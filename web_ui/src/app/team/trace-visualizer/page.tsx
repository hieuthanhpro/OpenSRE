'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Search,
  Sparkles,
  Loader2,
  AlertTriangle,
  Clock,
  Layers,
  Server,
  ExternalLink,
  Copy,
  Check,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  X,
  Code2,
  Activity,
  GitFork,
  GripHorizontal,
  Move,
  LayoutGrid,
  ChevronDown,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { apiFetch } from '@/lib/apiClient';

function formatJsonString(str: string): string {
  if (!str) return '';
  const trimmed = str.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch { }
  }
  return str;
}

interface DBQuery {
  operation: string;
  duration_us: number;
  duration_str: string;
  statement: string;
  db_system: string;
  span_id: string;
}

interface TraceErrorItem {
  span_id: string;
  operation: string;
  service: string;
  method?: string;
  endpoint?: string;
  full_url?: string;
  status_code?: string | number;
  error_type?: string;
  message: string;
  details?: string;
  request_body?: string;
  response_body?: string;
  request_headers?: string;
  response_headers?: string;
  stack_trace?: string;
  duration_us?: number;
  duration_str?: string;
}

interface ServiceData {
  name: string;
  span_count: number;
  max_duration_us: number;
  max_duration_str: string;
  total_time_us: number;
  total_time_str: string;
  has_error: boolean;
  error_count: number;
  errors: Array<TraceErrorItem | string>;
  servers: string[];
  db_summary: {
    count: number;
    total_duration_us: number;
    total_duration_str: string;
    slowest?: {
      operation: string;
      duration_us: number;
      duration_str: string;
      statement: string;
      db_system: string;
    };
    calls: DBQuery[];
  };
  outgoing_count: number;
}

interface EdgeData {
  id: string;
  from: string;
  from_label: string;
  to: string;
  to_label: string;
  method: string;
  endpoint: string;
  full_url: string;
  duration_us: number;
  duration_str: string;
  status_code: string;
  has_error: boolean;
  server_address: string;
  server_port: string;
  request_headers: string;
  response_headers: string;
  request_body: string;
  response_body: string;
  span_id: string;
  breakdown: Array<{
    name: string;
    detail: string;
    type: 'database' | 'downstream';
    duration_us: number;
    duration_str: string;
  }>;
  error_info?: TraceErrorItem | null;
}

interface TimelineItem {
  span_id: string;
  service: string;
  operation: string;
  type: 'service' | 'database';
  is_db: boolean;
  start_pct: number;
  width_pct: number;
  start_offset_str: string;
  duration_str: string;
  duration_us: number;
  has_error: boolean;
  edge_id: string | null;
}

interface TraceAnalysis {
  trace_id: string;
  start_time_iso: string;
  total_duration_us: number;
  total_duration_str: string;
  span_count: number;
  client_node: {
    id: string;
    label: string;
    ip: string;
  };
  services: Record<string, ServiceData>;
  edges: EdgeData[];
  timeline: TimelineItem[];
  mermaid?: string;
}

interface NodePosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

function computeLayeredPositions(analysis: TraceAnalysis): Record<string, NodePosition> {
  const pos: Record<string, NodePosition> = {};
  const services = Object.keys(analysis.services);

  // Layer 0: Client
  const layers: string[][] = [['client_entry']];
  const visited = new Set<string>(['client_entry']);

  while (visited.size < services.length + 1) {
    const nextLayer: string[] = [];
    const currentLayer = layers[layers.length - 1];

    currentLayer.forEach((parentId) => {
      analysis.edges
        .filter((e) => e.from === parentId)
        .forEach((e) => {
          if (!visited.has(e.to)) {
            visited.add(e.to);
            nextLayer.push(e.to);
          }
        });
    });

    if (nextLayer.length === 0) {
      services.forEach((s) => {
        if (!visited.has(s)) {
          visited.add(s);
          nextLayer.push(s);
        }
      });
    }
    layers.push(nextLayer);
  }

  layers.forEach((layer, layerIdx) => {
    const y = 60 + layerIdx * 140;
    const totalWidth = layer.length * 240;
    const startX = Math.max(60, 520 - totalWidth / 2);

    layer.forEach((nodeId, idx) => {
      pos[nodeId] = {
        x: startX + idx * 240,
        y: y,
        width: nodeId === 'client_entry' ? 180 : 210,
        height: nodeId === 'client_entry' ? 64 : 84,
      };
    });
  });

  return pos;
}

function ErrorCardView({ error, defaultOpen = false }: { error: TraceErrorItem | string; defaultOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [copiedType, setCopiedType] = useState<string | null>(null);

  if (typeof error === 'string') {
    return (
      <div className="rounded border border-red-500/30 bg-red-950/40 p-2.5 text-[11px] font-mono text-red-300 break-all">
        {error}
      </div>
    );
  }

  const handleCopy = (text: string, type: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 1500);
  };

  const formatPayload = (str?: string) => {
    if (!str) return '';
    try {
      const parsed = JSON.parse(str);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return str;
    }
  };

  const statusBg =
    error.status_code && Number(error.status_code) >= 500
      ? 'bg-rose-50 text-rose-700 border-rose-200'
      : error.status_code && Number(error.status_code) >= 400
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : 'bg-red-50 text-red-700 border-red-200';

  return (
    <div className="rounded-lg border border-red-200 bg-white overflow-hidden shadow-sm transition-all duration-200">
      {/* Header bar - click to expand */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between p-2.5 cursor-pointer hover:bg-red-50/50 select-none transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0 pr-2">
          {error.status_code && (
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${statusBg} shrink-0`}>
              {error.status_code}
            </span>
          )}
          {error.method && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
              {error.method}
            </span>
          )}
          <span className="text-xs font-mono font-semibold text-slate-800 truncate" title={error.endpoint || error.operation}>
            {error.endpoint || error.operation}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {error.duration_str && (
            <span className="text-[10px] font-mono text-rose-600 font-medium">
              {error.duration_str}
            </span>
          )}
          {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />}
        </div>
      </div>

      {/* Primary error message banner */}
      <div className="px-3 pb-2.5 pt-0.5">
        <div className="text-xs font-semibold text-rose-700 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-rose-600 mt-0.5 shrink-0" />
          <span>{error.message}</span>
        </div>
        {error.details && (
          <div className="mt-1.5 text-[11px] text-slate-700 font-sans leading-relaxed bg-slate-50 p-2 rounded border border-slate-200">
            {error.details}
          </div>
        )}
        {error.full_url && error.full_url !== error.endpoint && (
          <div className="mt-1 text-[10px] font-mono text-slate-500 truncate" title={error.full_url}>
            Target: <span className="text-slate-700">{error.full_url}</span>
          </div>
        )}
      </div>

      {/* Expanded details */}
      {isOpen && (
        <div className="border-t border-slate-200 bg-slate-50/70 p-3 space-y-3">
          {/* Response body */}
          {error.response_body && (
            <div>
              <div className="flex items-center justify-between text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                <span>Response Body</span>
                <button
                  type="button"
                  onClick={(e) => handleCopy(formatPayload(error.response_body), 'resp', e)}
                  className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-800"
                >
                  {copiedType === 'resp' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  {copiedType === 'resp' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="max-h-48 overflow-y-auto rounded bg-slate-900 p-2 font-mono text-[10px] text-rose-300 whitespace-pre-wrap break-all border border-slate-800">
                {formatPayload(error.response_body)}
              </pre>
            </div>
          )}

          {/* Request body */}
          {error.request_body && (
            <div>
              <div className="flex items-center justify-between text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
                <span>Request Payload</span>
                <button
                  type="button"
                  onClick={(e) => handleCopy(formatPayload(error.request_body), 'req', e)}
                  className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-800"
                >
                  {copiedType === 'req' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  {copiedType === 'req' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="max-h-48 overflow-y-auto rounded bg-slate-900 p-2 font-mono text-[10px] text-slate-200 whitespace-pre-wrap break-all border border-slate-800">
                {formatPayload(error.request_body)}
              </pre>
            </div>
          )}

          {/* Stack trace */}
          {error.stack_trace && (
            <div>
              <div className="flex items-center justify-between text-[10px] font-semibold text-rose-700 uppercase tracking-wider mb-1">
                <span>Exception Stack Trace</span>
                <button
                  type="button"
                  onClick={(e) => handleCopy(error.stack_trace!, 'stack', e)}
                  className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-800"
                >
                  {copiedType === 'stack' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  {copiedType === 'stack' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="max-h-56 overflow-y-auto rounded bg-slate-900 p-2 font-mono text-[10px] text-red-300 whitespace-pre-wrap break-all border border-slate-800">
                {error.stack_trace}
              </pre>
            </div>
          )}

          {/* Meta & Span ID */}
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1 border-t border-slate-200">
            <span>Span: <span className="text-slate-700 font-semibold">{error.span_id}</span></span>
            <button
              type="button"
              onClick={(e) => handleCopy(error.span_id, 'span', e)}
              className="hover:text-slate-800"
            >
              {copiedType === 'span' ? 'Copied ID' : 'Copy ID'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TraceVisualizerPage() {
  const [traceIdInput, setTraceIdInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<TraceAnalysis | null>(null);

  // Interactive Node Positions (Supports Drag and Drop)
  const [nodePositions, setNodePositions] = useState<Record<string, NodePosition>>({});

  // Timeline Pane Resizing (Supports Drag and Drop)
  const [timelineHeight, setTimelineHeight] = useState(230);
  const [isResizingTimeline, setIsResizingTimeline] = useState(false);

  // Inspector Drawer State
  const [selectedEdge, setSelectedEdge] = useState<EdgeData | null>(null);
  const [selectedService, setSelectedService] = useState<ServiceData | null>(null);
  const [selectedClient, setSelectedClient] = useState<{ ip: string; endpoint: string; duration: string } | null>(null);
  const [showMermaidModal, setShowMermaidModal] = useState(false);
  const [copiedMermaid, setCopiedMermaid] = useState(false);

  // Canvas Viewport Pan & Zoom State
  const [scale, setScale] = useState(1.0);
  const [pan, setPan] = useState({ x: 50, y: 40 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Node Dragging Tracking
  const draggingNodeRef = useRef<{
    nodeId: string;
    startSvgX: number;
    startSvgY: number;
    initialNodeX: number;
    initialNodeY: number;
    hasMoved: boolean;
  } | null>(null);

  const [activeDraggingNodeId, setActiveDraggingNodeId] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Hover Tooltip for timeline
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    title: string;
    service: string;
    duration: string;
    offset: string;
  }>({
    visible: false,
    x: 0,
    y: 0,
    title: '',
    service: '',
    duration: '',
    offset: '',
  });

  const handleFetchTrace = async (idToFetch?: string) => {
    const id = (idToFetch || traceIdInput).trim();
    if (!id) return;

    setLoading(true);
    setError(null);
    setSelectedEdge(null);
    setSelectedService(null);
    setSelectedClient(null);

    try {
      const res = await apiFetch(`/api/team/traces/visualize?trace_id=${encodeURIComponent(id)}`);
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || `Lỗi tải trace (${res.status})`);
      }

      const data: TraceAnalysis = json.data;
      setAnalysis(data);
      setTraceIdInput(id);

      // Compute and set initial positions
      const initialPos = computeLayeredPositions(data);
      setNodePositions(initialPos);

      // Reset view
      setScale(1.0);
      setPan({ x: 60, y: 50 });
    } catch (err: any) {
      setError(err.message || 'Không thể lấy dữ liệu trace');
    } finally {
      setLoading(false);
    }
  };

  const resetAutoLayout = () => {
    if (!analysis) return;
    const initialPos = computeLayeredPositions(analysis);
    setNodePositions(initialPos);
    setScale(1.0);
    setPan({ x: 60, y: 50 });
  };

  // Convert Screen Event to SVG Coordinates
  const getSvgCoordinates = useCallback(
    (clientX: number, clientY: number) => {
      if (!viewportRef.current) return { x: 0, y: 0 };
      const rect = viewportRef.current.getBoundingClientRect();
      const screenX = clientX - rect.left;
      const screenY = clientY - rect.top;
      return {
        x: (screenX - pan.x) / scale,
        y: (screenY - pan.y) / scale,
      };
    },
    [pan, scale]
  );

  // Mouse Down on a Node to start dragging
  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    const svgCoord = getSvgCoordinates(e.clientX, e.clientY);
    const nodePos = nodePositions[nodeId];
    if (!nodePos) return;

    draggingNodeRef.current = {
      nodeId,
      startSvgX: svgCoord.x,
      startSvgY: svgCoord.y,
      initialNodeX: nodePos.x,
      initialNodeY: nodePos.y,
      hasMoved: false,
    };
    setActiveDraggingNodeId(nodeId);
  };

  // Canvas Pan Mouse Down
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.graph-interactive')) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  // Global Mouse Move (handles Node Dragging, Canvas Pan, and Timeline Resizing)
  const handleMouseMove = (e: React.MouseEvent) => {
    // 1. Resizing timeline
    if (isResizingTimeline) {
      const newHeight = window.innerHeight - e.clientY;
      setTimelineHeight(Math.max(48, Math.min(650, newHeight)));
      return;
    }

    // 2. Dragging a node
    if (draggingNodeRef.current) {
      const svgCoord = getSvgCoordinates(e.clientX, e.clientY);
      const deltaX = svgCoord.x - draggingNodeRef.current.startSvgX;
      const deltaY = svgCoord.y - draggingNodeRef.current.startSvgY;

      if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
        draggingNodeRef.current.hasMoved = true;
      }

      const nodeId = draggingNodeRef.current.nodeId;
      const newX = Math.round(draggingNodeRef.current.initialNodeX + deltaX);
      const newY = Math.round(draggingNodeRef.current.initialNodeY + deltaY);

      setNodePositions((prev) => ({
        ...prev,
        [nodeId]: {
          ...prev[nodeId],
          x: newX,
          y: newY,
        },
      }));
      return;
    }

    // 3. Panning canvas
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  };

  // Global Mouse Up
  const handleMouseUp = () => {
    if (isResizingTimeline) {
      setIsResizingTimeline(false);
    }
    if (draggingNodeRef.current) {
      draggingNodeRef.current = null;
      setActiveDraggingNodeId(null);
    }
    if (isPanning) {
      setIsPanning(false);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    const newScale = e.deltaY < 0 ? scale * zoomFactor : scale / zoomFactor;
    if (newScale < 0.25 || newScale > 3.5) return;
    setScale(newScale);
  };

  const handleCopyMermaid = () => {
    if (!analysis?.mermaid) return;
    navigator.clipboard.writeText(analysis.mermaid);
    setCopiedMermaid(true);
    setTimeout(() => setCopiedMermaid(false), 2000);
  };

  const sampleTraces = [
    { id: '3a18d4f3389d102caefe9db7488dd85e', label: '6 Services, 110 Spans (Payment Flow)' },
    { id: 'aa5c98729d4b215fac80612a14e63b0b', label: 'Error 400 Bad Request Trace' },
  ];

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className="flex h-[calc(100vh-57px)] flex-col bg-slate-50 text-slate-800 font-sans select-none"
    >
      {/* Search & Top Action Bar */}
      <div className="border-b border-slate-200/80 bg-white/95 px-6 py-3 backdrop-blur z-20 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700 border border-slate-200">
              <GitFork className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Trace Flow Visualizer
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                  Live Jaeger
                </span>
                <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 border border-sky-200 flex items-center gap-1">
                  <Move className="h-3 w-3" /> Kéo thả Nodes
                </span>
              </h1>
              <p className="text-xs text-slate-500">
                Kéo thả các node để sắp xếp topology theo ý muốn • Kéo thanh chia để chỉnh độ cao timeline
              </p>
            </div>
          </div>

          {/* Input Form */}
          <div className="flex items-center gap-2 flex-1 max-w-xl">
            <div className="relative flex-1">
              <input
                type="text"
                value={traceIdInput}
                onChange={(e) => setTraceIdInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleFetchTrace()}
                placeholder="Nhập Trace ID (ví dụ: 3a18d4f3389d102caefe9db7488dd85e)..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2 pl-9 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 font-mono transition"
              />
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            </div>
            <button
              onClick={() => handleFetchTrace()}
              disabled={loading || !traceIdInput.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 disabled:opacity-50 transition"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Vẽ mô tả
            </button>
          </div>

          {/* Quick Actions */}
          {analysis && (
            <div className="flex items-center gap-2">
              <button
                onClick={resetAutoLayout}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 shadow-xs transition"
                title="Tự động sắp xếp lại vị trí ban đầu"
              >
                <LayoutGrid className="h-3.5 w-3.5 text-slate-500" />
                Auto Layout
              </button>
              <button
                onClick={() => setShowMermaidModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 shadow-xs transition"
                title="Xem Mermaid code"
              >
                <Code2 className="h-3.5 w-3.5 text-slate-500" />
                Mermaid
              </button>
              <a
                href={`/api/team/traces/visualize?trace_id=${analysis.trace_id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 shadow-xs transition"
                title="Mở JSON raw"
              >
                <ExternalLink className="h-3.5 w-3.5 text-slate-500" />
                Raw JSON
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="m-4 flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 shadow-xs">
          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Workspace */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* If no analysis loaded */}
        {!analysis && !loading && (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center bg-white/60">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 border border-sky-200 text-sky-600">
              <Activity className="h-7 w-7" />
            </div>
            <h2 className="text-base font-semibold text-slate-800">Chưa có Trace nào được tải</h2>
            <p className="mt-1 max-w-sm text-xs text-slate-500">
              Nhập Trace ID ở thanh tìm kiếm phía trên hoặc bấm vào các mẫu thử nghiệm để tự động dựng đồ thị topology và timeline tương tác.
            </p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-white/60">
            <Loader2 className="h-8 w-8 animate-spin text-slate-700" />
            <span className="text-xs text-slate-500">Đang truy vấn spans từ Jaeger API & dựng topology...</span>
          </div>
        )}

        {/* Analysis Visualizer Content */}
        {analysis && !loading && (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Trace Meta Header */}
            <div className="flex items-center justify-between border-b border-slate-200/80 bg-white px-6 py-2 text-xs">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="font-mono text-slate-500">
                  ID: <strong className="text-slate-800 font-semibold">{analysis.trace_id}</strong>
                </span>
                <span className="flex items-center gap-1 text-slate-500">
                  <Clock className="h-3.5 w-3.5 text-sky-600" />
                  Tổng thời gian: <strong className="text-sky-700 font-mono">{analysis.total_duration_str}</strong>
                </span>
                <span className="flex items-center gap-1 text-slate-500">
                  <Layers className="h-3.5 w-3.5 text-indigo-600" />
                  Spans: <strong className="text-slate-800">{analysis.span_count}</strong>
                </span>
                <span className="flex items-center gap-1 text-slate-500">
                  <Server className="h-3.5 w-3.5 text-emerald-600" />
                  Services: <strong className="text-slate-800">{Object.keys(analysis.services).length}</strong>
                </span>
                <span className="text-slate-400">🕒 {analysis.start_time_iso}</span>
              </div>
              <div className="text-[11px] text-slate-500 flex items-center gap-2">
                <span>🖱️ <strong>Kéo thả node</strong> để di chuyển</span>
                <span>•</span>
                <span>Click Edge/Node để xem chi tiết</span>
              </div>
            </div>

            {/* Upper: SVG Graph Viewport */}
            <div
              ref={viewportRef}
              onMouseDown={handleCanvasMouseDown}
              onWheel={handleWheel}
              style={{
                backgroundImage: 'radial-gradient(#cbd5e1 1.2px, transparent 1.2px)',
                backgroundSize: '18px 18px',
              }}
              className="relative flex-1 cursor-grab active:cursor-grabbing overflow-hidden bg-slate-100/60"
            >
              {/* Controls */}
              <div className="absolute left-4 top-4 z-10 flex flex-col gap-1.5 rounded-xl border border-slate-200/90 bg-white/95 p-1 shadow-md backdrop-blur">
                <button
                  onClick={() => setScale((s) => Math.min(3.5, s * 1.2))}
                  className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
                  title="Phóng to"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setScale((s) => Math.max(0.25, s / 1.2))}
                  className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
                  title="Thu nhỏ"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <button
                  onClick={resetAutoLayout}
                  className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
                  title="Tự động xếp lại vị trí"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              </div>

              {/* Drag instruction chip */}
              <div className="absolute right-4 top-4 z-10 rounded-lg border border-slate-200 bg-white/95 px-3 py-1 text-[11px] font-medium text-slate-600 shadow-sm pointer-events-none">
                💡 Nhấn giữ vào card để kéo thả vị trí
              </div>

              {/* SVG Canvas */}
              <svg ref={svgRef} className="h-full w-full">
                <defs>
                  <marker
                    id="react-arrow"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#64748b" />
                  </marker>
                  <marker
                    id="react-arrow-error"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#ef4444" />
                  </marker>
                  <marker
                    id="react-arrow-selected"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#0284c7" />
                  </marker>
                </defs>

                <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
                  {/* Dynamic Edges (Connected to current draggable node positions) */}
                  {analysis.edges.map((edge) => {
                    const src = nodePositions[edge.from];
                    const dst = nodePositions[edge.to];
                    if (!src || !dst) return null;

                    const x1 = src.x + src.width / 2;
                    const y1 = src.y + src.height;
                    const x2 = dst.x + dst.width / 2;
                    const y2 = dst.y;

                    const dy = y2 - y1;
                    const cx1 = x1;
                    const cy1 = y1 + Math.max(25, dy * 0.45);
                    const cx2 = x2;
                    const cy2 = y2 - Math.max(25, dy * 0.45);

                    const pathD = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
                    const isSelected = selectedEdge?.id === edge.id;
                    const strokeColor = isSelected ? '#0284c7' : edge.has_error ? '#ef4444' : '#94a3b8';
                    const marker = isSelected
                      ? 'url(#react-arrow-selected)'
                      : edge.has_error
                        ? 'url(#react-arrow-error)'
                        : 'url(#react-arrow)';

                    const midX = (x1 + 2 * ((cx1 + cx2) / 2) + x2) / 4;
                    const midY = (y1 + 2 * ((cy1 + cy2) / 2) + y2) / 4;

                    return (
                      <g
                        key={edge.id}
                        className="graph-interactive cursor-pointer group"
                        onClick={() => {
                          setSelectedEdge(edge);
                          setSelectedService(null);
                          setSelectedClient(null);
                        }}
                      >
                        {/* Hitbox */}
                        <path d={pathD} fill="none" stroke="transparent" strokeWidth="18" />
                        {/* Line */}
                        <path
                          d={pathD}
                          fill="none"
                          stroke={strokeColor}
                          strokeWidth={isSelected ? '3' : '2'}
                          markerEnd={marker}
                          className="transition-all group-hover:stroke-sky-600 group-hover:stroke-[2.5]"
                        />
                        {/* Label Pill */}
                        <g transform={`translate(${midX}, ${midY})`}>
                          <rect
                            x="-58"
                            y="-11"
                            width="116"
                            height="22"
                            rx="11"
                            fill="#ffffff"
                            stroke={strokeColor}
                            strokeWidth="1.2"
                            className="group-hover:fill-slate-50 transition drop-shadow-xs"
                          />
                          <text
                            x="0"
                            y="4"
                            textAnchor="middle"
                            fontSize="10"
                            fontFamily="monospace"
                            fill={edge.has_error ? '#dc2626' : '#334155'}
                            fontWeight="600"
                          >
                            {edge.method} {edge.duration_str}
                          </text>
                        </g>
                      </g>
                    );
                  })}

                  {/* 1. Client Node (Draggable) */}
                  {nodePositions['client_entry'] && (
                    <g
                      transform={`translate(${nodePositions['client_entry'].x}, ${nodePositions['client_entry'].y})`}
                      className="graph-interactive cursor-grab active:cursor-grabbing select-none"
                      onMouseDown={(e) => handleNodeMouseDown(e, 'client_entry')}
                      onClick={() => {
                        if (draggingNodeRef.current?.hasMoved) return;
                        setSelectedClient({
                          ip: analysis.client_node.ip,
                          endpoint: analysis.edges[0]?.endpoint || 'N/A',
                          duration: analysis.edges[0]?.duration_str || 'N/A',
                        });
                        setSelectedEdge(null);
                        setSelectedService(null);
                      }}
                    >
                      <rect
                        width={nodePositions['client_entry'].width}
                        height={nodePositions['client_entry'].height}
                        rx="10"
                        fill="#ffffff"
                        stroke={selectedClient ? '#6366f1' : '#c7d2fe'}
                        strokeWidth={selectedClient || activeDraggingNodeId === 'client_entry' ? '2.5' : '1.5'}
                        filter="drop-shadow(0 2px 6px rgba(0,0,0,0.06))"
                        className="hover:stroke-indigo-400 transition"
                      />
                      <text x="90" y="26" textAnchor="middle" fontSize="13" fontWeight="700" fill="#312e81" pointerEvents="none">
                        👤 Client
                      </text>
                      <text x="90" y="46" textAnchor="middle" fontSize="11" fontFamily="monospace" fill="#4f46e5" pointerEvents="none">
                        {analysis.client_node.ip}
                      </text>
                    </g>
                  )}

                  {/* 2. Service Nodes (Draggable) */}
                  {Object.entries(analysis.services).map(([svcName, svc]) => {
                    const pos = nodePositions[svcName];
                    if (!pos) return null;

                    const isSelected = selectedService?.name === svc.name;
                    const isDragging = activeDraggingNodeId === svcName;
                    const borderColor = isSelected || isDragging
                      ? '#0284c7'
                      : svc.has_error
                        ? '#fca5a5'
                        : '#e2e8f0';
                    const bgColor = svc.has_error ? '#fef2f2' : '#ffffff';

                    return (
                      <g
                        key={svcName}
                        transform={`translate(${pos.x}, ${pos.y})`}
                        className="graph-interactive cursor-grab active:cursor-grabbing select-none group"
                        onMouseDown={(e) => handleNodeMouseDown(e, svcName)}
                        onClick={() => {
                          if (draggingNodeRef.current?.hasMoved) return;
                          setSelectedService(svc);
                          setSelectedEdge(null);
                          setSelectedClient(null);
                        }}
                      >
                        <rect
                          width={pos.width}
                          height={pos.height}
                          rx="10"
                          fill={bgColor}
                          stroke={borderColor}
                          strokeWidth={isSelected || isDragging ? '2.5' : '1.5'}
                          filter="drop-shadow(0 2px 6px rgba(0,0,0,0.06))"
                          className="group-hover:stroke-sky-400 transition"
                        />
                        {/* Status dot */}
                        <circle cx="20" cy="24" r="5" fill={svc.has_error ? '#ef4444' : '#10b981'} pointerEvents="none" />
                        {/* Title */}
                        <text x="32" y="28" fontSize="13" fontWeight="700" fill={svc.has_error ? '#991b1b' : '#0f172a'} pointerEvents="none">
                          {svc.name.length > 14 ? svc.name.slice(0, 13) + '..' : svc.name}
                        </text>
                        {/* Duration */}
                        <text
                          x={pos.width - 12}
                          y="28"
                          textAnchor="end"
                          fontSize="11"
                          fontWeight="600"
                          fontFamily="monospace"
                          fill={svc.has_error ? '#dc2626' : '#0284c7'}
                          pointerEvents="none"
                        >
                          ⏱ {svc.max_duration_str}
                        </text>
                        {/* Separator */}
                        <line x1="12" y1="42" x2={pos.width - 12} y2="42" stroke="#f1f5f9" pointerEvents="none" />
                        {/* DB info / Spans info */}
                        {svc.db_summary.count > 0 ? (
                          <text x="14" y="64" fontSize="10" fill="#d97706" fontWeight="500" pointerEvents="none">
                            🗄️ {svc.db_summary.count} DB calls ({svc.db_summary.slowest?.duration_str})
                          </text>
                        ) : (
                          <text x="14" y="64" fontSize="10" fill="#64748b" pointerEvents="none">
                            Spans: {svc.span_count}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              </svg>
            </div>

            {/* Draggable Divider (Split Pane Resizer) */}
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                setIsResizingTimeline(true);
              }}
              className="h-2 w-full cursor-row-resize bg-slate-200 hover:bg-sky-400 border-t border-slate-300 transition-colors flex items-center justify-center group z-20 select-none shrink-0"
              title="Kéo lên / xuống để chỉnh độ cao timeline"
            >
              <div className="h-1 w-14 rounded-full bg-slate-400 group-hover:bg-white transition-colors" />
            </div>

            {/* Bottom: Interactive Timeline Pane (Resizable) */}
            <div
              style={{ height: `${timelineHeight}px` }}
              className="flex flex-col bg-white shrink-0 z-10 overflow-hidden"
            >
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-1.5 text-xs text-slate-700 font-semibold shrink-0">
                <span className="flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5 text-sky-600" />
                  TIMELINE & EXECUTION WATERFALL
                </span>
                <span className="text-[11px] text-slate-400 font-normal">
                  Chỉ hiện 1 thanh đại diện cho DB call chậm nhất mỗi service
                </span>
              </div>

              {/* Time Ruler */}
              <div className="flex justify-between border-b border-slate-200/80 px-4 py-1 text-[10px] text-slate-400 font-mono shrink-0">
                <span className="w-48 shrink-0">Service & Operation</span>
                <div className="relative flex flex-1 justify-between">
                  <span>0ms</span>
                  <span>{formatDuration(analysis.total_duration_us / 4)}</span>
                  <span>{formatDuration(analysis.total_duration_us / 2)}</span>
                  <span>{formatDuration((analysis.total_duration_us * 3) / 4)}</span>
                  <span>{analysis.total_duration_str}</span>
                </div>
              </div>

              {/* Rows */}
              <div className="flex-1 overflow-y-auto px-4 py-1.5">
                {analysis.timeline.map((item) => (
                  <div
                    key={item.span_id}
                    onClick={() => {
                      if (item.edge_id) {
                        const edge = analysis.edges.find((e) => e.id === item.edge_id);
                        if (edge) setSelectedEdge(edge);
                      } else {
                        const svc = analysis.services[item.service];
                        if (svc) setSelectedService(svc);
                      }
                    }}
                    className="flex h-6 items-center rounded hover:bg-slate-50 cursor-pointer transition text-xs"
                  >
                    <div
                      className={`w-48 truncate pr-2 text-[11px] ${item.is_db ? 'pl-4 text-amber-700 font-medium' : 'text-slate-700 font-medium'
                        }`}
                      title={item.operation}
                    >
                      {item.is_db ? `🗄️ ${item.operation}` : `${item.service}: ${item.operation}`}
                    </div>

                    <div className="relative flex h-full flex-1 items-center">
                      <div
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setTooltip({
                            visible: true,
                            x: rect.left,
                            y: rect.top - 70,
                            title: item.operation,
                            service: item.service,
                            duration: item.duration_str,
                            offset: item.start_offset_str,
                          });
                        }}
                        onMouseLeave={() => setTooltip((t) => ({ ...t, visible: false }))}
                        style={{ left: `${item.start_pct}%`, width: `${item.width_pct}%` }}
                        className={`absolute h-3.5 rounded text-[9px] text-white flex items-center px-1 font-mono truncate transition-transform hover:scale-y-125 ${item.is_db
                            ? 'bg-amber-600 border border-amber-500'
                            : item.has_error
                              ? 'bg-red-600 border border-red-500'
                              : 'bg-sky-600'
                          }`}
                      >
                        {item.duration_str}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Floating Tooltip */}
        {tooltip.visible && (
          <div
            style={{ left: tooltip.x, top: tooltip.y }}
            className="fixed z-50 pointer-events-none rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-800 shadow-xl"
          >
            <div className="font-semibold text-slate-900">{tooltip.title}</div>
            <div className="text-[11px] text-slate-500">
              Service: <span className="text-slate-800 font-medium">{tooltip.service}</span>
            </div>
            <div className="text-[11px] text-slate-500">
              Duration: <span className="font-mono text-sky-700 font-semibold">{tooltip.duration}</span> (Offset: {tooltip.offset})
            </div>
          </div>
        )}

        {/* Inspector Drawer (Right Panel) */}
        {(selectedEdge || selectedService || selectedClient) && (
          <div className="w-[420px] border-l border-slate-200 bg-white flex flex-col shadow-2xl z-30 transition-transform">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 bg-slate-50">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                {selectedEdge && '🔗 Request Inspector'}
                {selectedService && '📦 Service Inspector'}
                {selectedClient && '👤 Client Details'}
              </span>
              <button
                onClick={() => {
                  setSelectedEdge(null);
                  setSelectedService(null);
                  setSelectedClient(null);
                }}
                className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              {/* EDGE DETAILS */}
              {selectedEdge && (
                <>
                  <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-3.5 space-y-2">
                    <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Overview</div>
                    <div className="grid grid-cols-[80px_1fr] gap-1.5 text-xs">
                      <span className="text-slate-500">Flow:</span>
                      <span className="font-semibold text-sky-700">
                        {selectedEdge.from} → {selectedEdge.to}
                      </span>
                      <span className="text-slate-500">Method:</span>
                      <span>
                        <span className="rounded bg-sky-50 px-2 py-0.5 text-[11px] font-mono font-bold text-sky-700 border border-sky-200">
                          {selectedEdge.method}
                        </span>
                      </span>
                      <span className="text-slate-500">Endpoint:</span>
                      <span className="font-mono text-slate-800 break-all">{selectedEdge.endpoint}</span>
                      <span className="text-slate-500">Duration:</span>
                      <span className="font-mono font-bold text-sky-700">{selectedEdge.duration_str}</span>
                      <span className="text-slate-500">Status:</span>
                      <span>
                        <span
                          className={`rounded px-2 py-0.5 text-[11px] font-mono font-bold border ${selectedEdge.status_code.startsWith('2')
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}
                        >
                          {selectedEdge.status_code}
                        </span>
                      </span>
                      <span className="text-slate-500">Server:</span>
                      <span className="font-mono text-slate-700">
                        {selectedEdge.server_address}
                        {selectedEdge.server_port ? `:${selectedEdge.server_port}` : ''}
                      </span>
                    </div>
                  </div>

                  {/* Breakdown */}
                  {selectedEdge.breakdown && selectedEdge.breakdown.length > 0 && (
                    <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-3.5 space-y-2">
                      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        ⏱ Response Time Breakdown Inside Call
                      </div>
                      <div className="space-y-2">
                        {selectedEdge.breakdown.map((b, idx) => {
                          const maxUs = selectedEdge.breakdown[0].duration_us || 1;
                          const pct = Math.max(3, (b.duration_us / maxUs) * 100);
                          const isDb = b.type === 'database';

                          return (
                            <div key={idx} className="space-y-1 text-[11px]">
                              <div className="flex justify-between">
                                <span className={isDb ? 'text-amber-700 font-semibold' : 'text-sky-700 font-semibold'}>
                                  {isDb ? '🗄️' : '🌐'} {b.name}
                                </span>
                                <span className="font-mono text-slate-800 font-bold">{b.duration_str}</span>
                              </div>
                              <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                                <div
                                  style={{ width: `${pct}%` }}
                                  className={`h-full rounded-full ${isDb ? 'bg-amber-500' : 'bg-sky-500'}`}
                                />
                              </div>
                              <div className="text-[10px] text-slate-500 font-mono truncate">{b.detail}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Request Headers */}
                  {selectedEdge.request_headers && (
                    <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-3.5 space-y-1.5">
                      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                        <span>📤 Request Headers</span>
                        <button
                          onClick={() => navigator.clipboard.writeText(selectedEdge.request_headers)}
                          className="text-[10px] text-slate-500 hover:text-slate-800 font-mono flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3" /> Copy
                        </button>
                      </div>
                      <pre className="max-h-36 overflow-y-auto rounded-lg bg-slate-900 p-2.5 font-mono text-[10px] text-slate-200 whitespace-pre-wrap break-all border border-slate-800">
                        {selectedEdge.request_headers}
                      </pre>
                    </div>
                  )}

                  {/* Request Body */}
                  <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-3.5 space-y-1.5">
                    <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <span className="text-sky-600">📥</span> Request Body
                      </span>
                      {selectedEdge.request_body && (
                        <button
                          onClick={() => navigator.clipboard.writeText(selectedEdge.request_body)}
                          className="text-[10px] text-slate-500 hover:text-slate-800 font-mono flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3" /> Copy
                        </button>
                      )}
                    </div>
                    {selectedEdge.request_body ? (
                      <pre className="max-h-52 overflow-y-auto rounded-lg bg-slate-900 p-2.5 font-mono text-[10px] text-sky-200 whitespace-pre-wrap break-all border border-slate-800">
                        {formatJsonString(selectedEdge.request_body)}
                      </pre>
                    ) : (
                      <div className="text-[10px] text-slate-400 italic p-2 rounded bg-white border border-slate-200 font-mono">
                        (Không có dữ liệu Request Body trong span trace)
                      </div>
                    )}
                  </div>

                  {/* Response Body */}
                  <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-3.5 space-y-1.5">
                    <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <span className="text-amber-600">📦</span> Response Body
                      </span>
                      {selectedEdge.response_body && (
                        <button
                          onClick={() => navigator.clipboard.writeText(selectedEdge.response_body)}
                          className="text-[10px] text-slate-500 hover:text-slate-800 font-mono flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3" /> Copy
                        </button>
                      )}
                    </div>
                    {selectedEdge.response_body ? (
                      <pre className="max-h-52 overflow-y-auto rounded-lg bg-slate-900 p-2.5 font-mono text-[10px] text-emerald-200 whitespace-pre-wrap break-all border border-slate-800">
                        {formatJsonString(selectedEdge.response_body)}
                      </pre>
                    ) : (
                      <div className="text-[10px] text-slate-400 italic p-2 rounded bg-white border border-slate-200 font-mono">
                        (Không có dữ liệu Response Body trong span trace)
                      </div>
                    )}
                  </div>

                  {/* Response Headers */}
                  {selectedEdge.response_headers && (
                    <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-3.5 space-y-1.5">
                      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                        <span>📥 Response Headers</span>
                        <button
                          onClick={() => navigator.clipboard.writeText(selectedEdge.response_headers)}
                          className="text-[10px] text-slate-500 hover:text-slate-800 font-mono flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3" /> Copy
                        </button>
                      </div>
                      <pre className="max-h-36 overflow-y-auto rounded-lg bg-slate-900 p-2.5 font-mono text-[10px] text-slate-200 whitespace-pre-wrap break-all border border-slate-800">
                        {selectedEdge.response_headers}
                      </pre>
                    </div>
                  )}

                  {/* Edge Error Details if failed */}
                  {selectedEdge.has_error && (
                    <div className="rounded-xl border border-red-200 bg-red-50/50 p-3.5 space-y-2">
                      <div className="text-[11px] font-semibold text-red-700 uppercase tracking-wider flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                        <span>Call Error Details (Status: {selectedEdge.status_code})</span>
                      </div>
                      {selectedEdge.error_info ? (
                        <ErrorCardView error={selectedEdge.error_info} defaultOpen={true} />
                      ) : (
                        <div className="text-xs text-rose-700 font-mono bg-white p-2 rounded border border-red-200">
                          HTTP Status {selectedEdge.status_code}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* SERVICE DETAILS */}
              {selectedService && (
                <>
                  <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-3.5 space-y-2">
                    <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Service Overview</div>
                    <div className="grid grid-cols-[100px_1fr] gap-1.5 text-xs">
                      <span className="text-slate-500">Service:</span>
                      <span className="font-bold text-slate-900">{selectedService.name}</span>
                      <span className="text-slate-500">Max Duration:</span>
                      <span className="font-mono font-bold text-sky-700">{selectedService.max_duration_str}</span>
                      <span className="text-slate-500">Total Active:</span>
                      <span className="font-mono text-slate-800">{selectedService.total_time_str}</span>
                      <span className="text-slate-500">Total Spans:</span>
                      <span className="font-mono text-slate-800">{selectedService.span_count}</span>
                      <span className="text-slate-500">DB Calls:</span>
                      <span className="font-mono text-amber-700 font-semibold">{selectedService.db_summary.count}</span>
                      <span className="text-slate-500">Servers/IPs:</span>
                      <span className="font-mono text-slate-700 break-all">
                        {selectedService.servers.join(', ') || 'Internal'}
                      </span>
                    </div>
                  </div>

                  {/* DB Calls */}
                  {selectedService.db_summary.count > 0 && (
                    <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-3.5 space-y-2">
                      <div className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider flex items-center justify-between">
                        <span>🗄️ Database Queries ({selectedService.db_summary.count})</span>
                        <span className="font-mono text-slate-600">{selectedService.db_summary.total_duration_str}</span>
                      </div>
                      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {selectedService.db_summary.calls.map((c, idx) => (
                          <div key={idx} className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-1 shadow-2xs">
                            <div className="flex justify-between items-center text-[11px]">
                              <span className="font-semibold text-amber-700 truncate">{c.operation}</span>
                              <span className="font-mono text-slate-800 font-bold ml-2 shrink-0">{c.duration_str}</span>
                            </div>
                            <div className="font-mono text-[10px] text-slate-600 break-all bg-slate-50 p-2 rounded border border-slate-100">
                              {c.statement}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Errors */}
                  {selectedService.has_error && (
                    <div className="rounded-xl border border-red-200 bg-red-50/50 p-3.5 space-y-2.5">
                      <div className="text-[11px] font-semibold text-red-700 uppercase tracking-wider flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                          Errors ({selectedService.error_count})
                        </span>
                        <span className="text-[10px] text-slate-500 font-sans">Click card to expand payload & stack</span>
                      </div>
                      <div className="space-y-2">
                        {selectedService.errors.map((err, idx) => (
                          <ErrorCardView key={idx} error={err} defaultOpen={idx === 0} />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* CLIENT DETAILS */}
              {selectedClient && (
                <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-3.5 space-y-2">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Client Request</div>
                  <div className="grid grid-cols-[90px_1fr] gap-1.5 text-xs">
                    <span className="text-slate-500">Client IP:</span>
                    <span className="font-mono font-bold text-indigo-700">{selectedClient.ip}</span>
                    <span className="text-slate-500">First Call:</span>
                    <span className="font-mono text-slate-800">{selectedClient.endpoint}</span>
                    <span className="text-slate-500">Duration:</span>
                    <span className="font-mono text-sky-700 font-semibold">{selectedClient.duration}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mermaid Code Modal */}
      {showMermaidModal && analysis?.mermaid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 bg-slate-50">
              <span className="font-semibold text-sm text-slate-900 flex items-center gap-2">
                <Code2 className="h-4 w-4 text-slate-700" />
                Mermaid Flowchart Code
              </span>
              <button
                onClick={() => setShowMermaidModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4">
              <pre className="max-h-96 overflow-y-auto rounded-xl bg-slate-900 p-3.5 font-mono text-xs text-slate-100">
                {analysis.mermaid}
              </pre>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
              <button
                onClick={handleCopyMermaid}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition"
              >
                {copiedMermaid ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copiedMermaid ? 'Đã sao chép' : 'Sao chép Markdown'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDuration(microseconds: number): string {
  if (microseconds < 1000) {
    return `${microseconds}µs`;
  } else if (microseconds < 1_000_000) {
    return `${(microseconds / 1000).toFixed(1)}ms`;
  } else {
    return `${(microseconds / 1_000_000).toFixed(2)}s`;
  }
}
