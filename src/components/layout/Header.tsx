import React from 'react';
import { Shield, Server, Activity, User as UserIcon, LogOut, CheckCircle2, AlertTriangle } from 'lucide-react';
import { User } from '../../types';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentUser: User | null;
  onLogout: () => void;
  onOpenAuth: () => void;
  workerCount: number;
  unhealthyWorkers: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  currentUser,
  onLogout,
  onOpenAuth,
  workerCount,
  unhealthyWorkers
}) => {
  const navItems = [
    { id: 'overview', label: 'Overview' },
    { id: 'backups', label: 'Backups & Versions' },
    { id: 'jobs', label: 'Distributed Queue' },
    { id: 'workers', label: 'Worker Fleet' },
    { id: 'recovery', label: 'Recovery Engine' },
    { id: 'failure-demo', label: 'Fault Tolerance Lab' },
    { id: 'observability', label: 'Prometheus & Metrics' },
    { id: 'settings', label: 'Retention & Storage' }
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-950/95 backdrop-blur-md">
      <div className="flex items-center justify-between gap-6 px-6 py-3.5">
        {/* Zone 1: Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600/20 border border-blue-500/40 text-blue-400">
            <Shield className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-base font-bold tracking-tight text-white whitespace-nowrap">
              ResilienceX
            </span>
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
              Distributed Backup Engine
            </span>
          </div>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden xl:flex items-center gap-1 overflow-x-auto py-1">
          {navItems.map(item => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-900'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Cluster Health & User Action */}
        <div className="flex items-center gap-4 shrink-0">
          {/* Cluster Status Indicator */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-md border border-slate-800 bg-slate-900/60 text-xs text-slate-300">
            {unhealthyWorkers > 0 ? (
              <>
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-amber-300 font-mono text-[11px]">
                  DEGRADED ({unhealthyWorkers} Offline)
                </span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-slate-300 font-mono text-[11px]">
                  CLUSTER NOMINAL ({workerCount} Nodes)
                </span>
              </>
            )}
          </div>

          {/* User profile / Auth button */}
          {currentUser ? (
            <div className="flex items-center gap-3 pl-2 border-l border-slate-800">
              <div className="flex flex-col items-end">
                <span className="text-xs font-medium text-slate-200">{currentUser.name}</span>
                <span className="text-[10px] font-mono text-slate-400 uppercase">{currentUser.role}</span>
              </div>
              <button
                onClick={onLogout}
                title="Sign out"
                className="p-1.5 rounded-md text-slate-400 hover:text-red-400 hover:bg-slate-900 transition-colors"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-md transition-colors"
            >
              Sign In
            </button>
          )}
        </div>
      </div>

      {/* Mobile/Tablet Secondary Nav Bar */}
      <div className="xl:hidden flex items-center gap-1 overflow-x-auto px-4 py-2 border-t border-slate-900 bg-slate-950/80">
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap transition-colors ${
              activeTab === item.id
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </header>
  );
};
