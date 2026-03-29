from pathlib import Path
from typing import List, Dict, Optional
from datetime import datetime

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage, SystemMessage
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

from src.utils.log import logger

# Memory path (same as agent_old.py)
MEMORY_PATH = Path(__file__).parent / "memory"
DB_PATH = str(MEMORY_PATH / "checkpoint.db")


async def get_thread_history(thread_id: str, limit: Optional[int] = None) -> List:
    """
    Retrieve raw LangChain message history for a specific thread.

    Args:
        thread_id: The thread identifier
        limit: Optional limit on number of messages to return (most recent first)

    Returns:
        List of LangChain message objects (to be formatted by to_gateway_format)
    """
    try:
        async with AsyncSqliteSaver.from_conn_string(DB_PATH) as checkpointer:
            # Get the latest checkpoint for this thread
            config = {"configurable": {"thread_id": thread_id}}
            checkpoint_tuple = await checkpointer.aget_tuple(config)

            if not checkpoint_tuple:
                logger.info(f"[History] No history found for thread: {thread_id}")
                return []

            checkpoint = checkpoint_tuple.checkpoint
            messages = checkpoint.get("channel_values", {}).get("messages", [])

            # Apply limit if specified (most recent first)
            if limit and len(messages) > limit:
                messages = messages[-limit:]

            logger.info(
                f"[History] Retrieved {len(messages)} messages for thread: {thread_id}"
            )
            return messages

    except Exception as e:
        logger.error(
            f"[History] Error retrieving history for thread {thread_id}: {e}",
            exc_info=True,
        )
        return []


async def delete_thread_history(thread_id: str) -> bool:
    """
    Delete all history for a specific thread.

    Args:
        thread_id: The thread identifier

    Returns:
        True if deletion was successful
    """
    try:
        async with AsyncSqliteSaver.from_conn_string(DB_PATH) as checkpointer:
            config = {"configurable": {"thread_id": thread_id}}
            await checkpointer.adelete_thread(config)
            logger.info(f"[History] Deleted history for thread: {thread_id}")
            return True

    except Exception as e:
        logger.error(f"[History] Error deleting thread {thread_id}: {e}", exc_info=True)
        return False
