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
  const [onlyMermaid, setOnlyMermaid] = useState<boolean>(false);
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

    // If 'all' services selected vs specific service
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

          // Mermaid filter
          if (onlyMermaid && !doc.hasMermaid) {
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
    onlyMermaid,
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

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* 1. Horizontal Service Pill Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            <Server className="w-3.5 h-3.5 text-blue-600" />
            <span>Chọn dịch vụ (Services)</span>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {services.length} services
          </span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
          <button
            onClick={() => handleSelectService('all')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition border ${
              selectedServiceId === 'all'
                ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
            }`}
          >
            <span>🌐 Toàn bộ dịch vụ</span>
          </button>

          {services.map((svc) => {
            const isSelected = selectedServiceId === svc.id;
            return (
              <button
                key={svc.id}
                onClick={() => handleSelectService(svc.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition border ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs font-semibold'
                    : 'bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border-slate-200'
                }`}
              >
                <span>{svc.name.split('(')[0]}</span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                    isSelected ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {svc.totalDocs}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Filter Bar: Categories, Types, Diagram Toggle */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-3.5">
        {/* Category Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
          <span className="text-xs text-slate-500 font-medium mr-1 flex items-center gap-1 shrink-0">
            <Folder className="w-3.5 h-3.5 text-blue-600" />
            <span>Danh mục:</span>
          </span>

          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition border ${
              selectedCategory === 'all'
                ? 'bg-blue-50 text-blue-700 border-blue-200 font-semibold'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
            }`}
          >
            Tất cả danh mục
          </button>

          {availableCategories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition border ${
                selectedCategory === cat.id
                  ? 'bg-blue-50 text-blue-700 border-blue-200 font-semibold'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              <span>{cat.name}</span>
              <span className="text-[10px] font-mono text-slate-500 bg-white border border-slate-200/60 px-1 rounded">
                {cat.count}
              </span>
            </button>
          ))}
        </div>

        {/* Second Row: Type filter, Diagram toggle, Filter Search */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            {/* Type selector */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200 text-xs">
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

            {/* Mermaid only toggle */}
            <button
              onClick={() => setOnlyMermaid(!onlyMermaid)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium transition border ${
                onlyMermaid
                  ? 'bg-amber-50 text-amber-700 border-amber-200 font-semibold'
                  : 'bg-slate-50 text-slate-600 hover:text-slate-900 border-slate-200'
              }`}
            >
              <Sparkles className="w-3 h-3 text-amber-600" />
              <span>Có biểu đồ Mermaid</span>
            </button>

            {/* Active Tag chip if present */}
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

          {/* Quick local search inside Explorer */}
          <div className="relative min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Lọc trong danh sách này..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-7 py-1 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-slate-400 transition"
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

      {/* 3. Document Count & Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <div>
            Hiển thị <span className="font-semibold text-slate-800">{filteredDocs.length}</span> tài liệu
            {selectedServiceId !== 'all' && (
              <span> thuộc <strong className="text-blue-600 font-semibold">{currentService?.name}</strong></span>
            )}
          </div>
        </div>

        {filteredDocs.length === 0 ? (
          <div className="p-12 rounded-2xl bg-white border border-slate-200 text-center space-y-3 shadow-xs">
            <FileText className="w-10 h-10 text-slate-300 mx-auto" />
            <div className="text-sm font-semibold text-slate-800">
              Không tìm thấy tài liệu nào khớp với điều kiện lọc
            </div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Hãy thử chọn dịch vụ khác hoặc xóa bớt các điều kiện lọc loại, danh mục hoặc từ khóa.
            </p>
            <button
              onClick={() => {
                setSelectedCategory('all');
                setSelectedType('all');
                setOnlyMermaid(false);
                setLocalSearch('');
                if (onClearTagFilter) onClearTagFilter();
              }}
              className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-700 transition"
            >
              Đặt lại tất cả bộ lọc
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDocs.map((item, idx) => (
              <WikiDocCard
                key={`${item.service.id}-${item.doc.id || idx}`}
                doc={item.doc}
                serviceName={item.service.name}
                categoryName={item.category.name}
                onClick={() => onOpenDoc(item.service.id, item.doc.path)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
