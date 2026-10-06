'use client';

import { useState, useEffect } from 'react';
import { RequireRole } from '@/components/RequireRole';
import { NewInvestigationDrawer } from '@/components/NewInvestigationDrawer';
import {
  Database,
  Clock,
  AlertTriangle,
  Sparkles,
  Server,
  Folder,
  CheckCircle2,
} from 'lucide-react';
import { clsx } from 'clsx';

interface DBInstance {
  id: string;
  name: string;
  engine: 'oracle' | 'postgres';
  host: string;
  folderPath: string;
  status: 'online' | 'warning' | 'error';
  cpuCores: number;
  currentCpuPct: number;
  reportCount: number;
}

const DB_FLEET: DBInstance[] = [
  {
    id: 'orcl',
    name: 'Oracle DB (orcl)',
    engine: 'oracle',
    host: 'db.onepay.vn',
    folderPath: '/app/awr/orcl/',
    status: 'warning',
    cpuCores: 16,
    currentCpuPct: 81.7,
    reportCount: 24,
  },
  {
    id: 'pg-primary',
    name: 'PostgreSQL (payment_db)',
    engine: 'postgres',
    host: 'pg-primary.onepay.internal',
    folderPath: '/app/reports/postgres/',
    status: 'online',
    cpuCores: 8,
    currentCpuPct: 24.5,
    reportCount: 24,
  },
];

export default function DatabaseHubPage() {
  const [selectedDb, setSelectedDb] = useState<DBInstance>(DB_FLEET[0]);
  const [reports, setReports] = useState<any[]>([]);
  const [loadingReports, setLoadingReports] = useState<boolean>(false);
  const [selectedSnapshotFile, setSelectedSnapshotFile] = useState<string>(
    'AWR Rpt - orcl Snap 125190 thru 125191.html'
  );
  const [showChatDrawer, setShowChatDrawer] = useState(false);

  // Fetch reports when database selection changes
  useEffect(() => {
    async function loadReports() {
      setLoadingReports(true);
      try {
        const res = await fetch(`/api/team/databases/reports?db_id=${selectedDb.id}`);
        const data = await res.json();
        if (data.success && data.reports && data.reports.length > 0) {
          setReports(data.reports);
          setSelectedSnapshotFile(data.reports[0].fileName);
        }
      } catch (err) {
        console.error('Failed to load DB reports:', err);
      } finally {
        setLoadingReports(false);
      }
    }
    loadReports();
  }, [selectedDb.id]);

  const fullFilePath = `${selectedDb.folderPath}${selectedSnapshotFile}`;
  const initialAttachments = [
    {
      id: fullFilePath,
      name: selectedSnapshotFile,
      path: fullFilePath,
      type: 'file' as const,
    },
  ];
  const initialInvestigationPrompt = `Hãy phân tích file báo cáo AWR đính kèm của ${selectedDb.name}. Cho tôi biết các câu lệnh SQL ngốn CPU, RAM, I/O nặng nhất và đề xuất phương án tối ưu?`;

  const displayReports = reports.length > 0 ? reports : [
    {
      fileName: 'AWR Rpt - orcl Snap 125190 thru 125191.html',
      timeSlot: '10:00 - 11:00 (Aug 05)',
      status: 'critical',
      topEvent: 'DB CPU (81.7%)',
      hasExecZero: true,
    },
    {
      fileName: 'awrrpt_1_5334_5335.html',
      timeSlot: '09:00 - 10:00 (Aug 05)',
      status: 'warning',
      topEvent: 'db file sequential read',
      hasExecZero: false,
    },
  ];

  return (
    <RequireRole role="team" fallbackHref="/">
      <div className="p-8 max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-forest flex items-center justify-center">
              <Database className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-stone-900 dark:text-white">
                Database Hub & Hourly AWR Browser
              </h1>
              <p className="text-sm text-stone-500">
                Phân tích báo cáo AWR theo từng Database folder tự động xuất 1 tiếng/lần
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowChatDrawer(true)}
              className="flex items-center gap-2 px-4 py-2 bg-forest hover:bg-forest-dark text-white rounded-lg text-sm font-medium transition-colors shadow-sm cursor-pointer"
            >
              <Sparkles className="w-4 h-4" /> Chẩn đoán snapshot với AI Agent
            </button>
          </div>
        </div>

        {/* Database Selector Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {DB_FLEET.map((db) => {
            const isSelected = selectedDb.id === db.id;
            return (
              <button
                key={db.id}
                onClick={() => setSelectedDb(db)}
                className={clsx(
                  'p-5 rounded-xl border text-left transition-all flex items-start justify-between group cursor-pointer',
                  isSelected
                    ? 'border-forest bg-forest/5 dark:bg-forest/10 ring-1 ring-forest'
                    : 'border-stone-200 dark:border-stone-700 hover:border-stone-400 dark:hover:border-stone-600 bg-white dark:bg-stone-800'
                )}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-stone-900 dark:text-white text-lg">
                      {db.name}
                    </span>
                    {db.status === 'warning' && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> High CPU Bottleneck
                      </span>
                    )}
                    {db.status === 'online' && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Healthy
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-stone-500 font-mono flex items-center gap-1">
                    <Folder className="w-3.5 h-3.5 text-forest" /> Dedicated Folder:{' '}
                    <span className="font-semibold text-stone-700 dark:text-stone-300">
                      {db.folderPath}
                    </span>
                  </p>
                  <div className="flex items-center gap-4 text-xs text-stone-400 pt-2">
                    <span>Host: {db.host}</span>
                    <span>•</span>
                    <span>{db.cpuCores} Cores</span>
                    <span>•</span>
                    <span>Auto 1h/report</span>
                  </div>
                </div>
                <Server
                  className={clsx(
                    'w-6 h-6 transition-colors',
                    isSelected ? 'text-forest' : 'text-stone-400'
                  )}
                />
              </button>
            );
          })}
        </div>

        {/* Hourly Snapshot Timeline Browser for Selected DB */}
        <div className="bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-forest" />
              <h2 className="text-base font-semibold text-stone-900 dark:text-white">
                Báo cáo AWR theo giờ trong thư mục <code className="text-forest">{selectedDb.folderPath}</code>
              </h2>
            </div>
            <span className="text-xs text-stone-500 font-mono">Tự động xuất 60 phút/lần</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {displayReports.map((snap, idx) => {
              const active = selectedSnapshotFile === snap.fileName;
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedSnapshotFile(snap.fileName)}
                  className={clsx(
                    'p-3.5 rounded-lg border text-left transition-all cursor-pointer',
                    active
                      ? 'border-forest bg-forest/10 dark:bg-forest/20 ring-1 ring-forest'
                      : 'border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-700/50'
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-stone-900 dark:text-white font-mono">
                      {snap.timeSlot || snap.fileName}
                    </span>
                    {snap.status === 'critical' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 uppercase">
                        High Bottleneck
                      </span>
                    )}
                    {snap.status === 'normal' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 uppercase">
                        Normal
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-stone-500 font-mono truncate">{snap.fileName}</p>
                  <div className="text-xs text-stone-400 font-mono flex items-center justify-between mt-2">
                    <span>Wait: {snap.topEvent || 'DB CPU'}</span>
                    {snap.hasExecZero && (
                      <span className="text-red-500 font-semibold text-[10px]">
                        ⚠️ Execs=0
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* AI Agent Drawer pre-filled with DB folder path & attached snapshot file */}
      <NewInvestigationDrawer
        open={showChatDrawer}
        onClose={() => setShowChatDrawer(false)}
        initialPrompt={initialInvestigationPrompt}
        initialAttachments={initialAttachments}
        autoStart={false}
        onComplete={() => { }}
      />
    </RequireRole>
  );
}
