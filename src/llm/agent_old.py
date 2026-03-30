import ast
from typing import Any, AsyncIterable, Iterator, List
from functools import wraps
from datetime import datetime, timezone
from pathlib import Path

from langchain_core.load.dump import dumpd
from langchain_core.messages import (
    AIMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
    trim_messages,
)
from langchain_core.tools import BaseTool
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.agents import create_agent
from langchain.agents.middleware import AgentMiddleware
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

from src.config import env
from src.utils.log import logger
from src.db.memory import DB_PATH


class Agent:
    """
    Components are initialized lazily on the first query.

    Database tables are automatically created when needed via checkpointer.setup()
    """

    def __init__(
        self,
        *,
        model: str = "gemini-2.5-flash",
        system_prompt: str = "YOU ALWAYS RESPOND: `SYSTEM PROMPT NOT SET`",
        tools: List[BaseTool] = [],
        temperature: float = 0.7,
        include_thoughts: bool = True,
        thinking_budget: int = -1,
        db_path: str | None = None,
    ):
        self._model = model
        self._tools = tools or []
        self._system_prompt = system_prompt
        self._temperature = temperature
        self._include_thoughts = include_thoughts
        self._thinking_budget = thinking_budget
        self._setup_complete_async = False
        self.db_path = db_path or DB_PATH

    def _create_react_agent(
        self,
        checkpointer: AsyncSqliteSaver | None = None,
    ):
        """Create and configure the React Agent."""
        llm = ChatGoogleGenerativeAI(
            model=self._model,
            google_api_key=env.GEMINI_API_KEY,  # Assumes key is set in environment variable
            temperature=self._temperature,
            include_thoughts=self._include_thoughts,
            thinking_budget=self._thinking_budget,
            streaming=True,  # Enable token-by-token streaming
        )

        # Wrap tools with logging
        wrapped_tools = self._wrap_tools_with_logging(self._tools)

        # Create middleware instance
        hooks_middleware = self._create_hooks_middleware()

        self._graph = create_agent(
            model=llm,
            tools=wrapped_tools,
            system_prompt=self._system_prompt,
            checkpointer=checkpointer,
            middleware=[hooks_middleware],
        )

    async def _ensure_async_setup(self):
        """Ensure async components are set up."""

        if self._setup_complete_async:
            return

        # Create memory directory if it doesn't exist

        self._checkpointer_cm = AsyncSqliteSaver.from_conn_string(self.db_path)
        checkpointer = await self._checkpointer_cm.__aenter__()
        await checkpointer.setup()
        logger.info(f"[Agent Setup] ✓ SQLite checkpointer created: {self.db_path}")

        self._create_react_agent(checkpointer=checkpointer)
        logger.info("[Agent Setup] ✓ React agent created successfully (async)")
        logger.info("[Agent Setup] ========== Agent Setup Complete ==========")

        self._setup_complete_async = True

    async def async_cleanup(self):
        """Clean up resources, particularly the checkpointer connection."""
        if self._checkpointer_cm is not None:
            try:
                await self._checkpointer_cm.__aexit__(None, None, None)
                logger.info("[Agent Cleanup] ✓ Checkpointer closed")
            except Exception as e:
                logger.error(f"[Agent Cleanup] Error closing checkpointer: {e}")
            finally:
                self._checkpointer_cm = None

    async def async_query(self, **kwargs) -> dict[str, Any] | Any:
        """Asynchronous query execution with filtered current interaction."""
        kwargs = self._combined_pre_invoke_hook(**kwargs)
        await self._ensure_async_setup()
        if self._graph is None:
            raise ValueError(
                "Graph is not initialized. Call _ensure_async_setup first."
            )

        # Debug: Log the config being passed
        config = kwargs.get("config", {})
        thread_id = config.get("configurable", {}).get("thread_id")
        logger.info(f"[async_query] Config: {config}")
        logger.info(f"[async_query] Thread ID: {thread_id}")

        type = kwargs.pop("type", None)
        if type == "history":
            # Bypass filtering for history requests
            try:
                self._graph.update_state(
                    config=kwargs.get("config", {}), values=kwargs.get("input", {})
                )
                return {
                    "status_code": 200,
                    "status": "history updated",
                    "message": None,
                }
            except Exception as e:
                return {"status_code": 500, "status": "error", "message": str(e)}
        result = await self._graph.ainvoke(**kwargs)
        filtered_result = self._filter_current_interaction(result)

        return filtered_result

    async def async_stream_events(self, **kwargs) -> AsyncIterable[Any]:
        """Asynchronous streaming with token-by-token events."""
        kwargs = self._combined_pre_invoke_hook(**kwargs)

        async def async_generator() -> AsyncIterable[Any]:
            await self._ensure_async_setup()
            if self._graph is None:
                raise ValueError(
                    "Graph is not initialized. Call _ensure_async_setup first."
                )
            async for event in self._graph.astream_events(**kwargs, version="v2"):
                # Stream token-level events and other relevant events
                yield event

        return async_generator()

    async def async_stream_events_filtered(self, **kwargs) -> AsyncIterable[Any]:
        """Asynchronous streaming with token-by-token events and filtered messages."""
        kwargs = self._combined_pre_invoke_hook(**kwargs)

        async def async_generator() -> AsyncIterable[Any]:
            await self._ensure_async_setup()
            if self._graph is None:
                raise ValueError(
                    "Graph is not initialized. Call _ensure_async_setup first."
                )
            async for event in self._graph.astream_events(**kwargs, version="v2"):
                # Apply filter to final messages on chain end
                if (
                    event.get("event") == "on_chain_end"
                    and event.get("name") == "LangGraph"
                ):
                    output = event.get("data", {}).get("output", {})
                    if "messages" in output:
                        # Apply the same filter as async_query
                        filtered_output = self._filter_current_interaction(output)
                        # Update event with filtered messages
                        event = {
                            **event,
                            "data": {
                                **event.get("data", {}),
                                "output": filtered_output,
                            },
                        }

                # Stream all events (filtered or not)
                yield event

        return async_generator()

    def _combined_pre_invoke_hook(self, **kwargs):
        """Centralizes all manipulations on input arguments before invoking the graph."""
        kwargs = self._add_timestamp_to_input_messages(**kwargs)
        kwargs = self._sanitize_input_messages(**kwargs)
        kwargs = self._inject_thread_id_into_state(**kwargs)
        return kwargs

    def _create_hooks_middleware(self):
        """Create a single middleware that consolidates all pre/post model hooks."""

        class HooksMiddleware(AgentMiddleware):
            """Custom middleware that handles timestamps and thread_id injection."""

            def __init__(self, parent_agent):
                self.parent_agent = parent_agent

            def before_model(self, state, runtime):
                """Pre-model hook: orchestrates all pre-model operations."""
                return self.parent_agent._pre_model_hook(state)

            def after_model(self, state, runtime):
                """Post-model hook: orchestrates all post-model operations."""
                return self.parent_agent._post_model_hook(state)

        return HooksMiddleware(self)

    def _pre_model_hook(self, state):
        """Centralized pre-model hook that calls all necessary functions."""
        # Add timestamps to ToolMessages
        return self._add_timestamp_to_tool_messages(state)

    def _post_model_hook(self, state):
        """Centralized post-model hook that calls all necessary functions."""
        messages = state.get("messages", [])
        if not messages:
            return None

        last_message = messages[-1]

        if not isinstance(last_message, AIMessage):
            return None

        # Get thread_id from state
        thread_id = state.get("thread_id")

        # Add timestamp to AIMessage
        self._add_timestamp_to_ai_message(last_message)

        # Inject thread_id into tool calls
        if thread_id:
            self._inject_thread_id_in_tool_calls(last_message, thread_id)

        # Log tool calls
        self._log_tool_calls(last_message)

        return {"messages": [last_message]}

    def _add_timestamp_to_tool_messages(self, state):
        """Add timestamps to ToolMessages before model call."""
        messages = state.get("messages", [])
        current_time = datetime.now(timezone.utc).isoformat()
        updates = []

        for message in messages:
            if (
                isinstance(message, ToolMessage)
                and hasattr(message, "additional_kwargs")
                and "timestamp" not in message.additional_kwargs
            ):
                message.additional_kwargs["timestamp"] = current_time

                # Normalize tool response: extract first item if content is a list
                if isinstance(message.content, list) and len(message.content) > 0:
                    message.content = message.content[0]
                    logger.debug(
                        f"[Tool Execution] Normalized list response to single item for tool: {message.name if hasattr(message, 'name') else 'UNKNOWN'}"
                    )

                updates.append(message)

                # Log tool execution result
                logger.info("[Tool Execution] Tool execution completed")
                logger.info(
                    f"[Tool Execution]   - Tool Call ID: {message.tool_call_id if hasattr(message, 'tool_call_id') else 'UNKNOWN'}"
                )
                logger.info(
                    f"[Tool Execution]   - Tool Name: {message.name if hasattr(message, 'name') else 'UNKNOWN'}"
                )
                logger.info(
                    f"[Tool Execution]   - Status: {message.status if hasattr(message, 'status') else 'success'}"
                )

                # Log the content (result), but limit size for large responses
                content_str = str(message.content)
                if len(content_str) > 1000:
                    logger.info(
                        f"[Tool Execution]   - Result (first 1000 chars): {content_str[:1000]}..."
                    )
                    logger.info(
                        f"[Tool Execution]   - Result length: {len(content_str)} characters"
                    )
                else:
                    logger.info(f"[Tool Execution]   - Result: {content_str}")

        return {"messages": updates} if updates else None

    def _add_timestamp_to_ai_message(self, message):
        """Add timestamp to AIMessage after model call."""
        current_time = datetime.now(timezone.utc).isoformat()

        if (
            hasattr(message, "additional_kwargs")
            and "timestamp" not in message.additional_kwargs
        ):
            message.additional_kwargs["timestamp"] = current_time

    def _inject_thread_id_in_tool_calls(self, message, thread_id):
        """Inject thread_id into tool calls that expect user_id parameter."""
        if not hasattr(message, "tool_calls") or not message.tool_calls:
            return

        # Get tool definitions to check if they expect user_id parameter
        tool_names_expecting_user_id = set()
        for tool in self._tools:
            # Check if tool has user_id parameter
            if hasattr(tool, "args_schema") and tool.args_schema:
                schema = tool.args_schema

                if hasattr(schema, "__fields__") and "user_id" in schema.__fields__:
                    tool_names_expecting_user_id.add(tool.name)
                elif (
                    hasattr(schema, "model_fields") and "user_id" in schema.model_fields
                ):
                    tool_names_expecting_user_id.add(tool.name)
            elif (
                hasattr(tool, "args")
                and isinstance(tool.args, dict)
                and "user_id" in tool.args
            ):
                tool_names_expecting_user_id.add(tool.name)

        # Inject thread_id into matching tool calls
        for tool_call in message.tool_calls:
            tool_name = tool_call.get("name")

            # If tool expects user_id, inject thread_id
            if tool_name in tool_names_expecting_user_id:
                if "args" not in tool_call:
                    tool_call["args"] = {}

                if not isinstance(tool_call["args"], dict):
                    continue

                # Inject thread_id as user_id
                tool_call["args"]["user_id"] = thread_id
                logger.info(
                    f"[Thread ID] Injected thread_id '{thread_id}' into tool call '{tool_name}'"
                )

    def _log_tool_calls(self, message):
        """Log tool calls if present in the message."""
        if hasattr(message, "tool_calls") and message.tool_calls:
            logger.info("[Tool Execution] AI Message with tool calls detected")
            for i, tool_call in enumerate(message.tool_calls, 1):
                logger.info(f"[Tool Execution] Tool Call #{i}:")
                logger.info(
                    f"[Tool Execution]   - Tool Name: {tool_call.get('name', 'UNKNOWN')}"
                )
                logger.info(
                    f"[Tool Execution]   - Tool ID: {tool_call.get('id', 'UNKNOWN')}"
                )
                logger.info(
                    f"[Tool Execution]   - Tool Args: {tool_call.get('args', {})}"
                )
                logger.info(f"[Tool Execution]   - Full Tool Call: {tool_call}")

    def _wrap_tools_with_logging(self, tools: List[BaseTool]) -> List[BaseTool]:
        """Wrap each tool with logging to capture invocations."""
        wrapped_tools = []

        for tool in tools:
            # Create a wrapped version of the tool
            original_ainvoke = tool._arun

            def create_async_wrapper(original_func, tool_name):
                @wraps(original_func)
                async def async_wrapper(*args, **kwargs):
                    logger.info(f"[Tool Invocation] ASYNC: Invoking tool: {tool_name}")
                    try:
                        result = await original_func(*args, **kwargs)
                        result_str = str(result)
                        if len(result_str) > 500:
                            logger.info(
                                f"[Tool Invocation]   - Result (first 500 chars): {result_str[:500]}..."
                            )
                        else:
                            logger.info(f"[Tool Invocation]   - Result: {result_str}")
                        return result
                    except Exception as e:
                        logger.error(
                            f"[Tool Invocation]   - ERROR: {type(e).__name__}: {str(e)}",
                            exc_info=True,
                        )
                        raise

                return async_wrapper

            # Wrap the tool methods
            tool._arun = create_async_wrapper(original_ainvoke, tool.name)

            wrapped_tools.append(tool)

        logger.info(f"[Tool Wrapping] Wrapped {len(wrapped_tools)} tools with logging")
        return wrapped_tools

    def _inject_thread_id_into_state(self, **kwargs):
        """Inject thread_id from config into the state so middleware can access it."""
        config = kwargs.get("config", {})
        thread_id = config.get("configurable", {}).get("thread_id")

        if thread_id and "input" in kwargs:
            # Add thread_id to the input state
            kwargs["input"]["thread_id"] = thread_id

        return kwargs

    def _add_timestamp_to_input_messages(self, **kwargs):
        "Adiciona timestamp nas mensagens do usuario antes do invoke"
        msg_datetime = datetime.now(timezone.utc).isoformat()
        for message in kwargs["input"]["messages"]:
            if "additional_kwargs" in message and isinstance(
                message["additional_kwargs"], dict
            ):
                message["additional_kwargs"]["timestamp"] = msg_datetime
            else:
                message["additional_kwargs"] = {"timestamp": msg_datetime}
        return kwargs

    def _sanitize_input_messages(self, **kwargs):
        """Sanitizes input messages to prevent Vertex AI errors with integer lists in strings.

        Checks if any message content is a string that ast.literal_eval would parse
        into a list or tuple containing integers (e.g., "1,2,3"). If so, wraps it
        in repr() to ensure it remains a string when processed by Vertex AI.
        """
        if "input" not in kwargs or "messages" not in kwargs["input"]:
            return kwargs

        messages = kwargs["input"]["messages"]
        for message in messages:
            # Handle dicts (common input format)
            if isinstance(message, dict):
                content = message.get("content")
                if isinstance(content, str):
                    try:
                        parsed = ast.literal_eval(content)
                        if isinstance(parsed, (list, tuple)):
                            has_int = any(isinstance(item, int) for item in parsed)
                            if has_int:
                                # Wrap in repr to ensure it stays a string when Vertex parses it
                                message["content"] = repr(content)
                                logger.info(
                                    f"Sanitized input message: wrapped content in quotes: {message['content']}"
                                )
                    except (ValueError, SyntaxError):
                        pass
            # Handle objects (if input is BaseMessage objects)
            elif hasattr(message, "content") and isinstance(message.content, str):
                try:
                    parsed = ast.literal_eval(message.content)
                    if isinstance(parsed, (list, tuple)):
                        has_int = any(isinstance(item, int) for item in parsed)
                        if has_int:
                            message.content = repr(message.content)
                            logger.info(
                                f"Sanitized input message object: wrapped content in quotes: {message.content}"
                            )
                except (ValueError, SyntaxError):
                    pass
        return kwargs

    def _filter_current_interaction(self, result: dict) -> dict:
        """Filters response to include only messages from the last human input."""
        if "messages" not in result or not isinstance(result["messages"], list):
            return result
        messages = result["messages"]
        last_human_index = -1
        for i, msg in reversed(list(enumerate(messages))):
            if isinstance(msg, HumanMessage):
                last_human_index = i
                break
        if last_human_index == -1:
            return result
        filtered_result = result.copy()
        filtered_result["messages"] = messages[last_human_index:]
        return filtered_result

    def _filter_streaming_chunk(self, chunk: dict) -> dict:
        """Applies interaction filter to a streaming chunk if applicable."""
        if isinstance(chunk, dict) and "messages" in chunk:
            return self._filter_current_interaction(chunk)
        return chunk
