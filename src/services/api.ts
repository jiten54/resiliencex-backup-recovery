import {
  User,
  BackupRecord,
  BackupVersion,
  Job,
  WorkerInstance,
  RecoveryOperation,
  RetentionPolicy,
  AuditLog,
  DashboardOverview
} from '../types';

const TOKEN_KEY = 'resiliencex_auth_token';
const USER_KEY = 'resiliencex_auth_user';

export const authStorage = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  setToken: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  getUser: (): User | null => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  },
  setUser: (user: User) => localStorage.setItem(USER_KEY, JSON.stringify(user)),
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
};

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = authStorage.getToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(endpoint, {
    ...options,
    headers
  });

  if (!res.ok) {
    let errorMsg = `Request failed with status ${res.status}`;
    try {
      const errorJson = await res.json();
      errorMsg = errorJson.error || errorJson.message || errorMsg;
    } catch {}
    throw new Error(errorMsg);
  }

  // Handle empty responses
  if (res.status === 204) {
    return {} as T;
  }

  return res.json();
}

export const api = {
  // Authentication
  auth: {
    login: async (email: string, password: string) => {
      const data = await request<{ token: string; user: User }>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      authStorage.setToken(data.token);
      authStorage.setUser(data.user);
      return data;
    },
    register: async (email: string, password: string, name: string) => {
      const data = await request<{ token: string; user: User }>('/api/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, name })
      });
      authStorage.setToken(data.token);
      authStorage.setUser(data.user);
      return data;
    },
    me: async () => {
      return request<User>('/api/v1/auth/me');
    },
    logout: () => {
      authStorage.clear();
    }
  },

  // Dashboard Overview
  dashboard: {
    getOverview: () => request<DashboardOverview>('/api/v1/dashboard/overview')
  },

  // Backups
  backups: {
    list: () => request<BackupRecord[]>('/api/v1/backups'),
    get: (id: string) => request<BackupRecord & { versions: BackupVersion[] }>(`/api/v1/backups/${id}`),
    create: async (formData: FormData) => {
      const token = authStorage.getToken();
      const res = await fetch('/api/v1/backups', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(err.error || 'Upload failed');
      }
      return res.json();
    },
    delete: (id: string) => request<{ message: string }>(`/api/v1/backups/${id}`, { method: 'DELETE' }),
    getVersions: (id: string) => request<BackupVersion[]>(`/api/v1/backups/${id}/versions`),
    createVersion: async (backupId: string, formData: FormData) => {
      const token = authStorage.getToken();
      const res = await fetch(`/api/v1/backups/${backupId}/versions`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Version upload failed' }));
        throw new Error(err.error || 'Version upload failed');
      }
      return res.json();
    },
    verifyVersion: (backupId: string, versionId: string) =>
      request<{ message: string; job: Job }>(`/api/v1/backups/${backupId}/versions/${versionId}/verify`, { method: 'POST' }),
    corruptVersion: (backupId: string, versionId: string) =>
      request<{ message: string; version: BackupVersion }>(`/api/v1/backups/${backupId}/versions/${versionId}/corrupt`, { method: 'POST' })
  },

  // Jobs
  jobs: {
    list: (params?: { status?: string; type?: string; limit?: number }) => {
      const query = new URLSearchParams();
      if (params?.status) query.set('status', params.status);
      if (params?.type) query.set('type', params.type);
      if (params?.limit) query.set('limit', String(params.limit));
      return request<Job[]>(`/api/v1/jobs?${query.toString()}`);
    },
    get: (id: string) => request<Job>(`/api/v1/jobs/${id}`),
    retry: (id: string) => request<{ message: string; job: Job }>(`/api/v1/jobs/${id}/retry`, { method: 'POST' }),
    cancel: (id: string) => request<{ message: string; job: Job }>(`/api/v1/jobs/${id}/cancel`, { method: 'POST' })
  },

  // Recovery
  recovery: {
    list: () => request<RecoveryOperation[]>('/api/v1/recovery'),
    get: (id: string) => request<RecoveryOperation>(`/api/v1/recovery/${id}`),
    initiate: (backup_id: string, version_id: string, target_destination?: string) =>
      request<{ recovery: RecoveryOperation; job: Job }>('/api/v1/recovery', {
        method: 'POST',
        body: JSON.stringify({ backup_id, version_id, target_destination })
      }),
    downloadUrl: (id: string) => `/api/v1/recovery/${id}/download`
  },

  // Workers
  workers: {
    list: () => request<WorkerInstance[]>('/api/v1/workers'),
    crash: (id: string) => request<{ message: string; worker: WorkerInstance }>(`/api/v1/workers/${id}/crash`, { method: 'POST' }),
    revive: (id: string) => request<{ message: string; worker: WorkerInstance }>(`/api/v1/workers/${id}/revive`, { method: 'POST' }),
    spawn: () => request<{ worker: WorkerInstance }>('/api/v1/workers/spawn', { method: 'POST' })
  },

  // Settings & Retention
  retention: {
    list: () => request<RetentionPolicy[]>('/api/v1/settings/retention'),
    create: (data: { name: string; keep_versions: number; retention_days: number }) =>
      request<RetentionPolicy>('/api/v1/settings/retention', {
        method: 'POST',
        body: JSON.stringify(data)
      }),
    runCleanup: () => request<{ message: string; jobs: Job[] }>('/api/v1/retention/run-cleanup', { method: 'POST' })
  },

  // Audit Logs
  audit: {
    list: () => request<AuditLog[]>('/api/v1/audit')
  },

  // Raw Prometheus metrics and health checks
  monitoring: {
    getMetricsRaw: async () => {
      const res = await fetch('/metrics');
      return res.text();
    },
    getHealthLive: async () => {
      const res = await fetch('/health/live');
      return res.json();
    },
    getHealthReady: async () => {
      const res = await fetch('/health/ready');
      return res.json();
    }
  }
};
