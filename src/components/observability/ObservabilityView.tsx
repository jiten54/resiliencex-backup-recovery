import React, { useState, useEffect } from 'react';
import {
  Activity,
  CheckCircle2,
  Copy,
  RefreshCw,
  Server,
  Layers,
  ShieldCheck,
  AlertTriangle,
  ExternalLink
} from 'lucide-react';
import { api } from '../../services/api';

export const ObservabilityView: React.FC = () => {
  const [metricsText, setMetricsText] = useState<string>('');
  const [healthLive, setHealthLive] = useState<any>(null);
  const [healthReady, setHealthReady] = useState<any>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const fetchTelemetry = async () => {
    try {
      setIsLoading(true);
      const [metrics, live, ready] = await Promise.all([
        api.monitoring.getMetricsRaw(),
        api.monitoring.getHealthLive(),
        api.monitoring.getHealthReady()
      ]);
      setMetricsText(metrics);
      setHealthLive(live);
      setHealthReady(ready);
    } catch (e: any) {
      console.error('Telemetry fetch failed', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(metricsText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-400" />
            <span>Prometheus Metrics &amp; Health Probes</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time OpenMetrics scrape endpoint at <code className="text-blue-400 font-mono">/metrics</code> and Kubernetes readiness/liveness probes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchTelemetry}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Poll /metrics</span>
          </button>
          <a
            href="/metrics"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded transition-colors"
          >
            <span>Raw Endpoint</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {/* Kubernetes Probe Health Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Liveness Probe */}
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-slate-200">K8s Liveness Probe</span>
              <span className="text-[10px] font-mono text-slate-500">GET /health/live</span>
            </div>
            <div className="mt-2 text-xs font-mono text-slate-300">
              Status: <span className="text-emerald-400 font-bold">{healthLive?.status || 'UP'}</span>
            </div>
            <div className="text-[11px] font-mono text-slate-500 mt-1">
              Timestamp: {healthLive?.timestamp || new Date().toISOString()}
            </div>
          </div>
          <div className="p-2 rounded bg-emerald-950/40 border border-emerald-800/60 text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>

        {/* Readiness Probe */}
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-slate-200">K8s Readiness Probe</span>
              <span className="text-[10px] font-mono text-slate-500">GET /health/ready</span>
            </div>
            <div className="mt-2 text-xs font-mono text-slate-300">
              Status: <span className="text-emerald-400 font-bold">{healthReady?.status || 'READY'}</span>
            </div>
            <div className="text-[11px] font-mono text-slate-400 mt-1">
              Database: <span className="text-emerald-400">{healthReady?.database || 'CONNECTED'}</span> · Storage: <span className="text-emerald-400">{healthReady?.object_storage || 'AVAILABLE'}</span>
            </div>
          </div>
          <div className="p-2 rounded bg-emerald-950/40 border border-emerald-800/60 text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Raw Prometheus Exporter Output Panel */}
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-3">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2 font-mono text-xs text-slate-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-bold text-white">Live OpenMetrics Feed:</span>
            <span className="text-slate-500">Scraped every 5s by Prometheus server</span>
          </div>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded transition-colors"
          >
            <Copy className="h-3 w-3" />
            <span>{copied ? 'Copied!' : 'Copy Stream'}</span>
          </button>
        </div>

        <pre className="p-4 rounded-lg bg-black/80 border border-slate-800/80 font-mono text-xs text-slate-300 overflow-x-auto max-h-[450px] leading-relaxed">
          {metricsText || 'Loading live Prometheus metrics...'}
        </pre>
      </div>
    </div>
  );
};
