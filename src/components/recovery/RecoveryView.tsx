import React, { useState } from 'react';
import {
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
  HardDrive,
  Download,
  CheckCircle2,
  AlertTriangle,
  FolderDown,
  Layers,
  Clock,
  RefreshCw
} from 'lucide-react';
import { BackupRecord, BackupVersion, RecoveryOperation } from '../../types';

interface RecoveryViewProps {
  backups: BackupRecord[];
  recoveryHistory: RecoveryOperation[];
  onInitiateRestore: (backupId: string, versionId: string, destination: string) => Promise<void>;
  onRefresh: () => void;
  isLoading: boolean;
  preselectedBackupId?: string;
  preselectedVersionId?: string;
}

export const RecoveryView: React.FC<RecoveryViewProps> = ({
  backups,
  recoveryHistory,
  onInitiateRestore,
  onRefresh,
  isLoading,
  preselectedBackupId,
  preselectedVersionId
}) => {
  const [selectedBackupId, setSelectedBackupId] = useState<string>(preselectedBackupId || (backups[0]?.id || ''));
  const [selectedVersionId, setSelectedVersionId] = useState<string>(preselectedVersionId || '');
  const [targetDestination, setTargetDestination] = useState('/mnt/restores/production-node-01');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const currentBackup = backups.find(b => b.id === selectedBackupId);
  const versions = currentBackup?.versions || [];

  // Update selected version if backup changes and version not found
  React.useEffect(() => {
    if (versions.length > 0 && (!selectedVersionId || !versions.some(v => v.id === selectedVersionId))) {
      setSelectedVersionId(versions[0].id);
    }
  }, [selectedBackupId, versions]);

  const selectedVersion = versions.find(v => v.id === selectedVersionId);

  const handleRestoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBackupId || !selectedVersionId) {
      alert('Please select a backup and version snapshot.');
      return;
    }

    if (selectedVersion?.verification_status === 'CORRUPTED') {
      alert('CANNOT RESTORE: This version has failed SHA-256 integrity check and is marked CORRUPTED. Restoring compromised data is prohibited.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onInitiateRestore(selectedBackupId, selectedVersionId, targetDestination);
      setStatusMessage('Recovery operation queued! Pre-restore SHA-256 verification in progress.');
      setTimeout(() => setStatusMessage(null), 5000);
    } catch (err: any) {
      alert(`Recovery initiation failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">Recovery &amp; Restoration Engine</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Atomic point-in-time restores with pre-flight SHA-256 verification and zero-tampering guarantees.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-md transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Poll Restores</span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-950/40 text-emerald-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>{statusMessage}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Main Grid: Restoration Dispatch & Architecture Specs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Restore Request Form */}
        <div className="lg:col-span-2 p-5 rounded-xl border border-slate-800 bg-slate-900/60 space-y-4">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <FolderDown className="h-4 w-4 text-emerald-400" />
            <span>Initiate Point-in-Time File Restore</span>
          </h2>

          <form onSubmit={handleRestoreSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Target Backup Set *
                </label>
                <select
                  value={selectedBackupId}
                  onChange={e => setSelectedBackupId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                >
                  {backups.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.version_count || 0} versions)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Select Snapshot Version *
                </label>
                <select
                  value={selectedVersionId}
                  onChange={e => setSelectedVersionId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                >
                  {versions.map(v => (
                    <option key={v.id} value={v.id}>
                      v{v.version_number} — {v.original_filename} ({formatBytes(v.file_size_bytes)}) [{v.verification_status}]
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Version Metadata & Integrity Pre-check */}
            {selectedVersion && (
              <div className={`p-4 rounded-lg border font-mono text-xs space-y-2 ${
                selectedVersion.verification_status === 'CORRUPTED'
                  ? 'bg-rose-950/30 border-rose-900/60 text-rose-200'
                  : 'bg-slate-950 border-slate-800 text-slate-300'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Pre-Flight Integrity Gate:
                  </span>
                  {selectedVersion.verification_status === 'CORRUPTED' ? (
                    <span className="flex items-center gap-1 text-rose-400 font-bold">
                      <ShieldAlert className="h-4 w-4" />
                      INTEGRITY COMPROMISED (CORRUPTED)
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-emerald-400 font-bold">
                      <ShieldCheck className="h-4 w-4" />
                      INTEGRITY VERIFIED
                    </span>
                  )}
                </div>

                <div className="text-[11px] pt-1">
                  <span className="text-slate-500">Storage Object:</span> {selectedVersion.storage_object_key}
                </div>
                <div className="text-[11px] break-all">
                  <span className="text-slate-500">Expected SHA-256:</span> {selectedVersion.sha256_hash}
                </div>

                {selectedVersion.verification_status === 'CORRUPTED' && (
                  <p className="text-[11px] text-rose-300 font-sans mt-2">
                    Security Policy Alert: ResilienceX will refuse to restore this object because the byte hash does not match immutable metadata.
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Controlled Restore Destination Path *
              </label>
              <input
                type="text"
                required
                value={targetDestination}
                onChange={e => setTargetDestination(e.target.value)}
                placeholder="/mnt/restores/target-path"
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono focus:outline-none focus:border-blue-500"
              />
              <span className="text-[11px] text-slate-500 font-mono mt-1 block">
                Sandboxed isolation prevents directory traversal attacks and unauthorized writes.
              </span>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting || selectedVersion?.verification_status === 'CORRUPTED'}
                className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <FolderDown className="h-4 w-4" />
                <span>{isSubmitting ? 'Dispatching Restore Job...' : 'Execute Verified Restoration'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Right Info Box */}
        <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/60 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
            Recovery Safeguards
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            ResilienceX executes a cryptographic pre-flight check before any file is restored to an active system.
          </p>
          <ul className="space-y-2 text-xs text-slate-400 font-mono">
            <li className="flex items-start gap-2">
              <span className="text-emerald-400">✓</span>
              <span>Atomic payload extraction from object store</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400">✓</span>
              <span>SHA-256 byte comparison before write</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400">✓</span>
              <span>Zero-overwrite safety lock on active versions</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400">✓</span>
              <span>Instant browser download of restored payload</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Restore Operations Audit History */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-white">Restoration Operations Log</h2>

        <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/60">
          <table className="w-full text-left text-xs font-mono">
            <thead className="border-b border-slate-800 bg-slate-950/80 text-slate-400">
              <tr>
                <th className="py-3 px-3">Recovery ID</th>
                <th className="py-3 px-3">File / Version</th>
                <th className="py-3 px-3">Destination</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">SHA-256 Verification</th>
                <th className="py-3 px-3">Timestamp</th>
                <th className="py-3 px-3 text-right">Download Restored File</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {recoveryHistory.map(op => {
                const isCompleted = op.status === 'COMPLETED';
                const isFailed = op.status === 'FAILED';

                return (
                  <tr key={op.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-slate-200">
                      {op.id}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">
                      {op.original_filename} (v{op.version_number})
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 truncate max-w-[150px]">
                      {op.target_destination}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                        isCompleted
                          ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
                          : isFailed
                          ? 'text-rose-400 bg-rose-500/10 border border-rose-500/20'
                          : 'text-blue-400 bg-blue-500/10 border border-blue-500/20 animate-pulse'
                      }`}>
                        {op.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      {op.sha256_verified ? (
                        <span className="text-emerald-400 font-semibold flex items-center gap-1 text-[11px]">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          VERIFIED MATCH
                        </span>
                      ) : isFailed ? (
                        <span className="text-rose-400 font-semibold flex items-center gap-1 text-[11px]">
                          <ShieldAlert className="h-3.5 w-3.5" />
                          HASH MISMATCH
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">Verifying...</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 tabular-nums text-[11px]">
                      {new Date(op.created_at).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {isCompleted ? (
                        <a
                          href={`/api/v1/recovery/${op.id}/download`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-blue-300 bg-blue-900/30 hover:bg-blue-900/60 border border-blue-700/50 rounded transition-colors"
                        >
                          <Download className="h-3 w-3" />
                          <span>Download</span>
                        </a>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {recoveryHistory.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    No recovery operations executed yet. Submit a restore request above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
