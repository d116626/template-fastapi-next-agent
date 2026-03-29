import React from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import CodeBlock from '../components/modules/CodeBlock';

/**
 * Parse markdown and extract code blocks
 */
export function parseMarkdownWithCode(markdown: string, isDarkMode: boolean = false, isUser: boolean = false): React.ReactNode[] {
  const elements: React.ReactNode[] = [];

  // Regex to match code blocks: ```language\ncode\n```
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;

  let lastIndex = 0;
  let match;
  let key = 0;

  const baseStyles: React.CSSProperties = isUser
    ? {}
    : {
        "--tw-prose-pre-bg": "rgb(31 41 55)",
        "--tw-prose-pre-code": "rgb(209 213 219)",
      } as React.CSSProperties;

  while ((match = codeBlockRegex.exec(markdown)) !== null) {
    // Add text before code block
    if (match.index > lastIndex) {
      const textBefore = markdown.substring(lastIndex, match.index);
      if (textBefore.trim()) {
        // Parse markdown for the text portion
        const parsedText = marked.parse(textBefore, { breaks: true }) as string;
        const styledHTML = parsedText.replace(
          /<pre><code class="language-json">/g,
          `<pre style="background-color: transparent; padding: 1rem; border-radius: 0; overflow-x: auto; white-space: pre-wrap; word-break: break-all; margin: 0;"><code class="language-json" style="font-family: ui-monospace, SFMono-Regular, Consolas, monospace;">`
        );
        elements.push(
          <div
            key={`text-${key++}`}
            className={`prose prose-lg dark:prose-invert max-w-none whitespace-pre-wrap break-words ${
              isUser ? "text-primary-foreground user-message-content" : ""
            }`}
            style={baseStyles}
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(styledHTML, { ADD_ATTR: ["style"] })
            }}
          />
        );
      }
    }

    // Add code block
    const language = match[1] || 'text';
    const code = match[2].trim();

    elements.push(
      <CodeBlock
        key={`code-${key++}`}
        code={code}
        language={language}
        isDarkMode={isDarkMode}
      />
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < markdown.length) {
    const remainingText = markdown.substring(lastIndex);
    if (remainingText.trim()) {
      // Parse markdown for the remaining text
      const parsedText = marked.parse(remainingText, { breaks: true }) as string;
      const styledHTML = parsedText.replace(
        /<pre><code class="language-json">/g,
        `<pre style="background-color: transparent; padding: 1rem; border-radius: 0; overflow-x: auto; white-space: pre-wrap; word-break: break-all; margin: 0;"><code class="language-json" style="font-family: ui-monospace, SFMono-Regular, Consolas, monospace;">`
      );
      elements.push(
        <div
          key={`text-${key++}`}
          className={`prose prose-lg dark:prose-invert max-w-none whitespace-pre-wrap break-words ${
            isUser ? "text-primary-foreground user-message-content" : ""
          }`}
          style={baseStyles}
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(styledHTML, { ADD_ATTR: ["style"] })
          }}
        />
      );
    }
  }

  // If no code blocks found, return original
  if (elements.length === 0) {
    const parsedText = marked.parse(markdown, { breaks: true }) as string;
    const styledHTML = parsedText.replace(
      /<pre><code class="language-json">/g,
      `<pre style="background-color: transparent; padding: 1rem; border-radius: 0; overflow-x: auto; white-space: pre-wrap; word-break: break-all; margin: 0;"><code class="language-json" style="font-family: ui-monospace, SFMono-Regular, Consolas, monospace;">`
    );
    return [
      <div
        key="original"
        className={`prose prose-lg dark:prose-invert max-w-none whitespace-pre-wrap break-words ${
          isUser ? "text-primary-foreground user-message-content" : ""
        }`}
        style={baseStyles}
        dangerouslySetInnerHTML={{
          __html: DOMPurify.sanitize(styledHTML, { ADD_ATTR: ["style"] })
        }}
      />
    ];
  }

  return elements;
}

/**
 * Check if markdown contains code blocks
 */
export function hasCodeBlocks(markdown: string): boolean {
  return /```[\s\S]*?```/.test(markdown);
}
