"""
Processador de arquivos para o agente.
Converte arquivos para base64 para envio ao Gemini (processamento nativo).
"""

import base64
from typing import Dict, Any, List

from src.utils.log import logger


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
        cls, file_content: bytes, filename: str, mime_type: str
    ) -> Dict[str, Any]:
        """
        Processa um arquivo convertendo para base64.

        Args:
            file_content: Bytes do arquivo
            filename: Nome do arquivo
            mime_type: Tipo MIME do arquivo

        Returns:
            Dict com informações do arquivo processado
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

            logger.info(
                f"[FileProcessor] Arquivo processado: {filename} "
                f"({mime_type}, {len(file_content)} bytes)"
            )

            return {
                "filename": filename,
                "mime_type": mime_type,
                "data": base64_data,
                "size": len(file_content),
            }
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

        # Adicionar arquivos no formato inline_data (Gemini native format)
        for file_info in files:
            content.append(
                {
                    "type": "media",
                    "mime_type": file_info["mime_type"],
                    "data": file_info["data"],
                    "filename": file_info["filename"],  # Preservar filename para download
                }
            )

        logger.info(
            f"[FileProcessor] Criado conteúdo multimodal: "
            f"{len([c for c in content if c['type'] == 'text'])} texto(s), "
            f"{len([c for c in content if c['type'] == 'media'])} arquivo(s)"
        )
        return content
