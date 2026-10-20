import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Shield,
  Layers,
  Database,
  Calendar,
  CheckCircle2,
  Trash2,
  Plus,
  Play,
  HardDrive,
  Globe,
  Radio,
  ExternalLink,
  Save,
  RotateCcw
} from 'lucide-react';
import { RetentionPolicy, User } from '../../types';
import { api, getApiBaseUrl, setApiBaseUrl } from '../../services/api';

interface SettingsViewProps {
  retentionPolicies: RetentionPolicy[];
  onCreatePolicy: (data: { name: string; keep_versions: number; retention_days: number }) => Promise<void>;
  onRunRetentionSweep: () => Promise<void>;
  currentUser: User | null;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  retentionPolicies,
  onCreatePolicy,
  onRunRetentionSweep,
  currentUser
}) => {
  const [isAddingPolicy, setIsAddingPolicy] = useState(false);
  const [name, setName] = useState('');
  const [keepVersions, setKeepVersions] = useState(5);
  const [retentionDays, setRetentionDays] = useState(30);
  const [sweepMessage, setSweepMessage] = useState<string | null>(null);
  const [isSweeping, setIsSweeping] = useState(false);

  // Cloud Backend & Vercel Connection State
  const [backendUrl, setBackendUrl] = useState(getApiBaseUrl());
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'connected' | 'failed'>('idle');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [saveBanner, setSaveBanner] = useState<string | null>(null);

  useEffect(() => {
    // Initial connection test
    testBackendPing();
  }, []);

  const testBackendPing = async () => {
    setConnectionStatus('testing');
    const start = performance.now();
    try {
      const isOk = await api.connection.testConnection();
      const elapsed = Math.round(performance.now() - start);
      if (isOk) {
        setConnectionStatus('connected');
        setLatencyMs(elapsed);
      } else {
        setConnectionStatus('failed');
        setLatencyMs(null);
      }
    } catch {
      setConnectionStatus('failed');
      setLatencyMs(null);
    }
  };

  const handleSaveBackendUrl = (e: React.FormEvent) => {
    e.preventDefault();
    setApiBaseUrl(backendUrl);
    setSaveBanner('Backend endpoint saved! Testing connection...');
    testBackendPing();
    setTimeout(() => setSaveBanner(null), 4000);
  };

  const handleResetBackendUrl = () => {
    setBackendUrl('');
    setApiBaseUrl('');
    setSaveBanner('Reset to default same-origin / integrated server.');
    testBackendPing();
    setTimeout(() => setSaveBanner(null), 3000);
  };

  const handleAddPolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      await onCreatePolicy({
        name: name.trim(),
        keep_versions: Number(keepVersions),
        retention_days: Number(retentionDays)
      });
      setIsAddingPolicy(false);
      setName('');
      setKeepVersions(5);
      setRetentionDays(30);
    } catch (err: any) {
      alert(`Error creating policy: ${err.message}`);
    }
  };

  const handleSweep = async () => {
    try {
      setIsSweeping(true);
      await onRunRetentionSweep();
      setSweepMessage('Retention cleanup jobs dispatched across all backup sets!');
      setTimeout(() => setSweepMessage(null), 5000);
    } catch (err: any) {
      alert(`Cleanup failed: ${err.message}`);
    } finally {
      setIsSweeping(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Sliders className="h-5 w-5 text-blue-400" />
            <span>Cloud Deployment &amp; Storage Configuration</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure Render backend endpoints, Vercel frontend connectivity, lifecycle retention, and storage adapters.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSweep}
            disabled={isSweeping}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-amber-300 bg-amber-950/40 hover:bg-amber-900/50 border border-amber-800/60 rounded transition-colors"
          >
            <Play className={`h-3.5 w-3.5 ${isSweeping ? 'animate-spin' : ''}`} />
            <span>Run Retention Sweep</span>
          </button>
        </div>
      </div>

      {saveBanner && (
        <div className="p-3 rounded-lg border border-blue-500/30 bg-blue-950/40 text-blue-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-blue-400 shrink-0" />
            <span>{saveBanner}</span>
          </div>
          <button onClick={() => setSaveBanner(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {sweepMessage && (
        <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-950/40 text-amber-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-amber-400 shrink-0" />
            <span>{sweepMessage}</span>
          </div>
          <button onClick={() => setSweepMessage(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Render Backend & Vercel Frontend Connection Manager */}
      <div className="p-5 rounded-xl border border-blue-900/50 bg-gradient-to-br from-slate-900 via-slate-900/90 to-blue-950/30 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Globe className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Vercel &lt;—&gt; Render Cloud Integration</h2>
              <p className="text-xs text-slate-400">
                Connects this frontend (<span className="text-slate-300 font-mono">resiliencex-backup-recovery.vercel.app</span>) to your Render FastAPI backend.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-950 border border-slate-800 font-mono text-xs">
              <span className={`h-2 w-2 rounded-full ${
                connectionStatus === 'connected'
                  ? 'bg-emerald-400 animate-pulse'
                  : connectionStatus === 'testing'
                  ? 'bg-amber-400 animate-ping'
                  : connectionStatus === 'failed'
                  ? 'bg-rose-500'
                  : 'bg-slate-500'
              }`} />
              <span className={
                connectionStatus === 'connected' ? 'text-emerald-400 font-semibold' :
                connectionStatus === 'testing' ? 'text-amber-400' :
                connectionStatus === 'failed' ? 'text-rose-400' : 'text-slate-400'
              }>
                {connectionStatus === 'connected' ? `ONLINE ${latencyMs ? `(${latencyMs}ms)` : ''}` :
                 connectionStatus === 'testing' ? 'CONNECTING...' :
                 connectionStatus === 'failed' ? 'DISCONNECTED' : 'IDLE'}
              </span>
            </div>
            <button
              onClick={testBackendPing}
              disabled={connectionStatus === 'testing'}
              className="px-2.5 py-1 text-xs font-mono text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors"
            >
              Test Ping
            </button>
          </div>
        </div>

        <form onSubmit={handleSaveBackendUrl} className="space-y-3 font-mono text-xs">
          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              Backend API Base URL (Render Web Service):
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={backendUrl}
                onChange={e => setBackendUrl(e.target.value)}
                placeholder="e.g. https://resiliencex-api.onrender.com (or leave empty for relative /api/v1)"
                className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 font-mono"
              />
              <button
                type="submit"
                className="flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded shadow-sm transition-colors whitespace-nowrap"
              >
                <Save className="h-3.5 w-3.5" />
                <span>Save Endpoint</span>
              </button>
              {backendUrl && (
                <button
                  type="button"
                  onClick={handleResetBackendUrl}
                  title="Reset to local/same-origin"
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <span className="text-[11px] text-slate-500 block mt-1">
              Tip: In Vercel Project Settings &gt; Environment Variables, add <code className="text-blue-400 font-bold">VITE_API_BASE_URL=https://your-render-api.onrender.com</code>.
            </span>
          </div>
        </form>
      </div>

      {/* Retention Policies Table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-semibold text-white">Configured Lifecycle Policies</h2>
          </div>
          <button
            onClick={() => setIsAddingPolicy(true)}
            className="flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded transition-colors"
          >
            <Plus className="h-3 w-3" />
            <span>Add Policy</span>
          </button>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/60">
          <table className="w-full text-left text-xs font-mono">
            <thead className="border-b border-slate-800 bg-slate-950/80 text-slate-400">
              <tr>
                <th className="py-3 px-4">Policy Name</th>
                <th className="py-3 px-4">Keep Versions</th>
                <th className="py-3 px-4">Retention Window</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {retentionPolicies.map(policy => (
                <tr key={policy.id} className="hover:bg-slate-800/30">
                  <td className="py-3 px-4 font-semibold text-slate-200">
                    {policy.name}
                  </td>
                  <td className="py-3 px-4 text-slate-300">
                    Max {policy.keep_versions} versions
                  </td>
                  <td className="py-3 px-4 text-slate-300">
                    {policy.retention_days} days
                  </td>
                  <td className="py-3 px-4">
                    {policy.is_default ? (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30">
                        DEFAULT
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400">
                        CUSTOM
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-slate-400 text-[11px]">
                    {new Date(policy.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Storage & Adapter Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* MinIO / S3 Settings */}
        <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/60 space-y-3 font-mono text-xs">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <HardDrive className="h-4 w-4 text-blue-400" />
            <span>Object Storage Configuration</span>
          </div>
          <div className="space-y-2 text-slate-300">
            <div className="flex justify-between border-b border-slate-800/80 pb-1">
              <span className="text-slate-500">Storage Backend:</span>
              <span className="text-emerald-400 font-bold">MinIO / S3 / Local WORM Vault</span>
            </div>
            <div className="flex justify-between border-b border-slate-800/80 pb-1">
              <span className="text-slate-500">Bucket Name:</span>
              <span>resiliencex-vault</span>
            </div>
            <div className="flex justify-between border-b border-slate-800/80 pb-1">
              <span className="text-slate-500">Immutability Lock:</span>
              <span className="text-blue-400">WORM Compliant</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Checksum Algorithm:</span>
              <span className="text-emerald-400 font-bold">SHA-256</span>
            </div>
          </div>
        </div>

        {/* Database & Coordination Settings */}
        <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/60 space-y-3 font-mono text-xs">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <Database className="h-4 w-4 text-purple-400" />
            <span>Distributed Coordination Layer</span>
          </div>
          <div className="space-y-2 text-slate-300">
            <div className="flex justify-between border-b border-slate-800/80 pb-1">
              <span className="text-slate-500">Metadata Datastore:</span>
              <span>PostgreSQL 16 (ACID Leases)</span>
            </div>
            <div className="flex justify-between border-b border-slate-800/80 pb-1">
              <span className="text-slate-500">Messaging Stream:</span>
              <span>Redis 7.2 (Pub/Sub &amp; Queues)</span>
            </div>
            <div className="flex justify-between border-b border-slate-800/80 pb-1">
              <span className="text-slate-500">Supervisor Interval:</span>
              <span>2000 ms</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Orphan Lease Threshold:</span>
              <span className="text-amber-400 font-bold">12 seconds</span>
            </div>
          </div>
        </div>
      </div>

      {/* Add Policy Modal */}
      {isAddingPolicy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-2">Create Retention Policy</h3>

            <form onSubmit={handleAddPolicy} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Policy Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. 90-Day Financial Compliance"
                  className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Maximum Versions Retained *
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  required
                  value={keepVersions}
                  onChange={e => setKeepVersions(Number(e.target.value))}
                  className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Retention Window (Days) *
                </label>
                <input
                  type="number"
                  min={1}
                  max={3650}
                  required
                  value={retentionDays}
                  onChange={e => setRetentionDays(Number(e.target.value))}
                  className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddingPolicy(false)}
                  className="px-3.5 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded"
                >
                  Save Policy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
