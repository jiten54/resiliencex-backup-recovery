import React from 'react';
import {
  ShieldCheck,
  Server,
  Layers,
  Activity,
  HardDrive,
  CheckCircle,
  AlertOctagon,
  ArrowUpRight,
  RefreshCw,
  Cpu,
  Clock,
  Play
} from 'lucide-react';
import { DashboardOverview, Job, WorkerInstance } from '../../types';

interface OverviewViewProps {
  overview: DashboardOverview | null;
  workers: WorkerInstance[];
  onRefresh: () => void;
  onNavigate: (tab: string) => void;
  onOpenUpload: () => void;
  isLoading: boolean;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  overview,
  workers,
  onRefresh,
  onNavigate,
  onOpenUpload,
  isLoading
}) => {
  if (!overview) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <RefreshCw className="h-5 w-5 animate-spin text-blue-500" />
          <span className="text-sm font-medium">Gathering distributed cluster telemetry...</span>
        </div>
      </div>
    );
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10';
      case 'RUNNING': return 'text-blue-400 border-blue-500/20 bg-blue-500/10 animate-pulse';
      case 'QUEUED': return 'text-amber-400 border-amber-500/20 bg-amber-500/10';
      case 'RETRYING': return 'text-purple-400 border-purple-500/20 bg-purple-500/10';
      case 'FAILED': return 'text-rose-400 border-rose-500/20 bg-rose-500/10';
      default: return 'text-slate-400 border-slate-700 bg-slate-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">Cluster Operations Dashboard</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time status of distributed backup workers, lease supervisors, and cryptographic storage.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-md transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => onNavigate('failure-demo')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-300 bg-amber-950/40 hover:bg-amber-900/40 border border-amber-800/60 rounded-md transition-colors"
          >
            <Play className="h-3.5 w-3.5" />
            <span>Fault Tolerance Lab</span>
          </button>
          <button
            onClick={onOpenUpload}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-md shadow-sm transition-colors"
          >
            <HardDrive className="h-3.5 w-3.5" />
            <span>New Backup Job</span>
          </button>
        </div>
      </div>

      {/* KPI Stat Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Backups */}
        <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Backup Sets</span>
            <HardDrive className="h-4 w-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-white">
            {overview.total_backups}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {overview.total_versions} total versions
          </div>
        </div>

        {/* Queue Depth */}
        <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Queue Depth</span>
            <Layers className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-white">
            {overview.queue_depth}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {overview.running_jobs} actively running
          </div>
        </div>

        {/* Active Workers */}
        <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Worker Fleet</span>
            <Server className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-white">
            {overview.active_workers} <span className="text-xs font-normal text-slate-400">/ {overview.total_workers}</span>
          </div>
          <div className="text-[11px] text-emerald-400 mt-1">
            Independent nodes online
          </div>
        </div>

        {/* Data Integrity */}
        <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Verified Blocks</span>
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-emerald-400">
            {overview.verified_versions}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {overview.corrupted_versions > 0 ? (
              <span className="text-rose-400 font-bold">{overview.corrupted_versions} corrupted detected</span>
            ) : (
              '100% SHA-256 intact'
            )}
          </div>
        </div>

        {/* Success Rate */}
        <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Job Success</span>
            <Activity className="h-4 w-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-white">
            {overview.backup_success_rate_percent}%
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {overview.completed_jobs} done · {overview.failed_jobs} failed
          </div>
        </div>

        {/* Storage Size */}
        <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Object Storage</span>
            <HardDrive className="h-4 w-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-white">
            {formatBytes(overview.storage_utilization_bytes)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            MinIO / S3 tier
          </div>
        </div>
      </div>

      {/* Main 2-Column Split: Active Worker Nodes & Architecture Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Workers Status Panel (Col 1 & 2) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-blue-400" />
              <h2 className="text-sm font-semibold text-white">Distributed Worker Health &amp; Leases</h2>
            </div>
            <button
              onClick={() => onNavigate('workers')}
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium"
            >
              <span>Manage Fleet</span>
              <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {workers.map(worker => {
              const isCrashed = worker.status === 'CRASHED';
              const isBusy = worker.status === 'BUSY';
              return (
                <div
                  key={worker.id}
                  className={`p-3.5 rounded-lg border transition-all ${
                    isCrashed
                      ? 'bg-rose-950/20 border-rose-800/60'
                      : isBusy
                      ? 'bg-blue-950/20 border-blue-800/60'
                      : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-200 truncate">
                      {worker.id}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase ${
                        isCrashed
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : isBusy
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30 animate-pulse'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      }`}
                    >
                      {worker.status}
                    </span>
                  </div>

                  <div className="text-[11px] font-mono text-slate-400 mt-2 truncate">
                    {worker.region} · {worker.hostname}
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Heartbeat:</span>
                    <span className="font-mono tabular-nums text-slate-300">
                      {worker.heartbeat_age_seconds}s ago
                    </span>
                  </div>

                  <div className="mt-1 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Jobs Processed:</span>
                    <span className="font-mono tabular-nums text-slate-300">
                      {worker.jobs_completed}
                    </span>
                  </div>

                  {worker.current_job_id && (
                    <div className="mt-2 p-1.5 rounded bg-blue-900/30 border border-blue-700/40 text-[10px] font-mono text-blue-200 truncate">
                      Processing: {worker.current_job_id}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Recent Distributed Jobs Table */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-slate-400" />
                <h2 className="text-sm font-semibold text-white">Recent Queue Executions</h2>
              </div>
              <button
                onClick={() => onNavigate('jobs')}
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium"
              >
                <span>View All Jobs</span>
                <ArrowUpRight className="h-3 w-3" />
              </button>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/60">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-mono">
                  <tr>
                    <th className="py-2.5 px-3">Job ID</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Worker Node</th>
                    <th className="py-2.5 px-3">Attempt</th>
                    <th className="py-2.5 px-3 text-right">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {overview.recent_jobs.slice(0, 5).map(job => (
                    <tr key={job.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-2 px-3 text-slate-200 font-medium">
                        {job.id}
                      </td>
                      <td className="py-2 px-3 text-slate-300">
                        {job.job_type}
                      </td>
                      <td className="py-2 px-3">
                        <span className={`inline-block px-1.5 py-0.5 rounded border text-[10px] ${getStatusColor(job.status)}`}>
                          {job.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-400">
                        {job.worker_id || '—'}
                      </td>
                      <td className="py-2 px-3 text-slate-300 tabular-nums">
                        {job.attempt_count}/{job.max_retries}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-300 tabular-nums">
                        {job.processing_duration_ms ? `${job.processing_duration_ms}ms` : '—'}
                      </td>
                    </tr>
                  ))}
                  {overview.recent_jobs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-500">
                        No jobs currently recorded in queue
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Platform Architecture & Audit Log */}
        <div className="space-y-4">
          <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/60 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
              Rubrik-Grade Architecture
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              ResilienceX uses durable PostgreSQL job states with lease-based mutual exclusion.
              Workers acquire time-bounded leases. In the event of network partition or worker crash,
              the Lease Recovery Supervisor automatically recovers stranded jobs and reschedules execution with exponential backoff.
            </p>
            <div className="space-y-2 pt-1 font-mono text-[11px] text-slate-400">
              <div className="flex justify-between border-b border-slate-800/80 pb-1">
                <span>Lease Duration:</span>
                <span className="text-slate-200">15 seconds</span>
              </div>
              <div className="flex justify-between border-b border-slate-800/80 pb-1">
                <span>Heartbeat Interval:</span>
                <span className="text-slate-200">3 seconds</span>
              </div>
              <div className="flex justify-between border-b border-slate-800/80 pb-1">
                <span>Integrity Check:</span>
                <span className="text-emerald-400 font-semibold">SHA-256 Hash Digest</span>
              </div>
              <div className="flex justify-between">
                <span>Storage Backend:</span>
                <span className="text-blue-400 font-semibold">MinIO / S3 Object Store</span>
              </div>
            </div>
          </div>

          {/* Audit Log Stream */}
          <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/60">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono mb-3">
              Immutable Cluster Audit Trail
            </h3>
            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              {overview.recent_audit.map(log => (
                <div key={log.id} className="text-xs border-b border-slate-800/60 pb-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-mono text-blue-400 font-semibold">{log.action}</span>
                    <span className="font-mono text-slate-500 text-[10px]">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-slate-300 text-[11px] mt-1 line-clamp-2">
                    {log.details}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
