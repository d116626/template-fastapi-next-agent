import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import { Copy, Check } from 'lucide-react';

interface MarkdownProps {
  children: string;
  className?: string;
  compact?: boolean; // Para versões menores (tool returns, etc)
}

/**
 * Componente para code blocks com botão de copiar
 */
const CodeBlock: React.FC<{ language: string; code: string; compact?: boolean }> = ({ language, code, compact }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Custom style com fundo transparente e wrap
  const customStyle = {
    ...vscDarkPlus,
    'pre[class*="language-"]': {
      ...vscDarkPlus['pre[class*="language-"]'],
      background: 'transparent',
      margin: 0,
      padding: '1rem',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    },
    'code[class*="language-"]': {
      ...vscDarkPlus['code[class*="language-"]'],
      background: 'transparent',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    },
  };

  return (
    <div className="relative">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors"
        aria-label="Copiar código"
      >
        {copied ? (
          <Check className="w-4 h-4 text-green-500" />
        ) : (
          <Copy className="w-4 h-4" />
        )}
      </button>
      <div className="bg-muted/30 rounded-md">
        <SyntaxHighlighter
          style={customStyle}
          language={language}
          PreTag="div"
          className={compact ? "text-xs" : ""}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
};

/**
 * Componente centralizado para renderizar Markdown com syntax highlighting
 */
export const Markdown: React.FC<MarkdownProps> = ({ children, className = '', compact = false }) => {
  // Detectar se o conteúdo é JSON puro (sem code fence)
  const isJsonContent = (text: string): boolean => {
    const trimmed = text.trim();
    return (trimmed.startsWith('{') || trimmed.startsWith('[')) &&
           !text.includes('```');
  };

  // Se for JSON puro, renderizar como code block
  if (isJsonContent(children)) {
    try {
      const parsed = JSON.parse(children);
      const formatted = JSON.stringify(parsed, null, 2);
      return (
        <div className={className}>
          <div className={compact ? "my-1" : "my-2"}>
            <CodeBlock language="json" code={formatted} compact={compact} />
          </div>
        </div>
      );
    } catch {
      // Se falhar o parse, renderizar como markdown normal
    }
  }

  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
        h1: ({node, ...props}) => <h1 className={compact ? "text-base font-bold mb-1 mt-2" : "text-xl font-bold mb-2 mt-3"} {...props} />,
        h2: ({node, ...props}) => <h2 className={compact ? "text-sm font-bold mb-1 mt-1.5" : "text-lg font-bold mb-1.5 mt-2.5"} {...props} />,
        h3: ({node, ...props}) => <h3 className={compact ? "text-xs font-bold mb-0.5 mt-1" : "text-base font-bold mb-1 mt-2"} {...props} />,
        h4: ({node, ...props}) => <h4 className="text-sm font-bold mb-1 mt-1.5" {...props} />,
        p: ({node, ...props}) => <p className={compact ? "mb-1 leading-relaxed" : "mb-1.5 leading-relaxed"} {...props} />,
        ul: ({node, ...props}) => <ul className={compact ? "list-disc ml-4 mb-1 space-y-0.5" : "list-disc ml-4 mb-1.5 space-y-0.5"} {...props} />,
        ol: ({node, ...props}) => <ol className={compact ? "list-decimal ml-4 mb-1 space-y-0.5" : "list-decimal ml-4 mb-1.5 space-y-0.5"} {...props} />,
        li: ({node, ...props}) => <li className="leading-relaxed" {...props} />,
        code: ({node, inline, className, children, ...props}: any) => {
          const match = /language-(\w+)/.exec(className || '');
          return !inline && match ? (
            <div className={compact ? "my-1" : "my-2"}>
              <CodeBlock
                language={match[1]}
                code={String(children).replace(/\n$/, '')}
                compact={compact}
              />
            </div>
          ) : (
            <code className={compact ? "bg-muted px-1 py-0.5 rounded text-xs font-mono" : "bg-muted px-1.5 py-0.5 rounded text-sm font-mono"} {...props}>
              {children}
            </code>
          );
        },
        blockquote: ({node, ...props}) => (
          <blockquote className="border-l-4 border-muted-foreground/30 pl-3 italic my-2" {...props} />
        ),
        strong: ({node, ...props}) => <strong className="font-bold" {...props} />,
        em: ({node, ...props}) => <em className="italic" {...props} />,
        a: ({node, ...props}) => (
          <a className="text-primary hover:underline" {...props} />
        ),
      }}
    >
      {children}
    </ReactMarkdown>
    </div>
  );
};

/**
 * @deprecated Mantido para compatibilidade. Use o componente <Markdown> diretamente.
 */
export function parseMarkdownWithCode(markdown: string, isDarkMode: boolean = false, isUser: boolean = false): React.ReactNode[] {
  return [<Markdown key="markdown">{markdown}</Markdown>];
}

/**
 * @deprecated Não é mais necessário com react-markdown
 */
export function hasCodeBlocks(markdown: string): boolean {
  return /```[\s\S]*?```/.test(markdown);
}
