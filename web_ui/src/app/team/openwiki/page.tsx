'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { WikiTopologyGraph } from '@/components/openwiki/WikiTopologyGraph';
import { WikiPageHeader } from '@/components/openwiki/WikiPageHeader';
import { WikiDashboard } from '@/components/openwiki/WikiDashboard';
import { WikiExplorer } from '@/components/openwiki/WikiExplorer';
import { WikiDocSlideOver } from '@/components/openwiki/WikiDocSlideOver';
import { ServiceInfo, DocDetail, OpenWikiTab } from '@/components/openwiki/types';

export default function OpenWikiPage() {
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string>('openwiki-msp');
  const [activeTab, setActiveTab] = useState<OpenWikiTab>('dashboard');

  // Loading & error states
  const [isLoadingList, setIsLoadingList] = useState<boolean>(true);
  const [isRescanning, setIsRescanning] = useState<boolean>(false);
  const [listError, setListError] = useState<string | null>(null);

  // Global search & tag filter
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null);

  // Slide-over state for reading documents
  const [slideOverState, setSlideOverState] = useState<{
    isOpen: boolean;
    serviceId: string;
    docPath: string;
  }>({
    isOpen: false,
    serviceId: '',
    docPath: '',
  });

  const [activeDocDetail, setActiveDocDetail] = useState<DocDetail | null>(null);
  const [isLoadingDoc, setIsLoadingDoc] = useState<boolean>(false);
  const [docError, setDocError] = useState<string | null>(null);

  // Fetch Services & Docs list
  const loadServices = useCallback(async (isRescan = false) => {
    if (isRescan) setIsRescanning(true);
    else setIsLoadingList(true);
    setListError(null);

    try {
      const res = await fetch('/api/team/openwiki');
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Không thể quét danh sách OpenWiki');
      }

      setServices(data.services || []);

      // If no service selected or previously selected service deleted, select first available
      if (data.services && data.services.length > 0) {
        const exists = data.services.some((s: ServiceInfo) => s.id === selectedServiceId);
        if (!exists && selectedServiceId !== 'all') {
          setSelectedServiceId(data.services[0].id);
        }
      }
    } catch (err: any) {
      console.error('Failed to load openwiki list:', err);
      setListError(err.message || 'Lỗi khi tải dữ liệu open-wiki');
    } finally {
      setIsLoadingList(false);
      setIsRescanning(false);
    }
  }, [selectedServiceId]);

  useEffect(() => {
    loadServices();
  }, []);

  // Fetch document details when slideOver is open
  const loadDocDetail = useCallback(async (serviceId: string, docPath: string) => {
    if (!serviceId || !docPath) return;

    setIsLoadingDoc(true);
    setDocError(null);

    try {
      const res = await fetch(
        `/api/team/openwiki/doc?service=${encodeURIComponent(serviceId)}&path=${encodeURIComponent(
          docPath
        )}`
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Không thể đọc bài viết');
      }

      setActiveDocDetail(data);
    } catch (err: any) {
      console.error('Failed to fetch doc detail:', err);
      setDocError(err.message || 'Lỗi khi mở bài viết');
    } finally {
      setIsLoadingDoc(false);
    }
  }, []);

  // Open a document in SlideOver
  const handleOpenDoc = useCallback(
    (serviceId: string, docPath: string) => {
      // If serviceId is 'all', try to find which service owns this docPath
      let targetServiceId = serviceId;
      if (targetServiceId === 'all') {
        const owner = services.find((s) =>
          s.categories.some((c) => c.docs.some((d) => d.path === docPath))
        );
        if (owner) targetServiceId = owner.id;
      }

      setSlideOverState({
        isOpen: true,
        serviceId: targetServiceId,
        docPath,
      });

      loadDocDetail(targetServiceId, docPath);
    },
    [services, loadDocDetail]
  );

  // Close SlideOver
  const handleCloseSlideOver = useCallback(() => {
    setSlideOverState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  // Handle internal markdown link navigation
  const handleNavigateDoc = useCallback(
    (targetPath: string) => {
      handleOpenDoc(slideOverState.serviceId, targetPath);
    },
    [handleOpenDoc, slideOverState.serviceId]
  );

  // Current service name for slideover header
  const currentSlideOverServiceName = useMemo(() => {
    const svc = services.find((s) => s.id === slideOverState.serviceId);
    return svc ? svc.name : slideOverState.serviceId;
  }, [services, slideOverState.serviceId]);

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-900 flex flex-col font-sans selection:bg-emerald-100 selection:text-emerald-800">
      {/* 1. Sticky Header Bar */}
      <WikiPageHeader
        services={services}
        selectedServiceId={selectedServiceId}
        onSelectService={(id) => setSelectedServiceId(id)}
        activeTab={activeTab}
        onSelectTab={(tab) => setActiveTab(tab)}
        isRescanning={isRescanning}
        onRescan={() => loadServices(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenDoc={handleOpenDoc}
      />

      {/* 2. Main Content View Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 flex flex-col gap-6">
        {/* Loading Spinner */}
        {isLoadingList && (
          <div className="flex flex-col items-center justify-center p-20 text-slate-500 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
            <span className="text-sm font-medium">Đang quét thư mục open-wiki và cấu trúc dịch vụ...</span>
          </div>
        )}

        {/* Error Notification */}
        {listError && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-3 text-rose-800 text-sm">
            <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
            <div>
              <div className="font-semibold">Lỗi quét thư mục:</div>
              <div>{listError}</div>
            </div>
          </div>
        )}

        {!isLoadingList && !listError && (
          <>
            {/* TAB 1: DASHBOARD OVERVIEW */}
            {activeTab === 'dashboard' && (
              <WikiDashboard
                services={services}
                onSelectService={(sId) => setSelectedServiceId(sId)}
                onSelectTab={setActiveTab}
                onOpenDoc={handleOpenDoc}
                onSelectTag={(tag) => setSelectedTagFilter(tag)}
              />
            )}

            {/* TAB 2: EXPLORER WITH SERVICE TABS & CATEGORY CHIPS */}
            {activeTab === 'explorer' && (
              <WikiExplorer
                services={services}
                selectedServiceId={selectedServiceId}
                onSelectService={(sId) => setSelectedServiceId(sId)}
                selectedTagFilter={selectedTagFilter}
                onClearTagFilter={() => setSelectedTagFilter(null)}
                onOpenDoc={handleOpenDoc}
              />
            )}

            {/* TAB 3: TOPOLOGY GRAPH CANVAS */}
            {activeTab === 'graph' && (
              <div className="space-y-4">
                <WikiTopologyGraph
                  services={services}
                  selectedServiceId={selectedServiceId}
                  onSelectService={(sId) => setSelectedServiceId(sId)}
                  onSelectDoc={handleOpenDoc}
                />
              </div>
            )}
          </>
        )}
      </main>

      {/* 3. Slide-Over Document Drawer */}
      <WikiDocSlideOver
        isOpen={slideOverState.isOpen}
        onClose={handleCloseSlideOver}
        docDetail={activeDocDetail}
        isLoading={isLoadingDoc}
        error={docError}
        serviceName={currentSlideOverServiceName}
        onNavigateDoc={handleNavigateDoc}
      />
    </div>
  );
}
