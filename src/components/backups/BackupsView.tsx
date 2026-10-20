import React, { useState } from 'react';
import {
  HardDrive,
  UploadCloud,
  FileCheck2,
  FileX2,
  Clock,
  History,
  RotateCcw,
  Trash2,
  AlertTriangle,
  Search,
  Plus,
  CheckCircle2,
  ShieldAlert,
  Flame
} from 'lucide-react';
import { BackupRecord, BackupVersion, RetentionPolicy } from '../../types';

interface BackupsViewProps {
  backups: BackupRecord[];
  retentionPolicies: RetentionPolicy[];
  onUploadBackup: (formData: FormData) => Promise<void>;
  onUploadVersion: (backupId: string, formData: FormData) => Promise<void>;
  onVerifyVersion: (backupId: string, versionId: string) => Promise<void>;
  onCorruptVersion: (backupId: string, versionId: string) => Promise<void>;
  onDeleteBackup: (id: string) => Promise<void>;
  onNavigateToRestore: (backupId: string, versionId: string) => void;
  isLoading: boolean;
}

export const BackupsView: React.FC<BackupsViewProps> = ({
  backups,
  retentionPolicies,
  onUploadBackup,
  onUploadVersion,
  onVerifyVersion,
  onCorruptVersion,
  onDeleteBackup,
  onNavigateToRestore,
  isLoading
}) => {
  const [search, setSearch] = useState('');
  const [selectedBackup, setSelectedBackup] = useState<BackupRecord | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isNewVersionOpen, setIsNewVersionOpen] = useState(false);
  const [activeBackupForVersion, setActiveBackupForVersion] = useState<BackupRecord | null>(null);

  // Form states
  const [backupName, setBackupName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedPolicyId, setSelectedPolicyId] = useState(retentionPolicies[0]?.id || '');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const filteredBackups = backups.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    b.id.toLowerCase().includes(search.toLowerCase()) ||
    (b.description && b.description.toLowerCase().includes(search.toLowerCase()))
  );

  const handleCreateBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!backupName.trim()) return;

    try {
      setIsSubmitting(true);
      const fd = new FormData();
      fd.append('name', backupName.trim());
      fd.append('description', description.trim());
      fd.append('retention_policy_id', selectedPolicyId);
      if (selectedFile) {
        fd.append('file', selectedFile);
      }
      await onUploadBackup(fd);
      setIsUploadOpen(false);
      setBackupName('');
      setDescription('');
      setSelectedFile(null);
      setActionMessage('Backup job queued and assigned to distributed worker.');
      setTimeout(() => setActionMessage(null), 4000);
    } catch (err: any) {
      alert(`Error creating backup: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUploadNewVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBackupForVersion || !selectedFile) return;

    try {
      setIsSubmitting(true);
      const fd = new FormData();
      fd.append('file', selectedFile);
      await onUploadVersion(activeBackupForVersion.id, fd);
      setIsNewVersionOpen(false);
      setSelectedFile(null);
      setActionMessage(`New version queued for ${activeBackupForVersion.name}`);
      setTimeout(() => setActionMessage(null), 4000);
    } catch (err: any) {
      alert(`Failed to add version: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerify = async (backupId: string, versionId: string) => {
    try {
      await onVerifyVersion(backupId, versionId);
      setActionMessage('Integrity verification job dispatched to worker queue.');
      setTimeout(() => setActionMessage(null), 4000);
    } catch (err: any) {
      alert(`Verification failed: ${err.message}`);
    }
  };

  const handleCorrupt = async (backupId: string, versionId: string) => {
    if (!confirm('This test feature injects a bit-flip into the physical storage object to test corruption detection. Proceed?')) {
      return;
    }
    try {
      await onCorruptVersion(backupId, versionId);
      setActionMessage('Object byte-corrupted! Now click "Verify Now" to see ResilienceX detect data corruption.');
      setTimeout(() => setActionMessage(null), 6000);
    } catch (err: any) {
      alert(`Error injecting corruption: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">Backups &amp; Version Management</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Durable object backups with cryptographic SHA-256 hashing, multi-version snapshots, and immutability controls.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsUploadOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-md shadow-sm transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Create Backup Set</span>
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="p-3 rounded-lg border border-blue-500/30 bg-blue-950/40 text-blue-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-blue-400 shrink-0" />
            <span>{actionMessage}</span>
          </div>
          <button onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Filter / Search Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by backup title, ID, or description..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
          />
        </div>
      </div>

      {/* Backup Datatable */}
      <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/60">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-800 bg-slate-950/80 text-slate-400 font-mono">
            <tr>
              <th className="py-3 px-4">Backup Name &amp; Target</th>
              <th className="py-3 px-4">Versions</th>
              <th className="py-3 px-4">Aggregate Size</th>
              <th className="py-3 px-4">Retention Policy</th>
              <th className="py-3 px-4">Latest Integrity</th>
              <th className="py-3 px-4">Last Updated</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {filteredBackups.map(backup => {
              const latest = backup.latest_version;
              const isCorrupted = latest?.verification_status === 'CORRUPTED';
              const isVerified = latest?.verification_status === 'VERIFIED';

              return (
                <tr key={backup.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-100">{backup.name}</div>
                    <div className="text-[11px] font-mono text-slate-400 mt-0.5">{backup.id}</div>
                    {backup.description && (
                      <div className="text-[11px] text-slate-400 mt-1 line-clamp-1">{backup.description}</div>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono">
                    <button
                      onClick={() => setSelectedBackup(backup)}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-blue-400 text-xs transition-colors"
                    >
                      <History className="h-3 w-3" />
                      <span>{backup.version_count || 0} versions</span>
                    </button>
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums text-slate-300">
                    {formatBytes(backup.total_size_bytes)}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-300 text-[11px]">
                    {backup.retention_policy_name || 'Standard'}
                  </td>
                  <td className="py-3 px-4">
                    {latest ? (
                      <div className="flex items-center gap-1.5">
                        {isCorrupted ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-rose-400 font-mono font-medium">
                            <ShieldAlert className="h-3.5 w-3.5" />
                            CORRUPTED
                          </span>
                        ) : isVerified ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-mono font-medium">
                            <FileCheck2 className="h-3.5 w-3.5" />
                            VERIFIED (v{latest.version_number})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 font-mono font-medium">
                            <Clock className="h-3.5 w-3.5" />
                            UNVERIFIED
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-500 font-mono text-[11px]">No versions</span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-400 text-[11px] tabular-nums">
                    {new Date(backup.updated_at).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => {
                          setActiveBackupForVersion(backup);
                          setIsNewVersionOpen(true);
                        }}
                        title="Upload new file version"
                        className="px-2 py-1 text-[11px] font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded transition-colors"
                      >
                        + Version
                      </button>
                      <button
                        onClick={() => setSelectedBackup(backup)}
                        title="Inspect version snapshots"
                        className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
                      >
                        <History className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Permanently delete backup '${backup.name}' and its storage objects?`)) {
                            onDeleteBackup(backup.id);
                          }
                        }}
                        title="Delete backup set"
                        className="p-1.5 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filteredBackups.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-500">
                  No backup sets found matching query. Click "Create Backup Set" to begin.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Version History Drawer / Modal */}
      {selectedBackup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-3xl rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white">Version Snapshots: {selectedBackup.name}</h3>
                <p className="text-xs font-mono text-slate-400 mt-0.5">{selectedBackup.id}</p>
              </div>
              <button
                onClick={() => setSelectedBackup(null)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto my-4 space-y-3 pr-1 flex-1">
              {/* List versions */}
              {selectedBackup.versions && selectedBackup.versions.length > 0 ? (
                selectedBackup.versions.map(ver => (
                  <div
                    key={ver.id}
                    className={`p-4 rounded-lg border transition-colors ${
                      ver.verification_status === 'CORRUPTED'
                        ? 'border-rose-900/60 bg-rose-950/20'
                        : 'border-slate-800 bg-slate-950/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-blue-400">
                            Version {ver.version_number}
                          </span>
                          <span className="text-xs font-medium text-slate-200">
                            {ver.original_filename}
                          </span>
                          <span className="text-xs font-mono text-slate-400">
                            ({formatBytes(ver.file_size_bytes)})
                          </span>
                        </div>
                        <div className="mt-2 font-mono text-[11px] text-slate-400 flex items-center gap-1">
                          <span className="text-slate-500">SHA-256:</span>
                          <span className="text-slate-300 break-all">{ver.sha256_hash}</span>
                        </div>
                        <div className="mt-1 font-mono text-[10px] text-slate-500">
                          Storage Key: {ver.storage_object_key} · Created: {new Date(ver.created_at).toLocaleString()}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {ver.verification_status === 'CORRUPTED' ? (
                          <span className="px-2 py-0.5 text-[10px] font-mono font-bold text-rose-300 bg-rose-500/20 border border-rose-500/40 rounded">
                            CORRUPTED
                          </span>
                        ) : ver.verification_status === 'VERIFIED' ? (
                          <span className="px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-300 bg-emerald-500/20 border border-emerald-500/40 rounded">
                            VERIFIED
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-[10px] font-mono font-bold text-amber-300 bg-amber-500/20 border border-amber-500/40 rounded">
                            UNVERIFIED
                          </span>
                        )}

                        <div className="flex items-center gap-1.5 mt-2">
                          <button
                            onClick={() => handleVerify(selectedBackup.id, ver.id)}
                            className="px-2.5 py-1 text-xs font-medium text-blue-300 bg-blue-900/30 hover:bg-blue-900/50 border border-blue-700/50 rounded transition-colors"
                          >
                            Verify Now
                          </button>
                          <button
                            onClick={() => {
                              setSelectedBackup(null);
                              onNavigateToRestore(selectedBackup.id, ver.id);
                            }}
                            className="px-2.5 py-1 text-xs font-medium text-emerald-300 bg-emerald-900/30 hover:bg-emerald-900/50 border border-emerald-700/50 rounded transition-colors"
                          >
                            Restore
                          </button>
                          <button
                            onClick={() => handleCorrupt(selectedBackup.id, ver.id)}
                            title="Simulate object bit-rot to test corruption prevention"
                            className="p-1 text-amber-400 hover:text-amber-300 rounded border border-amber-800/60 bg-amber-950/30"
                          >
                            <Flame className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-slate-500 text-xs font-mono">
                  No versions available for this backup set yet.
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-800 text-xs text-slate-400">
              <span className="font-mono">Total {selectedBackup.versions?.length || 0} immutable snapshots</span>
              <button
                onClick={() => setSelectedBackup(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Backup Modal */}
      {isUploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">Create New Backup Archive</h3>
            <p className="text-xs text-slate-400 mb-4">
              Registers a backup target and dispatches the initial ingestion job to the distributed worker pool.
            </p>

            <form onSubmit={handleCreateBackup} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Backup Identifier / Name *
                </label>
                <input
                  type="text"
                  required
                  value={backupName}
                  onChange={e => setBackupName(e.target.value)}
                  placeholder="e.g. Postgres WAL Cluster or Customer Vault"
                  className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Operational context, workload source, or compliance tags"
                  className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Retention Policy
                </label>
                <select
                  value={selectedPolicyId}
                  onChange={e => setSelectedPolicyId(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
                >
                  {retentionPolicies.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.keep_versions} versions, {p.retention_days} days)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Attach Initial Data File (Optional)
                </label>
                <div className="border-2 border-dashed border-slate-800 hover:border-slate-700 rounded-lg p-4 text-center cursor-pointer bg-slate-950/40">
                  <input
                    type="file"
                    id="backup-file"
                    className="hidden"
                    onChange={e => {
                      if (e.target.files && e.target.files[0]) {
                        setSelectedFile(e.target.files[0]);
                      }
                    }}
                  />
                  <label htmlFor="backup-file" className="cursor-pointer">
                    <UploadCloud className="h-6 w-6 text-slate-500 mx-auto mb-1" />
                    {selectedFile ? (
                      <span className="text-xs font-mono text-blue-400 font-semibold block">
                        {selectedFile.name} ({formatBytes(selectedFile.size)})
                      </span>
                    ) : (
                      <>
                        <span className="text-xs text-slate-300 block">Click to select file</span>
                        <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                          Calculates SHA-256 hash &amp; stores in object tier
                        </span>
                      </>
                    )}
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsUploadOpen(false)}
                  className="px-3.5 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded disabled:opacity-50"
                >
                  {isSubmitting ? 'Dispatching Job...' : 'Create & Queue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add New Version Modal */}
      {isNewVersionOpen && activeBackupForVersion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">
              Add Version to {activeBackupForVersion.name}
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Select an updated file payload. The distributed worker will verify SHA-256 and commit the new version.
            </p>

            <form onSubmit={handleUploadNewVersion} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  File Payload *
                </label>
                <div className="border-2 border-dashed border-slate-800 hover:border-slate-700 rounded-lg p-4 text-center cursor-pointer bg-slate-950/40">
                  <input
                    type="file"
                    required
                    id="version-file"
                    className="hidden"
                    onChange={e => {
                      if (e.target.files && e.target.files[0]) {
                        setSelectedFile(e.target.files[0]);
                      }
                    }}
                  />
                  <label htmlFor="version-file" className="cursor-pointer">
                    <UploadCloud className="h-6 w-6 text-slate-500 mx-auto mb-1" />
                    {selectedFile ? (
                      <span className="text-xs font-mono text-blue-400 font-semibold block">
                        {selectedFile.name} ({formatBytes(selectedFile.size)})
                      </span>
                    ) : (
                      <span className="text-xs text-slate-300 block">Click to select file</span>
                    )}
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsNewVersionOpen(false)}
                  className="px-3.5 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !selectedFile}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded disabled:opacity-50"
                >
                  {isSubmitting ? 'Uploading...' : 'Queue New Version'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
