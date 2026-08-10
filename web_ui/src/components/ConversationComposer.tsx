'use client';

import { useState, useEffect } from 'react';
import { Send, Square, Paperclip, FileText, Database, Folder, X } from 'lucide-react';

export interface ComposerAttachment {
  id: string;
  name: string;
  path?: string;
  type?: 'file' | 'folder' | 'db' | 'context';
}

interface Props {
  onSend: (message: string) => void;
  onQueueMessage?: (message: string) => void | Promise<void>;
  onStop?: () => void;
  busy?: boolean;
  queuedMessages?: string[];
  disabled?: boolean;
  disabledReason?: string;
  placeholder?: string;
  initialValue?: string;
  initialAttachments?: ComposerAttachment[];
}

export default function ConversationComposer({
  onSend,
  onQueueMessage,
  onStop,
  busy,
  queuedMessages = [],
  disabled,
  disabledReason,
  placeholder: idlePlaceholder = 'Ask a follow-up…',
  initialValue = '',
  initialAttachments = [],
}: Props) {
  const [value, setValue] = useState(initialValue);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>(initialAttachments);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [customFilePath, setCustomFilePath] = useState('');
  const [queueError, setQueueError] = useState<string | null>(null);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    setAttachments(initialAttachments || []);
  }, [initialAttachments]);

  // Running investigations always get a Stop control, even when follow-ups are
  // not yet resumable (e.g. detail page opened from the drawer mid-run).
  if (disabled && !busy) {
    return (
      <div className="mt-6 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/40 px-4 py-3 text-sm text-stone-500">
        {disabledReason}
      </div>
    );
  }

  const submit = async () => {
    const rawText = value.trim();
    if (!rawText && attachments.length === 0) return;

    let fullMessage = rawText;
    if (attachments.length > 0) {
      const attsText = attachments
        .map((a) => (a.path ? `\`${a.path}\`` : a.name))
        .join(', ');
      if (rawText) {
        if (!attachments.some((a) => a.path && rawText.includes(a.path))) {
          fullMessage = `[Đính kèm context: ${attsText}]\n${rawText}`;
        } else {
          fullMessage = rawText;
        }
      } else {
        fullMessage = `Hãy phân tích file/báo cáo đã đính kèm (${attsText}) và đưa ra đánh giá, đề xuất phương án tối ưu.`;
      }
    }

    if (busy && onQueueMessage) {
      setQueueError(null);
      try {
        await Promise.resolve(onQueueMessage(fullMessage));
        setValue('');
      } catch (err) {
        setQueueError((err as Error).message || 'Failed to queue message');
      }
      return;
    }
    if (busy) return;
    onSend(fullMessage);
    setValue('');
  };

  const placeholder = busy ? 'Queue a message…' : idlePlaceholder;

  return (
    <div className="mt-6">
      {queuedMessages.length > 0 && (
        <ul
          data-testid="conversation-composer-queued-list"
          className="mb-2 space-y-1.5"
        >
          {queuedMessages.map((msg, index) => (
            <li
              key={`${index}-${msg}`}
              data-testid="conversation-composer-queued-item"
              className="flex items-start justify-between gap-3 text-sm"
            >
              <span className="text-stone-700 dark:text-stone-300">{msg}</span>
              <span className="shrink-0 rounded-full bg-forest/10 px-2 py-0.5 text-xs font-medium text-forest">
                Queued
              </span>
            </li>
          ))}
        </ul>
      )}
      {queueError ? (
        <p
          data-testid="conversation-composer-queue-error"
          className="mb-2 text-sm text-clay"
        >
          {queueError}
        </p>
      ) : null}

      {/* Attached Context / File Chips (Antigravity IDE style) */}
      {attachments.length > 0 && (
        <div
          data-testid="conversation-composer-attachments"
          className="mb-2.5 flex flex-wrap items-center gap-2"
        >
          {attachments.map((att) => (
            <div
              key={att.id}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono bg-forest/10 dark:bg-forest/20 text-forest dark:text-forest-light border border-forest/30 dark:border-forest/50 shadow-xs transition-all"
            >
              {att.type === 'db' ? (
                <Database className="w-3.5 h-3.5 text-forest" />
              ) : att.type === 'folder' ? (
                <Folder className="w-3.5 h-3.5 text-forest" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-forest" />
              )}
              <span className="font-semibold">{att.name}</span>
              {att.path && att.path !== att.name && (
                <span className="text-[10px] opacity-75 max-w-[180px] truncate" title={att.path}>
                  ({att.path})
                </span>
              )}
              <button
                type="button"
                onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                className="ml-1 p-0.5 rounded-full hover:bg-forest/20 text-forest/70 hover:text-forest transition-colors cursor-pointer"
                title="Gỡ đính kèm"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="relative flex items-end gap-2">
        {/* Attach File Button */}
        <div className="relative">
          <button
            type="button"
            data-testid="conversation-composer-attach-btn"
            onClick={() => setShowAttachMenu(!showAttachMenu)}
            className="h-11 w-11 shrink-0 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800 flex items-center justify-center transition-colors cursor-pointer"
            title="Đính kèm file/context"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          {/* Attach file popover */}
          {showAttachMenu && (
            <div className="absolute bottom-13 left-0 w-80 p-3 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl shadow-xl z-20 space-y-2 text-xs">
              <div className="font-semibold text-stone-800 dark:text-white flex items-center justify-between">
                <span>Đính kèm đường dẫn file / Context</span>
                <button
                  type="button"
                  onClick={() => setShowAttachMenu(false)}
                  className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="/app/awr/orcl/awrrpt..."
                  value={customFilePath}
                  onChange={(e) => setCustomFilePath(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customFilePath.trim()) {
                      e.preventDefault();
                      const path = customFilePath.trim();
                      const fileName = path.split('/').pop() || path;
                      setAttachments((prev) => [
                        ...prev,
                        { id: path, name: fileName, path, type: 'file' },
                      ]);
                      setCustomFilePath('');
                      setShowAttachMenu(false);
                    }
                  }}
                  className="flex-1 px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 text-stone-800 dark:text-stone-200 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-forest"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (customFilePath.trim()) {
                      const path = customFilePath.trim();
                      const fileName = path.split('/').pop() || path;
                      setAttachments((prev) => [
                        ...prev,
                        { id: path, name: fileName, path, type: 'file' },
                      ]);
                      setCustomFilePath('');
                      setShowAttachMenu(false);
                    }
                  }}
                  className="px-3 py-1.5 bg-forest hover:bg-forest-dark text-white font-medium rounded-lg text-xs transition-colors cursor-pointer"
                >
                  Thêm
                </button>
              </div>
            </div>
          )}
        </div>

        <textarea
          data-testid="conversation-composer-input"
          className="flex-1 resize-none rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest/40 disabled:opacity-60 text-stone-900 dark:text-white"
          rows={2}
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(); } }}
        />
        {busy && onStop ? (
          <button
            data-testid="conversation-composer-stop"
            onClick={onStop}
            className="h-11 w-11 shrink-0 rounded-xl bg-clay text-white flex items-center justify-center cursor-pointer"
            aria-label="Stop investigation"
          >
            <Square className="w-4 h-4 fill-current" />
          </button>
        ) : null}
        <button
          data-testid="conversation-composer-send"
          onClick={() => void submit()}
          disabled={!value.trim() && attachments.length === 0}
          className="h-11 w-11 shrink-0 rounded-xl bg-forest text-white flex items-center justify-center disabled:opacity-40 cursor-pointer"
          aria-label={busy ? 'Queue message' : 'Send follow-up'}
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

