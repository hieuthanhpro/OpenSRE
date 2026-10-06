'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Compass,
  Layers,
  LayoutDashboard,
  Server,
  RefreshCw,
  Search,
  ArrowRight,
  Sparkles,
  BookOpen,
  X,
  Bot,
} from 'lucide-react';
import { ServiceInfo, OpenWikiTab, DocMetadata, CategoryInfo } from './types';
import { getTypeBadgeClass } from './WikiDocCard';
import { useInvestigationLauncher } from '@/components/shell/InvestigationLauncherContext';

interface WikiPageHeaderProps {
  services: ServiceInfo[];
  selectedServiceId: string;
  onSelectService: (serviceId: string) => void;
  activeTab: OpenWikiTab;
  onSelectTab: (tab: OpenWikiTab) => void;
  isRescanning: boolean;
  onRescan: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenDoc: (serviceId: string, docPath: string) => void;
}

export function WikiPageHeader({
  services,
  selectedServiceId,
  onSelectService,
  activeTab,
  onSelectTab,
  isRescanning,
  onRescan,
  searchQuery,
  onSearchChange,
  onOpenDoc,
}: WikiPageHeaderProps) {
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const { open: openAgentDrawer } = useInvestigationLauncher();

  const handleAskSREAgent = () => {
    openAgentDrawer();
  };

  // Close search dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute search matches across all services
    const searchResults = useMemo(() => {
      if (!searchQuery.trim()) return [];
      const q = searchQuery.toLowerCase().trim();
      const results: Array<{ service: ServiceInfo; category: CategoryInfo; doc: DocMetadata }> = [];

      services.forEach((s) => {
        s.categories.forEach((c) => {
          c.docs.forEach((d) => {
            if (
              d.title.toLowerCase().includes(q) ||
              d.description.toLowerCase().includes(q) ||
              d.tags.some((t) => t.toLowerCase().includes(q)) ||
              d.type.toLowerCase().includes(q) ||
              d.path.toLowerCase().includes(q)
            ) {
              results.push({ service: s, category: c, doc: d });
            }
          });
        });
      });

      return results;
    }, [services, searchQuery]);

    return (
      <header className="border-b border-slate-200/80 bg-white/95 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-6 py-3.5 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-col gap-3">
          {/* Top row: Brand + Tabs + Actions */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Brand & Title */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200/60 flex items-center justify-center shrink-0 shadow-xs">
                <Compass className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900">OpenWiki Visualizer</h1>
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600 border border-slate-200 font-mono">
                    SRE Hub
                  </span>
                </div>
                <p className="text-xs text-slate-500 hidden sm:block">
                  Kiến trúc, mô hình dữ liệu và sơ đồ luồng nghiệp vụ dịch vụ
                </p>
              </div>
            </div>

            {/* Tab Switcher */}
            <div className="flex items-center bg-slate-100/90 p-1 rounded-xl border border-slate-200/70">
              <button
                onClick={() => onSelectTab('dashboard')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  activeTab === 'dashboard'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>Tổng quan</span>
              </button>
              <button
                onClick={() => onSelectTab('explorer')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  activeTab === 'explorer'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Khám phá</span>
              </button>
              <button
                onClick={() => onSelectTab('graph')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  activeTab === 'graph'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Sơ đồ liên kết</span>
              </button>
            </div>

            {/* Right Tools: Service Picker + Rescan */}
            <div className="flex items-center gap-2.5">
              {/* Service selector */}
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 shadow-xs">
                <Server className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <select
                  value={selectedServiceId}
                  onChange={(e) => onSelectService(e.target.value)}
                  className="bg-transparent text-xs text-slate-700 font-semibold focus:outline-none cursor-pointer max-w-[160px] sm:max-w-[200px] truncate"
                >
                  <option value="all">
                    🌐 Toàn bộ dịch vụ ({services.length})
                  </option>
                  {services.map((svc) => (
                    <option key={svc.id} value={svc.id}>
                      {svc.name.split('(')[0]} ({svc.totalDocs} docs)
                    </option>
                  ))}
                </select>
              </div>

              {/* Rescan Button */}
              <button
                onClick={onRescan}
                disabled={isRescanning}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 rounded-xl border border-slate-200 text-xs font-medium transition shadow-xs disabled:opacity-50"
                title="Quét lại thư mục open-wiki để nhận diện tài liệu mới"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRescanning ? 'animate-spin text-emerald-600' : 'text-slate-500'}`} />
                <span className="hidden sm:inline">{isRescanning ? 'Đang quét...' : 'Làm mới'}</span>
              </button>

              {/* Ask SRE Agent Button */}
              <button
                onClick={handleAskSREAgent}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition shadow-xs"
                title="Mở SRE Agent để hỏi đáp về kiến trúc OpenWiki"
              >
                <Bot className="w-3.5 h-3.5 text-slate-300" />
                <span className="hidden sm:inline">Hỏi SRE Agent</span>
              </button>
            </div>
          </div>

          {/* Search bar row */}
          <div ref={searchContainerRef} className="relative w-full">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onFocus={() => setIsSearchFocused(true)}
                onChange={(e) => {
                  onSearchChange(e.target.value);
                  setIsSearchFocused(true);
                }}
                placeholder="Tìm kiếm tài liệu, luồng nghiệp vụ, API, tags trong toàn bộ wiki..."
                className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-10 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 shadow-xs"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    onSearchChange('');
                    setIsSearchFocused(false);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Quick Search Overlay Dropdown */}
            {isSearchFocused && searchQuery.trim().length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 p-3 rounded-xl bg-white border border-slate-200 shadow-xl z-50 max-h-80 overflow-y-auto">
                <div className="text-[11px] font-semibold text-slate-500 mb-2 px-1 flex items-center justify-between">
                  <span>Kết quả tìm kiếm ({searchResults.length} bài viết)</span>
                  <span className="text-[10px] text-slate-400">Bấm để mở xem chi tiết</span>
                </div>
                {searchResults.length === 0 ? (
                  <div className="text-xs text-slate-500 py-4 text-center">
                    Không tìm thấy tài liệu nào khớp với "{searchQuery}"
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {searchResults.slice(0, 15).map((item, idx) => (
                      <div
                        key={idx}
                        onClick={() => {
                          onOpenDoc(item.service.id, item.doc.path);
                          setIsSearchFocused(false);
                        }}
                        className="p-2.5 rounded-lg bg-slate-50/70 border border-slate-200 hover:border-slate-350 hover:bg-slate-100/80 transition cursor-pointer flex items-center justify-between group"
                      >
                        <div className="min-w-0 pr-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-slate-900 group-hover:text-emerald-700 truncate">
                              {item.doc.title}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 font-mono">
                              {item.service.name.split('(')[0]}
                            </span>
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded font-semibold border ${getTypeBadgeClass(
                                item.doc.type
                              )}`}
                            >
                              {item.doc.type}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                            {item.doc.description || item.doc.path}
                          </div>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-1 transition shrink-0" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>
    );
  }
