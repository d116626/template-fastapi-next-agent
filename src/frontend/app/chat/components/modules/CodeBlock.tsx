"use client";

import React, { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface CodeBlockProps {
  code: string;
  language: string;
  isDarkMode?: boolean;
}

export default function CodeBlock({ code, language, isDarkMode = false }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success('Código copiado!');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Erro ao copiar código');
    }
  };

  return (
    <div className="relative group my-4 rounded-lg overflow-hidden border border-border">
      {/* Header with language and copy button */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-border">
        <span className="text-xs font-mono text-muted-foreground uppercase">
          {language || 'code'}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleCopy}
          className="h-7 w-7"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {/* Code content */}
      <SyntaxHighlighter
        language={language || 'text'}
        style={isDarkMode ? oneDark : oneLight}
        customStyle={{
          margin: 0,
          padding: '1rem',
          fontSize: '0.875rem',
          lineHeight: '1.5',
          background: 'transparent',
        }}
        showLineNumbers={true}
        wrapLines={true}
        wrapLongLines={true}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
