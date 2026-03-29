import React, { useEffect, useState, useRef } from 'react';
import { CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send, Paperclip, FileText } from 'lucide-react';
import FileUpload, { AttachedFile } from './FileUpload';
import { toast } from 'sonner';

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  requestStartTime: number | null;
  onSendMessage: (e: React.FormEvent) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  attachedFiles: AttachedFile[];
  onFilesChange: (files: AttachedFile[]) => void;
}

const ChatInput: React.FC<ChatInputProps> = ({
  input,
  setInput,
  isLoading,
  requestStartTime,
  onSendMessage,
  textareaRef,
  attachedFiles,
  onFilesChange
}) => {
  const [elapsed, setElapsed] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLoading && requestStartTime) {
      setElapsed(Math.floor((Date.now() - requestStartTime) / 1000));
      interval = setInterval(() => {
        setElapsed(Math.floor((Date.now() - requestStartTime) / 1000));
      }, 1000);
    } else {
      setElapsed(0);
    }
    return () => clearInterval(interval);
  }, [isLoading, requestStartTime]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if ((input.trim() || attachedFiles.length > 0) && !isLoading) {
        onSendMessage(e as React.FormEvent);
      }
    }
  };

  const getFileType = (file: File): AttachedFile['type'] => {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type === 'application/pdf') return 'pdf';
    if (file.type.startsWith('text/') || file.type.includes('json') || file.type.includes('javascript')) return 'code';
    if (file.type.includes('document') || file.type.includes('text')) return 'document';
    return 'other';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newFiles: AttachedFile[] = [];

    Array.from(files).forEach((file) => {
      const fileType = getFileType(file);

      // Verificar tamanho (max 20MB)
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`Arquivo ${file.name} muito grande (max 20MB)`);
        return;
      }

      const attachedFile: AttachedFile = {
        file,
        type: fileType,
      };

      // Criar preview para imagens
      if (fileType === 'image') {
        const reader = new FileReader();
        reader.onload = (e) => {
          attachedFile.preview = e.target?.result as string;
          onFilesChange([...attachedFiles, attachedFile]);
        };
        reader.readAsDataURL(file);
      } else {
        newFiles.push(attachedFile);
      }
    });

    if (newFiles.length > 0) {
      onFilesChange([...attachedFiles, ...newFiles]);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = (index: number) => {
    const newFiles = attachedFiles.filter((_, i) => i !== index);
    onFilesChange(newFiles);
  };

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    const newFiles: AttachedFile[] = [];

    Array.from(files).forEach((file) => {
      const fileType = getFileType(file);

      // Verificar tamanho (max 20MB)
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`Arquivo ${file.name} muito grande (max 20MB)`);
        return;
      }

      const attachedFile: AttachedFile = {
        file,
        type: fileType,
      };

      // Criar preview para imagens
      if (fileType === 'image') {
        const reader = new FileReader();
        reader.onload = (e) => {
          attachedFile.preview = e.target?.result as string;
          onFilesChange([...attachedFiles, attachedFile]);
        };
        reader.readAsDataURL(file);
      } else {
        newFiles.push(attachedFile);
      }
    });

    if (newFiles.length > 0) {
      onFilesChange([...attachedFiles, ...newFiles]);
    }

    toast.success(`${files.length} arquivo(s) anexado(s)`);
  };

  return (
    <CardFooter
      className="border-t pt-4 flex-col gap-2 relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary rounded-lg flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-background/95 rounded-lg p-6 shadow-lg">
            <div className="flex flex-col items-center gap-3">
              <FileText className="h-12 w-12 text-primary" />
              <p className="text-lg font-semibold">Solte os arquivos aqui</p>
              <p className="text-sm text-muted-foreground">
                Imagens, PDFs, documentos e código
              </p>
            </div>
          </div>
        </div>
      )}

      {attachedFiles.length > 0 && (
        <FileUpload files={attachedFiles} onRemove={handleRemoveFile} />
      )}

      <form onSubmit={onSendMessage} className="flex w-full items-end gap-2">
        <div className="flex-1 min-w-0">
          <Textarea
            ref={textareaRef}
            id="message"
            placeholder="Digite sua mensagem..."
            className="min-h-[120px] max-h-[70vh] overflow-y-auto overflow-x-hidden resize-y whitespace-pre-wrap break-all"
            autoComplete="off"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            rows={5}
          />
        </div>

        <div className="flex flex-col gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            accept="image/*,.pdf,.txt,.md,.json,.js,.ts,.tsx,.jsx,.py,.java,.c,.cpp,.cs,.php,.rb,.sh,.go,.rs,.html,.css"
          />

          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="h-10 w-10"
          >
            <Paperclip className="h-4 w-4" />
            <span className="sr-only">Anexar arquivo</span>
          </Button>

          <Button
            type="submit"
            size="icon"
            disabled={isLoading || (!input.trim() && attachedFiles.length === 0)}
            className={`h-10 w-10 ${isLoading ? "w-16" : ""}`}
          >
            {isLoading ? (
              <div className="flex flex-col items-center gap-0.5">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-[10px] leading-none">{elapsed}s</span>
              </div>
            ) : (
              <Send className="h-4 w-4" />
            )}
            <span className="sr-only">Enviar</span>
          </Button>
        </div>
      </form>
    </CardFooter>
  );
};

export default ChatInput;
