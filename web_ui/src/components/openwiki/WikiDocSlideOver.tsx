'use client';

import React, { useEffect, useState } from 'react';
import {
  X,
  Maximize2,
  Minimize2,
  Copy,
  Check,
  ExternalLink,
  ChevronRight,
  Loader2,
  AlertCircle,
  FileText,
  Bot,
} from 'lucide-react';
import { DocDetail } from './types';
import { WikiDocViewer } from './WikiDocViewer';
import { useInvestigationLauncher } from '@/components/shell/InvestigationLauncherContext';

interface WikiDocSlideOverProps {
  isOpen: boolean;
  onClose: () => void;
  docDetail: DocDetail | null;
  isLoading: boolean;
  error: string | null;
  serviceName: string;
  onNavigateDoc: (path: string) => void;
}

export function WikiDocSlideOver({
  isOpen,
  onClose,
  docDetail,
  isLoading,
  error,
  serviceName,
  onNavigateDoc,
}: WikiDocSlideOverProps) {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const { open: openAgentDrawer } = useInvestigationLauncher();

  const handleAskSREAgent = () => {
    if (!docDetail) return;
    const prompt = `Tôi đang xem tài liệu OpenWiki: "${docDetail.title}"
- Service: ${serviceName}
- Đường dẫn: ${docDetail.path}
- Mô tả: ${docDetail.description || 'Không có mô tả'}

Hãy phân tích tài liệu này và giải thích:
1. Luồng xử lý / kiến trúc chính được mô tả.
2. Các thành phần phụ thuộc và những điểm lưu ý kỹ thuật quan trọng.`;
    openAgentDrawer(prompt);
  };

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when slide-over is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopyPath = () => {
    if (docDetail?.path) {
      navigator.clipboard.writeText(docDetail.path);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Dimmed backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-300 animate-fadeIn"
      />

      {/* Slide-over Container */}
      <div
        className={`relative z-50 h-full bg-white border-l border-slate-200 flex flex-col shadow-2xl transition-all duration-300 ease-in-out ${
          isExpanded ? 'w-full' : 'w-full md:w-[85vw] lg:w-[70vw] xl:w-[60vw]'
        }`}
      >
        {/* Sticky SlideOver Top Control Bar */}
        <div className="sticky top-0 z-20 flex items-center justify-between px-5 py-3.5 bg-white/95 backdrop-blur border-b border-slate-200/80 text-slate-700">
          {/* Breadcrumb info */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500 min-w-0 pr-4">
            <span className="font-semibold text-blue-600 shrink-0">
              {serviceName.split('(')[0].trim()}
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="truncate text-slate-800 font-medium">
              {docDetail?.title || docDetail?.path || 'Đang mở tài liệu...'}
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {docDetail && (
              <>
                <button
                  onClick={handleAskSREAgent}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition"
                  title="Mở phiên chat với SRE Agent về tài liệu này"
                >
                  <Bot className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Hỏi SRE Agent</span>
                </button>
                <button
                  onClick={handleCopyPath}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs transition border border-slate-200"
                  title="Sao chép đường dẫn tài liệu"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-[11px] text-emerald-600 font-medium">Đã chép</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span className="text-[11px] hidden sm:inline">Sao chép path</span>
                    </>
                  )}
                </button>
              </>
            )}

            {/* Toggle Fullscreen / Expand */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition"
              title={isExpanded ? 'Thu nhỏ panel' : 'Mở rộng toàn màn hình'}
            >
              {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="flex items-center gap-1 p-1.5 pl-2 rounded-lg bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-600 transition border border-slate-200"
              title="Đóng panel (Esc)"
            >
              <span className="text-[10px] font-mono text-slate-400 hidden sm:inline">ESC</span>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-8 bg-slate-50/40">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin text-slate-700" />
              <span className="text-xs font-medium">Đang tải nội dung tài liệu...</span>
            </div>
          )}

          {error && (
            <div className="p-6 rounded-2xl bg-red-50 border border-red-200 flex items-start gap-3 text-red-700 shadow-xs">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-sm">Không thể mở tài liệu</h4>
                <p className="text-xs text-red-600 mt-1">{error}</p>
              </div>
            </div>
          )}

          {!isLoading && !error && docDetail && (
            <WikiDocViewer
              doc={docDetail}
              serviceName={serviceName}
              onNavigateDoc={onNavigateDoc}
            />
          )}
        </div>
      </div>
    </div>
  );
}
