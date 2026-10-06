'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Copy,
  Check,
  AlertCircle,
  Eye,
  Code2,
  X,
} from 'lucide-react';

interface MermaidBlockProps {
  code: string;
  title?: string;
}

export function MermaidBlock({ code, title }: MermaidBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgHtml, setSvgHtml] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [zoom, setZoom] = useState<number>(1);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [showCode, setShowCode] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Pan state
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);

    async function renderMermaid() {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'neutral',
          themeVariables: {
            darkMode: false,
            background: '#ffffff',
            primaryColor: '#f1f5f9',
            primaryTextColor: '#0f172a',
            primaryBorderColor: '#cbd5e1',
            lineColor: '#64748b',
            secondaryColor: '#e2e8f0',
            tertiaryColor: '#ffffff',
          },
          securityLevel: 'loose',
          fontFamily: 'Inter, system-ui, sans-serif',
        });

        const id = `mmd-${Math.random().toString(36).substring(2, 9)}`;
        // Clean code
        const cleanCode = code.trim();
        const { svg } = await mermaid.render(id, cleanCode);
        if (isMounted) {
          setSvgHtml(svg);
          setIsLoading(false);
        }
      } catch (err: any) {
        console.warn('Mermaid render error:', err);
        if (isMounted) {
          setError(err?.message || 'Không thể render biểu đồ Mermaid');
          setIsLoading(false);
        }
      }
    }

    renderMermaid();

    return () => {
      isMounted = false;
    };
  }, [code]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  }, [code]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="my-6 rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-xs font-semibold text-slate-800">
            {title || 'Kiến trúc / Quy trình (Mermaid Diagram)'}
          </span>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom((z) => Math.min(z + 0.2, 2.5))}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition"
            title="Phóng to"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(z - 0.2, 0.5))}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition"
            title="Thu nhỏ"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={resetView}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition"
            title="Đặt lại khung nhìn"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <div className="h-4 w-px bg-slate-200 mx-1" />
          <button
            onClick={() => setShowCode(!showCode)}
            className={`px-2 py-1 text-xs rounded-lg transition flex items-center gap-1 font-medium ${
              showCode
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/60'
            }`}
            title="Xem mã Mermaid"
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Mã</span>
          </button>
          <button
            onClick={handleCopy}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition"
            title="Sao chép Mermaid Code"
          >
            {isCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setIsFullscreen(true)}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition"
            title="Xem toàn màn hình"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Code Toggle Area */}
      {showCode && (
        <div className="bg-slate-900 border-b border-slate-800 p-3 max-h-48 overflow-y-auto font-mono text-xs text-slate-200">
          <pre>{code}</pre>
        </div>
      )}

      {/* Diagram Canvas */}
      <div
        className="relative min-h-[300px] max-h-[550px] overflow-hidden cursor-grab active:cursor-grabbing p-6 flex items-center justify-center bg-slate-50/60 select-none"
        style={{
          backgroundImage: 'radial-gradient(#e2e8f0 1.2px, transparent 1.2px)',
          backgroundSize: '16px 16px',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {isLoading && (
          <div className="flex flex-col items-center gap-2 text-slate-500">
            <div className="w-6 h-6 border-2 border-slate-700 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs">Đang dựng sơ đồ Mermaid...</span>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center gap-3 p-6 text-center max-w-md bg-white rounded-xl border border-red-200 shadow-xs">
            <AlertCircle className="w-8 h-8 text-amber-500" />
            <div className="text-sm font-semibold text-slate-800">Không thể dựng hình tự động</div>
            <p className="text-xs text-slate-500">{error}</p>
            <div className="w-full text-left bg-slate-900 p-3 rounded-lg border border-slate-800 max-h-40 overflow-auto font-mono text-xs text-slate-200">
              <pre>{code}</pre>
            </div>
          </div>
        )}

        {!isLoading && !error && svgHtml && (
          <div
            ref={containerRef}
            className="transition-transform duration-75"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
            }}
            dangerouslySetInnerHTML={{ __html: svgHtml }}
          />
        )}

        {/* Zoom Hint */}
        <div className="absolute bottom-2 right-3 text-[11px] text-slate-500 pointer-events-none bg-white/90 px-2.5 py-0.5 rounded-lg border border-slate-200 shadow-2xs">
          Kéo rê để di chuyển • Phóng to: {Math.round(zoom * 100)}%
        </div>
      </div>

      {/* Fullscreen Modal */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex flex-col p-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 bg-white px-5 py-3 rounded-t-2xl">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <h3 className="text-sm font-semibold text-slate-800">
                {title || 'Chi tiết sơ đồ Mermaid'}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setZoom((z) => Math.min(z + 0.2, 3))}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
              >
                <ZoomIn className="w-5 h-5" />
              </button>
              <button
                onClick={() => setZoom((z) => Math.max(z - 0.2, 0.3))}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
              >
                <ZoomOut className="w-5 h-5" />
              </button>
              <button
                onClick={resetView}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
              >
                <RotateCcw className="w-5 h-5" />
              </button>
              <button
                onClick={handleCopy}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
              >
                {isCopied ? <Check className="w-5 h-5 text-emerald-600" /> : <Copy className="w-5 h-5" />}
              </button>
              <button
                onClick={() => setIsFullscreen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          <div
            className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing flex items-center justify-center relative select-none bg-white rounded-b-2xl"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            {svgHtml && (
              <div
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom * 1.3})`,
                  transformOrigin: 'center center',
                }}
                dangerouslySetInnerHTML={{ __html: svgHtml }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
