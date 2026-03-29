import { DisplayMessage } from '../types/chat';

/**
 * Extract text from multimodal content
 */
function extractText(content: any): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter(item => item.type === 'text' && item.text)
      .map(item => item.text)
      .join('\n');
  }

  return '';
}

/**
 * Export conversation to Markdown
 */
export function exportToMarkdown(messages: DisplayMessage[], userId: string): string {
  const timestamp = new Date().toLocaleString('pt-BR');

  let markdown = `# Conversa - ${userId}\n\n`;
  markdown += `**Exportado em:** ${timestamp}\n\n`;
  markdown += `---\n\n`;

  messages.forEach((msg, index) => {
    // Determine sender based on message type
    let sender = '🤖 Assistente';
    if (msg.messageType === 'user_message' || msg.sender === 'user') {
      sender = '👤 Usuário';
    } else if (msg.messageType === 'reasoning_message') {
      sender = '💡 Pensamento';
    } else if (msg.messageType === 'tool_call_message') {
      sender = '🔧 Chamada de Ferramenta';
    } else if (msg.messageType === 'tool_return_message') {
      sender = '↩️ Retorno de Ferramenta';
    }

    markdown += `## ${sender}\n\n`;

    if (msg.timestamp) {
      const msgTime = new Date(msg.timestamp).toLocaleString('pt-BR');
      markdown += `*${msgTime}*\n\n`;
    }

    // Render reasoning
    if (msg.reasoning) {
      markdown += `**Raciocínio:**\n\n`;
      markdown += `\`\`\`\n${msg.reasoning}\n\`\`\`\n\n`;
    }

    // Render tool call
    if (msg.toolCall) {
      markdown += `**Ferramenta:** \`${msg.toolCall.name}\`\n\n`;
      markdown += `**Argumentos:**\n\n`;
      const argsText = typeof msg.toolCall.arguments === 'string'
        ? msg.toolCall.arguments
        : JSON.stringify(msg.toolCall.arguments, null, 2);
      markdown += `\`\`\`json\n${argsText}\n\`\`\`\n\n`;
    }

    // Render tool return
    if (msg.toolReturn) {
      markdown += `**Retorno:**\n\n`;
      const returnText = typeof msg.toolReturn === 'string'
        ? msg.toolReturn
        : JSON.stringify(msg.toolReturn, null, 2);
      markdown += `\`\`\`\n${returnText}\n\`\`\`\n\n`;
    }

    // Render main content
    const text = extractText(msg.content);
    if (text) {
      markdown += `${text}\n\n`;
    }

    if (msg.latency) {
      markdown += `*Tempo de resposta: ${msg.latency.toFixed(2)}s*\n\n`;
    }

    markdown += `---\n\n`;
  });

  return markdown;
}

/**
 * Export conversation to JSON
 */
export function exportToJSON(messages: DisplayMessage[], userId: string): string {
  const exportData = {
    userId,
    exportedAt: new Date().toISOString(),
    messageCount: messages.length,
    messages: messages.map(msg => ({
      sender: msg.sender,
      messageType: msg.messageType || (msg.sender === 'user' ? 'user_message' : 'assistant_message'),
      content: extractText(msg.content),
      timestamp: msg.timestamp,
      latency: msg.latency,
      reasoning: msg.reasoning,
      toolCall: msg.toolCall,
      toolReturn: msg.toolReturn,
    })),
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Export conversation to plain text
 */
export function exportToText(messages: DisplayMessage[], userId: string): string {
  const timestamp = new Date().toLocaleString('pt-BR');

  let text = `Conversa - ${userId}\n`;
  text += `Exportado em: ${timestamp}\n`;
  text += `${'='.repeat(60)}\n\n`;

  messages.forEach((msg, index) => {
    // Determine sender based on message type
    let sender = 'Assistente';
    if (msg.messageType === 'user_message' || msg.sender === 'user') {
      sender = 'Usuário';
    } else if (msg.messageType === 'reasoning_message') {
      sender = 'Pensamento';
    } else if (msg.messageType === 'tool_call_message') {
      sender = 'Chamada de Ferramenta';
    } else if (msg.messageType === 'tool_return_message') {
      sender = 'Retorno de Ferramenta';
    }

    text += `[${sender}]\n`;

    if (msg.timestamp) {
      const msgTime = new Date(msg.timestamp).toLocaleString('pt-BR');
      text += `${msgTime}\n`;
    }

    // Render reasoning
    if (msg.reasoning) {
      text += `\nRaciocínio:\n${msg.reasoning}\n`;
    }

    // Render tool call
    if (msg.toolCall) {
      text += `\nFerramenta: ${msg.toolCall.name}\n`;
      const argsText = typeof msg.toolCall.arguments === 'string'
        ? msg.toolCall.arguments
        : JSON.stringify(msg.toolCall.arguments, null, 2);
      text += `Argumentos:\n${argsText}\n`;
    }

    // Render tool return
    if (msg.toolReturn) {
      const returnText = typeof msg.toolReturn === 'string'
        ? msg.toolReturn
        : JSON.stringify(msg.toolReturn, null, 2);
      text += `\nRetorno:\n${returnText}\n`;
    }

    // Render main content
    const content = extractText(msg.content);
    if (content) {
      text += `\n${content}\n`;
    }

    if (msg.latency) {
      text += `\n(Tempo de resposta: ${msg.latency.toFixed(2)}s)\n`;
    }

    text += `\n${'-'.repeat(60)}\n\n`;
  });

  return text;
}

/**
 * Download file with given content
 */
export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export conversation with format selection
 */
export function exportConversation(
  messages: DisplayMessage[],
  userId: string,
  format: 'markdown' | 'json' | 'text'
) {
  const timestamp = new Date().toISOString().split('T')[0];

  let content: string;
  let filename: string;
  let mimeType: string;

  switch (format) {
    case 'markdown':
      content = exportToMarkdown(messages, userId);
      filename = `conversa-${userId}-${timestamp}.md`;
      mimeType = 'text/markdown';
      break;

    case 'json':
      content = exportToJSON(messages, userId);
      filename = `conversa-${userId}-${timestamp}.json`;
      mimeType = 'application/json';
      break;

    case 'text':
      content = exportToText(messages, userId);
      filename = `conversa-${userId}-${timestamp}.txt`;
      mimeType = 'text/plain';
      break;
  }

  downloadFile(content, filename, mimeType);
}
