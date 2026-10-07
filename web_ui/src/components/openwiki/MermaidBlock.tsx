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
  Code2,
  X,
  Scan,
  Maximize,
} from 'lucide-react';

interface MermaidBlockProps {
  code: string;
  title?: string;
}

export function MermaidBlock({ code, title }: MermaidBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fullscreenContainerRef = useRef<HTMLDivElement>(null);
  const svgWrapperRef = useRef<HTMLDivElement>(null);
  const fullscreenSvgWrapperRef = useRef<HTMLDivElement>(null);

  const [svgHtml, setSvgHtml] = useState<string>('');
  const [svgDimensions, setSvgDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
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

  // Render Mermaid diagram
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
            fontSize: '14px',
          },
          sequence: {
            useMaxWidth: false,
            messageFontSize: 13,
            noteFontSize: 13,
            actorFontSize: 14,
            mirrorActors: true,
            bottomMarginAdj: 10,
          },
          flowchart: {
            useMaxWidth: false,
            nodeSpacing: 50,
            rankSpacing: 50,
          },
          state: {
            useMaxWidth: false,
          },
          securityLevel: 'loose',
          fontFamily: 'Inter, system-ui, sans-serif',
        });

        const id = `mmd-${Math.random().toString(36).substring(2, 9)}`;
        const cleanCode = code.trim();
        const { svg } = await mermaid.render(id, cleanCode);

        if (isMounted) {
          // Remove any inline max-width from the svg tag to let it render at true native resolution
          let processedSvg = svg.replace(/max-width:\s*[^;"]+;?/gi, 'max-width: none;');
          
          // Parse natural viewBox dimensions
          const viewBoxMatch = /viewBox="([^"]+)"/i.exec(processedSvg);
          if (viewBoxMatch) {
            const parts = viewBoxMatch[1].trim().split(/\s+/).map(Number);
            if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
              setSvgDimensions({ width: parts[2], height: parts[3] });
            }
          }

          setSvgHtml(processedSvg);
          setIsLoading(false);
          setZoom(1);
          setPan({ x: 0, y: 0 });
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

  // Non-passive wheel event handling for smooth canvas zooming without scrolling the whole page
  useEffect(() => {
    const attachWheelZoom = (el: HTMLElement | null) => {
      if (!el) return;
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.12 : 0.89;
        setZoom((z) => Math.min(Math.max(Number((z * factor).toFixed(2)), 0.15), 4.5));
      };
      el.addEventListener('wheel', onWheel, { passive: false });
      return () => el.removeEventListener('wheel', onWheel);
    };

    const cleanupNormal = attachWheelZoom(containerRef.current);
    const cleanupFullscreen = attachWheelZoom(fullscreenContainerRef.current);

    return () => {
      cleanupNormal?.();
      cleanupFullscreen?.();
    };
  }, [svgHtml, isFullscreen]);

  // Keyboard navigation for fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullscreen(false);
      } else if (e.key === '+' || e.key === '=') {
        setZoom((z) => Math.min(z + 0.25, 4.5));
      } else if (e.key === '-') {
        setZoom((z) => Math.max(z - 0.25, 0.15));
      } else if (e.key === '0') {
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

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

  // Fit view to container width/height
  const fitView = useCallback(() => {
    const targetContainer = isFullscreen ? fullscreenContainerRef.current : containerRef.current;
    if (!targetContainer || !svgDimensions.width || !svgDimensions.height) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }
    const containerWidth = targetContainer.clientWidth - 48;
    const containerHeight = targetContainer.clientHeight - 48;
    const scaleX = containerWidth / svgDimensions.width;
    const scaleY = containerHeight / svgDimensions.height;
    const fitScale = Math.min(scaleX, scaleY, 1.5);
    setZoom(Number(Math.max(fitScale, 0.2).toFixed(2)));
    setPan({ x: 0, y: 0 });
  }, [isFullscreen, svgDimensions]);

  // Double click to toggle between 100% and fit
  const handleDoubleClick = () => {
    if (Math.abs(zoom - 1) < 0.1) {
      fitView();
    } else {
      resetView();
    }
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
          {svgDimensions.width > 0 && (
            <span className="text-[11px] font-mono text-slate-400 hidden sm:inline">
              ({svgDimensions.width} × {svgDimensions.height}px)
            </span>
          )}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom((z) => Math.min(Number((z + 0.2).toFixed(2)), 4.5))}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition"
            title="Phóng to (Ctrl + Cuộn chuột)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => setZoom((z) => Math.max(Number((z - 0.2).toFixed(2)), 0.15))}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition"
            title="Thu nhỏ (Ctrl + Cuộn chuột)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <button
            onClick={resetView}
            className={`px-2 py-1 text-xs rounded-lg transition font-mono font-medium ${
              Math.abs(zoom - 1) < 0.05
                ? 'bg-slate-200 text-slate-800 font-bold'
                : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'
            }`}
            title="Kích thước gốc 100% (chữ sắc nét)"
          >
            100%
          </button>

          <button
            onClick={fitView}
            className="px-2 py-1 text-xs rounded-lg text-slate-600 hover:bg-slate-200/60 hover:text-slate-900 transition flex items-center gap-1 font-medium"
            title="Thu phóng vừa màn hình (Fit)"
          >
            <Scan className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Vừa khung</span>
          </button>

          <button
            onClick={resetView}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition"
            title="Đặt lại vị trí ban đầu"
          >
            <RotateCcw className="w-3.5 h-3.5" />
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
            onClick={() => {
              setIsFullscreen(true);
            }}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition"
            title="Xem toàn màn hình"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Code Toggle Area */}
      {showCode && (
        <div className="bg-slate-900 border-b border-slate-800 p-3 max-h-52 overflow-y-auto font-mono text-xs text-slate-200">
          <pre>{code}</pre>
        </div>
      )}

      {/* Diagram Canvas */}
      <div
        ref={containerRef}
        className="relative min-h-[460px] max-h-[720px] overflow-hidden cursor-grab active:cursor-grabbing p-6 flex items-center justify-center bg-slate-50/70 select-none"
        style={{
          backgroundImage: 'radial-gradient(#cbd5e1 1.2px, transparent 1.2px)',
          backgroundSize: '16px 16px',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
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
            ref={svgWrapperRef}
            className="transition-transform duration-75 [&>svg]:max-w-none [&>svg]:w-auto [&>svg]:h-auto [&>svg]:block flex items-center justify-center"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
            }}
            dangerouslySetInnerHTML={{ __html: svgHtml }}
          />
        )}

        {/* Zoom & Navigation Hint */}
        <div className="absolute bottom-3 right-3 flex items-center gap-2 text-[11px] text-slate-600 pointer-events-none bg-white/95 px-3 py-1 rounded-lg border border-slate-200 shadow-2xs font-sans">
          <span>Cuộn chuột để phóng to/thu nhỏ</span>
          <span className="text-slate-300">•</span>
          <span>Kéo chuột để di chuyển</span>
          <span className="text-slate-300">•</span>
          <span className="font-mono font-semibold text-blue-600">{Math.round(zoom * 100)}%</span>
        </div>
      </div>

      {/* Fullscreen Modal */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-sm flex flex-col p-3 sm:p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 bg-white px-5 py-3 rounded-t-2xl shadow-xs">
            <div className="flex items-center gap-2.5">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <h3 className="text-sm font-semibold text-slate-800">
                {title || 'Chi tiết sơ đồ Mermaid'}
              </h3>
              {svgDimensions.width > 0 && (
                <span className="text-xs font-mono text-slate-400">
                  ({svgDimensions.width} × {svgDimensions.height}px)
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setZoom((z) => Math.min(Number((z + 0.25).toFixed(2)), 4.5))}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
                title="Phóng to (+)"
              >
                <ZoomIn className="w-5 h-5" />
              </button>

              <button
                onClick={() => setZoom((z) => Math.max(Number((z - 0.25).toFixed(2)), 0.15))}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
                title="Thu nhỏ (-)"
              >
                <ZoomOut className="w-5 h-5" />
              </button>

              <button
                onClick={resetView}
                className={`px-2.5 py-1 text-xs rounded-lg transition font-mono font-medium ${
                  Math.abs(zoom - 1) < 0.05
                    ? 'bg-slate-200 text-slate-900 font-bold'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
                title="Kích thước gốc 100%"
              >
                100%
              </button>

              <button
                onClick={fitView}
                className="px-2.5 py-1 text-xs rounded-lg text-slate-600 hover:bg-slate-100 transition flex items-center gap-1.5 font-medium"
                title="Vừa màn hình"
              >
                <Scan className="w-4 h-4" />
                <span>Vừa màn hình</span>
              </button>

              <button
                onClick={resetView}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
                title="Đặt lại khung nhìn"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <div className="h-5 w-px bg-slate-200 mx-1" />

              <button
                onClick={handleCopy}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
                title="Sao chép Mermaid Code"
              >
                {isCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>

              <button
                onClick={() => setIsFullscreen(false)}
                className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition ml-1"
                title="Đóng toàn màn hình (Esc)"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          <div
            ref={fullscreenContainerRef}
            className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing flex items-center justify-center relative select-none bg-slate-50/80 rounded-b-2xl p-6"
            style={{
              backgroundImage: 'radial-gradient(#cbd5e1 1.2px, transparent 1.2px)',
              backgroundSize: '16px 16px',
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onDoubleClick={handleDoubleClick}
          >
            {svgHtml && (
              <div
                ref={fullscreenSvgWrapperRef}
                className="transition-transform duration-75 [&>svg]:max-w-none [&>svg]:w-auto [&>svg]:h-auto [&>svg]:block flex items-center justify-center"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: 'center center',
                }}
                dangerouslySetInnerHTML={{ __html: svgHtml }}
              />
            )}

            {/* Floating Navigation Bar in Fullscreen */}
            <div className="absolute bottom-4 flex items-center gap-3 text-xs text-slate-600 bg-white/95 px-4 py-1.5 rounded-xl border border-slate-200 shadow-md">
              <span>Cuộn chuột để thu phóng</span>
              <span className="text-slate-300">•</span>
              <span>Kéo chuột để di chuyển</span>
              <span className="text-slate-300">•</span>
              <span>Nhấp đúp để đổi giữa 100% & Vừa khung</span>
              <span className="text-slate-300">•</span>
              <span className="font-mono font-bold text-blue-600">{Math.round(zoom * 100)}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
