"""
API endpoints for system prompts management.
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional

from src.core.security.dependencies import validar_token
from src.db.system_prompts import (
    create_prompt,
    get_all_prompts,
    get_prompt_by_id,
    update_prompt,
    delete_prompt,
)
from src.utils.log import logger

router = APIRouter(
    prefix="/system-prompts",
    tags=["System Prompts"],
    dependencies=[Depends(validar_token)],
)


class SystemPromptCreate(BaseModel):
    name: str
    prompt: str


class SystemPromptUpdate(BaseModel):
    name: Optional[str] = None
    prompt: Optional[str] = None


class SystemPromptResponse(BaseModel):
    id: str
    name: str
    prompt: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class SystemPromptsListResponse(BaseModel):
    prompts: List[SystemPromptResponse]


@router.get("", response_model=SystemPromptsListResponse)
async def list_prompts():
    """
    Get all system prompts.
    """
    try:
        prompts = get_all_prompts()
        return SystemPromptsListResponse(prompts=prompts)
    except Exception as e:
        logger.error(f"[SystemPrompts API] Error listing prompts: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{prompt_id}", response_model=SystemPromptResponse)
async def get_prompt(prompt_id: str):
    """
    Get a specific system prompt by ID.
    """
    try:
        prompt = get_prompt_by_id(prompt_id)
        if not prompt:
            raise HTTPException(status_code=404, detail="Prompt not found")
        return SystemPromptResponse(**prompt)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"[SystemPrompts API] Error getting prompt {prompt_id}: {e}", exc_info=True
        )
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", response_model=SystemPromptResponse)
async def create_new_prompt(data: SystemPromptCreate):
    """
    Create a new system prompt.
    """
    try:
        prompt = create_prompt(name=data.name, prompt=data.prompt)
        return SystemPromptResponse(**prompt)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"[SystemPrompts API] Error creating prompt: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{prompt_id}", response_model=SystemPromptResponse)
async def update_existing_prompt(prompt_id: str, data: SystemPromptUpdate):
    """
    Update an existing system prompt.
    """
    try:
        prompt = update_prompt(prompt_id=prompt_id, name=data.name, prompt=data.prompt)
        return SystemPromptResponse(**prompt)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(
            f"[SystemPrompts API] Error updating prompt {prompt_id}: {e}", exc_info=True
        )
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{prompt_id}")
async def delete_existing_prompt(prompt_id: str):
    """
    Delete a system prompt.
    """
    try:
        deleted = delete_prompt(prompt_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Prompt not found")
        return {"message": "Prompt deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"[SystemPrompts API] Error deleting prompt {prompt_id}: {e}", exc_info=True
        )
        raise HTTPException(status_code=500, detail=str(e))
