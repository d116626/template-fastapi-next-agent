from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, List
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

router = APIRouter(
    prefix="/chat",
    tags=["Chat"],
    dependencies=[Depends(validar_token)],
)

# Store agent instances per thread (in production, use Redis or similar)
agents: Dict[str, Agent] = {}


class ChatRequest(BaseModel):
    message: str
    user_id: str
    system_prompt: Optional[str] = "You are a helpful assistant."
    session_timeout_seconds: Optional[int] = None
    use_whatsapp_format: bool = True


class ChatResponse(BaseModel):
    user_id: str
    messages: List[dict]


def get_or_create_agent(user_id: str, system_prompt: str) -> Agent:
    """Get existing agent or create new one for user."""
    if user_id not in agents:
        logger.info(f"[Chat API] Creating new agent for user: {user_id}")
        agents[user_id] = Agent(
            system_prompt=system_prompt,
            tools=TOOLS,
            include_thoughts=True,
            thinking_budget=-1,
        )
    return agents[user_id]


@router.post("/message", response_model=ChatResponse)
async def send_message(request: ChatRequest):
    """
    Send a message to the chat agent.

    - **message**: The user's message
    - **user_id**: Unique identifier for the user
    - **system_prompt**: Optional system prompt for the agent
    """
    try:
        logger.info(f"[Chat API] Received message from user {request.user_id}")

        # Get or create agent for this user
        agent = get_or_create_agent(request.user_id, request.system_prompt)

        # Prepare data
        data = {
            "messages": [{"role": "user", "content": request.message}],
        }
        config = {"configurable": {"thread_id": request.user_id}}

        # Query agent
        result = await agent.async_query(input=data, config=config)
        # Extract response from messages
        messages = result.get("messages", [])

        logger.info(f"[Chat API] Response generated for user {request.user_id}")
        parsed_messages = to_gateway_format(
            messages=messages,
            thread_id=request.user_id,
            session_timeout_seconds=request.session_timeout_seconds,
            use_whatsapp_format=request.use_whatsapp_format,
        )
        reponse_messages = parsed_messages.get("data", {}).get("messages", [])
        return ChatResponse(
            messages=reponse_messages,
            user_id=request.user_id,
        )

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
