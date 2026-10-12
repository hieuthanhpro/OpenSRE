'use client';

import React, { useState, useMemo } from 'react';
import {
  Database,
  Table,
  Layers,
  Folder,
  Search,
  Filter,
  Sparkles,
  Workflow,
  Cpu,
  ArrowRight,
  BookOpen,
  Code2,
  SlidersHorizontal,
  X,
  FileText,
  Boxes,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { DatabaseInstanceInfo, CategoryInfo, DocMetadata, DatabaseSchemaInfo } from './types';
import { WikiDocCard } from './WikiDocCard';

interface WikiDatabaseExplorerProps {
  instances: DatabaseInstanceInfo[];
  selectedInstanceId: string;
  onSelectInstance: (id: string) => void;
  onOpenDoc: (instanceId: string, docPath: string) => void;
}

export function WikiDatabaseExplorer({
  instances,
  selectedInstanceId,
  onSelectInstance,
  onOpenDoc,
}: WikiDatabaseExplorerProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSchema, setSelectedSchema] = useState<string>('all');
  const [localSearch, setLocalSearch] = useState<string>('');
  const [viewMode, setViewMode] = useState<'categories' | 'schemas'>('categories');

  // Currently selected instance
  const currentInstance = useMemo(() => {
    return instances.find((i) => i.id === selectedInstanceId) || instances[0];
  }, [instances, selectedInstanceId]);

  // Aggregate all unique schemas in the selected instance or all instances
  const availableSchemas = useMemo(() => {
    const list: DatabaseSchemaInfo[] = [];
    const targetInstances =
      selectedInstanceId === 'all'
        ? instances
        : currentInstance
        ? [currentInstance]
        : [];

    targetInstances.forEach((inst) => {
      inst.schemas.forEach((s) => {
        if (!list.some((existing) => existing.name.toLowerCase() === s.name.toLowerCase())) {
          list.push(s);
        }
      });
    });

    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [instances, currentInstance, selectedInstanceId]);

  // Filtered documents
  const filteredDocs = useMemo(() => {
    const targetInstances =
      selectedInstanceId === 'all'
        ? instances
        : currentInstance
        ? [currentInstance]
        : [];

    let list: Array<{ instance: DatabaseInstanceInfo; category: CategoryInfo; doc: DocMetadata }> = [];

    targetInstances.forEach((inst) => {
      inst.categories.forEach((cat) => {
        if (selectedCategory !== 'all' && cat.id !== selectedCategory) {
          return;
        }

        cat.docs.forEach((doc) => {
          // Schema filter
          if (selectedSchema !== 'all') {
            const pathLower = doc.path.toLowerCase();
            const titleLower = doc.title.toLowerCase();
            const schemaLower = selectedSchema.toLowerCase();
            const matchesSchema =
              pathLower.includes(schemaLower) ||
              titleLower.includes(schemaLower) ||
              doc.tags.some((t) => t.toLowerCase() === schemaLower);

            if (!matchesSchema) return;
          }

          // Search query
          if (localSearch.trim()) {
            const q = localSearch.toLowerCase().trim();
            const matchTitle = doc.title.toLowerCase().includes(q);
            const matchDesc = doc.description.toLowerCase().includes(q);
            const matchTags = doc.tags.some((t) => t.toLowerCase().includes(q));
            const matchPath = doc.path.toLowerCase().includes(q);

            if (!matchTitle && !matchDesc && !matchTags && !matchPath) {
              return;
            }
          }

          list.push({ instance: inst, category: cat, doc });
        });
      });
    });

    return list;
  }, [instances, currentInstance, selectedInstanceId, selectedCategory, selectedSchema, localSearch]);

  // Group filtered docs by category
  const docsByCategory = useMemo(() => {
    const groups: Record<string, { categoryName: string; items: typeof filteredDocs }> = {};

    filteredDocs.forEach((item) => {
      const catId = item.category.id;
      if (!groups[catId]) {
        groups[catId] = {
          categoryName: item.category.name,
          items: [],
        };
      }
      groups[catId].items.push(item);
    });

    return Object.entries(groups);
  }, [filteredDocs]);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* 1. Database Instance Selection Tabs */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              onSelectInstance('all');
              setSelectedCategory('all');
              setSelectedSchema('all');
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition shrink-0 ${
              selectedInstanceId === 'all'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            <Boxes className="w-4 h-4" />
            <span>Tất cả DB Instances ({instances.length})</span>
          </button>

          {instances.map((inst) => {
            const isSelected = selectedInstanceId === inst.id;
            return (
              <button
                key={inst.id}
                onClick={() => {
                  onSelectInstance(inst.id);
                  setSelectedCategory('all');
                  setSelectedSchema('all');
                }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition shrink-0 ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                <span>{inst.rawName.toUpperCase()}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                    isSelected ? 'bg-slate-700 text-slate-200' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {inst.totalDocs}
                </span>
              </button>
            );
          })}
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setViewMode('categories')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
              viewMode === 'categories'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Theo danh mục
          </button>
          <button
            onClick={() => setViewMode('schemas')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
              viewMode === 'schemas'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Theo Schemas ({availableSchemas.length})
          </button>
        </div>
      </div>

      {/* 2. Current Instance Hero Card (when specific instance is selected) */}
      {currentInstance && selectedInstanceId !== 'all' && (
        <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-white to-slate-50/80 border border-slate-200/90 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-mono font-bold uppercase">
                  Oracle Database
                </span>
                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-xs font-mono">
                  {currentInstance.rawName}
                </span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                {currentInstance.name}
              </h2>
              <p className="text-xs text-slate-600 max-w-3xl leading-relaxed">
                {currentInstance.description}
              </p>
            </div>
          </div>

          {/* Quick Shortcuts */}
          {currentInstance.categories.find((c) => c.id === 'overview') && (
            <div className="pt-3 border-t border-slate-200/70 flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-slate-600">Bài viết trọng tâm:</span>
              {currentInstance.categories
                .find((c) => c.id === 'overview')
                ?.docs.map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => onOpenDoc(currentInstance.id, doc.path)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 text-xs text-slate-700 hover:text-emerald-700 transition shadow-2xs font-medium"
                  >
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    <span>{doc.title}</span>
                  </button>
                ))}
            </div>
          )}
        </div>
      )}

      {/* 3. Filter Bar (Search + Category Filter + Schema Filter + Mermaid Filter) */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Lọc theo bảng, package, procedure, schema, tên tài liệu..."
              className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-50/70 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-400 focus:bg-white transition"
            />
            {localSearch && (
              <button
                onClick={() => setLocalSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-slate-100">
          <span className="text-[11px] font-semibold text-slate-500 mr-1 flex items-center gap-1">
            <Folder className="w-3 h-3" />
            <span>Danh mục:</span>
          </span>
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
              selectedCategory === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700'
            }`}
          >
            Tất cả danh mục
          </button>
          {currentInstance?.categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                selectedCategory === cat.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700'
              }`}
            >
              {cat.name.split('(')[0]} ({cat.docCount})
            </button>
          ))}
        </div>

        {/* Schema Pills (if schemas available) */}
        {availableSchemas.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-slate-100">
            <span className="text-[11px] font-semibold text-slate-500 mr-1 flex items-center gap-1">
              <Table className="w-3 h-3" />
              <span>Schema:</span>
            </span>
            <button
              onClick={() => setSelectedSchema('all')}
              className={`px-2.5 py-0.5 rounded-md text-xs font-mono font-semibold transition ${
                selectedSchema === 'all'
                  ? 'bg-emerald-700 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              ALL
            </button>
            {availableSchemas.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedSchema(s.name)}
                className={`px-2 py-0.5 rounded-md text-xs font-mono font-semibold transition ${
                  selectedSchema.toLowerCase() === s.name.toLowerCase()
                    ? 'bg-emerald-700 text-white shadow-2xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {s.name} ({s.totalDocs})
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 4. Document Grid Output */}
      {viewMode === 'categories' ? (
        // Mode 1: Grouped by category
        <div className="space-y-8">
          {docsByCategory.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
              <Database className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <div className="text-sm font-bold text-slate-700">Không tìm thấy tài liệu phù hợp</div>
              <div className="text-xs text-slate-500 mt-1">
                Thử thay đổi bộ lọc schema, danh mục hoặc từ khoá tìm kiếm.
              </div>
            </div>
          ) : (
            docsByCategory.map(([catId, { categoryName, items }]) => (
              <div key={catId} className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                  <div className="flex items-center gap-2">
                    <Folder className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                      {categoryName} ({items.length})
                    </h3>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {items.map(({ instance, doc }, idx) => (
                    <WikiDocCard
                      key={`${instance.id}-${doc.id}-${idx}`}
                      doc={doc}
                      serviceName={instance.name.split('(')[0]}
                      onClick={() => onOpenDoc(instance.id, doc.path)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        // Mode 2: Schema-oriented view
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {availableSchemas.map((schema) => (
              <div
                key={schema.id}
                onClick={() => {
                  setSelectedSchema(schema.name);
                  setViewMode('categories');
                }}
                className="group p-5 rounded-2xl bg-white hover:bg-slate-50/80 border border-slate-200 hover:border-slate-350 transition cursor-pointer shadow-xs hover:shadow-md flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-mono font-bold">
                      SCHEMA
                    </span>
                    <span className="text-xs font-mono text-slate-500">{schema.totalDocs} tài liệu</span>
                  </div>
                  <h4 className="text-base font-bold text-slate-900 group-hover:text-emerald-700 transition">
                    {schema.name}
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                    {schema.description || `Các bảng dữ liệu, routines và luồng xử lý của schema ${schema.name}`}
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 group-hover:text-slate-900">
                  <span className="font-mono text-[11px]">{schema.instanceId.toUpperCase()}</span>
                  <div className="flex items-center gap-1 font-semibold text-emerald-700">
                    <span>Xem tài liệu</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
