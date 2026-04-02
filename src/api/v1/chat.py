from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, Dict, List, Union
import json

from src.core.security.dependencies import validar_token
from src.llm.agent_old import Agent
from src.utils.log import logger
from src.llm.tools import TOOLS
from src.utils.parser import to_gateway_format
from src.llm.history import (
    get_thread_history,
    delete_thread_history,
)
from src.utils.file_processor import FileProcessor
from src.config.models import get_available_models, model_supports_thinking

router = APIRouter(
    prefix="/chat",
    tags=["Chat"],
    dependencies=[Depends(validar_token)],
)

# Store agent instances per thread (in production, use Redis or similar)
agents: Dict[str, Agent] = {}


def get_file_type_from_mime(mime_type: str) -> str:
    """
    Determina o tipo de arquivo baseado no MIME type.

    Args:
        mime_type: Tipo MIME do arquivo

    Returns:
        Tipo do arquivo: "image", "pdf", "code", ou "document"
    """
    if mime_type.startswith("image/"):
        return "image"
    elif mime_type == "application/pdf":
        return "pdf"
    elif any(
        x in mime_type
        for x in ["javascript", "python", "java", "text/x-", "typescript"]
    ):
        return "code"
    else:
        return "document"


class ChatRequest(BaseModel):
    """Request model for chat messages."""

    message: str = Field(..., description="The user's message")
    user_id: str = Field(..., description="Unique identifier for the user")
    system_prompt: str = Field(
        default="You are a helpful assistant.",
        description="System prompt for the agent",
    )
    model: str = Field(default="gemini-2.5-flash", description="Model to use")
    temperature: float = Field(
        default=0.7, ge=0.0, le=1.0, description="Temperature for generation"
    )
    include_thoughts: bool = Field(
        default=True, description="Include model thinking process"
    )
    thinking_budget: int = Field(
        default=-1,
        description="Thinking budget tokens (-1=unlimited, 0=disabled, >0=limit)",
    )
    session_timeout_seconds: Optional[int] = Field(
        default=None, description="Session timeout in seconds"
    )
    use_whatsapp_format: bool = Field(
        default=True, description="Whether to use WhatsApp format"
    )


class ChatResponse(BaseModel):
    user_id: str
    messages: List[dict]


class ModelInfoResponse(BaseModel):
    code: str
    name: str
    description: str
    supports_thinking: bool
    supports_images: bool
    supports_function_calling: bool
    input_token_limit: int
    output_token_limit: int


class ModelsListResponse(BaseModel):
    models: List[ModelInfoResponse]


def get_or_create_agent(
    user_id: str,
    system_prompt: str,
    model: str = "gemini-2.5-flash",
    temperature: float = 0.7,
    include_thoughts: bool = True,
    thinking_budget: int = -1,
    enable_streaming: bool = True,
) -> Agent:
    """Get existing agent or create new one for user."""
    # Check if agent exists with different config - recreate if needed
    if user_id in agents:
        old_agent = agents[user_id]
        # Check if config changed
        if (
            old_agent._model != model
            or old_agent._temperature != temperature
            or old_agent._include_thoughts != include_thoughts
            or old_agent._thinking_budget != thinking_budget
            or old_agent._enable_streaming != enable_streaming
        ):
            logger.info(
                f"[Chat API] Agent config changed for user {user_id}, recreating..."
            )
            # Cleanup old agent
            import asyncio

            try:
                asyncio.create_task(old_agent.async_cleanup())
            except:
                pass
            del agents[user_id]

    if user_id not in agents:
        logger.info(
            f"[Chat API] Creating new agent for user: {user_id} "
            f"(model={model}, temp={temperature}, thoughts={include_thoughts}, budget={thinking_budget})"
        )
        agents[user_id] = Agent(
            model=model,
            system_prompt=system_prompt,
            tools=TOOLS,
            temperature=temperature,
            include_thoughts=include_thoughts,
            thinking_budget=thinking_budget,
            enable_streaming=enable_streaming,
        )
    return agents[user_id]


async def _process_uploaded_files(
    files: List[UploadFile],
) -> List[Dict]:
    """
    Process uploaded files and return processed files and metadata.

    Returns:
        Tuple of (processed_files, files_metadata)
    """
    processed_files = []
    for file in files:
        try:
            # Read file content
            file_content = await file.read()

            # Get MIME type
            mime_type = file.content_type or "application/octet-stream"

            # Process file and save to storage
            file_info = FileProcessor.process_file(
                file_content,
                file.filename,
                mime_type,
                save_to_storage=True,  # Save for VTX extraction
            )
            processed_files.append(file_info)
            logger.info(
                f"[Chat API] Processed file: {file.filename} "
                f"(Type: {get_file_type_from_mime(file_info['mime_type'])}, "
                f"MIME: {file_info['mime_type']}, Size: {file_info['size']} bytes)"
            )

        except ValueError as e:
            logger.warning(
                f"[Chat API] Skipping unsupported file: {file.filename} "
                f"(MIME: {file_info['mime_type']}) - {str(e)}"
            )
            continue
        except Exception as e:
            logger.error(
                f"[Chat API] Error processing file {file.filename}: {e}",
                exc_info=True,
            )
            raise HTTPException(
                status_code=400,
                detail=f"Error processing file {file.filename}: {str(e)}",
            )

    return processed_files


def _prepare_message_content(
    message: str,
    files: Optional[List[UploadFile]],
    processed_files: List[Dict],
) -> Union[str, List[Dict]]:
    """
    Prepare message content based on text and processed files.

    Returns:
        Either plain text or multimodal content list
    """
    if processed_files:
        # Create file context for VTX tool
        file_context = "==LOADED FILES==\n"
        for index, file_info in enumerate(processed_files):
            file_hash = file_info.get("file_hash", "unknown")
            filename = file_info.get("filename", "unknown")
            file_context += f"{index + 1}. {file_hash}: {filename}\n"

        # Add context to message
        message_with_context = f"{message}\n\n{file_context}"

        # Create multimodal content
        content = FileProcessor.create_langchain_content(
            message_with_context, processed_files
        )

        logger.info(
            f"[Chat API] Created multimodal content with {len(content)} elements, "
            f"file IDs: {[f.get('file_hash') for f in processed_files]}"
        )
        return content
    elif files and len(files) > 0:
        # Fallback to text-only if no files were successfully processed
        logger.warning(
            "[Chat API] No files were successfully processed, using text-only"
        )

    return message


def _validate_model_thinking(
    model: str, include_thoughts: bool, thinking_budget: int
) -> tuple[bool, int]:
    """
    Validate and adjust thinking parameters for the model.

    Returns:
        Tuple of (include_thoughts, thinking_budget) with validated values
    """
    if not model_supports_thinking(model) and (
        include_thoughts or thinking_budget != 0
    ):
        logger.warning(
            f"[Chat API] Model {model} does not support thinking, "
            f"disabling thinking features"
        )
        return False, 0

    return include_thoughts, thinking_budget


@router.get("/models", response_model=ModelsListResponse)
async def list_models():
    """
    Get list of available models with their capabilities.

    Returns information about each model including:
    - Model code and name
    - Supported features (thinking, images, function calling)
    - Token limits
    """
    models = get_available_models()
    return ModelsListResponse(models=models)


@router.post("/message", response_model=ChatResponse)
async def send_message(
    message: str = Form(""),
    user_id: str = Form(...),
    system_prompt: str = Form("You are a helpful assistant."),
    model: str = Form("gemini-2.5-flash"),
    temperature: float = Form(0.7),
    include_thoughts: bool = Form(True),
    thinking_budget: int = Form(-1),
    session_timeout_seconds: Optional[int] = Form(None),
    use_whatsapp_format: bool = Form(True),
    files: List[UploadFile] = File(default=[]),
):
    """
    Send a message to the chat agent, with or without files.

    **Fields:**
    - **message**: The user's message
    - **user_id**: Unique identifier for the user
    - **system_prompt**: Optional system prompt for the agent (default: "You are a helpful assistant.")
    - **model**: Model to use (default: "gemini-2.5-flash")
    - **temperature**: Temperature for generation (default: 0.7, range: 0.0-1.0)
    - **include_thoughts**: Include model thinking process (default: True)
    - **thinking_budget**: Thinking budget tokens (-1 = unlimited, 0 = disabled, >0 = specific limit)
    - **session_timeout_seconds**: Optional session timeout in seconds
    - **use_whatsapp_format**: Whether to use WhatsApp format (default: True)
    - **files**: Optional list of files to upload (images, PDFs, code, documents)
    """
    try:
        # Validate request using Pydantic model
        request = ChatRequest(
            message=message,
            user_id=user_id,
            system_prompt=system_prompt,
            model=model,
            temperature=temperature,
            include_thoughts=include_thoughts,
            thinking_budget=thinking_budget,
            session_timeout_seconds=session_timeout_seconds,
            use_whatsapp_format=use_whatsapp_format,
        )

        file_count = len(files) if files else 0
        logger.info(
            f"[Chat API] Received message from user {request.user_id} with {file_count} file(s)"
        )

        # Validate and adjust thinking parameters
        include_thoughts, thinking_budget = _validate_model_thinking(
            request.model, request.include_thoughts, request.thinking_budget
        )

        # Get or create agent for this user
        agent = get_or_create_agent(
            user_id=request.user_id,
            system_prompt=request.system_prompt,
            model=request.model,
            temperature=request.temperature,
            include_thoughts=include_thoughts,
            thinking_budget=thinking_budget,
            enable_streaming=False,  # Disable streaming for non-stream endpoint
        )

        # Process files if provided
        processed_files = []
        if files and len(files) > 0:
            processed_files = await _process_uploaded_files(files)

        # Prepare message content
        content = _prepare_message_content(request.message, files, processed_files)

        # Prepare data
        data = {"messages": [{"role": "user", "content": content}]}
        config = {"configurable": {"thread_id": request.user_id}}

        # Query agent
        result = await agent.async_query(input=data, config=config)

        # Extract response from messages
        messages = result.get("messages", [])
        logger.info(f"[Chat API] Response generated for user {request.user_id}")

        # Format messages
        parsed_messages = to_gateway_format(
            messages=messages,
            thread_id=request.user_id,
            session_timeout_seconds=request.session_timeout_seconds,
            use_whatsapp_format=request.use_whatsapp_format,
        )
        response_messages = parsed_messages.get("data", {}).get("messages", [])

        return ChatResponse(
            messages=response_messages,
            user_id=request.user_id,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Chat API] Error processing message: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Error processing message: {str(e)}"
        )


@router.post("/message/stream")
async def send_message_stream(
    message: str = Form(""),
    user_id: str = Form(...),
    system_prompt: str = Form("You are a helpful assistant."),
    model: str = Form("gemini-2.5-flash"),
    temperature: float = Form(0.7),
    include_thoughts: bool = Form(True),
    thinking_budget: int = Form(-1),
    session_timeout_seconds: Optional[int] = Form(None),
    use_whatsapp_format: bool = Form(True),
    files: List[UploadFile] = File(default=[]),
):
    """
    Send a message to the chat agent with streaming response (Server-Sent Events).

    **Fields:**
    - **message**: The user's message
    - **user_id**: Unique identifier for the user
    - **system_prompt**: Optional system prompt for the agent (default: "You are a helpful assistant.")
    - **model**: Model to use (default: "gemini-2.5-flash")
    - **temperature**: Temperature for generation (default: 0.7, range: 0.0-1.0)
    - **include_thoughts**: Include model thinking process (default: True)
    - **thinking_budget**: Thinking budget tokens (-1 = unlimited, 0 = disabled, >0 = specific limit)
    - **session_timeout_seconds**: Optional session timeout in seconds
    - **use_whatsapp_format**: Whether to use WhatsApp format (default: True)
    - **files**: Optional list of files to upload (images, PDFs, code, documents)

    **Response:**
    - Server-Sent Events (SSE) stream with JSON chunks
    - Each event contains a chunk of the agent's response
    - Final event signals completion
    """
    try:
        # Validate request using Pydantic model
        request = ChatRequest(
            message=message,
            user_id=user_id,
            system_prompt=system_prompt,
            model=model,
            temperature=temperature,
            include_thoughts=include_thoughts,
            thinking_budget=thinking_budget,
            session_timeout_seconds=session_timeout_seconds,
            use_whatsapp_format=use_whatsapp_format,
        )

        file_count = len(files) if files else 0
        logger.info(
            f"[Chat API Stream] Received message from user {request.user_id} with {file_count} file(s)"
        )

        # Validate and adjust thinking parameters
        include_thoughts, thinking_budget = _validate_model_thinking(
            request.model, request.include_thoughts, request.thinking_budget
        )

        # Get or create agent for this user
        agent = get_or_create_agent(
            user_id=request.user_id,
            system_prompt=request.system_prompt,
            model=request.model,
            temperature=request.temperature,
            include_thoughts=include_thoughts,
            thinking_budget=thinking_budget,
            enable_streaming=True,  # Enable streaming for stream endpoint
        )

        # Process files if provided
        processed_files = []
        if files and len(files) > 0:
            processed_files = await _process_uploaded_files(files)

        # Prepare message content
        content = _prepare_message_content(request.message, files, processed_files)

        # Prepare data
        data = {"messages": [{"role": "user", "content": content}]}
        # Add file metadata to additional_kwargs if files were attached

        config = {"configurable": {"thread_id": request.user_id}}

        # Stream generator
        async def event_generator():
            try:
                # Get streaming response from agent with token-level events (filtered)
                stream = await agent.async_stream_events_filtered(
                    input=data, config=config
                )

                # Accumulate messages for final formatting
                accumulated_messages = []
                accumulated_content = ""

                # Stream events to client
                async for event in stream:
                    event_type = event.get("event")
                    event_data_payload = event.get("data", {})

                    # Stream token chunks from model
                    if event_type == "on_chat_model_stream":
                        chunk_content = event_data_payload.get("chunk")
                        if chunk_content and hasattr(chunk_content, "content"):
                            if isinstance(chunk_content.content, str):
                                # Plain text token
                                token = chunk_content.content
                                if token:
                                    accumulated_content += token
                                    token_event = json.dumps(
                                        {"type": "token", "content": token},
                                        ensure_ascii=False,
                                    )
                                    yield f"data: {token_event}\n\n"
                            elif (
                                isinstance(chunk_content.content, list)
                                and len(chunk_content.content) > 0
                            ):
                                # Handle multimodal content - can be thinking or text
                                for item in chunk_content.content:
                                    if isinstance(item, dict):
                                        if item.get("type") == "thinking":
                                            # Stream thinking content
                                            thinking_token = item.get("thinking", "")
                                            if thinking_token:
                                                thinking_event = json.dumps(
                                                    {
                                                        "type": "thinking_token",
                                                        "content": thinking_token,
                                                    },
                                                    ensure_ascii=False,
                                                )
                                                yield f"data: {thinking_event}\n\n"
                                        elif item.get("type") == "text":
                                            # Stream text content
                                            text_token = item.get("text", "")
                                            if text_token:
                                                accumulated_content += text_token
                                                token_event = json.dumps(
                                                    {
                                                        "type": "token",
                                                        "content": text_token,
                                                    },
                                                    ensure_ascii=False,
                                                )
                                                yield f"data: {token_event}\n\n"

                    # Capture final messages from agent completion
                    elif event_type == "on_chain_end":
                        event_name = event.get("name")
                        if event_name == "LangGraph":  # Main graph completion
                            output = event_data_payload.get("output", {})
                            if "messages" in output:
                                # Messages already filtered by async_stream_events_filtered
                                accumulated_messages = output["messages"]

                logger.info(
                    f"[Chat API Stream] Stream completed for user {request.user_id}"
                )

                # Apply gateway format to accumulated messages
                if accumulated_messages:
                    # Messages from astream_events are already LangChain objects, no need to deserialize
                    parsed_messages = to_gateway_format(
                        messages=accumulated_messages,
                        thread_id=request.user_id,
                        session_timeout_seconds=request.session_timeout_seconds,
                        use_whatsapp_format=request.use_whatsapp_format,
                    )
                    response_messages = parsed_messages.get("data", {}).get(
                        "messages", []
                    )

                    # Send formatted messages
                    formatted_data = json.dumps(
                        {"type": "formatted", "messages": response_messages},
                        ensure_ascii=False,
                    )
                    yield f"data: {formatted_data}\n\n"

                # Send completion signal
                yield f"data: {json.dumps({'type': 'done'})}\n\n"

            except Exception as e:
                logger.error(f"[Chat API Stream] Error in stream: {e}", exc_info=True)
                # Send error event
                error_data = json.dumps({"type": "error", "error": str(e)})
                yield f"data: {error_data}\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",  # Disable nginx buffering
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Chat API Stream] Error processing message: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Error processing message: {str(e)}"
        )


@router.get("/history/{user_id}")
async def get_history(
    user_id: str,
    limit: Optional[int] = None,
    session_timeout_seconds: Optional[int] = None,
    use_whatsapp_format: bool = True,
):
    """
    Get message history for a specific user in gateway format.

    - **user_id**: The user identifier
    - **limit**: Optional limit on number of messages (most recent)
    - **session_timeout_seconds**: Session timeout in seconds for grouping messages
    - **use_whatsapp_format**: Convert markdown to WhatsApp format
    """
    try:
        # Get LangChain messages
        messages = await get_thread_history(user_id, limit=limit)

        # Apply gateway format
        parsed_messages = to_gateway_format(
            messages=messages,
            thread_id=user_id,
            session_timeout_seconds=session_timeout_seconds,
            use_whatsapp_format=use_whatsapp_format,
        )
        formatted_messages = parsed_messages.get("data", {}).get("messages", [])

        return {
            "user_id": user_id,
            "messages": formatted_messages,
            "count": len(formatted_messages),
        }
    except Exception as e:
        logger.error(f"[Chat API] Error getting history: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/history/{user_id}")
async def delete_history(user_id: str):
    """
    Delete message history for a specific user from database.

    - **user_id**: The user identifier
    """
    try:
        success = await delete_thread_history(user_id)
        if success:
            # Also cleanup in-memory agent if exists
            if user_id in agents:
                agent = agents[user_id]
                await agent.async_cleanup()
                del agents[user_id]

            return {"message": f"History for user {user_id} deleted successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to delete history")
    except Exception as e:
        logger.error(f"[Chat API] Error deleting history: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
