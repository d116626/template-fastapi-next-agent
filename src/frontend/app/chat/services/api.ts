'use client';

import { API_BASE_URL } from '@/app/components/config';

// --- Interfaces ---

export interface ChatRequestPayload {
  user_id: string;
  message: string;
  system_prompt?: string;
  model?: string;
  temperature?: number;
  include_thoughts?: boolean;
  thinking_budget?: number;
  session_timeout_seconds?: number;
  use_whatsapp_format?: boolean;
}

export interface ModelInfo {
  code: string;
  name: string;
  description: string;
  supports_thinking: boolean;
  supports_images: boolean;
  supports_function_calling: boolean;
  input_token_limit: number;
  output_token_limit: number;
}

export interface ModelsListResponse {
  models: ModelInfo[];
}

export interface SystemPrompt {
  id: string;
  name: string;
  prompt: string;
  created_at?: string;
  updated_at?: string;
}

export interface SystemPromptsListResponse {
  prompts: SystemPrompt[];
}

export interface SystemPromptCreate {
  name: string;
  prompt: string;
}

export interface SystemPromptUpdate {
  name?: string;
  prompt?: string;
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
  message_type: 'tool_call_message' | 'tool_return_message' | 'assistant_message' | 'user_message' | 'reasoning_message' | 'usage_statistics';
  tool_call?: ToolCall;
  tool_return?: ToolReturn;
  content?: string | any[]; // Can be string or multimodal array
  reasoning?: string; // For reasoning_message type
  session_id?: string; // Session identifier for history grouping
  model_name?: string; // Model used for this message
  finish_reason?: string; // Reason the message generation finished
  usage_metadata?: Record<string, any>; // Token usage and other metadata
}

export interface ChatResponseData {
  user_id: string;
  messages: AgentMessage[];
  usage?: Record<string, any>; // Usage statistics for the conversation
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

// System Prompts

export async function getSystemPrompts(token: string): Promise<SystemPromptsListResponse> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/system-prompts`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch system prompts: ${res.status}`);
    }

    const data: SystemPromptsListResponse = await res.json();
    return data;

  } catch (error) {
    console.error("Error fetching system prompts:", error);
    throw error;
  }
}

export async function createSystemPrompt(token: string, data: SystemPromptCreate): Promise<SystemPrompt> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/system-prompts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ detail: 'Failed to create prompt' }));
      throw new Error(errorData.detail || `Failed to create prompt: ${res.status}`);
    }

    const prompt: SystemPrompt = await res.json();
    return prompt;

  } catch (error) {
    console.error("Error creating system prompt:", error);
    throw error;
  }
}

export async function updateSystemPrompt(token: string, id: string, data: SystemPromptUpdate): Promise<SystemPrompt> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/system-prompts/${id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ detail: 'Failed to update prompt' }));
      throw new Error(errorData.detail || `Failed to update prompt: ${res.status}`);
    }

    const prompt: SystemPrompt = await res.json();
    return prompt;

  } catch (error) {
    console.error("Error updating system prompt:", error);
    throw error;
  }
}

export async function deleteSystemPrompt(token: string, id: string): Promise<void> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/system-prompts/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ detail: 'Failed to delete prompt' }));
      throw new Error(errorData.detail || `Failed to delete prompt: ${res.status}`);
    }

  } catch (error) {
    console.error("Error deleting system prompt:", error);
    throw error;
  }
}

// Models

export async function getAvailableModels(token: string): Promise<ModelsListResponse> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/chat/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch models: ${res.status}`);
    }

    const data: ModelsListResponse = await res.json();
    return data;

  } catch (error) {
    console.error("Error fetching models:", error);
    throw error;
  }
}

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

    if (payload.model) {
      formData.append('model', payload.model);
    }

    if (payload.temperature !== undefined) {
      formData.append('temperature', payload.temperature.toString());
    }

    if (payload.include_thoughts !== undefined) {
      formData.append('include_thoughts', payload.include_thoughts.toString());
    }

    if (payload.thinking_budget !== undefined) {
      formData.append('thinking_budget', payload.thinking_budget.toString());
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

export async function sendChatMessageStream(
  payload: ChatRequestPayload,
  token: string,
  files?: File[],
  onChunk?: (chunk: any) => void,
  onFormatted?: (messages: AgentMessage[]) => void,
  onDone?: () => void,
  onError?: (error: Error) => void
): Promise<void> {
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

    if (payload.model) {
      formData.append('model', payload.model);
    }

    if (payload.temperature !== undefined) {
      formData.append('temperature', payload.temperature.toString());
    }

    if (payload.include_thoughts !== undefined) {
      formData.append('include_thoughts', payload.include_thoughts.toString());
    }

    if (payload.thinking_budget !== undefined) {
      formData.append('thinking_budget', payload.thinking_budget.toString());
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

    const res = await fetch(`${API_BASE_URL}/api/v1/chat/message/stream`, {
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

    // Read the stream
    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error('No response body stream available');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      // Decode chunk
      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE messages
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || ''; // Keep incomplete message in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6); // Remove "data: " prefix
          try {
            const chunk = JSON.parse(data);

            if (chunk.type === 'done') {
              onDone?.();
            } else if (chunk.type === 'error') {
              onError?.(new Error(chunk.error));
            } else if (chunk.type === 'formatted') {
              onFormatted?.(chunk.messages);
            } else {
              onChunk?.(chunk);
            }
          } catch (e) {
            console.error('Error parsing SSE chunk:', e);
          }
        }
      }
    }

  } catch (error) {
    clearTimeout(timeoutId);
    console.error("Error sending stream chat message:", error);

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        onError?.(new Error("Timeout: A requisição demorou mais de 5 minutos para responder."));
        return;
      }
      onError?.(error);
      return;
    }

    onError?.(new Error("Unknown error occurred"));
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
