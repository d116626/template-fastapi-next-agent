'use client';

import { API_BASE_URL } from '@/app/components/config';

// --- Interfaces ---

export interface ChatRequestPayload {
  user_id: string;
  message: string;
  system_prompt?: string;
  session_timeout_seconds?: number;
  use_whatsapp_format?: boolean;
}

export interface ToolCall {
  name: string;
  arguments: string;
  tool_call_id: string;
}

export interface ToolReturn {
  text?: string;
  message?: string;
  [key: string]: unknown;
}

export interface AgentMessage {
  id: string;
  date: string;
  name: string | null;
  message_type: 'tool_call_message' | 'tool_return_message' | 'assistant_message' | 'user_message';
  tool_call?: ToolCall;
  tool_return?: ToolReturn;
  content?: string | any[]; // Can be string or multimodal array
}

export interface ChatResponseData {
  user_id: string;
  messages: AgentMessage[];
}

// --- History Interfaces ---

export interface HistoryMessage extends AgentMessage {}

export interface HistoryResponseData {
  user_id: string;
  messages: HistoryMessage[];
  count: number;
}

// --- Delete History Interfaces ---

export interface DeleteHistoryResponseData {
  message: string;
}

// --- API Functions ---

export async function sendChatMessage(
  payload: ChatRequestPayload,
  token: string,
  files?: File[]
): Promise<ChatResponseData> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutos

  try {
    // Sempre usar FormData (unificado)
    const formData = new FormData();
    formData.append('message', payload.message);
    formData.append('user_id', payload.user_id);

    if (payload.system_prompt) {
      formData.append('system_prompt', payload.system_prompt);
    }

    if (payload.session_timeout_seconds !== undefined) {
      formData.append('session_timeout_seconds', payload.session_timeout_seconds.toString());
    }

    if (payload.use_whatsapp_format !== undefined) {
      formData.append('use_whatsapp_format', payload.use_whatsapp_format.toString());
    }

    // Adicionar arquivos se houver
    if (files && files.length > 0) {
      files.forEach((file) => {
        formData.append('files', file);
      });
    }

    const res = await fetch(`${API_BASE_URL}/api/v1/chat/message`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        // Não definir Content-Type - o browser define automaticamente com boundary
      },
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      if (res.status === 502) {
        throw new Error('O servidor está demorando muito para responder. Aguarde alguns instantes e tente novamente.');
      }

      const errorData = await res.json().catch(() => ({ detail: 'Failed to parse error response.' }));
      throw new Error(errorData.detail || `Request failed with status ${res.status}`);
    }

    const data: ChatResponseData = await res.json();

    if (!data.messages) {
      throw new Error("Resposta da API inválida: campo 'messages' ausente.");
    }

    return data;

  } catch (error) {
    clearTimeout(timeoutId);
    console.error("Error sending chat message:", error);

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error("Timeout: A requisição demorou mais de 5 minutos para responder.");
      }
    }

    throw error;
  }
}

export async function getUserHistory(
  userId: string,
  token: string,
  limit?: number,
  sessionTimeoutSeconds?: number,
  useWhatsappFormat: boolean = true
): Promise<HistoryResponseData> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 segundos

    const url = new URL(`${API_BASE_URL}/api/v1/chat/history/${userId}`);
    if (limit) {
      url.searchParams.append('limit', limit.toString());
    }
    if (sessionTimeoutSeconds !== undefined) {
      url.searchParams.append('session_timeout_seconds', sessionTimeoutSeconds.toString());
    }
    url.searchParams.append('use_whatsapp_format', useWhatsappFormat.toString());

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ detail: 'Failed to parse error response.' }));
      throw new Error(errorData.detail || `Request failed with status ${res.status}`);
    }

    const data: HistoryResponseData = await res.json();

    if (!data.messages) {
      throw new Error("Resposta da API inválida: campo 'messages' ausente.");
    }

    return data;

  } catch (error) {
    console.error("Error fetching user history:", error);

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error("Timeout: A requisição de histórico demorou mais de 30 segundos para responder.");
      }
      throw error;
    }

    throw new Error("Erro desconhecido ao buscar histórico.");
  }
}

export async function deleteUserHistory(userId: string, token: string): Promise<DeleteHistoryResponseData> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 segundos

    const res = await fetch(`${API_BASE_URL}/api/v1/chat/history/${userId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ detail: 'Failed to parse error response.' }));
      throw new Error(errorData.detail || `Request failed with status ${res.status}`);
    }

    const data: DeleteHistoryResponseData = await res.json();

    return data;

  } catch (error) {
    console.error("Error deleting user history:", error);

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error("Timeout: A requisição de exclusão demorou mais de 30 segundos para responder.");
      }
      throw error;
    }

    throw new Error("Erro desconhecido ao deletar histórico.");
  }
}
