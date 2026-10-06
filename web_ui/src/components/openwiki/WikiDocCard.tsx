'use client';

import React from 'react';
import { FileText, Sparkles, Tag, ArrowRight, BookOpen, GitBranch } from 'lucide-react';
import { DocMetadata } from './types';

interface WikiDocCardProps {
  doc: DocMetadata;
  serviceName?: string;
  serviceId?: string;
  categoryName?: string;
  onClick: () => void;
}

export const getTypeBadgeClass = (type: string) => {
  switch (type?.toLowerCase()) {
    case 'workflow':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'architecture':
      return 'bg-sky-50 text-sky-700 border-sky-200';
    case 'guide':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'concept':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'integration':
      return 'bg-purple-50 text-purple-700 border-purple-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
};

export function WikiDocCard({
  doc,
  serviceName,
  categoryName,
  onClick,
}: WikiDocCardProps) {
  return (
    <div
      onClick={onClick}
      className="group relative flex flex-col justify-between p-4 rounded-xl bg-white hover:bg-slate-50/80 border border-slate-200/90 hover:border-slate-300 transition-all duration-200 cursor-pointer shadow-xs hover:shadow-md"
    >
      <div>
        {/* Top meta tags */}
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            {serviceName && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 font-mono">
                {serviceName.split('(')[0].trim()}
              </span>
            )}
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border uppercase tracking-wider ${getTypeBadgeClass(
                doc.type
              )}`}
            >
              {doc.type || 'Doc'}
            </span>
          </div>

          {doc.hasMermaid && (
            <span
              className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 shrink-0"
              title={`${doc.mermaidCount} biểu đồ Mermaid`}
            >
              <Sparkles className="w-3 h-3 text-amber-600" />
              <span>{doc.mermaidCount} {doc.mermaidCount > 1 ? 'diagrams' : 'diagram'}</span>
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-1 leading-snug">
          {doc.title}
        </h3>

        {/* Description or category path */}
        <p className="text-xs text-slate-500 line-clamp-2 mt-1.5 leading-relaxed font-sans min-h-[2rem]">
          {doc.description || (categoryName ? `Danh mục: ${categoryName}` : doc.path)}
        </p>
      </div>

      {/* Footer: Tags & Action */}
      <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 flex-wrap overflow-hidden max-h-5">
          {doc.tags && doc.tags.length > 0 ? (
            doc.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-[10px] px-1.5 py-0.2 rounded bg-slate-50 text-slate-600 border border-slate-200/80 font-mono"
              >
                #{tag}
              </span>
            ))
          ) : (
            <span className="text-[10px] text-slate-400 font-mono truncate">
              {doc.path}
            </span>
          )}
          {doc.tags && doc.tags.length > 3 && (
            <span className="text-[10px] text-slate-400 font-mono">
              +{doc.tags.length - 3}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 text-xs text-slate-400 group-hover:text-blue-600 transition-colors shrink-0">
          <span className="text-[11px] font-medium hidden group-hover:inline">Đọc</span>
          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>
    </div>
  );
}
