'use client';

import React, { useMemo } from 'react';
import {
  Server,
  FileText,
  Workflow,
  Folder,
  ArrowRight,
  Sparkles,
  ExternalLink,
  Layers,
  Tag,
  Compass,
  CheckCircle2,
  Database,
  Cpu,
} from 'lucide-react';
import { ServiceInfo, DocMetadata, OpenWikiTab } from './types';
import { WikiDocCard } from './WikiDocCard';

interface WikiDashboardProps {
  services: ServiceInfo[];
  onSelectService: (serviceId: string) => void;
  onSelectTab: (tab: OpenWikiTab) => void;
  onOpenDoc: (serviceId: string, docPath: string) => void;
  onSelectTag?: (tag: string) => void;
}

export function WikiDashboard({
  services,
  onSelectService,
  onSelectTab,
  onOpenDoc,
  onSelectTag,
}: WikiDashboardProps) {
  // Aggregate system-wide stats
  const totalStats = useMemo(() => {
    let docs = 0;
    let mermaids = 0;
    const catSet = new Set<string>();

    services.forEach((s) => {
      docs += s.totalDocs;
      mermaids += s.totalMermaid;
      s.categories.forEach((c) => catSet.add(c.id));
    });

    return {
      serviceCount: services.length,
      docCount: docs,
      mermaidCount: mermaids,
      categoryCount: catSet.size,
    };
  }, [services]);

  // Featured / Core Workflows (workflows, architecture, or docs with diagrams)
  const featuredDocs = useMemo(() => {
    const list: Array<{ service: ServiceInfo; doc: DocMetadata }> = [];

    services.forEach((s) => {
      s.categories.forEach((c) => {
        c.docs.forEach((d) => {
          if (
            d.type.toLowerCase() === 'workflow' ||
            d.type.toLowerCase() === 'architecture' ||
            d.mermaidCount > 0
          ) {
            list.push({ service: s, doc: d });
          }
        });
      });
    });

    // Sort by mermaidCount desc, then title
    return list
      .sort((a, b) => b.doc.mermaidCount - a.doc.mermaidCount)
      .slice(0, 6);
  }, [services]);

  // Top tags frequency
  const popularTags = useMemo(() => {
    const counts: Record<string, number> = {};
    services.forEach((s) => {
      s.categories.forEach((c) => {
        c.docs.forEach((d) => {
          d.tags?.forEach((t) => {
            const clean = t.trim().toLowerCase();
            if (clean) counts[clean] = (counts[clean] || 0) + 1;
          });
        });
      });
    });

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 16);
  }, [services]);

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* 1. Metric Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Services Card */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/80 flex items-center gap-4 shadow-xs hover:border-slate-300 transition">
          <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
            <Server className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight text-slate-900">
              {totalStats.serviceCount}
            </div>
            <div className="text-xs text-slate-500 font-medium mt-0.5">Dịch vụ tích hợp</div>
          </div>
        </div>

        {/* Docs Card */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/80 flex items-center gap-4 shadow-xs hover:border-slate-300 transition">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight text-slate-900">
              {totalStats.docCount}
            </div>
            <div className="text-xs text-slate-500 font-medium mt-0.5">Tài liệu kỹ thuật</div>
          </div>
        </div>

        {/* Diagrams Card */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/80 flex items-center gap-4 shadow-xs hover:border-slate-300 transition">
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
            <Workflow className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight text-slate-900">
              {totalStats.mermaidCount}
            </div>
            <div className="text-xs text-slate-500 font-medium mt-0.5">Sơ đồ Mermaid</div>
          </div>
        </div>

        {/* Categories Card */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/80 flex items-center gap-4 shadow-xs hover:border-slate-300 transition">
          <div className="w-12 h-12 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 shrink-0">
            <Folder className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight text-slate-900">
              {totalStats.categoryCount}
            </div>
            <div className="text-xs text-slate-500 font-medium mt-0.5">Danh mục hệ thống</div>
          </div>
        </div>
      </div>

      {/* 2. Services Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-slate-700" />
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Danh sách dịch vụ ({services.length})
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            Nhấn vào dịch vụ để khám phá toàn bộ tài liệu
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map((svc) => (
            <div
              key={svc.id}
              onClick={() => {
                onSelectService(svc.id);
                onSelectTab('explorer');
              }}
              className="group p-5 rounded-2xl bg-white hover:bg-slate-50/60 border border-slate-200/80 hover:border-slate-350 transition-all duration-200 cursor-pointer flex flex-col justify-between shadow-xs hover:shadow-md"
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 group-hover:bg-emerald-50 border border-slate-200 group-hover:border-emerald-200 flex items-center justify-center text-slate-600 group-hover:text-emerald-700 transition-colors shrink-0">
                    <Cpu className="w-4 h-4" />
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                      {svc.totalDocs} docs
                    </span>
                    {svc.totalMermaid > 0 && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                        ⚡ {svc.totalMermaid}
                      </span>
                    )}
                  </div>
                </div>

                {/* Service Name & Description */}
                <h3 className="text-sm font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
                  {svc.name}
                </h3>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                  {svc.description || `Thư mục tài liệu của ${svc.rawName}`}
                </p>
              </div>

              {/* Service Meta Footer */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <div className="text-[11px] text-slate-400">
                  {svc.categories.length} danh mục
                  {svc.dependencies?.length > 0 && ` • ${svc.dependencies.length} liên kết`}
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-500 group-hover:text-slate-900 transition-colors">
                  <span className="text-[11px] font-medium">Khám phá</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Split Section: Featured Workflows & Popular Tags */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Featured / Core Workflows (2 cols on lg) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Workflow className="w-4 h-4 text-amber-600" />
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Luồng nghiệp vụ & Sơ đồ tiêu biểu
              </h2>
            </div>
            <button
              onClick={() => onSelectTab('explorer')}
              className="text-xs text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-1"
            >
              <span>Xem tất cả</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {featuredDocs.map((item, idx) => (
              <WikiDocCard
                key={idx}
                doc={item.doc}
                serviceName={item.service.name}
                onClick={() => onOpenDoc(item.service.id, item.doc.path)}
              />
            ))}
          </div>
        </div>

        {/* Popular Tags & Topology Shortcut (1 col on lg) */}
        <div className="space-y-6">
          {/* Quick Graph Banner */}
          <div
            onClick={() => onSelectTab('graph')}
            className="p-5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200/90 hover:border-slate-350 cursor-pointer group transition-all shadow-xs hover:shadow-md"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center">
                <Layers className="w-4 h-4" />
              </div>
              <span className="text-sm font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
                Topology Graph
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Trực quan hoá tương tác và sơ đồ phụ thuộc đa dịch vụ với đồ hoạ động có thể zoom/pan.
            </p>
            <div className="mt-3 flex items-center gap-1 text-xs text-emerald-700 font-semibold">
              <span>Mở đồ thị toàn cảnh</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Tag Cloud */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200/80 space-y-3 shadow-xs">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
              <Tag className="w-3.5 h-3.5 text-slate-500" />
              <span>Chủ đề / Tags phổ biến</span>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {popularTags.map(([tag, count]) => (
                <button
                  key={tag}
                  onClick={() => {
                    if (onSelectTag) onSelectTag(tag);
                    onSelectTab('explorer');
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-mono text-slate-700 hover:text-slate-900 transition flex items-center gap-1.5"
                >
                  <span>#{tag}</span>
                  <span className="text-[10px] text-slate-500 bg-slate-200/70 px-1 rounded">
                    {count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
