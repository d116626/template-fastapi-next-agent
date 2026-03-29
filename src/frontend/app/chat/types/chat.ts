import { ChatResponseData } from '../services/api';

// Multimodal content types
export type MultimodalContent = string | MultimodalContentItem[];

export interface MultimodalContentItem {
  type: 'text' | 'media' | 'image_url';
  text?: string;
  mime_type?: string;
  data?: string;
  filename?: string;
  image_url?: {
    url: string;
  };
}

export interface DisplayMessage {
  sender: 'user' | 'bot';
  content: MultimodalContent;
  fullResponse?: ChatResponseData;
  timestamp?: string;
  latency?: number;
  isTimeoutError?: boolean;
  isStreaming?: boolean;
  streamingThinking?: string;
  thinkingExpanded?: boolean; // Track if user expanded thinking accordion
  // For export purposes - preserve message type and tool data
  messageType?: 'user_message' | 'assistant_message' | 'reasoning_message' | 'tool_call_message' | 'tool_return_message';
  reasoning?: string;
  toolCall?: { name: string; arguments: string };
  toolReturn?: any;
}

export interface InstrucaoItem {
  tema?: string;
  instrucoes?: string;
}
