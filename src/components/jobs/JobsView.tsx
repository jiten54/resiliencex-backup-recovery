import React, { useState } from 'react';
import {
  Layers,
  RotateCcw,
  Ban,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Search,
  Filter,
  RefreshCw,
  Cpu,
  AlertOctagon
} from 'lucide-react';
import { Job, JobStatus, JobType } from '../../types';

interface JobsViewProps {
  jobs: Job[];
  onRetryJob: (id: string) => Promise<void>;
  onCancelJob: (id: string) => Promise<void>;
  onRefresh: () => void;
  isLoading: boolean;
}

export const JobsView: React.FC<JobsViewProps> = ({
  jobs,
  onRetryJob,
  onCancelJob,
  onRefresh,
  isLoading
}) => {
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  const filteredJobs = jobs.filter(j => {
    const matchesStatus = statusFilter === 'ALL' || j.status === statusFilter;
    const matchesType = typeFilter === 'ALL' || j.job_type === typeFilter;
    const matchesSearch =
      j.id.toLowerCase().includes(search.toLowerCase()) ||
      (j.worker_id && j.worker_id.toLowerCase().includes(search.toLowerCase())) ||
      (j.backup_id && j.backup_id.toLowerCase().includes(search.toLowerCase())) ||
      (j.error_details && j.error_details.toLowerCase().includes(search.toLowerCase()));
    return matchesStatus && matchesType && matchesSearch;
  });

  const getStatusBadge = (status: JobStatus) => {
    switch (status) {
      case 'COMPLETED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">COMPLETED</span>;
      case 'RUNNING':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium text-blue-400 bg-blue-500/10 border border-blue-500/20 animate-pulse">RUNNING</span>;
      case 'QUEUED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20">QUEUED</span>;
      case 'RETRYING':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium text-purple-400 bg-purple-500/10 border border-purple-500/20">RETRYING</span>;
      case 'FAILED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20">FAILED</span>;
      case 'CANCELLED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium text-slate-400 bg-slate-800 border border-slate-700">CANCELLED</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium text-slate-400 bg-slate-800">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">Distributed Job State Machine</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Durable PostgreSQL job queue with lease-based mutual exclusion, exponential backoff, and idempotency guarantees.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-md transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Poll Queue</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search Job ID, Worker Node, Error..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
          />
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono">
          {['ALL', 'RUNNING', 'QUEUED', 'RETRYING', 'COMPLETED', 'FAILED'].map(st => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 py-1 rounded transition-colors ${
                statusFilter === st
                  ? 'bg-blue-600 text-white font-medium shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        {/* Type Filter */}
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-md text-slate-200 font-mono focus:outline-none focus:border-blue-500"
        >
          <option value="ALL">All Types</option>
          <option value="BACKUP">BACKUP</option>
          <option value="INTEGRITY_VERIFICATION">INTEGRITY_VERIFICATION</option>
          <option value="RESTORE">RESTORE</option>
          <option value="RETENTION_CLEANUP">RETENTION_CLEANUP</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/60">
        <table className="w-full text-left text-xs font-mono">
          <thead className="border-b border-slate-800 bg-slate-950/80 text-slate-400">
            <tr>
              <th className="py-3 px-3">Job ID</th>
              <th className="py-3 px-3">Type</th>
              <th className="py-3 px-3">Status</th>
              <th className="py-3 px-3">Priority</th>
              <th className="py-3 px-3">Attempts</th>
              <th className="py-3 px-3">Assigned Worker</th>
              <th className="py-3 px-3">Lease Expiry / Duration</th>
              <th className="py-3 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {filteredJobs.map(job => {
              const isEligibleRetry = job.status === 'FAILED' || job.status === 'CANCELLED';
              const isEligibleCancel = job.status === 'QUEUED' || job.status === 'RUNNING' || job.status === 'RETRYING';

              return (
                <tr key={job.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-2.5 px-3">
                    <button
                      onClick={() => setSelectedJob(job)}
                      className="font-semibold text-blue-400 hover:underline text-left block"
                    >
                      {job.id}
                    </button>
                    {job.backup_id && (
                      <span className="text-[10px] text-slate-500 block truncate max-w-[120px]">
                        Target: {job.backup_id}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-slate-300">
                    {job.job_type}
                  </td>
                  <td className="py-2.5 px-3">
                    {getStatusBadge(job.status)}
                  </td>
                  <td className="py-2.5 px-3 tabular-nums text-slate-300">
                    P{job.priority}
                  </td>
                  <td className="py-2.5 px-3 tabular-nums text-slate-300">
                    {job.attempt_count} / {job.max_retries}
                  </td>
                  <td className="py-2.5 px-3 text-slate-400 truncate max-w-[140px]">
                    {job.worker_id ? (
                      <span className="text-slate-200">{job.worker_id}</span>
                    ) : (
                      <span className="text-slate-600 italic">Unassigned</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 tabular-nums text-slate-400 text-[11px]">
                    {job.status === 'RUNNING' && job.lease_expires_at ? (
                      <span className="text-blue-300">
                        Expires in {Math.max(0, Math.round((new Date(job.lease_expires_at).getTime() - Date.now()) / 1000))}s
                      </span>
                    ) : job.processing_duration_ms ? (
                      <span className="text-slate-300">{job.processing_duration_ms}ms</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {isEligibleRetry && (
                        <button
                          onClick={() => onRetryJob(job.id)}
                          title="Manually retry failed job"
                          className="px-2 py-1 text-[11px] font-medium text-amber-300 bg-amber-950/40 hover:bg-amber-900/50 border border-amber-800/60 rounded flex items-center gap-1 transition-colors"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>Retry</span>
                        </button>
                      )}
                      {isEligibleCancel && (
                        <button
                          onClick={() => onCancelJob(job.id)}
                          title="Cancel queued or running job"
                          className="px-2 py-1 text-[11px] font-medium text-rose-300 bg-rose-950/40 hover:bg-rose-900/50 border border-rose-800/60 rounded flex items-center gap-1 transition-colors"
                        >
                          <Ban className="h-3 w-3" />
                          <span>Cancel</span>
                        </button>
                      )}
                      <button
                        onClick={() => setSelectedJob(job)}
                        className="px-2 py-1 text-[11px] text-slate-400 hover:text-white rounded hover:bg-slate-800"
                      >
                        Inspect
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filteredJobs.length === 0 && (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-500">
                  No jobs found matching the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Inspect Job Drawer / Modal */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-blue-400" />
                <h3 className="text-base font-bold text-white font-mono">{selectedJob.id}</h3>
              </div>
              <button
                onClick={() => setSelectedJob(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="my-4 space-y-3 font-mono text-xs">
              <div className="grid grid-cols-2 gap-2 text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div>
                  <span className="text-slate-500 block text-[10px]">JOB TYPE:</span>
                  <span className="font-semibold text-white">{selectedJob.job_type}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">CURRENT STATUS:</span>
                  <div>{getStatusBadge(selectedJob.status)}</div>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">ASSIGNED WORKER:</span>
                  <span>{selectedJob.worker_id || 'None (Queue)'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">ATTEMPTS / MAX:</span>
                  <span>{selectedJob.attempt_count} / {selectedJob.max_retries}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">CREATED AT:</span>
                  <span className="text-[11px]">{new Date(selectedJob.created_at).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">COMPLETED AT:</span>
                  <span className="text-[11px]">
                    {selectedJob.completed_at ? new Date(selectedJob.completed_at).toLocaleString() : 'In Progress'}
                  </span>
                </div>
              </div>

              {selectedJob.error_details && (
                <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-900/60 text-rose-300 text-xs">
                  <span className="font-bold block text-[10px] text-rose-400 uppercase tracking-wider mb-1">
                    Worker Error Diagnostic:
                  </span>
                  <span className="font-mono">{selectedJob.error_details}</span>
                </div>
              )}

              {selectedJob.idempotency_key && (
                <div className="text-[11px] text-slate-400">
                  <span className="text-slate-500">Idempotency Key:</span> {selectedJob.idempotency_key}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-800">
              <button
                onClick={() => setSelectedJob(null)}
                className="px-4 py-1.5 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
