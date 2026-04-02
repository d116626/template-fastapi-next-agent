"""
Database manager for system prompts.
"""

import hashlib
import sqlite3
from pathlib import Path
from typing import List, Dict, Optional

from src.utils.log import logger

# Database path
DB_DIR = Path(__file__).parent / "data"
DB_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = str(DB_DIR / "system_prompts.db")


def get_connection() -> sqlite3.Connection:
    """Get database connection."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initialize database with schema."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS system_prompts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            prompt TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """
    )

    # Insert default prompts if table is empty
    cursor.execute("SELECT COUNT(*) as count FROM system_prompts")
    count = cursor.fetchone()["count"]

    if count == 0:
        default_prompts = [
            {
                "name": "Helpful Assistant",
                "prompt": "You are a helpful assistant.",
            },
            {
                "name": "Code Expert",
                "prompt": "You are an expert software engineer. Provide clear, concise, and well-documented code solutions. Follow best practices and explain your reasoning.",
            },
            {
                "name": "Creative Writer",
                "prompt": "You are a creative writer with a flair for storytelling. Write engaging, imaginative content with vivid descriptions and compelling narratives.",
            },
            {
                "name": "Technical Analyst",
                "prompt": "You are a technical analyst. Provide detailed, data-driven analysis with clear explanations. Focus on accuracy and technical depth.",
            },
        ]

        for prompt_data in default_prompts:
            prompt_id = hashlib.sha256(prompt_data["prompt"].encode()).hexdigest()[:16]
            cursor.execute(
                """
                INSERT INTO system_prompts (id, name, prompt)
                VALUES (?, ?, ?)
            """,
                (prompt_id, prompt_data["name"], prompt_data["prompt"]),
            )

        logger.info(f"[SystemPrompts] Initialized with {len(default_prompts)} default prompts")

    conn.commit()
    conn.close()


def create_prompt(name: str, prompt: str) -> Dict:
    """
    Create a new system prompt.

    Args:
        name: Name of the prompt
        prompt: The system prompt text

    Returns:
        Created prompt data

    Raises:
        ValueError: If name already exists
    """
    conn = get_connection()
    cursor = conn.cursor()

    # Generate ID from hash
    prompt_id = hashlib.sha256(prompt.encode()).hexdigest()[:16]

    try:
        cursor.execute(
            """
            INSERT INTO system_prompts (id, name, prompt)
            VALUES (?, ?, ?)
        """,
            (prompt_id, name, prompt),
        )
        conn.commit()

        logger.info(f"[SystemPrompts] Created prompt: {name} (ID: {prompt_id})")

        return {
            "id": prompt_id,
            "name": name,
            "prompt": prompt,
        }

    except sqlite3.IntegrityError as e:
        if "UNIQUE constraint failed" in str(e):
            raise ValueError(f"A prompt with the name '{name}' already exists")
        raise

    finally:
        conn.close()


def get_all_prompts() -> List[Dict]:
    """
    Get all system prompts.

    Returns:
        List of all prompts
    """
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT id, name, prompt, created_at, updated_at
        FROM system_prompts
        ORDER BY created_at DESC
    """
    )

    prompts = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return prompts


def get_prompt_by_id(prompt_id: str) -> Optional[Dict]:
    """
    Get a system prompt by ID.

    Args:
        prompt_id: The prompt ID

    Returns:
        Prompt data or None if not found
    """
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT id, name, prompt, created_at, updated_at
        FROM system_prompts
        WHERE id = ?
    """,
        (prompt_id,),
    )

    row = cursor.fetchone()
    conn.close()

    return dict(row) if row else None


def update_prompt(prompt_id: str, name: Optional[str] = None, prompt: Optional[str] = None) -> Dict:
    """
    Update a system prompt.

    Args:
        prompt_id: The prompt ID
        name: New name (optional)
        prompt: New prompt text (optional)

    Returns:
        Updated prompt data

    Raises:
        ValueError: If prompt not found or name already exists
    """
    conn = get_connection()
    cursor = conn.cursor()

    # Check if exists
    existing = get_prompt_by_id(prompt_id)
    if not existing:
        conn.close()
        raise ValueError(f"Prompt with ID '{prompt_id}' not found")

    updates = []
    params = []

    if name is not None:
        updates.append("name = ?")
        params.append(name)

    if prompt is not None:
        updates.append("prompt = ?")
        params.append(prompt)

    if not updates:
        conn.close()
        return existing

    updates.append("updated_at = CURRENT_TIMESTAMP")
    params.append(prompt_id)

    try:
        cursor.execute(
            f"""
            UPDATE system_prompts
            SET {', '.join(updates)}
            WHERE id = ?
        """,
            params,
        )
        conn.commit()

        logger.info(f"[SystemPrompts] Updated prompt: {prompt_id}")

        # Get updated data
        updated = get_prompt_by_id(prompt_id)
        if not updated:
            raise ValueError(f"Failed to retrieve updated prompt with ID '{prompt_id}'")
        return updated

    except sqlite3.IntegrityError as e:
        if "UNIQUE constraint failed" in str(e):
            raise ValueError(f"A prompt with the name '{name}' already exists")
        raise

    finally:
        conn.close()


def delete_prompt(prompt_id: str) -> bool:
    """
    Delete a system prompt.

    Args:
        prompt_id: The prompt ID

    Returns:
        True if deleted, False if not found
    """
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        DELETE FROM system_prompts
        WHERE id = ?
    """,
        (prompt_id,),
    )

    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()

    if deleted:
        logger.info(f"[SystemPrompts] Deleted prompt: {prompt_id}")

    return deleted


# Initialize database on import
init_db()
