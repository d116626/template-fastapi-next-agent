"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MessageSquare, History } from "lucide-react";
import { useAuth } from "@/app/contexts/AuthContext";
import {
  sendChatMessage,
  sendChatMessageStream,
  ChatRequestPayload,
  getUserHistory,
  HistoryMessage,
  deleteUserHistory,
  AgentMessage,
  getAvailableModels,
  ModelInfo,
  getSystemPrompts,
  createSystemPrompt,
  updateSystemPrompt,
  deleteSystemPrompt,
  SystemPrompt,
} from "../services/api";
import { marked } from "marked";
import { toast } from "sonner";
import { parseMarkdownWithCode, hasCodeBlocks } from "../utils/markdown";

import { DisplayMessage, MultimodalContent, MultimodalContentItem } from "../types/chat";

// Modules
import ChatSidebar from "./modules/ChatSidebar";
import ChatInput from "./modules/ChatInput";
import JsonViewer from "./modules/JsonViewer";
import ToolReturnViewer from "./modules/ToolReturnViewer";
import { AttachedFile } from "./modules/FileUpload";
import ImageModal from "./modules/ImageModal";
import {
  Bot,
  User,
  Copy,
  Search,
  BarChart2,
  Lightbulb,
  Wrench,
  LogIn,
  Clock,
  ShieldAlert,
  FileText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import DOMPurify from "dompurify";


// Configurar marked para processar quebras de linha
marked.use({ breaks: true });

// --- Utils ---

const getStepIcon = (
  messageType: AgentMessage["message_type"] | HistoryMessage["message_type"]
) => {
  switch (messageType) {
    case "reasoning_message":
      return <Lightbulb className="h-4 w-4 text-yellow-500" />;
    case "tool_call_message":
      return <Wrench className="h-4 w-4 text-blue-500" />;
    case "tool_return_message":
      return <LogIn className="h-4 w-4 text-green-500" />;
    case "user_message":
      return <User className="h-4 w-4 text-blue-600" />;
    case "assistant_message":
      return <Bot className="h-4 w-4 text-green-600" />;
    default:
      return null;
  }
};

const generateRandomNumber = (): string => {
  return Math.floor(100000000 + Math.random() * 900000000).toString();
};

const extractTextFromContent = (content: MultimodalContent | null | undefined): string => {
  if (!content) return '';

  if (typeof content === 'string') {
    return content;
  }

  // Extract text from multimodal content
  return content
    .filter(item => item.type === 'text' && item.text)
    .map(item => item.text || '')
    .join('\n');
};

const copyToClipboard = async (content: MultimodalContent | string | null | undefined) => {
  try {
    const text = typeof content === 'string' ? content : extractTextFromContent(content);
    await navigator.clipboard.writeText(text);
    toast.success("Copiado para a área de transferência!");
  } catch {
    toast.error("Erro ao copiar");
  }
};

const formatDuration = (seconds: number) => {
  if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${s}s`;
};

// --- Main Component ---

export default function ChatClient() {
  const { token } = useAuth();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevMessageCountRef = useRef<number>(0);

  // Estado para controlar se o componente já foi montado no cliente
  const [isMounted, setIsMounted] = useState(false);

  // Chat Parameters State
  const [userId, setUserId] = useState("");
  const [isUserIdFixed, setIsUserIdFixed] = useState(false);

  // Inicializa User ID e cadeado apenas uma vez no mount
  useEffect(() => {
    setIsMounted(true);

    // Recupera o User ID e estado do cadeado do localStorage
    const savedUserId = localStorage.getItem("chat-user-id");
    const savedFixed = localStorage.getItem("chat-user-id-fixed") === "true";

    // Define o User ID
    if (savedUserId) {
      // Se existe um User ID salvo, usa ele
      setUserId(savedUserId);
    } else if (!savedFixed) {
      // Só gera um novo número se não estiver travado
      setUserId(generateRandomNumber());
    }
    // Se não tem savedUserId E está travado, mantém vazio (userId = "")

    // Define o estado do cadeado
    setIsUserIdFixed(savedFixed);
  }, []); // Roda apenas uma vez no mount

  // Buscar modelos e prompts quando o token mudar
  useEffect(() => {
    const fetchModels = async () => {
      if (!token) return;

      setIsLoadingModels(true);
      try {
        const response = await getAvailableModels(token);
        setAvailableModels(response.models);
      } catch (error) {
        console.error("Error fetching models:", error);
        toast.error("Erro ao carregar modelos disponíveis");
      } finally {
        setIsLoadingModels(false);
      }
    };

    const fetchPrompts = async () => {
      if (!token) return;

      setIsLoadingPrompts(true);
      try {
        const response = await getSystemPrompts(token);
        setSystemPrompts(response.prompts);

        // Set default prompt if available
        if (response.prompts.length > 0 && !selectedPromptId) {
          const defaultPrompt = response.prompts.find(p => p.name === "Helpful Assistant") || response.prompts[0];
          setSelectedPromptId(defaultPrompt.id);
          setSystemPrompt(defaultPrompt.prompt);
        }
      } catch (error) {
        console.error("Error fetching system prompts:", error);
        toast.error("Erro ao carregar system prompts");
      } finally {
        setIsLoadingPrompts(false);
      }
    };

    fetchModels();
    fetchPrompts();
  }, [token]);

  // History States
  const [historyMessages, setHistoryMessages] = useState<HistoryMessage[]>(
    []
  );
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isDeletingHistory, setIsDeletingHistory] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // History Parameters
  const [sessionTimeoutSeconds, setSessionTimeoutSeconds] = useState(3600); // 1 hora default
  const [useWhatsappFormat, setUseWhatsappFormat] = useState(false);

  // Agent Parameters
  const [model, setModel] = useState("gemini-2.5-flash");
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful assistant.");
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [temperature, setTemperature] = useState(0.7);
  const [includeThoughts, setIncludeThoughts] = useState(true);
  const [thinkingBudget, setThinkingBudget] = useState(-1);
  const [responseMode, setResponseMode] = useState<'normal' | 'stream'>('normal');

  // Available models
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // System prompts
  const [systemPrompts, setSystemPrompts] = useState<SystemPrompt[]>([]);
  const [isLoadingPrompts, setIsLoadingPrompts] = useState(false);

  // Smart auto-scroll: only scroll when new messages are added AND user is near bottom
  useEffect(() => {
    if (!scrollAreaRef.current) return;

    const scrollContainer = scrollAreaRef.current;
    const totalMessages = messages.length + historyMessages.length;
    const isNewMessage = totalMessages > prevMessageCountRef.current;

    // Check if user is near bottom (within 100px)
    const isNearBottom =
      scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight < 100;

    // Only auto-scroll if:
    // 1. A new message was added (not just updated)
    // 2. AND user is already near the bottom (not reading old messages)
    if (isNewMessage && isNearBottom) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }

    // Update previous count
    prevMessageCountRef.current = totalMessages;
  }, [messages, historyMessages]);

  // Salva o User ID no localStorage quando mudar
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("chat-user-id", userId);
    }
  }, [userId]);

  // Salva o estado do cadeado no localStorage quando mudar
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("chat-user-id-fixed", isUserIdFixed.toString());
    }
  }, [isUserIdFixed]);

  // Carregar configurações do localStorage no mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedModel = localStorage.getItem("agent-config-model");
      const savedTemperature = localStorage.getItem("agent-config-temperature");
      const savedIncludeThoughts = localStorage.getItem("agent-config-include-thoughts");
      const savedThinkingBudget = localStorage.getItem("agent-config-thinking-budget");
      const savedResponseMode = localStorage.getItem("agent-config-response-mode");
      const savedSessionTimeout = localStorage.getItem("agent-config-session-timeout");
      const savedWhatsappFormat = localStorage.getItem("agent-config-whatsapp-format");
      const savedSelectedPromptId = localStorage.getItem("agent-config-selected-prompt-id");

      if (savedModel) setModel(savedModel);
      if (savedTemperature) setTemperature(parseFloat(savedTemperature));
      if (savedIncludeThoughts) setIncludeThoughts(savedIncludeThoughts === "true");
      if (savedThinkingBudget) setThinkingBudget(parseInt(savedThinkingBudget));
      if (savedResponseMode) setResponseMode(savedResponseMode as 'normal' | 'stream');
      if (savedSessionTimeout) setSessionTimeoutSeconds(parseInt(savedSessionTimeout));
      if (savedWhatsappFormat) setUseWhatsappFormat(savedWhatsappFormat === "true");
      if (savedSelectedPromptId) setSelectedPromptId(savedSelectedPromptId);
    }
  }, []);

  // Salvar configurações do agente no localStorage quando mudarem
  useEffect(() => {
    if (typeof window !== "undefined" && isMounted) {
      localStorage.setItem("agent-config-model", model);
      localStorage.setItem("agent-config-temperature", temperature.toString());
      localStorage.setItem("agent-config-include-thoughts", includeThoughts.toString());
      localStorage.setItem("agent-config-thinking-budget", thinkingBudget.toString());
      localStorage.setItem("agent-config-response-mode", responseMode);
      localStorage.setItem("agent-config-session-timeout", sessionTimeoutSeconds.toString());
      localStorage.setItem("agent-config-whatsapp-format", useWhatsappFormat.toString());
      if (selectedPromptId) {
        localStorage.setItem("agent-config-selected-prompt-id", selectedPromptId);
      }
    }
  }, [model, temperature, includeThoughts, thinkingBudget, responseMode, sessionTimeoutSeconds, useWhatsappFormat, selectedPromptId, isMounted]);

  const [requestStartTime, setRequestStartTime] = useState<number | null>(
    null
  );
  const isSendingRef = useRef(false);

  // File attachment state
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);

  // Image modal state
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{
    url: string;
    filename?: string;
  } | null>(null);

  const openImageModal = (url: string, filename?: string) => {
    setSelectedImage({ url, filename });
    setImageModalOpen(true);
  };

  const closeImageModal = () => {
    setImageModalOpen(false);
    setSelectedImage(null);
  };

  // System prompt handlers
  const handleCreatePrompt = async (name: string, prompt: string) => {
    if (!token) return;

    try {
      const newPrompt = await createSystemPrompt(token, { name, prompt });
      setSystemPrompts(prev => [newPrompt, ...prev]);
      setSelectedPromptId(newPrompt.id);
      setSystemPrompt(newPrompt.prompt);
      toast.success("System prompt criado com sucesso!");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erro ao criar prompt";
      toast.error(errorMessage);
      throw error;
    }
  };

  const handleUpdatePrompt = async (id: string, name?: string, prompt?: string) => {
    if (!token) return;

    try {
      const updatedPrompt = await updateSystemPrompt(token, id, { name, prompt });
      setSystemPrompts(prev => prev.map(p => p.id === id ? updatedPrompt : p));

      if (selectedPromptId === id && prompt) {
        setSystemPrompt(prompt);
      }

      toast.success("System prompt atualizado com sucesso!");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erro ao atualizar prompt";
      toast.error(errorMessage);
      throw error;
    }
  };

  const handleDeletePrompt = async (id: string) => {
    if (!token) return;

    try {
      await deleteSystemPrompt(token, id);
      setSystemPrompts(prev => prev.filter(p => p.id !== id));

      if (selectedPromptId === id) {
        const remaining = systemPrompts.filter(p => p.id !== id);
        if (remaining.length > 0) {
          setSelectedPromptId(remaining[0].id);
          setSystemPrompt(remaining[0].prompt);
        } else {
          setSelectedPromptId(null);
          setSystemPrompt("You are a helpful assistant.");
        }
      }

      toast.success("System prompt deletado com sucesso!");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erro ao deletar prompt";
      toast.error(errorMessage);
      throw error;
    }
  };

  const handleSelectPrompt = (promptId: string) => {
    const prompt = systemPrompts.find(p => p.id === promptId);
    if (prompt) {
      setSelectedPromptId(promptId);
      setSystemPrompt(prompt.prompt);
    }
  };

  // Export conversation handler
  const handleExportConversation = (format: 'markdown' | 'json' | 'text') => {
    const { exportConversation } = require('../utils/export');

    // Combinar histórico e mensagens atuais - incluindo TODOS os tipos de mensagens
    const historyMessagesFormatted: DisplayMessage[] = historyMessages
      .map(msg => {
        const isUserMsg = msg.message_type === 'user_message';
        const isAssistantMsg = msg.message_type === 'assistant_message';
        const isReasoning = msg.message_type === 'reasoning_message';
        const isToolCall = msg.message_type === 'tool_call_message';
        const isToolReturn = msg.message_type === 'tool_return_message';

        return {
          sender: isUserMsg ? 'user' as const : 'bot' as const,
          content: msg.content || '',
          timestamp: msg.date,
          latency: undefined,
          messageType: msg.message_type,
          reasoning: isReasoning ? msg.reasoning : undefined,
          toolCall: isToolCall ? msg.tool_call : undefined,
          toolReturn: isToolReturn ? msg.tool_return : undefined,
        };
      });

    const allMessages = [...historyMessagesFormatted, ...messages];

    if (allMessages.length === 0) {
      toast.error('Nenhuma mensagem para exportar');
      return;
    }

    exportConversation(allMessages, userId, format);
    toast.success(`Conversa exportada como ${format.toUpperCase()}!`);
  };

  const handleExportConfig = () => {
    const config = {
      model,
      temperature,
      includeThoughts,
      thinkingBudget,
      responseMode,
      sessionTimeoutSeconds,
      useWhatsappFormat,
      selectedPromptId,
      systemPrompt,
    };

    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-config-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('Configurações exportadas!');
  };

  const handleImportConfig = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async (e: Event) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const config = JSON.parse(text);

        // Apply configurations
        if (config.model) setModel(config.model);
        if (config.temperature !== undefined) setTemperature(config.temperature);
        if (config.includeThoughts !== undefined) setIncludeThoughts(config.includeThoughts);
        if (config.thinkingBudget !== undefined) setThinkingBudget(config.thinkingBudget);
        if (config.responseMode) setResponseMode(config.responseMode);
        if (config.sessionTimeoutSeconds !== undefined) setSessionTimeoutSeconds(config.sessionTimeoutSeconds);
        if (config.useWhatsappFormat !== undefined) setUseWhatsappFormat(config.useWhatsappFormat);
        if (config.selectedPromptId) setSelectedPromptId(config.selectedPromptId);
        if (config.systemPrompt) setSystemPrompt(config.systemPrompt);

        toast.success('Configurações importadas com sucesso!');
      } catch (error) {
        console.error('Error importing config:', error);
        toast.error('Erro ao importar configurações. Verifique se o arquivo é válido.');
      }
    };
    input.click();
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    // Verificação síncrona para evitar envios duplicados rápidos
    if (isSendingRef.current) return;
    if ((!input.trim() && attachedFiles.length === 0) || !token) return;

    isSendingRef.current = true;
    const startTime = Date.now();
    setRequestStartTime(startTime);

    // Criar mensagem de usuário com conteúdo multimodal se houver arquivos
    let messageContent: MultimodalContent;

    if (attachedFiles.length > 0) {
      // Criar array multimodal
      const contentItems: MultimodalContentItem[] = [];

      // Adicionar texto se houver
      if (input.trim()) {
        contentItems.push({
          type: 'text',
          text: input,
        });
      }

      // Adicionar arquivos
      for (const file of attachedFiles) {
        if (file.preview) {
          // Imagem com preview
          contentItems.push({
            type: 'image_url',
            filename: file.file.name,
            image_url: {
              url: file.preview,
            },
          });
        } else {
          // Arquivo sem preview (PDF, documento, etc)
          contentItems.push({
            type: 'media',
            filename: file.file.name,
            mime_type: file.file.type,
            data: file.file.name, // Placeholder - será substituído pelo base64 do backend
          });
        }
      }

      messageContent = contentItems;
    } else {
      // Apenas texto
      messageContent = input;
    }

    const userMessage: DisplayMessage = {
      sender: "user",
      content: messageContent,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => {
      return [...prev, userMessage];
    });

    const currentInput = input;
    const currentFiles = [...attachedFiles];

    setInput("");
    setAttachedFiles([]);
    setIsLoading(true);

    try {
      const payload: ChatRequestPayload = {
        user_id: userId,
        message: currentInput,
        system_prompt: systemPrompt,
        model: model,
        temperature: temperature,
        include_thoughts: includeThoughts,
        thinking_budget: thinkingBudget,
        session_timeout_seconds: sessionTimeoutSeconds,
        use_whatsapp_format: useWhatsappFormat,
      };

      // Enviar mensagem (com ou sem arquivos) baseado no modo selecionado
      if (responseMode === 'stream') {
        // Modo Stream (SSE)
        // Criar mensagem de bot inicial vazia para streaming
        const streamingBotMessage: DisplayMessage = {
          sender: "bot",
          content: "",
          timestamp: new Date().toISOString(),
          isStreaming: true,
          streamingThinking: "", // Para acumular thinking durante streaming
        };

        setMessages((prev) => [...prev, streamingBotMessage]);
        const streamingMessageIndex = messages.length + 1; // +1 porque já adicionamos a mensagem do usuário

        await sendChatMessageStream(
          payload,
          token,
          currentFiles.length > 0 ? currentFiles.map(f => f.file) : undefined,
          (chunk) => {
            // Callback para cada token recebido
            if (chunk.type === 'token' && chunk.content) {
              // Token de texto normal
              setMessages((prev) => {
                const updated = [...prev];
                if (updated[streamingMessageIndex]) {
                  const currentContent = typeof updated[streamingMessageIndex].content === 'string'
                    ? updated[streamingMessageIndex].content
                    : '';
                  updated[streamingMessageIndex] = {
                    ...updated[streamingMessageIndex],
                    content: currentContent + chunk.content,
                  };
                }
                return updated;
              });
            } else if (chunk.type === 'thinking_token' && chunk.content) {
              // Token de thinking
              setMessages((prev) => {
                const updated = [...prev];
                if (updated[streamingMessageIndex]) {
                  const currentThinking = updated[streamingMessageIndex].streamingThinking || '';
                  updated[streamingMessageIndex] = {
                    ...updated[streamingMessageIndex],
                    streamingThinking: currentThinking + chunk.content,
                  };
                }
                return updated;
              });
            }
          },
          (formattedMessages) => {
            // Callback quando recebe as mensagens formatadas
            const latency = (Date.now() - startTime) / 1000;
            const assistantMessage = formattedMessages.find(
              (m) => m.message_type === "assistant_message"
            );

            // Substituir mensagem de streaming pela versão final formatada
            setMessages((prev) => {
              const updated = [...prev];
              if (updated[streamingMessageIndex]) {
                const currentMsg = updated[streamingMessageIndex];
                updated[streamingMessageIndex] = {
                  sender: "bot",
                  content:
                    assistantMessage?.content ||
                    "Não foi possível obter uma resposta do assistente.",
                  fullResponse: { user_id: userId, messages: formattedMessages },
                  timestamp: new Date().toISOString(),
                  latency: latency,
                  isStreaming: false,
                  // Preserve thinking data and expansion state
                  streamingThinking: currentMsg.streamingThinking,
                  thinkingExpanded: currentMsg.thinkingExpanded,
                };
              }
              return updated;
            });
          },
          () => {
            // Callback quando stream termina
            console.log('Stream done');
          },
          (error) => {
            // Callback de erro
            throw error;
          }
        );
      } else {
        // Modo Normal
        const botResponseData = await sendChatMessage(
          payload,
          token,
          currentFiles.length > 0 ? currentFiles.map(f => f.file) : undefined
        );

        const latency = (Date.now() - startTime) / 1000;
        const assistantMessage = botResponseData.messages.find(
          (m) => m.message_type === "assistant_message"
        );

        const botMessage: DisplayMessage = {
          sender: "bot",
          content:
            assistantMessage?.content ||
            "Não foi possível obter uma resposta do assistente.",
          fullResponse: botResponseData,
          timestamp: new Date().toISOString(),
          latency: latency,
        };
        setMessages((prev) => {
          return [...prev, botMessage];
        });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred.";

      const isConnectionError =
        errorMessage.includes("connection is closed") ||
        errorMessage.includes("Failed to fetch") ||
        errorMessage.includes("NetworkError");

      const isTimeout =
        errorMessage.includes("Timeout") || errorMessage.includes("504");

      if (isTimeout || isConnectionError) {
        // Silenciosamente falha no chat, apenas avisa via toast se necessário
        // O usuário pediu para não mostrar msg de erro no chat para não confundir
        console.warn("Timeout ou erro de conexão:", errorMessage);

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        const botErrorMessage: DisplayMessage = { 
          sender: 'bot', 
          content: `⚠️ **O servidor está demorando para responder.**\n\nSua mensagem foi enviada, mas não recebemos a confirmação em tempo hábil (${duration}s).\n\n**O que fazer:**\n1. Aguarde alguns instantes.\n2. Clique em **"Carregar Histórico"** no menu lateral para verificar se a resposta já foi processada.\n3. Se o problema persistir, tente novamente mais tarde.`,
          timestamp: new Date().toISOString(),
          latency: parseFloat(duration),
          isTimeoutError: true
        };
        setMessages((prev) => {
          // Evitar duplicação se a última mensagem já for um erro de timeout
          if (prev.length > 0 && prev[prev.length - 1].isTimeoutError) {
            return prev;
          }
          return [...prev, botErrorMessage];
        });
      } else {
        toast.error("Erro ao enviar mensagem.");
        // Opcional: Adicionar msg de erro no chat apenas para erros fatais não-timeout
        // const botErrorMessage: DisplayMessage = { sender: 'bot', content: `Erro: ${errorMessage}` };
        // setMessages(prev => [...prev, botErrorMessage]);
      }
    } finally {
      setIsLoading(false);
      setRequestStartTime(null);
      isSendingRef.current = false;
      // Retornar foco para o textarea após o envio
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  };

  const handleGenerateNumber = () => {
    if (!isUserIdFixed) {
      const newUserId = generateRandomNumber();
      setUserId(newUserId);
      // Limpar histórico e mensagens atuais
      setHistoryMessages([]);
      setMessages([]);
      toast.success("Novo User ID gerado e tela limpa!");
    } else {
      toast.error("User ID está travado! Desbloqueie primeiro.");
    }
  };

  const handleToggleFixNumber = () => {
    setIsUserIdFixed(!isUserIdFixed);
    toast.success(isUserIdFixed ? "User ID desbloqueado!" : "User ID fixado!");
  };

  const handleCopyNumber = () => {
    copyToClipboard(userId);
  };

  const handleLoadHistory = async () => {
    if (!token) {
      toast.error("Token de autenticação não encontrado!");
      return;
    }

    if (isLoadingHistory) {
      return;
    }

    setIsLoadingHistory(true);
    setHistoryError(null);

    try {
      const historyData = await getUserHistory(
        userId,
        token,
        undefined, // limit
        sessionTimeoutSeconds,
        useWhatsappFormat
      );

      const uniqueMessages = historyData.messages;

      setHistoryMessages(uniqueMessages);

      // Limpar chat atual quando carregar histórico
      setMessages([]);

      // Filtrar apenas mensagens de conversa (não usage_statistics)
      const conversationMessages = uniqueMessages.filter(
        (msg) => msg.message_type !== "usage_statistics"
      );

      toast.success(
        `Histórico carregado! ${conversationMessages.length} mensagens encontradas.`
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Erro desconhecido ao carregar histórico.";
      setHistoryError(errorMessage);
      toast.error(`Erro ao carregar histórico: ${errorMessage}`);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleDeleteHistory = async () => {
    if (!token) {
      toast.error("Token de autenticação não encontrado!");
      return;
    }

    setIsDeletingHistory(true);
    setHistoryError(null);
    setShowDeleteModal(false);

    try {
      const deleteResult = await deleteUserHistory(userId, token);

      // Limpar histórico carregado e chat atual
      setHistoryMessages([]);
      setMessages([]);

      toast.success(
        deleteResult.message || "Histórico deletado com sucesso!"
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Erro desconhecido ao deletar histórico.";
      setHistoryError(errorMessage);
      toast.error(`Erro ao deletar histórico: ${errorMessage}`);
    } finally {
      setIsDeletingHistory(false);
    }
  };

  // Helper to render message content (handles both text and multimodal content)
  const renderMessageContent = (content: any, isUser: boolean) => {
    // Handle multimodal content (array format)
    if (Array.isArray(content)) {
      // Separar texto de arquivos/imagens
      const textItems = content.filter(item => item.type === "text");
      const mediaItems = content.filter(item => item.type === "media" || item.type === "image_url");

      return (
        <div className="p-6">
          {/* Texto primeiro */}
          {textItems.length > 0 && (
            <div className="space-y-2">
              {textItems.map((item: any, index: number) => {
                const text = item.text;
                const isDarkMode = typeof window !== 'undefined'
                  ? document.documentElement.classList.contains('dark')
                  : false;

                // Check if text contains code blocks
                if (hasCodeBlocks(text)) {
                  const elements = parseMarkdownWithCode(text, isDarkMode, isUser);
                  return (
                    <div key={`text-${index}`}>
                      {elements}
                    </div>
                  );
                }

                // Fallback to regular markdown parsing
                const parsed = marked.parse(text, { breaks: true }) as string;
                const styledHTML = parsed.replace(
                  /<pre><code class="language-json">/g,
                  `<pre style="background-color: transparent; padding: 1rem; border-radius: 0; overflow-x: auto; white-space: pre-wrap; word-break: break-all; margin: 0;"><code class="language-json" style="font-family: ui-monospace, SFMono-Regular, Consolas, monospace;">`
                );

                const baseStyles: React.CSSProperties = isUser
                  ? {}
                  : {
                      "--tw-prose-pre-bg": "rgb(31 41 55)",
                      "--tw-prose-pre-code": "rgb(209 213 219)",
                    } as React.CSSProperties;

                return (
                  <div key={`text-${index}`}>
                    <div
                      className={`prose prose-lg dark:prose-invert max-w-none whitespace-pre-wrap break-words overflow-wrap-anywhere ${
                        isUser ? "text-primary-foreground user-message-content" : ""
                      }`}
                      style={baseStyles}
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(styledHTML, { ADD_ATTR: ["style"] }),
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* Anexos depois */}
          {mediaItems.length > 0 && (
            <div className={`flex flex-wrap gap-2 ${textItems.length > 0 ? "mt-3 pt-3 border-t" : ""} ${
              isUser ? "border-white/10" : "border-border/30"
            }`}>
              {mediaItems.map((item: any, index: number) => {
            // Media content (images, PDFs, etc)
            if (item.type === "media" && item.mime_type && item.data) {
              const mimeType = item.mime_type;
              const isImage = mimeType.startsWith("image/");
              const imageUrl = `data:${mimeType};base64,${item.data}`;
              const filename = item.filename || "file";

              if (isImage) {
                // Thumbnail clicável para expandir
                return (
                  <div key={index} className="inline-block mr-2 mb-2">
                    <div
                      className={`relative group cursor-pointer inline-block rounded-lg overflow-hidden border-2 transition-all ${
                        isUser
                          ? "border-white/20 hover:border-white/60"
                          : "border-primary/20 hover:border-primary/60"
                      }`}
                      onClick={() => openImageModal(imageUrl, filename)}
                    >
                      <img
                        src={imageUrl}
                        alt={filename}
                        className="transition-transform group-hover:scale-105"
                        style={{
                          maxHeight: "100px",
                          maxWidth: "100px",
                          objectFit: "cover",
                        }}
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <div className="bg-black/60 rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Search className="h-4 w-4 text-white" />
                        </div>
                      </div>
                    </div>
                    {filename && (
                      <p
                        className={`text-xs mt-1 truncate max-w-[100px] ${
                          isUser ? "text-primary-foreground/80" : "text-muted-foreground"
                        }`}
                      >
                        {filename}
                      </p>
                    )}
                  </div>
                );
              } else {
                // Link de download para arquivos não-imagem
                const handleDownload = () => {
                  const link = document.createElement("a");
                  link.href = imageUrl;
                  link.download = filename;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                };

                // Determinar ícone baseado no tipo
                const getFileIcon = () => {
                  if (mimeType.includes("pdf")) return "📄";
                  if (mimeType.includes("python")) return "🐍";
                  if (mimeType.includes("javascript") || mimeType.includes("typescript")) return "📜";
                  if (mimeType.includes("json")) return "📋";
                  if (mimeType.includes("markdown")) return "📝";
                  return "📎";
                };

                return (
                  <div
                    key={index}
                    onClick={handleDownload}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer transition-all group ${
                      isUser
                        ? "bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/40"
                        : "bg-primary/5 hover:bg-primary/10 border border-primary/20 hover:border-primary/40"
                    }`}
                  >
                    <span className="text-lg">{getFileIcon()}</span>
                    <div className="flex flex-col min-w-0">
                      <span
                        className={`text-sm font-medium truncate max-w-[200px] ${
                          isUser
                            ? "text-primary-foreground group-hover:underline"
                            : "text-foreground group-hover:underline"
                        }`}
                      >
                        {filename}
                      </span>
                      <span
                        className={`text-xs truncate ${
                          isUser ? "text-primary-foreground/70" : "text-muted-foreground"
                        }`}
                      >
                        {mimeType.split("/")[1] || mimeType}
                      </span>
                    </div>
                  </div>
                );
              }
            }

            // Image URL format (alternative format)
            if (item.type === "image_url" && item.image_url?.url) {
              const imageUrl = item.image_url.url;
              const filename = item.filename || "image";

              return (
                <div key={index} className="inline-block mr-2 mb-2">
                  <div
                    className={`relative group cursor-pointer inline-block rounded-lg overflow-hidden border-2 transition-all ${
                      isUser
                        ? "border-white/20 hover:border-white/60"
                        : "border-primary/20 hover:border-primary/60"
                    }`}
                    onClick={() => openImageModal(imageUrl, filename)}
                  >
                    <img
                      src={imageUrl}
                      alt={filename}
                      className="transition-transform group-hover:scale-105"
                      style={{
                        maxHeight: "100px",
                        maxWidth: "100px",
                        objectFit: "cover",
                      }}
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <div className="bg-black/60 rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Search className="h-4 w-4 text-white" />
                      </div>
                    </div>
                  </div>
                  {filename && (
                    <p
                      className={`text-xs mt-1 truncate max-w-[100px] ${
                        isUser ? "text-primary-foreground/80" : "text-muted-foreground"
                      }`}
                    >
                      {filename}
                    </p>
                  )}
                </div>
              );
            }

            return null;
              })}
            </div>
          )}
        </div>
      );
    }

    // Handle plain text content (string)
    const textContent = typeof content === "string" ? content : String(content || "");
    const isDarkMode = typeof window !== 'undefined'
      ? document.documentElement.classList.contains('dark')
      : false;

    // Check if text contains code blocks
    if (hasCodeBlocks(textContent)) {
      const elements = parseMarkdownWithCode(textContent, isDarkMode, isUser);
      return (
        <div className="p-6">
          {elements}
        </div>
      );
    }

    // Fallback to regular markdown parsing
    const parsed = marked.parse(textContent, { breaks: true }) as string;

    const styledHTML = parsed.replace(
      /<pre><code class="language-json">/g,
      `<pre style="background-color: transparent; padding: 1rem; border-radius: 0; overflow-x: auto; white-space: pre-wrap; word-break: break-all; margin: 0;"><code class="language-json" style="font-family: ui-monospace, SFMono-Regular, Consolas, monospace;">`
    );

    const baseStyles: React.CSSProperties = isUser
      ? {}
      : {
          "--tw-prose-pre-bg": "rgb(31 41 55)",
          "--tw-prose-pre-code": "rgb(209 213 219)",
        } as React.CSSProperties;

    return (
      <div className="p-6">
        <div
          className={`prose prose-lg dark:prose-invert max-w-none whitespace-pre-wrap break-words overflow-wrap-anywhere ${
            isUser ? "text-primary-foreground user-message-content" : ""
          }`}
          style={baseStyles}
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(styledHTML, { ADD_ATTR: ["style"] }),
          }}
        />
      </div>
    );
  };

  return (
    <div className="grid md:grid-cols-[1fr_350px] gap-6 h-full">
      {/* Painel do Chat (Esquerda) */}
      <Card className="flex flex-col h-full overflow-hidden">
        <CardHeader>
          <CardTitle>Chat</CardTitle>
        </CardHeader>
        <CardContent
          ref={scrollAreaRef}
          className="flex-1 overflow-y-auto p-4"
        >
          <div className="space-y-4">
            {/* Mensagens do Histórico */}
            {(() => {
              // Filtrar mensagens de conversa
              if (!historyMessages || historyMessages.length === 0) return null;

              const conversationMessages = historyMessages
                .filter(
                  (msg) =>
                    msg.message_type === "user_message" ||
                    msg.message_type === "assistant_message"
                );

              if (conversationMessages.length === 0) return null;

              // Criar mapeamento de session_id para número sequencial
              const uniqueSessionIds = Array.from(
                new Set(
                  conversationMessages
                    .map((msg) => msg.session_id)
                    .filter(Boolean)
                )
              );
              const sessionIdToNumber = Object.fromEntries(
                uniqueSessionIds.map((sessionId, index) => [
                  sessionId,
                  index + 1,
                ])
              );

              // Agrupar mensagens por sessão
              const groupedBySessions = uniqueSessionIds.map((sessionId) => ({
                sessionId,
                sessionNumber: sessionIdToNumber[sessionId || ""],
                messages: conversationMessages.filter(
                  (msg) => msg.session_id === sessionId
                ),
              }));

              return groupedBySessions.map((session) => (
                <div key={`session-${session.sessionId}`}>
                  {/* Separador da Sessão */}
                  <div className="flex items-center gap-4 py-4">
                    <div className="flex-1 border-t border-border"></div>
                    <div className="flex items-center gap-2 px-3 py-1 bg-muted/50 rounded-full border">
                      <History className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-muted-foreground">
                        Sessão {session.sessionNumber}
                      </span>
                    </div>
                    <div className="flex-1 border-t border-border"></div>
                  </div>

                  {/* Mensagens da Sessão */}

                  <div className="space-y-4">
                    {session.messages.map((msg, msgIndex) => {
                      return (
                        <div
                          key={`history-${msg.id}-${msgIndex}`}
                          className={`flex items-start gap-3 ${
                            msg.message_type === "user_message"
                              ? "justify-end"
                              : ""
                          }`}
                        >
                          {msg.message_type === "assistant_message" && (
                            <Bot className="h-6 w-6 text-primary flex-shrink-0" />
                          )}

                          <div
                            className={`w-full max-w-[80%] rounded-lg overflow-hidden ${
                              msg.message_type === "user_message"
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted"
                            }`}
                          >
                            <div className="relative group">
                              <div className="flex items-center gap-2 px-3 py-1 bg-black/10 border-b border-border/20">
                                <History className="h-3 w-3" />

                                <span className="text-xs font-mono">
                                  Sessão{" "}
                                  {sessionIdToNumber[msg.session_id || ""]} •{" "}
                                  {new Date(msg.date).toLocaleDateString(
                                    "pt-BR"
                                  )}{" "}
                                  {new Date(msg.date).toLocaleTimeString(
                                    "pt-BR",
                                    {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                      second: "2-digit",
                                    }
                                  )}
                                </span>

                                {(() => {
                                  if (msgIndex > 0) {
                                    const prevMsg =
                                      session.messages[msgIndex - 1];

                                    // Tempo de resposta do Assistente (User -> Assistant)

                                    if (
                                      msg.message_type ===
                                        "assistant_message" &&
                                      prevMsg.message_type === "user_message"
                                    ) {
                                      const diff =
                                        (new Date(msg.date).getTime() -
                                          new Date(prevMsg.date).getTime()) /
                                        1000;

                                      return (
                                        <span className="text-xs text-muted-foreground flex items-center gap-1 border-l border-muted-foreground/30 pl-2 ml-1">
                                          <Clock className="h-3 w-3" />

                                          {formatDuration(diff)}
                                        </span>
                                      );
                                    }

                                    // Tempo de pensamento do Usuário (Assistant -> User)

                                    if (
                                      msg.message_type === "user_message" &&
                                      prevMsg.message_type ===
                                        "assistant_message"
                                    ) {
                                      const diff =
                                        (new Date(msg.date).getTime() -
                                          new Date(prevMsg.date).getTime()) /
                                        1000;

                                      return (
                                        <span className="text-xs text-primary-foreground/80 flex items-center gap-1 border-l border-primary-foreground/30 pl-2 ml-1">
                                          <Clock className="h-3 w-3" />

                                          {formatDuration(diff)}
                                        </span>
                                      );
                                    }
                                  }

                                  return null;
                                })()}

                                {/* Copy button */}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className={`ml-auto h-6 w-6 ${
                                        msg.message_type === "user_message"
                                          ? "text-white/70 hover:text-white hover:bg-white/10"
                                          : "text-foreground/50 hover:text-foreground hover:bg-muted"
                                      }`}
                                      onClick={() =>
                                        copyToClipboard(msg.content)
                                      }
                                    >
                                      <Copy className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>

                                  <TooltipContent>
                                    <p>Copiar mensagem do histórico</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>

                              {renderMessageContent(
                                msg.content || "",
                                msg.message_type === "user_message"
                              )}
                            </div>

                            {msg.message_type === "assistant_message" && (
                              <div className="mt-3 pt-3 border-t border-muted/30">
                                <Accordion
                                  type="single"
                                  collapsible
                                  className="w-full"
                                >
                                  <AccordionItem
                                    value={`history-details-${msg.id}`}
                                    className="border-none"
                                  >
                                    <AccordionTrigger className="px-3 py-2 text-sm font-medium bg-background/50 hover:bg-background/80 rounded-md border border-border hover:border-border/80 transition-colors">
                                      <div className="flex items-center gap-2">
                                        <Search className="h-4 w-4 text-blue-600 dark:text-blue-400" />

                                        <span className="text-blue-600 dark:text-blue-400">
                                          Ver Detalhes (Histórico)
                                        </span>
                                      </div>
                                    </AccordionTrigger>

                                    <AccordionContent className="p-4 space-y-4">
                                      {/* Buscar todas as mensagens da interação */}

                                      {(() => {
                                        const currentIndex =
                                          historyMessages.findIndex(
                                            (m) => m.id === msg.id
                                          );

                                        if (currentIndex === -1) return null;

                                        let interactionStart = currentIndex;

                                        while (interactionStart > 0) {
                                          interactionStart--;

                                          if (
                                            historyMessages[interactionStart]
                                              .message_type === "user_message"
                                          ) {
                                            break;
                                          }
                                        }

                                        if (
                                          historyMessages[interactionStart]
                                            .message_type !== "user_message"
                                        ) {
                                          return null;
                                        }

                                        let interactionEnd = currentIndex;

                                        while (
                                          interactionEnd <
                                          historyMessages.length - 1
                                        ) {
                                          interactionEnd++;

                                          if (
                                            historyMessages[interactionEnd]
                                              .message_type === "user_message"
                                          ) {
                                            interactionEnd--;

                                            break;
                                          }
                                        }

                                        const interactionMessages =
                                          historyMessages.slice(
                                            interactionStart,
                                            interactionEnd + 1
                                          );

                                        const interactionSteps =
                                          interactionMessages.filter(
                                            (step) =>
                                              step.message_type !==
                                                "usage_statistics" &&
                                              step.message_type !==
                                                "user_message" &&
                                              step.id !== msg.id &&
                                              (step.message_type ===
                                                "tool_call_message" ||
                                                step.message_type ===
                                                  "tool_return_message" ||
                                                step.message_type ===
                                                  "reasoning_message")
                                          );

                                        return (
                                          <div className="space-y-2">
                                            {interactionSteps.length > 0 ? (
                                              interactionSteps.map(
                                                (step, stepIndex) => (
                                                  <div
                                                    key={`step-${step.id}-${stepIndex}`}
                                                    className="space-y-2 border-l-2 border-muted pl-3"
                                                  >
                                                    <div className="flex items-center gap-2">
                                                      {getStepIcon(
                                                        step.message_type
                                                      )}

                                                      <h5 className="font-semibold text-sm">
                                                        {step.message_type.replace(
                                                          /_/g,
                                                          " "
                                                        )}
                                                      </h5>

                                                      {step.name && (
                                                        <Badge variant="secondary">
                                                          {step.name}
                                                        </Badge>
                                                      )}
                                                    </div>

                                                    {step.reasoning && (
                                                      <p className="italic text-muted-foreground text-sm">
                                                        {step.reasoning}
                                                      </p>
                                                    )}

                                                    {step.tool_call && (
                                                      <div>
                                                        <p className="font-semibold text-sm capitalize mb-2">
                                                          Tool Call Arguments:
                                                        </p>

                                                        <JsonViewer
                                                          data={(() => {
                                                            try {
                                                              return typeof step
                                                                .tool_call
                                                                .arguments ===
                                                                "string"
                                                                ? JSON.parse(
                                                                    step
                                                                      .tool_call
                                                                      .arguments
                                                                  )
                                                                : step
                                                                    .tool_call
                                                                    .arguments;
                                                            } catch {
                                                              return {
                                                                raw: step
                                                                  .tool_call
                                                                  .arguments,
                                                              };
                                                            }
                                                          })()}
                                                        />
                                                      </div>
                                                    )}

                                                    {step.tool_return && (
                                                      <ToolReturnViewer
                                                        toolReturn={
                                                          step.tool_return
                                                        }
                                                        toolName={
                                                          step.name ||
                                                          undefined
                                                        }
                                                      />
                                                    )}

                                                    {step.content &&
                                                      step.message_type ===
                                                        "assistant_message" && (
                                                        <div>
                                                          <p className="font-semibold text-sm capitalize mb-2">
                                                            Resposta
                                                            Intermediária:
                                                          </p>

                                                          <div
                                                            className="prose prose-lg dark:prose-invert max-w-none bg-muted/30 p-2 rounded"
                                                            dangerouslySetInnerHTML={{
                                                              __html:
                                                                DOMPurify.sanitize(
                                                                  marked.parse(
                                                                    typeof step.content === 'string' ? step.content : extractTextFromContent(step.content),
                                                                    {
                                                                      breaks:
                                                                        true,
                                                                    }
                                                                  ) as string
                                                                ),
                                                            }}
                                                          />
                                                        </div>
                                                      )}
                                                  </div>
                                                )
                                              )
                                            ) : (
                                              <div className="text-sm text-muted-foreground italic">
                                                Resposta direta sem uso de
                                                ferramentas
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })()}

                                      <div className="space-y-2 pt-2 border-t">
                                        <h4 className="font-semibold">
                                          Informações da Mensagem
                                        </h4>

                                        <div className="text-sm space-y-1">
                                          <div>
                                            <span className="font-medium">
                                              ID:
                                            </span>{" "}
                                            {msg.id}
                                          </div>

                                          <div>
                                            <span className="font-medium">
                                              Session ID:
                                            </span>{" "}
                                            {msg.session_id}
                                          </div>

                                          <div>
                                            <span className="font-medium">
                                              Data:
                                            </span>{" "}
                                            {new Date(
                                              msg.date
                                            ).toLocaleString("pt-BR")}
                                          </div>

                                          <div>
                                            <span className="font-medium">
                                              Tipo:
                                            </span>{" "}
                                            {msg.message_type}
                                          </div>

                                          {msg.model_name && (
                                            <div>
                                              <span className="font-medium">
                                                Modelo:
                                              </span>{" "}
                                              {msg.model_name}
                                            </div>
                                          )}

                                          {msg.finish_reason && (
                                            <div>
                                              <span className="font-medium">
                                                Finish Reason:
                                              </span>{" "}
                                              {msg.finish_reason}
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      {msg.usage_metadata && (
                                        <div className="space-y-2 pt-2 border-t">
                                          <div className="flex items-center gap-2">
                                            <BarChart2 className="h-4 w-4 text-purple-500" />

                                            <h4 className="font-semibold">
                                              Usage Metadata
                                            </h4>
                                          </div>

                                          <JsonViewer
                                            data={msg.usage_metadata}
                                          />
                                        </div>
                                      )}
                                    </AccordionContent>
                                  </AccordionItem>
                                </Accordion>
                              </div>
                            )}
                          </div>

                          {msg.message_type === "user_message" && (
                            <User className="h-6 w-6 flex-shrink-0" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ));
            })()}

            {/* Separador entre histórico e chat atual */}
            {historyMessages.length > 0 && messages.length > 0 && (
              <div className="flex items-center gap-4 py-4">
                <div className="flex-1 border-t border-border"></div>
                <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-full border">
                  <MessageSquare className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-primary">
                    Nova Conversa
                  </span>
                </div>
                <div className="flex-1 border-t border-border"></div>
              </div>
            )}

            {/* Mensagens do Chat Atual */}
            {messages.map((msg, index) => {
              return (
                <div
                  key={index}
                  className={`flex items-start gap-3 ${
                    msg.sender === "user" ? "justify-end" : ""
                  }`}
                >
                  {msg.sender === "bot" && !msg.isTimeoutError && (
                    <Bot className="h-6 w-6 text-primary flex-shrink-0" />
                  )}
                  {msg.isTimeoutError && (
                    <ShieldAlert className="h-6 w-6 text-amber-500 flex-shrink-0" />
                  )}
                                                      {msg.isTimeoutError ? (
                                                        <div className="w-full max-w-[80%] p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 shadow-sm">
                                                          {renderMessageContent(msg.content || "", false)}
                                                        </div>
                                                      ) : (                                      <div
                                        className={`w-full max-w-[80%] rounded-lg overflow-hidden ${
                                          msg.sender === "user"
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-muted"
                                        }`}
                                      >
                                        <div className="relative group">
                                          <div className="flex items-center gap-2 px-3 py-1 bg-black/10 border-b border-border/20">
                                            <Clock className="h-3 w-3" />
                                            {msg.timestamp && (
                                              <span className="text-xs font-mono opacity-80">
                                                {new Date(msg.timestamp).toLocaleDateString(
                                                  "pt-BR"
                                                )}{" "}
                                                {new Date(msg.timestamp).toLocaleTimeString(
                                                  "pt-BR",
                                                  {
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                    second: "2-digit",
                                                  }
                                                )}
                                              </span>
                                            )}
                                            {msg.sender === "bot" && msg.latency && (
                                              <span className="text-xs text-muted-foreground font-mono flex items-center gap-1 ml-2 border-l border-muted-foreground/30 pl-2">
                                                <Clock className="h-3 w-3" />
                                                {formatDuration(msg.latency)}
                                              </span>
                                            )}
                                            {(() => {
                                              if (msg.sender === "user" && index > 0) {
                                                const prevMsg = messages[index - 1];
                                                if (
                                                  prevMsg.sender === "bot" &&
                                                  msg.timestamp &&
                                                  prevMsg.timestamp
                                                ) {
                                                  const diff =
                                                    (new Date(msg.timestamp).getTime() -
                                                      new Date(prevMsg.timestamp).getTime()) /
                                                    1000;
                                                  return (
                                                    <span className="text-xs text-primary-foreground/80 font-mono flex items-center gap-1 ml-2 border-l border-primary-foreground/30 pl-2">
                                                      <Clock className="h-3 w-3" />
                                                      {formatDuration(diff)}
                                                    </span>
                                                  );
                                                }
                                              }
                                              return null;
                                            })()}

                                            {/* Copy button */}
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  className={`ml-auto h-6 w-6 ${
                                                    msg.sender === "user"
                                                      ? "text-white/70 hover:text-white hover:bg-white/10"
                                                      : "text-foreground/50 hover:text-foreground hover:bg-muted"
                                                  }`}
                                                  onClick={() => copyToClipboard(msg.content)}
                                                >
                                                  <Copy className="h-3.5 w-3.5" />
                                                </Button>
                                              </TooltipTrigger>
                                              <TooltipContent>
                                                <p>Copiar mensagem</p>
                                              </TooltipContent>
                                            </Tooltip>
                                          </div>

                                          {/* Streaming Thinking Accordion */}
                                          {msg.streamingThinking && (
                                            <Accordion
                                              type="single"
                                              collapsible
                                              className="mb-3"
                                              value={msg.thinkingExpanded ? "thinking" : ""}
                                              onValueChange={(value) => {
                                                // Update thinking expanded state
                                                setMessages((prev) => {
                                                  const updated = [...prev];
                                                  updated[index] = {
                                                    ...updated[index],
                                                    thinkingExpanded: value === "thinking"
                                                  };
                                                  return updated;
                                                });
                                              }}
                                            >
                                              <AccordionItem value="thinking" className="border rounded-md bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800">
                                                <AccordionTrigger className="px-3 py-2 hover:no-underline">
                                                  <div className="flex items-center gap-2">
                                                    <Lightbulb className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                                                    <span className="text-xs font-semibold text-yellow-700 dark:text-yellow-300">
                                                      {msg.isStreaming ? "Thinking..." : "Ver Thinking"}
                                                    </span>
                                                  </div>
                                                </AccordionTrigger>
                                                <AccordionContent className="px-3 pb-3">
                                                  <div className="text-sm text-yellow-800 dark:text-yellow-200 whitespace-pre-wrap font-mono">
                                                    {msg.streamingThinking}
                                                  </div>
                                                </AccordionContent>
                                              </AccordionItem>
                                            </Accordion>
                                          )}

                                          {renderMessageContent(
                                            msg.content || "",
                                            msg.sender === "user"
                                          )}
                                        </div>
                                        {msg.sender === "bot" && msg.fullResponse && (
                                          <div className="mt-3 pt-3 border-t border-muted/30">
                                            <Accordion
                                              type="single"
                                              collapsible
                                              className="w-full"
                                            >
                                              <AccordionItem
                                                value="item-1"
                                                className="border-none"
                                              >
                                                <AccordionTrigger className="px-3 py-2 text-sm font-medium bg-background/50 hover:bg-background/80 rounded-md border border-border hover:border-border/80 transition-colors">
                                                  <div className="flex items-center gap-2">
                                                    <Search className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                                    <span className="text-blue-600 dark:text-blue-400">
                                                      Ver Detalhes
                                                    </span>
                                                  </div>
                                                </AccordionTrigger>
                                                <AccordionContent className="p-4 space-y-4">
                                                  {msg.fullResponse.messages
                                                    .filter(
                                                      (m) =>
                                                        m.message_type !== "assistant_message"
                                                    )
                                                    .map((step, stepIndex) => (
                                                      <div
                                                        key={`${step.id}-${step.message_type}-${stepIndex}`}
                                                        className="space-y-2"
                                                      >
                                                        <div className="flex items-center gap-2">
                                                          {getStepIcon(step.message_type)}
                                                          <h4 className="font-semibold">
                                                            {step.message_type.replace(/_/g, " ")}
                                                          </h4>
                                                          {step.name && (
                                                            <Badge variant="secondary">
                                                              {step.name}
                                                            </Badge>
                                                          )}
                                                        </div>
                                                        {step.reasoning && (
                                                          <p className="italic text-muted-foreground text-base pl-6">
                                                            {step.reasoning}
                                                          </p>
                                                        )}
                                                        {step.tool_call && (
                                                          <div>
                                                            <p className="font-semibold text-base capitalize mb-2">
                                                              Tool Call Arguments:
                                                            </p>
                                                            <JsonViewer
                                                              data={(() => {
                                                                try {
                                                                  return typeof step.tool_call
                                                                    .arguments === "string"
                                                                    ? JSON.parse(
                                                                        step.tool_call.arguments
                                                                      )
                                                                    : step.tool_call.arguments;
                                                                } catch {
                                                                  return {
                                                                    raw: step.tool_call.arguments,
                                                                  };
                                                                }
                                                              })()}
                                                            />
                                                          </div>
                                                        )}
                                                        {step.tool_return && (
                                                          <ToolReturnViewer
                                                            toolReturn={step.tool_return}
                                                            toolName={step.name || undefined}
                                                          />
                                                        )}
                                                      </div>
                                                    ))}
                                                  {msg.fullResponse.usage && (
                                                    <div className="space-y-2 pt-2 border-t">
                                                      <div className="flex items-center gap-2">
                                                        <BarChart2 className="h-4 w-4 text-purple-500" />
                                                        <h4 className="font-semibold">
                                                          Usage Statistics
                                                        </h4>
                                                      </div>
                                                      <JsonViewer data={msg.fullResponse.usage} />
                                                    </div>
                                                  )}
                                                </AccordionContent>
                                              </AccordionItem>
                                            </Accordion>
                                          </div>
                                        )}
                                      </div>
                                    )}                  {msg.sender === "user" && (
                    <User className="h-6 w-6 flex-shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>

        <ChatInput
          input={input}
          setInput={setInput}
          isLoading={isLoading}
          requestStartTime={requestStartTime}
          onSendMessage={handleSendMessage}
          textareaRef={textareaRef}
          attachedFiles={attachedFiles}
          onFilesChange={setAttachedFiles}
        />
      </Card>

      {/* Painel de Parâmetros (Direita) */}
      <ChatSidebar
        userId={userId}
        setUserId={setUserId}
        isUserIdFixed={isUserIdFixed}
        isMounted={isMounted}
        sessionTimeoutSeconds={sessionTimeoutSeconds}
        setSessionTimeoutSeconds={setSessionTimeoutSeconds}
        useWhatsappFormat={useWhatsappFormat}
        setUseWhatsappFormat={setUseWhatsappFormat}
        isLoadingHistory={isLoadingHistory}
        isDeletingHistory={isDeletingHistory}
        historyMessages={historyMessages}
        historyError={historyError}
        showDeleteModal={showDeleteModal}
        setShowDeleteModal={setShowDeleteModal}
        model={model}
        setModel={setModel}
        systemPrompt={systemPrompt}
        setSystemPrompt={setSystemPrompt}
        selectedPromptId={selectedPromptId}
        systemPrompts={systemPrompts}
        isLoadingPrompts={isLoadingPrompts}
        temperature={temperature}
        setTemperature={setTemperature}
        includeThoughts={includeThoughts}
        setIncludeThoughts={setIncludeThoughts}
        thinkingBudget={thinkingBudget}
        setThinkingBudget={setThinkingBudget}
        availableModels={availableModels}
        isLoadingModels={isLoadingModels}
        responseMode={responseMode}
        setResponseMode={setResponseMode}
        onGenerateNumber={handleGenerateNumber}
        onToggleFixNumber={handleToggleFixNumber}
        onCopyNumber={handleCopyNumber}
        onLoadHistory={handleLoadHistory}
        onClearScreen={() => {
          setHistoryMessages([]);
          setMessages([]);
          setHistoryError(null);
          toast.info("Tela limpa!");
        }}
        onDeleteHistory={handleDeleteHistory}
        onSelectPrompt={handleSelectPrompt}
        onCreatePrompt={handleCreatePrompt}
        onUpdatePrompt={handleUpdatePrompt}
        onDeletePrompt={handleDeletePrompt}
        onExportConversation={handleExportConversation}
        onExportConfig={handleExportConfig}
        onImportConfig={handleImportConfig}
      />

      {/* Image Modal */}
      <ImageModal
        isOpen={imageModalOpen}
        onClose={closeImageModal}
        imageUrl={selectedImage?.url || ""}
        filename={selectedImage?.filename}
      />
    </div>
  );
}
