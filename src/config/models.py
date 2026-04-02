"""
Configuração de modelos disponíveis para o agente.
"""

from typing import List, Dict, Optional, TypedDict


class ModelInfo(TypedDict):
    """Informações sobre um modelo disponível."""

    code: str
    name: str
    description: str
    supports_thinking: bool
    supports_images: bool
    supports_function_calling: bool
    input_token_limit: int
    output_token_limit: int


# Lista de modelos disponíveis
AVAILABLE_MODELS: List[ModelInfo] = [
    {
        "code": "gemini-3.1-pro-preview",
        "name": "Gemini 3.1 Pro Preview",
        "description": "Best for software engineering and agentic workflows with precise tool usage",
        "supports_thinking": True,
        "supports_images": True,
        "supports_function_calling": True,
        "input_token_limit": 1_048_576,
        "output_token_limit": 65_536,
    },
    {
        "code": "gemini-3.1-pro-preview-customtools",
        "name": "Gemini 3.1 Pro Preview (Custom Tools)",
        "description": "Optimized for custom tools and bash workflows",
        "supports_thinking": True,
        "supports_images": True,
        "supports_function_calling": True,
        "input_token_limit": 1_048_576,
        "output_token_limit": 65_536,
    },
    {
        "code": "gemini-3-flash-preview",
        "name": "Gemini 3 Flash Preview",
        "description": "Best multimodal understanding and powerful agentic model",
        "supports_thinking": True,
        "supports_images": True,
        "supports_function_calling": True,
        "input_token_limit": 1_048_576,
        "output_token_limit": 65_536,
    },
    {
        "code": "gemini-3.1-flash-lite-preview",
        "name": "Gemini 3.1 Flash-Lite Preview",
        "description": "Most cost-efficient for high-volume agentic tasks",
        "supports_thinking": True,
        "supports_images": True,
        "supports_function_calling": True,
        "input_token_limit": 1_048_576,
        "output_token_limit": 65_536,
    },
    {
        "code": "gemini-2.5-flash",
        "name": "Gemini 2.5 Flash",
        "description": "Best price-performance for large scale processing",
        "supports_thinking": True,
        "supports_images": True,
        "supports_function_calling": True,
        "input_token_limit": 1_048_576,
        "output_token_limit": 65_536,
    },
    {
        "code": "gemini-2.5-flash-lite",
        "name": "Gemini 2.5 Flash-Lite",
        "description": "Fast and cost-efficient for lightweight tasks",
        "supports_thinking": True,
        "supports_images": True,
        "supports_function_calling": True,
        "input_token_limit": 1_048_576,
        "output_token_limit": 65_536,
    },
    {
        "code": "gemini-2.5-pro",
        "name": "Gemini 2.5 Pro",
        "description": "State-of-the-art thinking model for complex reasoning",
        "supports_thinking": True,
        "supports_images": True,
        "supports_function_calling": True,
        "input_token_limit": 1_048_576,
        "output_token_limit": 65_536,
    },
]


def get_available_models() -> List[ModelInfo]:
    """Retorna lista de modelos disponíveis."""
    return AVAILABLE_MODELS


def get_model_info(model_code: str) -> Optional[ModelInfo]:
    """
    Retorna informações sobre um modelo específico.

    Args:
        model_code: Código do modelo (ex: "gemini-2.5-flash")

    Returns:
        Informações do modelo ou None se não encontrado
    """
    for model in AVAILABLE_MODELS:
        if model["code"] == model_code:
            return model
    return None


def model_supports_thinking(model_code: str) -> bool:
    """
    Verifica se um modelo suporta thinking.

    Args:
        model_code: Código do modelo

    Returns:
        True se suporta thinking, False caso contrário
    """
    model_info = get_model_info(model_code)
    return model_info["supports_thinking"] if model_info else False
