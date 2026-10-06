'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Server,
  Layers,
  FileText,
  Workflow,
  Sparkles,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Database,
  Shield,
  CreditCard,
  Building,
  ArrowRight,
  Code2,
  Tag,
  CheckCircle,
  Eye,
  LayoutGrid,
  Move,
  GripHorizontal,
} from 'lucide-react';
import { DocMetadata, CategoryInfo, ServiceInfo } from './types';

interface WikiTopologyGraphProps {
  services: ServiceInfo[];
  selectedServiceId: string;
  onSelectService: (serviceId: string) => void;
  onSelectDoc: (serviceId: string, docPath: string) => void;
}

export function WikiTopologyGraph({
  services,
  selectedServiceId,
  onSelectService,
  onSelectDoc,
}: WikiTopologyGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<number>(0.9);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 50, y: 40 });

  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [activeDraggingNodeId, setActiveDraggingNodeId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState<boolean>(false);

  // Refs for tracking active drag states without React re-render lag
  const draggingNodeRef = useRef<{
    nodeId: string;
    startMouseX: number;
    startMouseY: number;
    initialNodeX: number;
    initialNodeY: number;
    hasMoved: boolean;
  } | null>(null);

  const panStartRef = useRef<{
    startMouseX: number;
    startMouseY: number;
    initialPanX: number;
    initialPanY: number;
  } | null>(null);

  const [previewDoc, setPreviewDoc] = useState<{ serviceId: string; doc: DocMetadata } | null>(null);

  const currentService = useMemo(() => {
    return services.find((s) => s.id === selectedServiceId) || services[0];
  }, [services, selectedServiceId]);

  // Layout calculation
  const calculateDefaultPositions = useCallback(() => {
    const pos: Record<string, { x: number; y: number }> = {};

    if (selectedServiceId === 'all') {
      // System-wide overview
      const centerX = 520;
      const centerY = 320;
      const radius = 270;

      services.forEach((svc, idx) => {
        const angle = (idx / Math.max(1, services.length)) * 2 * Math.PI - Math.PI / 2;
        pos[svc.id] = {
          x: Math.round(centerX + radius * Math.cos(angle) - 130),
          y: Math.round(centerY + radius * Math.sin(angle) - 60),
        };
      });

      // External dependency nodes
      pos['ext-napas'] = { x: 80, y: 100 };
      pos['ext-banks'] = { x: 840, y: 100 };
      pos['ext-onecomm'] = { x: 80, y: 520 };
      pos['ext-db'] = { x: 840, y: 520 };
    } else if (currentService) {
      // Single Service deep dive
      const centerNodeX = 540;
      const centerNodeY = 340;
      pos[currentService.id] = { x: centerNodeX, y: centerNodeY };

      const categories = currentService.categories || [];
      const catCount = categories.length;
      const catRadius = 320;

      categories.forEach((cat, catIdx) => {
        const angle = (catIdx / Math.max(1, catCount)) * 2 * Math.PI - Math.PI / 2;
        const catX = Math.round(centerNodeX + catRadius * Math.cos(angle));
        const catY = Math.round(centerNodeY + catRadius * Math.sin(angle));
        pos[`cat-${cat.id}`] = { x: catX, y: catY };

        // Spread docs around category outward
        const docs = cat.docs || [];
        docs.slice(0, 5).forEach((doc, docIdx) => {
          const docDist = 175;
          const spreadAngle = angle - 0.45 + (docIdx / Math.max(1, docs.length - 1 || 1)) * 0.9;
          pos[`doc-${doc.id}`] = {
            x: Math.round(catX + docDist * Math.cos(spreadAngle)),
            y: Math.round(catY + docDist * Math.sin(spreadAngle)),
          };
        });
      });
    }

    setNodePositions(pos);
  }, [services, selectedServiceId, currentService]);

  useEffect(() => {
    calculateDefaultPositions();
  }, [calculateDefaultPositions]);

  // Window-level MouseMove and MouseUp to guarantee rock-solid drag & drop tracking
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      // 1. Handle Node Dragging
      if (draggingNodeRef.current) {
        const deltaX = (e.clientX - draggingNodeRef.current.startMouseX) / zoom;
        const deltaY = (e.clientY - draggingNodeRef.current.startMouseY) / zoom;

        if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
          draggingNodeRef.current.hasMoved = true;
        }

        const nodeId = draggingNodeRef.current.nodeId;
        const newX = Math.round(draggingNodeRef.current.initialNodeX + deltaX);
        const newY = Math.round(draggingNodeRef.current.initialNodeY + deltaY);

        setNodePositions((prev) => ({
          ...prev,
          [nodeId]: { x: newX, y: newY },
        }));
        return;
      }

      // 2. Handle Canvas Panning
      if (panStartRef.current) {
        const deltaX = e.clientX - panStartRef.current.startMouseX;
        const deltaY = e.clientY - panStartRef.current.startMouseY;

        setPan({
          x: panStartRef.current.initialPanX + deltaX,
          y: panStartRef.current.initialPanY + deltaY,
        });
      }
    };

    const handleGlobalMouseUp = () => {
      if (draggingNodeRef.current) {
        draggingNodeRef.current = null;
        setActiveDraggingNodeId(null);
      }
      if (panStartRef.current) {
        panStartRef.current = null;
        setIsPanning(false);
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [zoom]);

  // Start Node Dragging
  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    if (e.button !== 0) return; // Only left click

    const currentPos = nodePositions[nodeId] || { x: 0, y: 0 };
    draggingNodeRef.current = {
      nodeId,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      initialNodeX: currentPos.x,
      initialNodeY: currentPos.y,
      hasMoved: false,
    };
    setActiveDraggingNodeId(nodeId);
  };

  // Start Canvas Panning
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    // Don't pan if clicking an interactive node element
    if ((e.target as HTMLElement).closest('.node-draggable')) return;

    panStartRef.current = {
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      initialPanX: pan.x,
      initialPanY: pan.y,
    };
    setIsPanning(true);
  };

  // Mouse Wheel Zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    setZoom((prev) => Math.max(0.35, Math.min(2.5, prev * zoomFactor)));
  };

  const getCategoryColor = (catId: string) => {
    switch (catId?.toLowerCase()) {
      case 'workflows':
        return 'bg-amber-50 border-amber-200 text-amber-800';
      case 'architecture':
        return 'bg-sky-50 border-sky-200 text-sky-800';
      case 'integrations':
        return 'bg-purple-50 border-purple-200 text-purple-800';
      case 'concepts':
        return 'bg-emerald-50 border-emerald-200 text-emerald-800';
      case 'operations':
        return 'bg-rose-50 border-rose-200 text-rose-800';
      default:
        return 'bg-slate-50 border-slate-200 text-slate-700';
    }
  };

  return (
    <div
      style={{
        backgroundImage: 'radial-gradient(#cbd5e1 1.2px, transparent 1.2px)',
        backgroundSize: '18px 18px',
      }}
      className={`relative w-full h-[680px] bg-slate-100/60 border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs flex flex-col select-none ${
        isPanning ? 'cursor-grabbing' : 'cursor-grab'
      }`}
      onMouseDown={handleCanvasMouseDown}
      onWheel={handleWheel}
    >
      {/* Top Floating Control Bar */}
      <div className="absolute top-4 left-4 z-30 flex flex-wrap items-center gap-2 bg-white/95 backdrop-blur-md px-3 py-2 rounded-xl border border-slate-200/90 shadow-md">
        <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5 mr-2">
          <Layers className="w-4 h-4 text-blue-600" />
          <span>Topology View:</span>
        </span>

        {/* View Mode Toggle */}
        <button
          onClick={() => onSelectService('all')}
          className={`px-2.5 py-1 text-xs rounded-lg transition font-medium ${
            selectedServiceId === 'all'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          Toàn bộ Hệ thống ({services.length} Services)
        </button>

        {services.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelectService(s.id)}
            className={`px-2.5 py-1 text-xs rounded-lg transition font-medium ${
              selectedServiceId === s.id
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            {s.name.split('(')[0].trim()}
          </button>
        ))}

        <div className="h-4 w-px bg-slate-200 mx-1" />

        {/* Controls */}
        <button
          onClick={() => setZoom((z) => Math.min(z + 0.15, 2.2))}
          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
          title="Phóng to"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(z - 0.15, 0.4))}
          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
          title="Thu nhỏ"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            setZoom(0.9);
            setPan({ x: 50, y: 40 });
            calculateDefaultPositions();
          }}
          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
          title="Sắp xếp tự động lại vị trí"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Canvas Viewport */}
      <div ref={containerRef} className="flex-1 w-full h-full relative overflow-hidden">
        {/* Transform Layer (Pan and Zoom) */}
        <div
          className="absolute inset-0 origin-top-left"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          {/* SVG Connecting Lines Layer */}
          <svg className="absolute inset-0 w-[4000px] h-[4000px] pointer-events-none">
            <defs>
              <linearGradient id="edgeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.5" />
              </linearGradient>
            </defs>

            {/* Connecting lines for All Services View */}
            {selectedServiceId === 'all' && (
              <>
                {services.map((fromSvc, idx) => {
                  const fromPos = nodePositions[fromSvc.id];
                  if (!fromPos) return null;

                  return services.slice(idx + 1).map((toSvc) => {
                    const toPos = nodePositions[toSvc.id];
                    if (!toPos) return null;
                    return (
                      <line
                        key={`edge-${fromSvc.id}-${toSvc.id}`}
                        x1={fromPos.x + 130}
                        y1={fromPos.y + 45}
                        x2={toPos.x + 130}
                        y2={toPos.y + 45}
                        stroke="url(#edgeGrad)"
                        strokeWidth="2.5"
                        strokeDasharray="6,4"
                      />
                    );
                  });
                })}
              </>
            )}

            {/* Connecting lines for Single Service View */}
            {selectedServiceId !== 'all' && currentService && (
              <>
                {currentService.categories.map((cat) => {
                  const svcPos = nodePositions[currentService.id];
                  const catPos = nodePositions[`cat-${cat.id}`];
                  if (!svcPos || !catPos) return null;

                  return (
                    <g key={`group-${cat.id}`}>
                      {/* Line from Service to Category */}
                      <line
                        x1={svcPos.x + 110}
                        y1={svcPos.y + 45}
                        x2={catPos.x + 85}
                        y2={catPos.y + 25}
                        stroke="#94a3b8"
                        strokeWidth="2"
                        strokeOpacity="0.7"
                      />

                      {/* Lines from Category to Docs */}
                      {(cat.docs || []).slice(0, 5).map((doc) => {
                        const docPos = nodePositions[`doc-${doc.id}`];
                        if (!docPos) return null;
                        return (
                          <line
                            key={`cat-doc-${doc.id}`}
                            x1={catPos.x + 85}
                            y1={catPos.y + 25}
                            x2={docPos.x + 75}
                            y2={docPos.y + 20}
                            stroke="#cbd5e1"
                            strokeWidth="1.5"
                            strokeDasharray="4,3"
                          />
                        );
                      })}
                    </g>
                  );
                })}
              </>
            )}
          </svg>

          {/* Interactive HTML Nodes */}
          <div>
            {/* 1. All Services View */}
            {selectedServiceId === 'all' && (
              <>
                {services.map((svc) => {
                  const pos = nodePositions[svc.id] || { x: 300, y: 300 };
                  const isDragging = activeDraggingNodeId === svc.id;

                  return (
                    <div
                      key={svc.id}
                      onMouseDown={(e) => handleNodeMouseDown(e, svc.id)}
                      onClick={(e) => {
                        if (draggingNodeRef.current?.hasMoved) return;
                        onSelectService(svc.id);
                      }}
                      style={{
                        transform: `translate(${pos.x}px, ${pos.y}px)`,
                        cursor: isDragging ? 'grabbing' : 'grab',
                      }}
                      className={`node-draggable absolute w-64 p-4 rounded-xl bg-white border-2 shadow-md transition-shadow select-none group ${
                        isDragging
                          ? 'border-blue-500 ring-4 ring-blue-500/20 scale-105 z-30 shadow-lg'
                          : 'border-slate-200/90 hover:border-blue-400 z-10'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="flex items-center gap-1.5 text-xs font-bold text-blue-600 uppercase tracking-wider">
                          <GripHorizontal className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600" />
                          <span>Service Node</span>
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-mono font-semibold border border-blue-200">
                          {svc.totalDocs} docs
                        </span>
                      </div>
                      <h4 className="text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition">
                        {svc.name}
                      </h4>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                        {svc.description}
                      </p>
                      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                        <span className="flex items-center gap-1 text-[11px] text-amber-600 font-medium">
                          <Sparkles className="w-3.5 h-3.5" />
                          {svc.totalMermaid} diagrams
                        </span>
                        <span className="text-blue-600 group-hover:translate-x-1 transition flex items-center gap-0.5 font-medium">
                          Xem chi tiết <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* External Nodes (Draggable too!) */}
                {[
                  {
                    id: 'ext-napas',
                    label: 'NAPAS Gateway',
                    icon: CreditCard,
                    color: 'text-purple-700 border-purple-200 bg-purple-50',
                  },
                  {
                    id: 'ext-banks',
                    label: 'Banking Hosts (Vietcombank, etc.)',
                    icon: Building,
                    color: 'text-purple-700 border-purple-200 bg-purple-50',
                  },
                  {
                    id: 'ext-onecomm',
                    label: 'OneComm Core',
                    icon: Server,
                    color: 'text-sky-700 border-sky-200 bg-sky-50',
                  },
                  {
                    id: 'ext-db',
                    label: 'Oracle / SQL DB',
                    icon: Database,
                    color: 'text-amber-700 border-amber-200 bg-amber-50',
                  },
                ].map((ext) => {
                  const pos = nodePositions[ext.id] || { x: 100, y: 100 };
                  const isDragging = activeDraggingNodeId === ext.id;
                  const Icon = ext.icon;

                  return (
                    <div
                      key={ext.id}
                      onMouseDown={(e) => handleNodeMouseDown(e, ext.id)}
                      style={{
                        transform: `translate(${pos.x}px, ${pos.y}px)`,
                        cursor: isDragging ? 'grabbing' : 'grab',
                      }}
                      className={`node-draggable absolute p-3 rounded-xl border shadow-xs text-xs font-semibold flex items-center gap-2 select-none ${
                        ext.color
                      } ${isDragging ? 'ring-2 ring-slate-800 scale-105 z-30' : 'z-10'}`}
                    >
                      <GripHorizontal className="w-3 h-3 text-slate-400" />
                      <Icon className="w-4 h-4" />
                      <span>{ext.label}</span>
                    </div>
                  );
                })}
              </>
            )}

            {/* 2. Single Service Deep-Dive View */}
            {selectedServiceId !== 'all' && currentService && (
              <>
                {/* Central Service Core Node */}
                {(() => {
                  const pos = nodePositions[currentService.id] || { x: 460, y: 300 };
                  const isDragging = activeDraggingNodeId === currentService.id;

                  return (
                    <div
                      onMouseDown={(e) => handleNodeMouseDown(e, currentService.id)}
                      style={{
                        transform: `translate(${pos.x}px, ${pos.y}px)`,
                        cursor: isDragging ? 'grabbing' : 'grab',
                      }}
                      className={`node-draggable absolute w-56 p-4 rounded-2xl bg-white border-2 shadow-lg text-center select-none ${
                        isDragging
                          ? 'border-blue-600 ring-4 ring-blue-500/20 scale-105 z-30'
                          : 'border-blue-400 z-10'
                      }`}
                    >
                      <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-200">
                        <Server className="w-5 h-5" />
                      </div>
                      <h3 className="text-sm font-bold text-slate-900">{currentService.name}</h3>
                      <div className="mt-2 flex items-center justify-center gap-2 text-[11px] text-slate-500">
                        <span>{currentService.categories.length} phân hệ</span>
                        <span>•</span>
                        <span>{currentService.totalDocs} bài viết</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Category Nodes */}
                {currentService.categories.map((cat) => {
                  const catPos = nodePositions[`cat-${cat.id}`] || { x: 200, y: 200 };
                  const colorClass = getCategoryColor(cat.id);
                  const isDragging = activeDraggingNodeId === `cat-${cat.id}`;

                  return (
                    <div
                      key={`cat-${cat.id}`}
                      onMouseDown={(e) => handleNodeMouseDown(e, `cat-${cat.id}`)}
                      style={{
                        transform: `translate(${catPos.x}px, ${catPos.y}px)`,
                        cursor: isDragging ? 'grabbing' : 'grab',
                      }}
                      className={`node-draggable absolute w-44 p-3 rounded-xl ${colorClass} border shadow-xs select-none ${
                        isDragging ? 'ring-2 ring-slate-800 scale-105 z-30' : 'z-10'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider">
                          <GripHorizontal className="w-3 h-3 opacity-60" />
                          Phân hệ
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/80 font-mono shadow-2xs">
                          {cat.docCount} docs
                        </span>
                      </div>
                      <div className="text-xs font-semibold">{cat.name.split('(')[0]}</div>
                    </div>
                  );
                })}

                {/* Document Nodes */}
                {currentService.categories.flatMap((cat) =>
                  (cat.docs || []).slice(0, 5).map((doc) => {
                    const docPos = nodePositions[`doc-${doc.id}`] || { x: 100, y: 100 };
                    const isDragging = activeDraggingNodeId === `doc-${doc.id}`;

                    return (
                      <div
                        key={`doc-${doc.id}`}
                        onMouseDown={(e) => handleNodeMouseDown(e, `doc-${doc.id}`)}
                        onClick={(e) => {
                          if (draggingNodeRef.current?.hasMoved) return;
                          setPreviewDoc({ serviceId: currentService.id, doc });
                        }}
                        style={{
                          transform: `translate(${docPos.x}px, ${docPos.y}px)`,
                          cursor: isDragging ? 'grabbing' : 'grab',
                        }}
                        className={`node-draggable absolute w-40 p-2.5 rounded-xl bg-white border shadow-xs select-none group transition-all ${
                          isDragging
                            ? 'border-blue-600 ring-2 ring-blue-500/30 scale-105 z-30'
                            : 'border-slate-200 hover:border-blue-400 z-10'
                        }`}
                      >
                        <div className="flex items-center gap-1 text-[10px] text-slate-500">
                          <GripHorizontal className="w-3 h-3 text-slate-400 group-hover:text-slate-600" />
                          {doc.hasMermaid ? (
                            <span className="text-amber-600 font-bold">⚡ Diagram</span>
                          ) : (
                            <FileText className="w-3 h-3 text-slate-400" />
                          )}
                          <span className="truncate uppercase font-mono">{doc.type}</span>
                        </div>
                        <div className="text-xs font-medium text-slate-800 mt-1 truncate group-hover:text-blue-600">
                          {doc.title}
                        </div>
                      </div>
                    );
                  })
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Document Quick Preview Drawer / Card */}
      {previewDoc && (
        <div className="absolute bottom-4 right-4 z-40 w-80 p-4 rounded-2xl bg-white/95 border border-slate-200 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Chi tiết tài liệu
            </span>
            <button
              onClick={() => setPreviewDoc(null)}
              className="text-slate-400 hover:text-slate-700 text-xs px-1"
            >
              ✕
            </button>
          </div>

          <h4 className="text-sm font-semibold text-slate-900 mt-2">{previewDoc.doc.title}</h4>
          <p className="text-xs text-slate-500 mt-1 line-clamp-3 leading-relaxed">
            {previewDoc.doc.description || 'Không có mô tả vắn tắt.'}
          </p>

          <div className="mt-3 flex flex-wrap gap-1">
            {previewDoc.doc.hasMermaid && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                ⚡ {previewDoc.doc.mermaidCount} Mermaid Diagram
              </span>
            )}
            <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-medium">
              Loại: {previewDoc.doc.type}
            </span>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              onClick={() => {
                onSelectDoc(previewDoc.serviceId, previewDoc.doc.path);
                setPreviewDoc(null);
              }}
              className="w-full py-1.5 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-xs"
            >
              <span>Mở đọc tài liệu đầy đủ</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Bottom Hint */}
      <div className="absolute bottom-3 left-4 z-20 text-[11px] text-slate-500 pointer-events-none bg-white/90 px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
        💡 Kéo thả tự do bất kỳ node nào • Kéo nền để di chuyển khung nhìn • Cuộn chuột để Zoom
      </div>
    </div>
  );
}
