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
}

export interface InstrucaoItem {
  tema?: string;
  instrucoes?: string;
}
