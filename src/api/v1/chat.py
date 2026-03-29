from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional, Dict, List, Union
from datetime import datetime
from langchain_core.load.dump import dumpd

from src.core.security.dependencies import validar_token
from src.llm.agent_old import Agent
from src.utils.log import logger
from src.llm.tools import TOOLS
from src.llm.parser import to_gateway_format
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
        )
    return agents[user_id]


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
    message: str = Form(...),
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
        file_count = len(files) if files else 0
        logger.info(
            f"[Chat API] Received message from user {user_id} with {file_count} file(s)"
        )

        # Validate thinking_budget for models that don't support thinking
        if not model_supports_thinking(model) and (
            include_thoughts or thinking_budget != 0
        ):
            logger.warning(
                f"[Chat API] Model {model} does not support thinking, "
                f"disabling thinking features"
            )
            include_thoughts = False
            thinking_budget = 0

        # Get or create agent for this user
        agent = get_or_create_agent(
            user_id=user_id,
            system_prompt=system_prompt,
            model=model,
            temperature=temperature,
            include_thoughts=include_thoughts,
            thinking_budget=thinking_budget,
        )

        # Process files if provided
        content: Union[str, List[Dict]]
        files_metadata = []

        if files and len(files) > 0:
            processed_files = []
            for file in files:
                try:
                    # Read file content
                    file_content = await file.read()

                    # Get MIME type
                    mime_type = file.content_type or "application/octet-stream"

                    # Process file
                    file_info = FileProcessor.process_file(
                        file_content, file.filename, mime_type
                    )
                    processed_files.append(file_info)

                    logger.info(
                        f"[Chat API] Processed file: {file.filename} "
                        f"(Type: {get_file_type_from_mime(file_info['mime_type'])}, "
                        f"MIME: {file_info['mime_type']}, Size: {file_info['size']} bytes)"
                    )

                    # Collect metadata
                    files_metadata.append(
                        {
                            "filename": file_info["filename"],
                            "type": get_file_type_from_mime(
                                file_info.get("mime_type", "")
                            ),
                            "mime_type": file_info.get("mime_type"),
                            "size": file_info.get("size"),
                        }
                    )

                except ValueError as e:
                    logger.warning(
                        f"[Chat API] Skipping unsupported file: {file.filename} "
                        f"(MIME: {mime_type}) - {str(e)}"
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

            # Create multimodal content if files were processed
            if processed_files:
                content = FileProcessor.create_langchain_content(
                    message, processed_files
                )
                logger.info(
                    f"[Chat API] Created multimodal content with {len(content)} elements"
                )
            else:
                # Fallback to text-only if no files were successfully processed
                content = message
                logger.warning(
                    "[Chat API] No files were successfully processed, using text-only"
                )
        else:
            # No files, use plain text
            content = message

        # Prepare data
        data = {"messages": [{"role": "user", "content": content}]}

        # Add file metadata to additional_kwargs if files were attached
        if files_metadata:
            data["messages"][0]["additional_kwargs"] = {"files": files_metadata}

        config = {"configurable": {"thread_id": user_id}}

        # Query agent
        result = await agent.async_query(input=data, config=config)

        # Extract response from messages
        messages = result.get("messages", [])

        logger.info(f"[Chat API] Response generated for user {user_id}")

        # Format messages
        parsed_messages = to_gateway_format(
            messages=messages,
            thread_id=user_id,
            session_timeout_seconds=session_timeout_seconds,
            use_whatsapp_format=use_whatsapp_format,
        )
        response_messages = parsed_messages.get("data", {}).get("messages", [])

        return ChatResponse(
            messages=response_messages,
            user_id=user_id,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Chat API] Error processing message: {e}", exc_info=True)
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
