import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { RefreshCw, Lock, Unlock, Copy, History, Loader2, MessageSquare, Eraser, Trash2, Clock, Settings, Brain, Zap, Plus, Edit, FileText, Download, Upload } from 'lucide-react';
import { HistoryMessage, ModelInfo, SystemPrompt } from '../../services/api';

interface ChatSidebarProps {
  userId: string;
  setUserId: (value: string) => void;
  isUserIdFixed: boolean;
  isMounted: boolean;
  sessionTimeoutSeconds: number;
  setSessionTimeoutSeconds: (value: number) => void;
  useWhatsappFormat: boolean;
  setUseWhatsappFormat: (value: boolean) => void;
  isLoadingHistory: boolean;
  isDeletingHistory: boolean;
  historyMessages: HistoryMessage[];
  historyError: string | null;
  showDeleteModal: boolean;
  setShowDeleteModal: (value: boolean) => void;

  // Agent configuration
  model: string;
  setModel: (value: string) => void;
  systemPrompt: string;
  setSystemPrompt: (value: string) => void;
  selectedPromptId: string | null;
  systemPrompts: SystemPrompt[];
  isLoadingPrompts: boolean;
  temperature: number;
  setTemperature: (value: number) => void;
  includeThoughts: boolean;
  setIncludeThoughts: (value: boolean) => void;
  thinkingBudget: number;
  setThinkingBudget: (value: number) => void;
  availableModels: ModelInfo[];
  isLoadingModels: boolean;
  responseMode: 'normal' | 'stream';
  setResponseMode: (value: 'normal' | 'stream') => void;

  // Handlers
  onGenerateNumber: () => void;
  onToggleFixNumber: () => void;
  onCopyNumber: () => void;
  onLoadHistory: () => void;
  onClearScreen: () => void;
  onDeleteHistory: () => void;
  onSelectPrompt: (promptId: string) => void;
  onCreatePrompt: (name: string, prompt: string) => Promise<void>;
  onUpdatePrompt: (id: string, name?: string, prompt?: string) => Promise<void>;
  onDeletePrompt: (id: string) => Promise<void>;
  onExportConversation: (format: 'markdown' | 'json' | 'text') => void;
  onExportConfig: () => void;
  onImportConfig: () => void;
}

const ChatSidebar: React.FC<ChatSidebarProps> = ({
  userId,
  setUserId,
  isUserIdFixed,
  isMounted,
  sessionTimeoutSeconds,
  setSessionTimeoutSeconds,
  useWhatsappFormat,
  setUseWhatsappFormat,
  isLoadingHistory,
  isDeletingHistory,
  historyMessages,
  historyError,
  showDeleteModal,
  setShowDeleteModal,
  model,
  setModel,
  systemPrompt,
  setSystemPrompt,
  selectedPromptId,
  systemPrompts,
  isLoadingPrompts,
  temperature,
  setTemperature,
  includeThoughts,
  setIncludeThoughts,
  thinkingBudget,
  setThinkingBudget,
  availableModels,
  isLoadingModels,
  responseMode,
  setResponseMode,
  onGenerateNumber,
  onToggleFixNumber,
  onCopyNumber,
  onLoadHistory,
  onClearScreen,
  onDeleteHistory,
  onSelectPrompt,
  onCreatePrompt,
  onUpdatePrompt,
  onDeletePrompt,
  onExportConversation,
  onExportConfig,
  onImportConfig,
}) => {
  // Check if current model supports thinking
  const currentModelInfo = availableModels.find(m => m.code === model);
  const supportsThinking = currentModelInfo?.supports_thinking ?? true;

  // System prompt modals state
  const [showPromptModal, setShowPromptModal] = React.useState(false);
  const [showCreateModal, setShowCreateModal] = React.useState(false);
  const [editingPrompt, setEditingPrompt] = React.useState<SystemPrompt | null>(null);
  const [newPromptName, setNewPromptName] = React.useState("");
  const [newPromptText, setNewPromptText] = React.useState("");

  return (
    <Card className="flex flex-col min-h-0 overflow-hidden">
      <CardContent className="flex-1 overflow-y-auto space-y-4 min-h-0 pt-6">
        <div className="space-y-2">
          <Label htmlFor="user-id" className="text-sm">User ID</Label>
          <div className="flex items-center gap-2">
            <Input
              id="user-id"
              value={isMounted ? userId : ''}
              onChange={(e) => !isUserIdFixed && setUserId(e.target.value)}
              disabled={isUserIdFixed}
              className="flex-1 h-9"
            />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={onGenerateNumber}
                    disabled={isUserIdFixed || !isMounted}
                    className="h-9 w-9"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Gerar novo User ID aleatório</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={onToggleFixNumber}
                    disabled={!isMounted}
                    className="h-9 w-9"
                  >
                    {isUserIdFixed ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isUserIdFixed ? "Desbloquear User ID" : "Fixar User ID"}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={onCopyNumber}
                    disabled={!isMounted}
                    className="h-9 w-9"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Copiar número</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-lg">Configurações do Agente</h3>
          </div>

          {/* Modelo */}
          <div className="grid grid-cols-[120px_1fr] items-center gap-3">
            <Label htmlFor="model" className="text-sm">Modelo</Label>
            <Select value={model} onValueChange={setModel} disabled={isLoadingModels}>
              <SelectTrigger id="model" className="h-9 w-full">
                <SelectValue placeholder={isLoadingModels ? "Carregando..." : "Selecione"}>
                  {currentModelInfo && (
                    <span className="text-sm truncate">{currentModelInfo.name}</span>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {availableModels.map((m) => (
                  <SelectItem key={m.code} value={m.code} className="py-3">
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold">{m.name}</span>
                      <span className="text-xs text-muted-foreground font-mono">{m.code}</span>
                      <span className="text-xs text-muted-foreground mt-1">
                        {m.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* System Prompt */}
          <div className="grid grid-cols-[120px_1fr] items-center gap-3">
            <Label className="text-sm">System Prompt</Label>
            <Button
              variant="outline"
              className="h-9 justify-start text-sm"
              onClick={() => {
                // Se tem um prompt selecionado, pre-carregar no modal
                if (selectedPromptId) {
                  const prompt = systemPrompts.find(p => p.id === selectedPromptId);
                  if (prompt) {
                    setEditingPrompt(prompt);
                    setNewPromptName(prompt.name);
                    setNewPromptText(prompt.prompt);
                  }
                } else {
                  setEditingPrompt(null);
                  setNewPromptName("");
                  setNewPromptText(systemPrompt || "");
                }
                setShowPromptModal(true);
              }}
            >
              <FileText className="h-4 w-4 mr-2" />
              {selectedPromptId
                ? systemPrompts.find(p => p.id === selectedPromptId)?.name || "Editar"
                : "Editar"}
            </Button>
          </div>

          {/* Temperature */}
          <div className="grid grid-cols-[120px_1fr] items-center gap-3">
            <Label htmlFor="temperature" className="text-sm">Temperature</Label>
            <div className="flex items-center gap-3">
              <Slider
                id="temperature"
                value={[temperature]}
                onValueChange={(values) => setTemperature(values[0])}
                min={0}
                max={1}
                step={0.1}
                className="flex-1 max-w-[120px]"
              />
              <Input
                type="number"
                value={temperature.toFixed(1)}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val) && val >= 0 && val <= 1) {
                    setTemperature(val);
                  }
                }}
                min={0}
                max={1}
                step={0.1}
                className="w-16 h-9 text-center text-sm"
              />
            </div>
          </div>

          {/* Thinking Level */}
          <div className="grid grid-cols-[120px_1fr] items-center gap-3">
            <Label htmlFor="thinking-level" className="text-sm">Thinking Level</Label>
            <Select
              value={
                thinkingBudget === -1 ? "high" :
                thinkingBudget === 10000 ? "medium" :
                thinkingBudget === 1000 ? "low" :
                "disabled"
              }
              onValueChange={(value) => {
                const budgetMap: Record<string, number> = {
                  high: -1,
                  medium: 10000,
                  low: 1000,
                  disabled: 0,
                };
                setThinkingBudget(budgetMap[value]);
                setIncludeThoughts(value !== "disabled");
              }}
              disabled={!supportsThinking}
            >
              <SelectTrigger id="thinking-level" className="h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Response Mode */}
          <div className="grid grid-cols-[120px_1fr] items-center gap-3">
            <Label htmlFor="response-mode" className="text-sm">Response Mode</Label>
            <Select
              value={responseMode}
              onValueChange={(value: 'normal' | 'stream') => setResponseMode(value)}
            >
              <SelectTrigger id="response-mode" className="h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="stream">Stream (SSE)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Config Export/Import */}
          <div className="space-y-2 pt-4 border-t">
            <Label className="text-sm font-medium">Configurações</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={onExportConfig}
                disabled={!isMounted}
                className="h-9 text-xs"
                variant="outline"
                title="Exportar configurações do agente"
              >
                <Download className="h-3 w-3 mr-1" />
                Exportar
              </Button>
              <Button
                onClick={onImportConfig}
                disabled={!isMounted}
                className="h-9 text-xs"
                variant="outline"
                title="Importar configurações do agente"
              >
                <Upload className="h-3 w-3 mr-1" />
                Importar
              </Button>
            </div>
          </div>
        </div>

        {/* System Prompt Modal */}
        <Dialog open={showPromptModal} onOpenChange={setShowPromptModal}>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>System Prompt</DialogTitle>
              <DialogDescription>
                Selecione um prompt existente ou crie um novo
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 overflow-y-auto flex-1 pr-2">
              {/* Select para escolher prompt */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="select-prompt">Selecionar Prompt</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setEditingPrompt(null);
                      setNewPromptName("");
                      setNewPromptText("");
                    }}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Novo Prompt
                  </Button>
                </div>
                <Select
                  value={editingPrompt?.id || ""}
                  onValueChange={(value) => {
                    if (value) {
                      const prompt = systemPrompts.find(p => p.id === value);
                      if (prompt) {
                        setEditingPrompt(prompt);
                        setNewPromptName(prompt.name);
                        setNewPromptText(prompt.prompt);
                        // Aplicar automaticamente o prompt selecionado
                        onSelectPrompt(value);
                      }
                    }
                  }}
                >
                  <SelectTrigger id="select-prompt" className="h-9 w-full">
                    <SelectValue placeholder="Escolha um prompt existente" />
                  </SelectTrigger>
                  <SelectContent>
                    {systemPrompts.map((prompt) => (
                      <SelectItem key={prompt.id} value={prompt.id}>
                        {prompt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* Nome do prompt */}
              <div className="space-y-2">
                <Label htmlFor="prompt-name">Nome</Label>
                <Input
                  id="prompt-name"
                  value={newPromptName}
                  onChange={(e) => setNewPromptName(e.target.value)}
                  placeholder="Ex: Code Expert"
                  className="h-9"
                />
              </div>

              {/* Texto do prompt */}
              <div className="space-y-2">
                <Label htmlFor="prompt-text">System Prompt</Label>
                <Textarea
                  id="prompt-text"
                  value={newPromptText}
                  onChange={(e) => setNewPromptText(e.target.value)}
                  placeholder="You are a helpful assistant."
                  className="min-h-[200px] resize-y font-mono text-sm"
                />
              </div>
            </div>

            <DialogFooter className="flex justify-between items-center">
              <div className="flex gap-2">
                {editingPrompt && (
                  <Button
                    variant="destructive"
                    onClick={async () => {
                      if (editingPrompt) {
                        await onDeletePrompt(editingPrompt.id);
                        setShowPromptModal(false);
                        setEditingPrompt(null);
                        setNewPromptName("");
                        setNewPromptText("");
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Deletar
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowPromptModal(false);
                    setEditingPrompt(null);
                    setNewPromptName("");
                    setNewPromptText("");
                  }}
                >
                  Cancelar
                </Button>
                {editingPrompt && (
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      if (!newPromptName.trim() || !newPromptText.trim()) {
                        return;
                      }

                      // Salvar como novo (duplicar)
                      await onCreatePrompt(newPromptName + " (cópia)", newPromptText);

                      setShowPromptModal(false);
                      setEditingPrompt(null);
                      setNewPromptName("");
                      setNewPromptText("");
                    }}
                    disabled={!newPromptName.trim() || !newPromptText.trim()}
                  >
                    Salvar Como Novo
                  </Button>
                )}
                <Button
                  onClick={async () => {
                    if (!newPromptName.trim() || !newPromptText.trim()) {
                      return;
                    }

                    if (editingPrompt) {
                      // Atualizar existente
                      await onUpdatePrompt(editingPrompt.id, newPromptName, newPromptText);
                      // Selecionar o prompt atualizado
                      onSelectPrompt(editingPrompt.id);
                    } else {
                      // Criar novo
                      await onCreatePrompt(newPromptName, newPromptText);
                      // O onCreatePrompt já seleciona automaticamente no ChatClient
                    }

                    setShowPromptModal(false);
                    setEditingPrompt(null);
                    setNewPromptName("");
                    setNewPromptText("");
                  }}
                  disabled={!newPromptName.trim() || !newPromptText.trim()}
                >
                  {editingPrompt ? "Salvar" : "Criar"}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Separator className="my-4" />

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-lg">Histórico</h3>
          </div>

          {/* Session Timeout */}
          <div className="grid grid-cols-[120px_1fr] items-center gap-3">
            <Label htmlFor="session-timeout" className="text-sm">Session Timeout</Label>
            <Input
              id="session-timeout"
              type="number"
              value={sessionTimeoutSeconds}
              onChange={(e) => setSessionTimeoutSeconds(parseInt(e.target.value) || 3600)}
              min="60"
              max="86400"
              placeholder="3600"
              className="h-9"
            />
          </div>

          {/* WhatsApp Format */}
          <div className="grid grid-cols-[120px_1fr] items-center gap-3">
            <Label htmlFor="whatsapp-format" className="text-sm">Formato WhatsApp</Label>
            <Select
              value={useWhatsappFormat ? "enabled" : "disabled"}
              onValueChange={(value) => setUseWhatsappFormat(value === "enabled")}
            >
              <SelectTrigger id="whatsapp-format" className="h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="enabled">Enabled</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Button
              onClick={onLoadHistory}
              disabled={isLoadingHistory || !isMounted}
              className="w-full h-9"
              variant="outline"
            >
              {isLoadingHistory ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Carregando...
                </>
              ) : (
                <>
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Carregar Histórico
                </>
              )}
            </Button>

            <Button
              onClick={onClearScreen}
              disabled={!isMounted}
              className="w-full h-9"
              variant="outline"
            >
              <Eraser className="h-4 w-4 mr-2" />
              Limpar Tela
            </Button>

            <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
              <DialogTrigger asChild>
                <Button
                  disabled={isDeletingHistory || isLoadingHistory || !isMounted}
                  className="w-full h-9"
                  variant="destructive"
                >
                  {isDeletingHistory ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Deletando...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Deletar Histórico
                    </>
                  )}
                </Button>
              </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <Trash2 className="h-5 w-5" />
                  Deletar Histórico
                </DialogTitle>
                <DialogDescription className="text-base">
                  Tem certeza que deseja deletar <strong>PERMANENTEMENTE</strong> todo o histórico do usuário <code className="bg-muted px-1 py-0.5 rounded text-sm font-mono">{userId}</code>?
                </DialogDescription>
              </DialogHeader>

              <div className="py-4">
                <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <div className="text-destructive mt-0.5">⚠️</div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-destructive mb-1">Atenção!</h4>
                    <ul className="text-sm text-destructive/80 space-y-1">
                      <li>• Esta ação não pode ser desfeita</li>
                      <li>• Todos os checkpoints serão removidos</li>
                      <li>• O histórico será perdido permanentemente</li>
                    </ul>
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteModal(false)}
                  disabled={isDeletingHistory}
                >
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={onDeleteHistory}
                  disabled={isDeletingHistory}
                >
                  {isDeletingHistory ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Deletando...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Sim, Deletar
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
            </Dialog>

            {/* Export buttons */}
            <div className="space-y-2 pt-2 border-t">
              <Label className="text-sm font-medium">Exportar Conversa</Label>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  onClick={() => onExportConversation('markdown')}
                  disabled={!isMounted}
                  className="h-9 text-xs"
                  variant="outline"
                  title="Exportar como Markdown"
                >
                  <Download className="h-3 w-3 mr-1" />
                  MD
                </Button>
                <Button
                  onClick={() => onExportConversation('json')}
                  disabled={!isMounted}
                  className="h-9 text-xs"
                  variant="outline"
                  title="Exportar como JSON"
                >
                  <Download className="h-3 w-3 mr-1" />
                  JSON
                </Button>
                <Button
                  onClick={() => onExportConversation('text')}
                  disabled={!isMounted}
                  className="h-9 text-xs"
                  variant="outline"
                  title="Exportar como Texto"
                >
                  <Download className="h-3 w-3 mr-1" />
                  TXT
                </Button>
              </div>
            </div>
          </div>

          {historyError && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <p className="text-sm text-destructive">{historyError}</p>
            </div>
          )}

          {historyMessages.length > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-600">
                  {historyMessages.filter(m => m.message_type === 'user_message' || m.message_type === 'assistant_message').length} mensagens carregadas
                </span>
              </div>
              <Button
                onClick={onClearScreen}
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
              >
                Limpar Tudo
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ChatSidebar;
