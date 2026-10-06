'use client';

import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  FileText,
  Clock,
  Tag,
  Code2,
  ExternalLink,
  ChevronRight,
  List,
  Sparkles,
  Layers,
  CheckCircle,
  Copy,
  Check,
  Calendar,
  Compass,
  Bot,
} from 'lucide-react';
import { MermaidBlock } from './MermaidBlock';
import { DocDetail } from './types';
import { useInvestigationLauncher } from '@/components/shell/InvestigationLauncherContext';

export type { DocDetail };

interface WikiDocViewerProps {
  doc: DocDetail;
  serviceName: string;
  onNavigateDoc?: (path: string) => void;
}

export function WikiDocViewer({ doc, serviceName, onNavigateDoc }: WikiDocViewerProps) {
  const [activeSlug, setActiveSlug] = useState<string>('');
  const [copiedResource, setCopiedResource] = useState<string | null>(null);
  const { open: openAgentDrawer } = useInvestigationLauncher();

  const handleAskSREAgent = () => {
    const prompt = `Tôi đang xem tài liệu OpenWiki: "${doc.title}"
- Service: ${serviceName}
- Đường dẫn: ${doc.path}
- Mô tả: ${doc.description || 'Không có mô tả'}

Hãy phân tích tài liệu này và giải thích:
1. Luồng xử lý / kiến trúc chính được mô tả.
2. Các thành phần phụ thuộc và những điểm lưu ý kỹ thuật quan trọng.`;
    openAgentDrawer(prompt);
  };

  const handleCopyResource = (res: string) => {
    navigator.clipboard.writeText(res);
    setCopiedResource(res);
    setTimeout(() => setCopiedResource(null), 2000);
  };

  const getTypeBadgeColor = (type: string) => {
    switch (type?.toLowerCase()) {
      case 'workflow':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'guide':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'concept':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'integration':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'architecture':
        return 'bg-sky-50 text-sky-700 border-sky-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="flex flex-col xl:flex-row gap-6 w-full mx-auto">
      {/* Main Content Column */}
      <div className="flex-1 min-w-0">
        {/* Document Header Card */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs mb-8">
          {/* Breadcrumbs */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-3">
            <span className="font-semibold text-blue-600">{serviceName}</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-500">{doc.path.split('/')[0]}</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-800 font-medium truncate">{doc.title}</span>
          </div>

          {/* Title & Type Badge */}
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider border ${getTypeBadgeColor(
                doc.type
              )}`}
            >
              {doc.type}
            </span>
            {doc.mermaids.length > 0 && (
              <span className="flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                <Sparkles className="w-3 h-3 text-amber-600" />
                {doc.mermaids.length} Mermaid Diagram
              </span>
            )}
            <span className="flex items-center gap-1 text-xs text-slate-400 ml-auto font-mono">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              ~{doc.stats.readingTimeMinutes} phút đọc
            </span>
          </div>

          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight mt-2">
            {doc.title}
          </h1>

          {doc.description && (
            <p className="text-sm text-slate-600 mt-2 leading-relaxed font-sans">
              {doc.description}
            </p>
          )}

          {/* Quick Ask SRE Agent Action */}
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-200">
                <Bot className="w-4 h-4" />
              </div>
              <div className="text-xs">
                <div className="font-semibold text-slate-800">Hỏi AI SRE Agent về tài liệu này</div>
                <div className="text-slate-500 text-[11px]">Đối chiếu kiến trúc wiki với số liệu trace/telemetry thực tế của hệ thống</div>
              </div>
            </div>
            <button
              onClick={handleAskSREAgent}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition hover:scale-[1.01] active:scale-[0.99] shrink-0"
              title="Mở SRE Agent để đặt câu hỏi về tài liệu này"
            >
              <span>Phân tích với Agent</span>
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            </button>
          </div>

          {/* Tags */}
          {doc.tags && doc.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-4 pt-3 border-t border-slate-100">
              <Tag className="w-3.5 h-3.5 text-slate-400 mr-1" />
              {doc.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded text-xs bg-slate-50 text-slate-600 border border-slate-200/80 font-mono"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Source Code References */}
          {doc.sources && doc.sources.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-100">
              <div className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5 text-blue-600" />
                <span>Mã nguồn tham chiếu (Source Code References):</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {doc.sources.map((src, i) => (
                  <div
                    key={src.id || i}
                    onClick={() => handleCopyResource(src.resource)}
                    className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 hover:border-blue-400 text-xs font-mono text-slate-700 cursor-pointer transition group"
                    title="Click để sao chép đường dẫn"
                  >
                    <span className="text-blue-700 font-medium">
                      {src.resource.replace('repo://', '')}
                    </span>
                    {copiedResource === src.resource ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Copy className="w-3 h-3 text-slate-400 group-hover:text-slate-600" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Markdown Rendered Content */}
        <div className="prose prose-slate max-w-none prose-pre:p-0 prose-pre:bg-transparent">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              // Intercept code blocks for Mermaid rendering
              code({ node, className, children, ...props }: any) {
                const match = /language-(\w+)/.exec(className || '');
                const lang = match ? match[1] : '';
                const codeString = String(children).replace(/\n$/, '');

                if (lang === 'mermaid') {
                  return <MermaidBlock code={codeString} />;
                }

                if (!match) {
                  return (
                    <code
                      className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 font-mono text-xs border border-slate-200"
                      {...props}
                    >
                      {children}
                    </code>
                  );
                }

                return (
                  <div className="my-4 rounded-xl border border-slate-800 bg-slate-900 p-4 overflow-x-auto font-mono text-xs text-slate-200">
                    <pre className="text-slate-200 leading-relaxed">{codeString}</pre>
                  </div>
                );
              },
              h1({ children }) {
                return (
                  <h1 className="text-2xl font-bold text-slate-900 mt-8 mb-4 pb-2 border-b border-slate-200">
                    {children}
                  </h1>
                );
              },
              h2({ children }) {
                return (
                  <h2 className="text-xl font-bold text-slate-900 mt-7 mb-3 flex items-center gap-2">
                    <span className="w-1.5 h-5 rounded-full bg-blue-600 inline-block" />
                    {children}
                  </h2>
                );
              },
              h3({ children }) {
                return (
                  <h3 className="text-lg font-semibold text-slate-800 mt-6 mb-2">
                    {children}
                  </h3>
                );
              },
              p({ children }) {
                return (
                  <p className="text-slate-600 text-sm leading-relaxed my-3 font-sans">
                    {children}
                  </p>
                );
              },
              ul({ children }) {
                return (
                  <ul className="list-disc list-inside space-y-1.5 my-3 text-slate-600 text-sm pl-2">
                    {children}
                  </ul>
                );
              },
              ol({ children }) {
                return (
                  <ol className="list-decimal list-inside space-y-1.5 my-3 text-slate-600 text-sm pl-2">
                    {children}
                  </ol>
                );
              },
              table({ children }) {
                return (
                  <div className="my-5 overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <table className="w-full text-left text-xs text-slate-700 border-collapse">
                      {children}
                    </table>
                  </div>
                );
              },
              th({ children }) {
                return (
                  <th className="bg-slate-50 p-3 font-semibold text-slate-800 border-b border-slate-200 uppercase tracking-wider text-[11px]">
                    {children}
                  </th>
                );
              },
              td({ children }) {
                return (
                  <td className="p-3 border-b border-slate-100 leading-normal text-slate-700">
                    {children}
                  </td>
                );
              },
              blockquote({ children }) {
                return (
                  <blockquote className="my-4 pl-4 border-l-4 border-blue-500 bg-blue-50/50 py-2.5 rounded-r-lg text-slate-700 italic text-sm">
                    {children}
                  </blockquote>
                );
              },
              a({ href, children }) {
                // Check if it's an internal openwiki link
                const isInternalWiki = href?.includes('/openwiki/') || href?.endsWith('.md');
                return (
                  <a
                    href={href}
                    onClick={(e) => {
                      if (isInternalWiki && onNavigateDoc && href) {
                        e.preventDefault();
                        const cleanPath = href.replace(/^\/openwiki\//, '');
                        onNavigateDoc(cleanPath);
                      }
                    }}
                    className="text-blue-600 hover:text-blue-700 underline font-medium cursor-pointer inline-flex items-center gap-0.5"
                    target={isInternalWiki ? undefined : '_blank'}
                    rel="noreferrer"
                  >
                    <span>{children}</span>
                    {!isInternalWiki && <ExternalLink className="w-3 h-3 inline-block ml-0.5" />}
                  </a>
                );
              },
            }}
          >
            {doc.content}
          </ReactMarkdown>
        </div>
      </div>

      {/* Right Column: Table of Contents & Quick Meta */}
      <div className="w-full xl:w-72 shrink-0 space-y-6">
        {/* Table of Contents Sticky Box */}
        {doc.headings && doc.headings.length > 0 && (
          <div className="sticky top-6 p-4 rounded-xl bg-white border border-slate-200/90 shadow-xs">
            <div className="flex items-center gap-2 pb-3 mb-3 border-b border-slate-100 text-xs font-bold text-slate-700 uppercase tracking-wider">
              <List className="w-4 h-4 text-blue-600" />
              <span>Mục lục bài viết (TOC)</span>
            </div>
            <nav className="space-y-1.5 max-h-[420px] overflow-y-auto text-xs pr-1">
              {doc.headings.map((h, i) => (
                <a
                  key={i}
                  href={`#${h.slug}`}
                  className={`block py-1 hover:text-blue-600 transition truncate ${
                    h.level === 1
                      ? 'font-bold text-slate-800'
                      : h.level === 2
                      ? 'pl-2 text-slate-600 hover:text-slate-900'
                      : 'pl-4 text-slate-400 hover:text-slate-700'
                  }`}
                >
                  {h.text}
                </a>
              ))}
            </nav>

            <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
              <span>{doc.stats.lines} dòng mã</span>
              <span>{(doc.stats.sizeBytes / 1024).toFixed(1)} KB</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
