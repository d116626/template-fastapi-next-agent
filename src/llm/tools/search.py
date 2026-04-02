from src.llm.tools.search_services.google import gemini_service
from src.config import env
from src.utils.log import logger
from langchain.tools import tool


@tool("google_search")
async def google_search(query: str):
    """Obtém os resultados da busca no Google"""
    final_response = {}
    response_google = await gemini_service.google_search(
        query=query,
        model=env.GEMINI_SEARCH_MODEL or "gemini-2.5-flash",
        temperature=0.0,
        retry_attempts=1,
    )
    logger.debug(f"Google Search Response:\n{response_google}")
    final_response = {
        "text": response_google.get("text"),
        "sources": response_google.get("sources"),
        "web_search_queries": response_google.get("web_search_queries"),
        "id": response_google.get("id"),
    }

    return final_response
