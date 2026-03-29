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

    def _wrap_tools_with_logging(self, tools: List[BaseTool]) -> List[BaseTool]:
        """Wrap each tool with logging to capture invocations."""
        wrapped_tools = []

        for tool in tools:
            # Create a wrapped version of the tool
            original_invoke = tool._run
            original_ainvoke = tool._arun

            def create_sync_wrapper(original_func, tool_name):
                @wraps(original_func)
                def sync_wrapper(*args, **kwargs):
                    logger.info(f"[Tool Invocation] SYNC: Invoking tool: {tool_name}")
                    try:
                        result = original_func(*args, **kwargs)
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

                return sync_wrapper

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
            tool._run = create_sync_wrapper(original_invoke, tool.name)
            tool._arun = create_async_wrapper(original_ainvoke, tool.name)

            wrapped_tools.append(tool)

        logger.info(f"[Tool Wrapping] Wrapped {len(wrapped_tools)} tools with logging")
        return wrapped_tools

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
        )

        # Wrap tools with logging
        wrapped_tools = self._wrap_tools_with_logging(self._tools)

        self._graph = create_agent(
            model=llm,
            tools=wrapped_tools,
            system_prompt=self._system_prompt,
            checkpointer=checkpointer,
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

    async def async_stream_query(self, **kwargs) -> AsyncIterable[Any]:
        """Asynchronous streaming query execution with filtered chunks."""
        kwargs = self._combined_pre_invoke_hook(**kwargs)

        async def async_generator() -> AsyncIterable[Any]:
            await self._ensure_async_setup()
            if self._graph is None:
                raise ValueError(
                    "Graph is not initialized. Call _ensure_async_setup first."
                )
            async for chunk in self._graph.astream(**kwargs):
                filtered_chunk = self._filter_streaming_chunk(chunk)
                yield dumpd(filtered_chunk)

        return async_generator()

    def _filter_streaming_chunk(self, chunk: dict) -> dict:
        """Applies interaction filter to a streaming chunk if applicable."""
        if isinstance(chunk, dict) and "messages" in chunk:
            return self._filter_current_interaction(chunk)
        return chunk

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

    def _combined_pre_invoke_hook(self, **kwargs):
        """Centralizes all manipulations on input arguments before invoking the graph."""
        kwargs = self._add_timestamp_to_input_messages(**kwargs)
        kwargs = self._sanitize_input_messages(**kwargs)
        return kwargs

    def _add_timestamp_to_input_messages(self, **kwargs):
        "Adiciona timestamp nas mensagens do usuario antes do invoke"
        msg_datetime = datetime.now(timezone.utc).isoformat()
        for message in kwargs["input"]["messages"]:
            message["additional_kwargs"] = {"timestamp": msg_datetime}
        return kwargs

    def _combined_pre_model_hook(self, state, config=None):
        # Step 1: Add timestamps to new ToolMessages (safe update, modifies in-place)
        # We invoke this for the side-effect on state['messages'], relying on
        # _inject_long_term_memory or subsequent steps to return the messages list.
        self._add_timestamp_to_tool_messages(state)

        # No filtering applied, just inject thread_id normally
        return self._inject_thread_id_in_user_id_params(state, config)

    def _combined_post_model_hook(self, state, config=None):
        # Log tool calls if present
        messages = state.get("messages", [])
        for msg in reversed(messages):
            if (
                isinstance(msg, AIMessage)
                and hasattr(msg, "tool_calls")
                and msg.tool_calls
            ):
                logger.info("[Tool Execution] AI Message with tool calls detected")
                for i, tool_call in enumerate(msg.tool_calls, 1):
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
                break  # Only log the most recent AI message

        # Check if upsert_user_memory tool was called
        for msg in reversed(messages):
            if isinstance(msg, AIMessage) and hasattr(msg, "tool_calls"):
                for tool_call in msg.tool_calls:
                    if tool_call.get("name") == "upsert_user_memory":
                        self._memory_needs_refresh = True
                        logger.info(
                            "[Long-Term Memory] Detected upsert_user_memory call, flagging for refresh"
                        )
                        break
                break  # Only check the last AI message
        # Add timestamp to the new AIMessage (modifies in-place)
        self._add_timestamp_to_ai_message(state)

        return self._inject_thread_id_in_user_id_params(state, config)

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

    def _add_timestamp_to_ai_message(self, state):
        """Hook para adicionar timestamp na AIMessage (Agent) logo após geração."""
        messages = state.get("messages", [])
        if not messages:
            return {}

        last_message = messages[-1]
        current_time = datetime.now(timezone.utc).isoformat()

        if (
            isinstance(last_message, AIMessage)
            and hasattr(last_message, "additional_kwargs")
            and "timestamp" not in last_message.additional_kwargs
        ):
            last_message.additional_kwargs["timestamp"] = current_time
            # Retorna apenas a mensagem modificada
            return {"messages": [last_message]}

        return {}

    def _inject_thread_id_in_user_id_params(self, state, config=None):
        """Hook para injetar thread_id em qualquer parâmetro user_id de tool calls.

        Este hook processa todas as tool calls e substitui qualquer parâmetro
        'user_id' pelo thread_id atual, garantindo que todas as ferramentas
        recebam o identificador correto do usuário.

        Args:
            state: Estado do grafo contendo as mensagens
            config: Configuração do LangGraph (pode ser None em alguns contextos)

        Returns:
            dict: Estado atualizado com thread_id injetado em todos os parâmetros user_id
        """
        messages = state.get("messages", [])

        # Múltiplas formas de tentar obter o thread_id
        thread_id = None

        # Método 1: Diretamente do parâmetro config
        if config and isinstance(config, dict):
            configurable = config.get("configurable", {})
            thread_id = configurable.get("thread_id")

        # Método 2: Se config não foi passado, tenta do state (fallback)
        if not thread_id and hasattr(state, "config"):
            state_config = getattr(state, "config", {})
            if isinstance(state_config, dict):
                configurable = state_config.get("configurable", {})
                thread_id = configurable.get("thread_id")

        if thread_id:
            # Processa apenas a última mensagem AI que pode ter tool calls
            for message in reversed(messages):
                if hasattr(message, "tool_calls") and message.tool_calls:
                    for tool_call in message.tool_calls:
                        # Verifica se a tool call tem argumentos e se possui user_id
                        if (
                            "args" in tool_call
                            and isinstance(tool_call["args"], dict)
                            and "user_id" in tool_call["args"]
                        ):
                            # Substitui user_id pelo thread_id
                            tool_call["args"]["user_id"] = thread_id
                    break  # Processa apenas a última mensagem AI

        return {"messages": messages}

    def _add_timestamp_to_tool_messages(self, state):
        """Hook para adicionar timestamp nas ToolMessages após execução."""
        messages = state.get("messages", [])
        current_time = datetime.now(timezone.utc).isoformat()
        updates = []

        # Adicionar timestamp apenas nas ToolMessages que não têm
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

        # Retorna APENAS as mensagens modificadas para evitar duplicação no add_messages
        return {"messages": updates} if updates else {}
