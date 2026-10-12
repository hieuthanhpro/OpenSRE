'use client';

import React, { useState, useMemo } from 'react';
import {
  Server,
  Folder,
  Filter,
  Sparkles,
  Search,
  Tag,
  X,
  Layers,
  FileText,
  SlidersHorizontal,
  Check,
  Globe,
  CreditCard,
  ShieldCheck,
  KeyRound,
  Cpu,
  PlugZap,
  Compass,
  ArrowRight,
  Boxes,
} from 'lucide-react';
import { ServiceInfo, DocMetadata, CategoryInfo } from './types';
import { WikiDocCard } from './WikiDocCard';

interface WikiExplorerProps {
  services: ServiceInfo[];
  selectedServiceId: string;
  onSelectService: (id: string) => void;
  selectedTagFilter?: string | null;
  onClearTagFilter?: () => void;
  onOpenDoc: (serviceId: string, docPath: string) => void;
}

function getServiceDisplayInfo(svc: ServiceInfo): { shortName: string; icon: any } {
  const raw = svc.rawName.toLowerCase();
  if (raw === 'openwiki') return { shortName: 'Toàn cảnh Hệ thống', icon: Compass };
  if (raw === 'openwiki-msp') return { shortName: 'MSP (Merchant Core)', icon: CreditCard };
  if (raw === 'openwiki-wsp') return { shortName: 'WSP (Web Gateway)', icon: Globe };
  if (raw === 'openwiki-onesm') return { shortName: 'OneSM (Security/Crypto)', icon: ShieldCheck };
  if (raw === 'openwiki-tvsp') return { shortName: 'TVSP (Token Vault)', icon: KeyRound };
  if (raw === 'openwiki-scsp') return { shortName: 'SCSP (Smart Card)', icon: Cpu };
  if (raw.includes('onecomm-apple')) return { shortName: 'PSP OneComm Apple', icon: PlugZap };
  if (raw.includes('onecomm')) return { shortName: 'PSP OneComm Gateway', icon: PlugZap };
  if (raw.includes('kbank')) return { shortName: 'PSP KBank BNPL', icon: PlugZap };
  if (raw.includes('ewallet')) return { shortName: 'PSP E-Wallet', icon: PlugZap };
  return { shortName: svc.name.split('(')[0].trim(), icon: Server };
}

export function WikiExplorer({
  services,
  selectedServiceId,
  onSelectService,
  selectedTagFilter,
  onClearTagFilter,
  onOpenDoc,
}: WikiExplorerProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [localSearch, setLocalSearch] = useState<string>('');

  // Current service
  const currentService = useMemo(() => {
    return services.find((s) => s.id === selectedServiceId) || services[0];
  }, [services, selectedServiceId]);

  // Reset category filter when service changes
  const handleSelectService = (id: string) => {
    onSelectService(id);
    setSelectedCategory('all');
  };

  // Filtered documents
  const filteredDocs = useMemo(() => {
    if (!currentService) return [];

    let docs: Array<{ service: ServiceInfo; category: CategoryInfo; doc: DocMetadata }> = [];

    const targetServices =
      selectedServiceId === 'all'
        ? services
        : currentService
        ? [currentService]
        : [];

    targetServices.forEach((svc) => {
      svc.categories.forEach((cat) => {
        if (selectedCategory !== 'all' && cat.id !== selectedCategory) {
          return;
        }

        cat.docs.forEach((doc) => {
          // Type filter
          if (selectedType !== 'all' && doc.type?.toLowerCase() !== selectedType.toLowerCase()) {
            return;
          }

          // Tag filter
          if (
            selectedTagFilter &&
            !doc.tags?.some((t) => t.toLowerCase() === selectedTagFilter.toLowerCase())
          ) {
            return;
          }

          // Local text search
          if (localSearch.trim()) {
            const q = localSearch.toLowerCase().trim();
            const matchTitle = doc.title.toLowerCase().includes(q);
            const matchDesc = doc.description?.toLowerCase().includes(q);
            const matchTag = doc.tags?.some((t) => t.toLowerCase().includes(q));
            const matchPath = doc.path.toLowerCase().includes(q);

            if (!matchTitle && !matchDesc && !matchTag && !matchPath) {
              return;
            }
          }

          docs.push({ service: svc, category: cat, doc });
        });
      });
    });

    return docs;
  }, [
    services,
    currentService,
    selectedServiceId,
    selectedCategory,
    selectedType,
    selectedTagFilter,
    localSearch,
  ]);

  // Categories available for current service
  const availableCategories = useMemo(() => {
    if (selectedServiceId === 'all') {
      const catMap = new Map<string, { id: string; name: string; count: number }>();
      services.forEach((s) => {
        s.categories.forEach((c) => {
          const existing = catMap.get(c.id);
          if (existing) {
            existing.count += c.docCount;
          } else {
            catMap.set(c.id, { id: c.id, name: c.name, count: c.docCount });
          }
        });
      });
      return Array.from(catMap.values());
    }

    return (
      currentService?.categories.map((c) => ({
        id: c.id,
        name: c.name,
        count: c.docCount,
      })) || []
    );
  }, [services, currentService, selectedServiceId]);

  const totalServiceDocs = useMemo(() => {
    return services.reduce((acc, s) => acc + s.totalDocs, 0);
  }, [services]);

  return (
    <div className="flex flex-col md:flex-row gap-6 animate-fadeIn items-start">
      {/* 1. Left Sidebar: Clean Vertical Service List (Master) */}
      <aside className="w-full md:w-64 lg:w-72 shrink-0 bg-white rounded-2xl border border-slate-200/90 shadow-xs p-3 space-y-2">
        <div className="px-2 py-1.5 flex items-center justify-between border-b border-slate-100 pb-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
            <Server className="w-3.5 h-3.5 text-blue-600" />
            <span>Dịch vụ ({services.length})</span>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            {totalServiceDocs} docs
          </span>
        </div>

        {/* All Services Option */}
        <button
          onClick={() => handleSelectService('all')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition text-left ${
            selectedServiceId === 'all'
              ? 'bg-slate-900 text-white font-semibold shadow-xs'
              : 'hover:bg-slate-50 text-slate-700'
          }`}
        >
          <div className="flex items-center gap-2.5 truncate">
            <Boxes className="w-4 h-4 shrink-0 text-blue-400" />
            <span className="truncate">Toàn bộ dịch vụ</span>
          </div>
          <span
            className={`text-[10px] font-mono px-1.5 py-0.2 rounded shrink-0 ml-1.5 ${
              selectedServiceId === 'all'
                ? 'bg-slate-800 text-slate-200'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            {totalServiceDocs}
          </span>
        </button>

        {/* Individual Service Items */}
        <div className="space-y-1 max-h-[620px] overflow-y-auto no-scrollbar pt-1">
          {services.map((svc) => {
            const isSelected = selectedServiceId === svc.id;
            const { shortName, icon: Icon } = getServiceDisplayInfo(svc);

            return (
              <button
                key={svc.id}
                onClick={() => handleSelectService(svc.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition text-left group ${
                  isSelected
                    ? 'bg-blue-50 text-blue-900 font-semibold border border-blue-200/80 shadow-2xs'
                    : 'hover:bg-slate-50 text-slate-700 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      isSelected ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'
                    }`}
                  />
                  <span className="truncate">{shortName}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-1.5">
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                      isSelected
                        ? 'bg-blue-200/70 text-blue-900 font-bold'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {svc.totalDocs}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* 2. Right Content Area: Filter & Documents Grid (Detail) */}
      <main className="flex-1 min-w-0 space-y-5 w-full">
        {/* Service Hero Info Banner (when specific service selected) */}
        {selectedServiceId !== 'all' && currentService && (
          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 uppercase">
                  {currentService.rawName}
                </span>
              </div>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              {currentService.name}
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed max-w-3xl">
              {currentService.description}
            </p>
          </div>
        )}

        {/* Filters & Category Chips Card */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-3.5">
          {/* Category Chips (wrap naturally, no horizontal scrollbar!) */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-500 font-medium mr-1 flex items-center gap-1 shrink-0">
              <Folder className="w-3.5 h-3.5 text-blue-600" />
              <span>Danh mục:</span>
            </span>

            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition border ${
                selectedCategory === 'all'
                  ? 'bg-slate-900 text-white border-slate-900 font-semibold shadow-2xs'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              Tất cả danh mục ({filteredDocs.length})
            </button>

            {availableCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition border ${
                  selectedCategory === cat.id
                    ? 'bg-blue-50 text-blue-800 border-blue-200 font-semibold shadow-2xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                }`}
              >
                <span>{cat.name.split('(')[0]}</span>
                <span className="text-[10px] font-mono text-slate-500 bg-white border border-slate-200/60 px-1 rounded">
                  {cat.count}
                </span>
              </button>
            ))}
          </div>

          {/* Filter Controls Row */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-2">
              {/* Type selector */}
              <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs">
                <SlidersHorizontal className="w-3 h-3 text-slate-500" />
                <span className="text-slate-500">Loại:</span>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="bg-transparent text-slate-800 font-medium focus:outline-none cursor-pointer text-xs"
                >
                  <option value="all">Tất cả loại</option>
                  <option value="workflow">Workflow (Luồng)</option>
                  <option value="architecture">Architecture (Kiến trúc)</option>
                  <option value="guide">Guide (Hướng dẫn)</option>
                  <option value="concept">Concept (Khái niệm)</option>
                  <option value="integration">Integration (Tích hợp)</option>
                </select>
              </div>

              {/* Active Tag filter */}
              {selectedTagFilter && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 text-xs">
                  <Tag className="w-3 h-3 text-blue-600" />
                  <span>#{selectedTagFilter}</span>
                  {onClearTagFilter && (
                    <button
                      onClick={onClearTagFilter}
                      className="hover:text-blue-900 transition ml-0.5"
                      title="Xóa bộ lọc tag"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Quick search input */}
            <div className="relative min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                placeholder="Lọc trong dịch vụ này..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-7 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-slate-400 transition"
              />
              {localSearch && (
                <button
                  onClick={() => setLocalSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Document Cards Grid */}
        <div className="space-y-4">
          {filteredDocs.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 space-y-2">
              <FileText className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="text-sm font-bold text-slate-700">Không tìm thấy tài liệu phù hợp</div>
              <div className="text-xs text-slate-500">
                Thử đổi danh mục, bỏ bộ lọc hoặc xoá từ khoá tìm kiếm.
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDocs.map((item, idx) => (
                <WikiDocCard
                  key={`${item.service.id}-${item.doc.id}-${idx}`}
                  doc={item.doc}
                  serviceName={item.service.name.split('(')[0]}
                  onClick={() => onOpenDoc(item.service.id, item.doc.path)}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
