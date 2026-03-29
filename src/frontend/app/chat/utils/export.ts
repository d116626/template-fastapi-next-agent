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
    const sender = msg.sender === 'user' ? '👤 Usuário' : '🤖 Assistente';
    const text = extractText(msg.content);

    markdown += `## ${sender}\n\n`;

    if (msg.timestamp) {
      const msgTime = new Date(msg.timestamp).toLocaleString('pt-BR');
      markdown += `*${msgTime}*\n\n`;
    }

    markdown += `${text}\n\n`;

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
      content: extractText(msg.content),
      timestamp: msg.timestamp,
      latency: msg.latency,
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
    const sender = msg.sender === 'user' ? 'Usuário' : 'Assistente';
    const content = extractText(msg.content);

    text += `[${sender}]\n`;

    if (msg.timestamp) {
      const msgTime = new Date(msg.timestamp).toLocaleString('pt-BR');
      text += `${msgTime}\n`;
    }

    text += `\n${content}\n\n`;

    if (msg.latency) {
      text += `(Tempo de resposta: ${msg.latency.toFixed(2)}s)\n`;
    }

    text += `${'-'.repeat(60)}\n\n`;
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
