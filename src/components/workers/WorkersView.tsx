import React from 'react';
import {
  Server,
  Activity,
  AlertTriangle,
  Plus,
  RefreshCw,
  PowerOff,
  RotateCcw,
  Cpu,
  Clock,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import { WorkerInstance } from '../../types';

interface WorkersViewProps {
  workers: WorkerInstance[];
  onCrashWorker: (id: string) => Promise<void>;
  onReviveWorker: (id: string) => Promise<void>;
  onSpawnWorker: () => Promise<void>;
  onRefresh: () => void;
  isLoading: boolean;
}

export const WorkersView: React.FC<WorkersViewProps> = ({
  workers,
  onCrashWorker,
  onReviveWorker,
  onSpawnWorker,
  onRefresh,
  isLoading
}) => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">Distributed Worker Fleet</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Autonomous backup processing nodes. Each worker heartbeats every 3s and acquires atomic 15s execution leases.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-md transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Poll Nodes</span>
          </button>
          <button
            onClick={onSpawnWorker}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-md shadow-sm transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Spawn Worker Node</span>
          </button>
        </div>
      </div>

      {/* Cluster Architecture Banner */}
      <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/40 text-xs text-slate-300 space-y-2">
        <div className="flex items-center gap-2 font-mono font-bold text-slate-200">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <span>Lease-Based Job Claiming &amp; Orphan Protection</span>
        </div>
        <p className="text-slate-400 leading-relaxed">
          In distributed systems, worker crashes must never permanently strand jobs.
          ResilienceX workers acquire atomic PostgreSQL leases with an expiration timestamp.
          If a worker experiences an ungraceful shutdown, OOM kill, or network partition, the central
          Lease Recovery Supervisor detects the expired lease (&gt;12s stale) and safely reschedules the job with exponential backoff.
        </p>
      </div>

      {/* Worker Fleet Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {workers.map(worker => {
          const isCrashed = worker.status === 'CRASHED';
          const isBusy = worker.status === 'BUSY';
          const isOnline = worker.status === 'ONLINE';

          return (
            <div
              key={worker.id}
              className={`rounded-xl border p-5 transition-all flex flex-col justify-between ${
                isCrashed
                  ? 'bg-rose-950/20 border-rose-800/60 shadow-rose-950/10'
                  : isBusy
                  ? 'bg-blue-950/20 border-blue-800/60 shadow-blue-950/10'
                  : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div>
                {/* Node Identity & Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Server className={`h-4 w-4 ${isCrashed ? 'text-rose-400' : isBusy ? 'text-blue-400' : 'text-emerald-400'}`} />
                    <span className="font-mono text-xs font-bold text-slate-100">
                      {worker.id}
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
                      isCrashed
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        : isBusy
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 animate-pulse'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    }`}
                  >
                    {worker.status}
                  </span>
                </div>

                {/* Subtitle / Region */}
                <div className="text-[11px] font-mono text-slate-400 mt-2">
                  Region: <span className="text-slate-300">{worker.region}</span> · Host: <span className="text-slate-300">{worker.hostname}</span>
                </div>

                {/* Metrics Breakdown */}
                <div className="mt-4 space-y-2 pt-3 border-t border-slate-800/80 font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Heartbeat Health:</span>
                    <span className={`font-semibold tabular-nums ${isCrashed ? 'text-rose-400' : 'text-slate-200'}`}>
                      {worker.heartbeat_age_seconds}s ago {isCrashed && '(Stale)'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Jobs Completed:</span>
                    <span className="text-emerald-400 font-semibold tabular-nums">
                      {worker.jobs_completed}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Failures Encountered:</span>
                    <span className={`font-semibold tabular-nums ${worker.jobs_failed > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                      {worker.jobs_failed}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Mean Duration:</span>
                    <span className="text-slate-300 tabular-nums">
                      {worker.avg_processing_duration_ms > 0 ? `${worker.avg_processing_duration_ms}ms` : '—'}
                    </span>
                  </div>
                </div>

                {/* Currently Assigned Job */}
                {worker.current_job_id ? (
                  <div className="mt-4 p-2.5 rounded bg-blue-900/30 border border-blue-700/50">
                    <span className="block text-[10px] font-mono uppercase tracking-wider text-blue-300 font-bold">
                      Active Execution Lease:
                    </span>
                    <span className="block font-mono text-xs text-white mt-0.5 truncate">
                      {worker.current_job_id}
                    </span>
                  </div>
                ) : (
                  <div className="mt-4 p-2 rounded bg-slate-950/40 border border-slate-800 text-[11px] font-mono text-slate-500 text-center">
                    Node idle · polling distributed queue
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                {isCrashed ? (
                  <button
                    onClick={() => onReviveWorker(worker.id)}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-semibold text-emerald-300 bg-emerald-950/50 hover:bg-emerald-900/60 border border-emerald-800/60 rounded transition-colors"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Restart / Revive Node</span>
                  </button>
                ) : (
                  <button
                    onClick={() => onCrashWorker(worker.id)}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-semibold text-rose-300 bg-rose-950/40 hover:bg-rose-900/50 border border-rose-800/60 rounded transition-colors"
                  >
                    <PowerOff className="h-3.5 w-3.5" />
                    <span>Simulate Crash (Fault Test)</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
