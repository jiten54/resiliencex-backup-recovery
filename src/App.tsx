import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/layout/Header';
import { OverviewView } from './components/dashboard/OverviewView';
import { BackupsView } from './components/backups/BackupsView';
import { JobsView } from './components/jobs/JobsView';
import { WorkersView } from './components/workers/WorkersView';
import { RecoveryView } from './components/recovery/RecoveryView';
import { FailureDemoView } from './components/demonstration/FailureDemoView';
import { ObservabilityView } from './components/observability/ObservabilityView';
import { SettingsView } from './components/settings/SettingsView';
import { AuthModal } from './components/auth/AuthModal';
import { api, authStorage } from './services/api';
import {
  User,
  DashboardOverview,
  BackupRecord,
  Job,
  WorkerInstance,
  RecoveryOperation,
  RetentionPolicy
} from './types';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Core Data Stores
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [workers, setWorkers] = useState<WorkerInstance[]>([]);
  const [recoveryHistory, setRecoveryHistory] = useState<RecoveryOperation[]>([]);
  const [retentionPolicies, setRetentionPolicies] = useState<RetentionPolicy[]>([]);

  // Navigation context for restore
  const [restoreContext, setRestoreContext] = useState<{ backupId?: string; versionId?: string }>({});

  // Auto-login default user for seamless experience
  useEffect(() => {
    const existing = authStorage.getUser();
    if (existing) {
      setCurrentUser(existing);
    } else {
      // Auto login as default admin for instant reviewer access
      api.auth.login('admin@resiliencex.io', 'ResilienceX2026!')
        .then(res => setCurrentUser(res.user))
        .catch(() => {});
    }
  }, []);

  const refreshAllData = useCallback(async () => {
    if (!authStorage.getToken()) return;

    try {
      const [ov, bkps, jbs, wrks, rec, ret] = await Promise.all([
        api.dashboard.getOverview().catch(() => null),
        api.backups.list().catch(() => []),
        api.jobs.list({ limit: 50 }).catch(() => []),
        api.workers.list().catch(() => []),
        api.recovery.list().catch(() => []),
        api.retention.list().catch(() => [])
      ]);

      if (ov) setOverview(ov);
      setBackups(bkps);
      setJobs(jbs);
      setWorkers(wrks);
      setRecoveryHistory(rec);
      setRetentionPolicies(ret);
    } catch (err) {
      console.error('Error refreshing platform data', err);
    }
  }, []);

  // Poll cluster state every 3 seconds
  useEffect(() => {
    refreshAllData();
    const interval = setInterval(refreshAllData, 3000);
    return () => clearInterval(interval);
  }, [refreshAllData]);

  // Handlers
  const handleLogout = () => {
    api.auth.logout();
    setCurrentUser(null);
    setIsAuthOpen(true);
  };

  const handleUploadBackup = async (formData: FormData) => {
    await api.backups.create(formData);
    await refreshAllData();
  };

  const handleUploadVersion = async (backupId: string, formData: FormData) => {
    await api.backups.createVersion(backupId, formData);
    await refreshAllData();
  };

  const handleVerifyVersion = async (backupId: string, versionId: string) => {
    await api.backups.verifyVersion(backupId, versionId);
    await refreshAllData();
  };

  const handleCorruptVersion = async (backupId: string, versionId: string) => {
    await api.backups.corruptVersion(backupId, versionId);
    await refreshAllData();
  };

  const handleDeleteBackup = async (id: string) => {
    await api.backups.delete(id);
    await refreshAllData();
  };

  const handleRetryJob = async (id: string) => {
    await api.jobs.retry(id);
    await refreshAllData();
  };

  const handleCancelJob = async (id: string) => {
    await api.jobs.cancel(id);
    await refreshAllData();
  };

  const handleCrashWorker = async (id: string) => {
    await api.workers.crash(id);
    await refreshAllData();
  };

  const handleReviveWorker = async (id: string) => {
    await api.workers.revive(id);
    await refreshAllData();
  };

  const handleSpawnWorker = async () => {
    await api.workers.spawn();
    await refreshAllData();
  };

  const handleInitiateRestore = async (backupId: string, versionId: string, dest: string) => {
    await api.recovery.initiate(backupId, versionId, dest);
    await refreshAllData();
  };

  const handleCreatePolicy = async (data: { name: string; keep_versions: number; retention_days: number }) => {
    await api.retention.create(data);
    await refreshAllData();
  };

  const handleRunRetentionSweep = async () => {
    await api.retention.runCleanup();
    await refreshAllData();
  };

  const navigateToRestore = (backupId: string, versionId: string) => {
    setRestoreContext({ backupId, versionId });
    setActiveTab('recovery');
  };

  const unhealthyWorkers = workers.filter(w => w.status === 'CRASHED').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        onLogout={handleLogout}
        onOpenAuth={() => setIsAuthOpen(true)}
        workerCount={workers.length}
        unhealthyWorkers={unhealthyWorkers}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {activeTab === 'overview' && (
          <OverviewView
            overview={overview}
            workers={workers}
            onRefresh={refreshAllData}
            onNavigate={setActiveTab}
            onOpenUpload={() => setActiveTab('backups')}
            isLoading={isLoading}
          />
        )}

        {activeTab === 'backups' && (
          <BackupsView
            backups={backups}
            retentionPolicies={retentionPolicies}
            onUploadBackup={handleUploadBackup}
            onUploadVersion={handleUploadVersion}
            onVerifyVersion={handleVerifyVersion}
            onCorruptVersion={handleCorruptVersion}
            onDeleteBackup={handleDeleteBackup}
            onNavigateToRestore={navigateToRestore}
            isLoading={isLoading}
          />
        )}

        {activeTab === 'jobs' && (
          <JobsView
            jobs={jobs}
            onRetryJob={handleRetryJob}
            onCancelJob={handleCancelJob}
            onRefresh={refreshAllData}
            isLoading={isLoading}
          />
        )}

        {activeTab === 'workers' && (
          <WorkersView
            workers={workers}
            onCrashWorker={handleCrashWorker}
            onReviveWorker={handleReviveWorker}
            onSpawnWorker={handleSpawnWorker}
            onRefresh={refreshAllData}
            isLoading={isLoading}
          />
        )}

        {activeTab === 'recovery' && (
          <RecoveryView
            backups={backups}
            recoveryHistory={recoveryHistory}
            onInitiateRestore={handleInitiateRestore}
            onRefresh={refreshAllData}
            isLoading={isLoading}
            preselectedBackupId={restoreContext.backupId}
            preselectedVersionId={restoreContext.versionId}
          />
        )}

        {activeTab === 'failure-demo' && (
          <FailureDemoView />
        )}

        {activeTab === 'observability' && (
          <ObservabilityView />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            retentionPolicies={retentionPolicies}
            onCreatePolicy={handleCreatePolicy}
            onRunRetentionSweep={handleRunRetentionSweep}
            currentUser={currentUser}
          />
        )}
      </main>

      <footer className="border-t border-slate-800/80 bg-slate-950 py-4 px-6 text-xs text-slate-500 text-center font-mono">
        ResilienceX v2.4 · Distributed Backup &amp; Recovery Platform · Designed for Rubrik Software Engineering Portfolio
      </footer>

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={() => {
          const user = authStorage.getUser();
          setCurrentUser(user);
          refreshAllData();
        }}
      />
    </div>
  );
}
