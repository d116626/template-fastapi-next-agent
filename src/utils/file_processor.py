"""
Processador de arquivos para o agente.
Converte arquivos para base64 para envio ao Gemini (processamento nativo).
"""

import base64
import hashlib
import sqlite3
from pathlib import Path
from typing import Dict, Any, List, Optional

from src.utils.log import logger

# Database path for file storage
DB_PATH = Path(__file__).parent.parent / "db" / "data" / "file_storage.db"


class FileStorage:
    """Storage de arquivos processados (base64 em SQLite)."""

    @staticmethod
    def init_db():
        """Inicializa database de arquivos."""
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)

        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS files (
                file_hash TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                size INTEGER NOT NULL,
                content_base64 TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        conn.commit()
        conn.close()

        logger.debug("[FileStorage] Database initialized")

    @staticmethod
    def save_file(content: bytes, filename: str, mime_type: str) -> str:
        """
        Salva arquivo e retorna ID curto (8 chars).

        Args:
            content: Bytes do arquivo
            filename: Nome original
            mime_type: MIME type

        Returns:
            file_hash: 8 caracteres (SHA256[:8])
        """
        # Generate hash
        full_hash = hashlib.sha256(content).hexdigest()
        file_hash = full_hash[:8]

        # Base64
        content_b64 = base64.b64encode(content).decode("utf-8")

        # Save
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        try:
            cursor.execute(
                """
                INSERT OR REPLACE INTO files
                (file_hash, filename, mime_type, size, content_base64)
                VALUES (?, ?, ?, ?, ?)
            """,
                (file_hash, filename, mime_type, len(content), content_b64),
            )

            conn.commit()
            logger.info(f"[FileStorage] Saved file: {filename} (ID: {file_hash})")

        except sqlite3.OperationalError as e:
            # Se a tabela não existe, inicializar e tentar novamente
            if "no such table" in str(e):
                logger.warning(
                    "[FileStorage] Table not found, initializing database..."
                )
                conn.close()
                FileStorage.init_db()
                # Retry
                return FileStorage.save_file(content, filename, mime_type)
            else:
                raise
        finally:
            conn.close()

        return file_hash

    @staticmethod
    def get_file(file_hash: str) -> Optional[Dict[str, Any]]:
        """
        Recupera arquivo pelo ID.

        Returns:
            {
                "file_hash": "a7f3c2e1",
                "filename": "nota.pdf",
                "mime_type": "application/pdf",
                "content": bytes
            }
        """
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        try:
            cursor.execute(
                """
                SELECT file_hash, filename, mime_type, content_base64
                FROM files
                WHERE file_hash = ?
            """,
                (file_hash,),
            )

            row = cursor.fetchone()

            if not row:
                return None

            # Decode base64
            content = base64.b64decode(row["content_base64"])

            return {
                "file_hash": row["file_hash"],
                "filename": row["filename"],
                "mime_type": row["mime_type"],
                "content": content,
            }

        except sqlite3.OperationalError as e:
            # Se a tabela não existe, inicializar
            if "no such table" in str(e):
                logger.warning(
                    "[FileStorage] Table not found, initializing database..."
                )
                conn.close()
                FileStorage.init_db()
                return None  # Arquivo não existe após inicialização
            else:
                raise
        finally:
            conn.close()


# Initialize database on import
FileStorage.init_db()


class FileProcessor:
    """Processa arquivos convertendo para base64 para o Gemini."""

    # Tipos de arquivos suportados pelo Gemini
    SUPPORTED_MIME_TYPES = {
        # Imagens
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/webp",
        "image/heic",
        "image/heif",
        "image/gif",
        # PDFs
        "application/pdf",
        # Documentos de texto
        "text/plain",
        "text/html",
        "text/css",
        "text/javascript",
        "text/typescript",
        "application/x-javascript",
        "application/javascript",
        "application/json",
        "application/xml",
        "text/xml",
        # Documentos
        "application/rtf",
        "text/rtf",
        # Code - variações de MIME types
        "text/x-python",
        "application/x-python",
        "application/x-python-code",
        "text/x-script.python",
        "text/x-java-source",
        "text/x-java",
        "text/x-c",
        "text/x-c++",
        "text/x-c++src",
        "text/x-csharp",
        "text/x-php",
        "text/x-ruby",
        "text/x-shellscript",
        "application/x-sh",
        "text/x-sh",
        "text/x-go",
        "text/x-golang",
        "text/x-rust",
        "text/x-rustsrc",
        "text/markdown",
        "text/x-markdown",
    }

    # Mapeamento de extensões para MIME types corretos
    EXTENSION_TO_MIME = {
        # Code
        ".py": "text/x-python",
        ".js": "text/javascript",
        ".jsx": "text/javascript",
        ".ts": "text/typescript",
        ".tsx": "text/typescript",
        ".java": "text/x-java",
        ".c": "text/x-c",
        ".cpp": "text/x-c++",
        ".cc": "text/x-c++",
        ".h": "text/x-c",
        ".hpp": "text/x-c++",
        ".cs": "text/x-csharp",
        ".php": "text/x-php",
        ".rb": "text/x-ruby",
        ".sh": "text/x-shellscript",
        ".bash": "text/x-shellscript",
        ".go": "text/x-go",
        ".rs": "text/x-rust",
        # Markup/Data
        ".html": "text/html",
        ".htm": "text/html",
        ".css": "text/css",
        ".json": "application/json",
        ".xml": "text/xml",
        ".md": "text/markdown",
        ".markdown": "text/markdown",
        ".txt": "text/plain",
        # Images
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
        # Documents
        ".pdf": "application/pdf",
    }

    @classmethod
    def get_mime_from_filename(cls, filename: str) -> str | None:
        """
        Tenta determinar o MIME type baseado na extensão do arquivo.

        Args:
            filename: Nome do arquivo

        Returns:
            MIME type ou None se não reconhecido
        """
        from pathlib import Path

        ext = Path(filename).suffix.lower()
        return cls.EXTENSION_TO_MIME.get(ext)

    @classmethod
    def is_supported(cls, mime_type: str, filename: str = "") -> bool:
        """
        Verifica se o tipo de arquivo é suportado.

        Args:
            mime_type: Tipo MIME do arquivo
            filename: Nome do arquivo (usado como fallback)

        Returns:
            True se suportado, False caso contrário
        """
        # Primeiro, verificar MIME type direto
        if mime_type in cls.SUPPORTED_MIME_TYPES:
            return True

        # Fallback: verificar por extensão de arquivo
        if filename:
            detected_mime = cls.get_mime_from_filename(filename)
            if detected_mime and detected_mime in cls.SUPPORTED_MIME_TYPES:
                return True

        return False

    @classmethod
    def process_file(
        cls,
        file_content: bytes,
        filename: str,
        mime_type: str,
        save_to_storage: bool = True,
    ) -> Dict[str, Any]:
        """
        Processa um arquivo convertendo para base64.

        Args:
            file_content: Bytes do arquivo
            filename: Nome do arquivo
            mime_type: Tipo MIME do arquivo
            save_to_storage: Se True, salva no FileStorage e retorna file_hash

        Returns:
            Dict com informações do arquivo processado
            Se save_to_storage=True, inclui "file_hash" (8 chars)
        """
        # Tentar corrigir MIME type baseado na extensão se necessário
        detected_mime = cls.get_mime_from_filename(filename)
        if detected_mime and (
            mime_type not in cls.SUPPORTED_MIME_TYPES
            or mime_type == "application/octet-stream"
        ):
            logger.info(
                f"[FileProcessor] Corrigindo MIME type de {mime_type} para {detected_mime} "
                f"baseado na extensão de {filename}"
            )
            mime_type = detected_mime

        # Verificar se é suportado
        if not cls.is_supported(mime_type, filename):
            raise ValueError(
                f"Tipo de arquivo não suportado: {mime_type}. Arquivo: {filename}"
            )

        try:
            # Converter para base64
            base64_data = base64.b64encode(file_content).decode("utf-8")
            result = {
                "type": "media",
                "filename": filename,
                "mime_type": mime_type,
                "size": len(file_content),
                "data": base64_data,
            }

            # Salvar no storage se solicitado
            if save_to_storage:
                file_hash = FileStorage.save_file(file_content, filename, mime_type)
                result["file_hash"] = file_hash

            logger.info(
                f"[FileProcessor] Arquivo processado: {filename} "
                f"({mime_type}, {len(file_content)} bytes)"
                + (f", ID: {result.get('file_hash')}" if save_to_storage else "")
            )

            return result
        except Exception as e:
            logger.error(f"[FileProcessor] Erro ao processar arquivo {filename}: {e}")
            raise

    @classmethod
    def create_langchain_content(
        cls, message: str, files: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Cria conteúdo no formato LangChain para mensagens multimodais.

        Args:
            message: Mensagem de texto do usuário
            files: Lista de arquivos processados

        Returns:
            Lista de dicts no formato esperado pelo LangChain/Gemini
        """
        content = []

        # Adicionar texto se houver
        if message and message.strip():
            content.append({"type": "text", "text": message})

        # Adicionar arquivos no formato especificado (ordem exata dos campos)
        for file_info in files:
            content.append(file_info)

        logger.info(
            f"[FileProcessor] Criado conteúdo multimodal: "
            f"{len([c for c in content if c['type'] == 'text'])} texto(s), "
            f"{len([c for c in content if c['type'] == 'media'])} arquivo(s)"
        )
        return content
