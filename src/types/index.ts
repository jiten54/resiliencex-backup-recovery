export type JobType = 'BACKUP' | 'INTEGRITY_VERIFICATION' | 'RESTORE' | 'RETENTION_CLEANUP';
export type JobStatus = 'PENDING' | 'QUEUED' | 'RUNNING' | 'RETRYING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'operator' | 'viewer';
  created_at: string;
}

export interface BackupRecord {
  id: string;
  user_id: string;
  name: string;
  description: string;
  retention_policy_id?: string;
  retention_policy_name?: string;
  version_count?: number;
  total_size_bytes?: number;
  latest_version?: BackupVersion | null;
  created_at: string;
  updated_at: string;
  versions?: BackupVersion[];
}

export interface BackupVersion {
  id: string;
  backup_id: string;
  version_number: number;
  original_filename: string;
  file_size_bytes: number;
  sha256_hash: string;
  storage_object_key: string;
  verification_status: 'UNVERIFIED' | 'VERIFIED' | 'CORRUPTED';
  last_verified_at?: string;
  job_id: string;
  created_at: string;
  metadata?: Record<string, any>;
}

export interface Job {
  id: string;
  user_id: string;
  backup_id?: string;
  version_id?: string;
  job_type: JobType;
  status: JobStatus;
  priority: number;
  attempt_count: number;
  max_retries: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  worker_id?: string;
  lease_expires_at?: string;
  retry_after?: string;
  processing_duration_ms?: number;
  error_details?: string;
  idempotency_key?: string;
  payload?: any;
}

export interface WorkerInstance {
  id: string;
  hostname: string;
  region: string;
  status: 'ONLINE' | 'BUSY' | 'CRASHED' | 'DRAINING';
  last_heartbeat: string;
  heartbeat_age_seconds: number;
  current_job_id?: string;
  jobs_completed: number;
  jobs_failed: number;
  total_processing_duration_ms: number;
  avg_processing_duration_ms: number;
  is_stale: boolean;
  registered_at: string;
}

export interface RecoveryOperation {
  id: string;
  user_id: string;
  backup_id: string;
  backup_name?: string;
  version_id: string;
  version_number?: number;
  original_filename?: string;
  target_destination: string;
  status: 'QUEUED' | 'VERIFYING' | 'RESTORING' | 'COMPLETED' | 'FAILED';
  sha256_verified: boolean;
  restored_file_path?: string;
  error_details?: string;
  job_id: string;
  created_at: string;
  completed_at?: string;
}

export interface RetentionPolicy {
  id: string;
  name: string;
  keep_versions: number;
  retention_days: number;
  is_default: boolean;
  created_at: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details: string;
  correlation_id?: string;
}

export interface DashboardOverview {
  total_backups: number;
  total_versions: number;
  verified_versions: number;
  corrupted_versions: number;
  running_jobs: number;
  queue_depth: number;
  failed_jobs: number;
  completed_jobs: number;
  active_workers: number;
  total_workers: number;
  storage_utilization_bytes: number;
  backup_success_rate_percent: number;
  recent_jobs: Job[];
  recent_audit: AuditLog[];
}
