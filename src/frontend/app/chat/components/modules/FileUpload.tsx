"use client";

import React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface AttachedFile {
  file: File;
  preview?: string;
  type: "image" | "pdf" | "document" | "code" | "other";
}

interface FileUploadProps {
  files: AttachedFile[];
  onRemove: (index: number) => void;
}

const getFileIcon = (file: File) => {
  const mimeType = file.type;
  if (mimeType.includes("pdf")) return "📄";
  if (mimeType.includes("python")) return "🐍";
  if (mimeType.includes("javascript") || mimeType.includes("typescript")) return "📜";
  if (mimeType.includes("json")) return "📋";
  if (mimeType.includes("markdown")) return "📝";
  return "📎";
};

export default function FileUpload({ files, onRemove }: FileUploadProps) {
  if (files.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 pb-2 w-full justify-start items-start">
      {files.map((attachedFile, index) => {
        const isImage = attachedFile.type === "image" && attachedFile.preview;

        if (isImage) {
          // Renderização de imagem (igual às mensagens)
          return (
            <div key={index} className="inline-block relative group">
              <div className="relative rounded-lg overflow-hidden border-2 border-primary/20 hover:border-primary/60 transition-all">
                <img
                  src={attachedFile.preview}
                  alt={attachedFile.file.name}
                  className="transition-transform"
                  style={{
                    maxHeight: "100px",
                    maxWidth: "100px",
                    objectFit: "cover",
                  }}
                />
              </div>
              <p className="text-xs mt-1 truncate max-w-[100px] text-muted-foreground">
                {attachedFile.file.name}
              </p>
              {/* Botão remover */}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-full shadow-lg"
                onClick={() => onRemove(index)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          );
        } else {
          // Renderização de arquivo não-imagem (igual às mensagens)
          return (
            <div key={index} className="relative group inline-block">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md cursor-default transition-all bg-primary/5 hover:bg-primary/10 border border-primary/20 hover:border-primary/40">
                <span className="text-lg">{getFileIcon(attachedFile.file)}</span>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium truncate max-w-[200px] text-foreground">
                    {attachedFile.file.name}
                  </span>
                  <span className="text-xs truncate text-muted-foreground">
                    {attachedFile.file.type.split("/")[1] || attachedFile.file.type}
                  </span>
                </div>
              </div>
              {/* Botão remover */}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-full shadow-lg"
                onClick={() => onRemove(index)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          );
        }
      })}
    </div>
  );
}
