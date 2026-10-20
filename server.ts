import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Setup directories for persistence & object storage simulation
const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORAGE_DIR = path.join(DATA_DIR, 'storage');
const RESTORES_DIR = path.join(DATA_DIR, 'restores');
const DB_FILE = path.join(DATA_DIR, 'db.json');

[DATA_DIR, STORAGE_DIR, RESTORES_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configure upload handling
const upload = multer({
  dest: path.join(DATA_DIR, 'tmp'),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

if (!fs.existsSync(path.join(DATA_DIR, 'tmp'))) {
  fs.mkdirSync(path.join(DATA_DIR, 'tmp'), { recursive: true });
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Correlation ID & Structured Logging Middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const correlationId = (req.headers['x-correlation-id'] as string) || crypto.randomUUID();
  res.setHeader('x-correlation-id', correlationId);
  (req as any).correlationId = correlationId;
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (!req.path.startsWith('/@') && !req.path.startsWith('/node_modules') && !req.path.includes('.')) {
      // Structured log
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'INFO',
        correlation_id: correlationId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: duration,
        user_agent: req.headers['user-agent'] || 'unknown'
      }));
    }
  });
  next();
});

// TYPES
export type JobType = 'BACKUP' | 'INTEGRITY_VERIFICATION' | 'RESTORE' | 'RETENTION_CLEANUP';
export type JobStatus = 'PENDING' | 'QUEUED' | 'RUNNING' | 'RETRYING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface User {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: 'admin' | 'operator' | 'viewer';
  created_at: string;
}

export interface BackupRecord {
  id: string;
  user_id: string;
  name: string;
  description: string;
  retention_policy_id?: string;
  created_at: string;
  updated_at: string;
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
  priority: number; // 1 (low) to 10 (urgent)
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
  current_job_id?: string;
  jobs_completed: number;
  jobs_failed: number;
  total_processing_duration_ms: number;
  registered_at: string;
}

export interface RecoveryOperation {
  id: string;
  user_id: string;
  backup_id: string;
  version_id: string;
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

// IN-MEMORY / PERSISTENT DATABASE STATE
interface DatabaseState {
  users: User[];
  backups: BackupRecord[];
  versions: BackupVersion[];
  jobs: Job[];
  workers: WorkerInstance[];
  recovery_ops: RecoveryOperation[];
  retention_policies: RetentionPolicy[];
  audit_logs: AuditLog[];
}

function hashPassword(password: string, salt: string = 'resiliencex-salt'): string {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
}

// Load or Seed Initial Database
let db: DatabaseState = {
  users: [],
  backups: [],
  versions: [],
  jobs: [],
  workers: [],
  recovery_ops: [],
  retention_policies: [],
  audit_logs: []
};

function saveDb() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save DB state', err);
  }
}

function initDb() {
  if (fs.existsSync(DB_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
      // Clean up dead leases on boot and set workers online
      db.workers.forEach(w => {
        w.status = 'ONLINE';
        w.last_heartbeat = new Date().toISOString();
        w.current_job_id = undefined;
      });
      console.log('Loaded database state from file and initialized workers to ONLINE');
      return;
    } catch (e) {
      console.error('Error loading db file, re-initializing...', e);
    }
  }

  // Seed default admin and operator
  const adminUser: User = {
    id: 'usr_admin_001',
    email: 'admin@resiliencex.io',
    name: 'Sarah Connor (Rubrik Lead)',
    password_hash: hashPassword('ResilienceX2026!'),
    role: 'admin',
    created_at: new Date(Date.now() - 86400000 * 7).toISOString()
  };

  const devUser: User = {
    id: 'usr_dev_002',
    email: 'jitenmoni8@gmail.com',
    name: 'Jiten Moni',
    password_hash: hashPassword('ResilienceX2026!'),
    role: 'admin',
    created_at: new Date(Date.now() - 86400000 * 5).toISOString()
  };

  db.users.push(adminUser, devUser);

  // Default retention policies
  db.retention_policies.push(
    {
      id: 'ret_prod_default',
      name: 'Production Standard (30 Days / 5 Versions)',
      keep_versions: 5,
      retention_days: 30,
      is_default: true,
      created_at: new Date(Date.now() - 86400000 * 10).toISOString()
    },
    {
      id: 'ret_compliance_archive',
      name: 'Compliance Archive (365 Days / 10 Versions)',
      keep_versions: 10,
      retention_days: 365,
      is_default: false,
      created_at: new Date(Date.now() - 86400000 * 10).toISOString()
    }
  );

  // Default independent worker fleet
  const workersSeed: WorkerInstance[] = [
    {
      id: 'worker-us-east-1a',
      hostname: 'ip-10-0-12-44.ec2.internal',
      region: 'us-east-1',
      status: 'ONLINE',
      last_heartbeat: new Date().toISOString(),
      jobs_completed: 18,
      jobs_failed: 0,
      total_processing_duration_ms: 43200,
      registered_at: new Date(Date.now() - 86400000).toISOString()
    },
    {
      id: 'worker-us-east-1b',
      hostname: 'ip-10-0-12-89.ec2.internal',
      region: 'us-east-1',
      status: 'ONLINE',
      last_heartbeat: new Date().toISOString(),
      jobs_completed: 14,
      jobs_failed: 1,
      total_processing_duration_ms: 38900,
      registered_at: new Date(Date.now() - 86400000).toISOString()
    },
    {
      id: 'worker-us-west-2a',
      hostname: 'ip-10-0-48-12.ec2.internal',
      region: 'us-west-2',
      status: 'ONLINE',
      last_heartbeat: new Date().toISOString(),
      jobs_completed: 11,
      jobs_failed: 0,
      total_processing_duration_ms: 27500,
      registered_at: new Date(Date.now() - 86400000).toISOString()
    }
  ];

  db.workers = workersSeed;

  // Seed sample enterprise backups and versions
  const backup1: BackupRecord = {
    id: 'bkp_postgres_cluster_01',
    user_id: devUser.id,
    name: 'Primary PostgreSQL Cluster Wal-Logs',
    description: 'Hourly WAL archive snapshots for Rubrik distributed datastore demo',
    retention_policy_id: 'ret_prod_default',
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 3).toISOString()
  };

  const backup2: BackupRecord = {
    id: 'bkp_customer_vault_02',
    user_id: devUser.id,
    name: 'Secure Customer Document Vault',
    description: 'Encrypted object archive containing client contracts and identity verifications',
    retention_policy_id: 'ret_prod_default',
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 6).toISOString()
  };

  db.backups.push(backup1, backup2);

  // Write seed physical files to storage
  const sampleData1 = Buffer.from('RESILIENCEX_ENTERPRISE_WAL_SNAPSHOT_SEGMENT_0000000100000002\nLSN: 0/15F8C40\nCOMMIT_TIMESTAMP: 2026-10-19T14:00:00Z\nDATA_BLOCK_INTEGRITY_OK');
  const hash1 = crypto.createHash('sha256').update(sampleData1).digest('hex');
  const objKey1 = `bkp_postgres_cluster_01/v1_wal_segment_01.tar.gz`;
  const fullObjPath1 = path.join(STORAGE_DIR, objKey1);
  fs.mkdirSync(path.dirname(fullObjPath1), { recursive: true });
  fs.writeFileSync(fullObjPath1, sampleData1);

  const sampleData2 = Buffer.from('RESILIENCEX_ENTERPRISE_WAL_SNAPSHOT_SEGMENT_0000000100000003\nLSN: 0/16F9D10\nCOMMIT_TIMESTAMP: 2026-10-20T00:00:00Z\nDATA_BLOCK_INTEGRITY_OK\nREPLICA_CONSISTENCY: VALID');
  const hash2 = crypto.createHash('sha256').update(sampleData2).digest('hex');
  const objKey2 = `bkp_postgres_cluster_01/v2_wal_segment_02.tar.gz`;
  const fullObjPath2 = path.join(STORAGE_DIR, objKey2);
  fs.mkdirSync(path.dirname(fullObjPath2), { recursive: true });
  fs.writeFileSync(fullObjPath2, sampleData2);

  const sampleVault = Buffer.from('CONFIDENTIAL_VAULT_METADATA_BLOCK\nVERSION: 1.4\nSECURITY_TIER: RESTRICTED\nCHECKSUM_VERIFIED: TRUE\nPAYLOAD: [ENCRYPTED_BLOB_RESILIENCEX_002]');
  const hashVault = crypto.createHash('sha256').update(sampleVault).digest('hex');
  const objKeyVault = `bkp_customer_vault_02/v1_contracts_vault.enc`;
  const fullObjPathVault = path.join(STORAGE_DIR, objKeyVault);
  fs.mkdirSync(path.dirname(fullObjPathVault), { recursive: true });
  fs.writeFileSync(fullObjPathVault, sampleVault);

  db.versions.push(
    {
      id: 'ver_wal_001',
      backup_id: backup1.id,
      version_number: 1,
      original_filename: 'wal_segment_01.tar.gz',
      file_size_bytes: sampleData1.length,
      sha256_hash: hash1,
      storage_object_key: objKey1,
      verification_status: 'VERIFIED',
      last_verified_at: new Date(Date.now() - 3600000 * 5).toISOString(),
      job_id: 'job_seed_01',
      created_at: new Date(Date.now() - 86400000).toISOString()
    },
    {
      id: 'ver_wal_002',
      backup_id: backup1.id,
      version_number: 2,
      original_filename: 'wal_segment_02.tar.gz',
      file_size_bytes: sampleData2.length,
      sha256_hash: hash2,
      storage_object_key: objKey2,
      verification_status: 'VERIFIED',
      last_verified_at: new Date(Date.now() - 3600000 * 1).toISOString(),
      job_id: 'job_seed_02',
      created_at: new Date(Date.now() - 3600000 * 3).toISOString()
    },
    {
      id: 'ver_vault_001',
      backup_id: backup2.id,
      version_number: 1,
      original_filename: 'contracts_vault.enc',
      file_size_bytes: sampleVault.length,
      sha256_hash: hashVault,
      storage_object_key: objKeyVault,
      verification_status: 'VERIFIED',
      last_verified_at: new Date(Date.now() - 3600000 * 2).toISOString(),
      job_id: 'job_seed_03',
      created_at: new Date(Date.now() - 3600000 * 6).toISOString()
    }
  );

  saveDb();
}

initDb();

// AUTHENTICATION UTILITY
function createToken(userId: string): string {
  const payload = {
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + (86400 * 7), // 7 days
    iat: Math.floor(Date.now() / 1000)
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function verifyToken(token: string): { sub: string } | null {
  try {
    const payload = JSON.parse(Buffer.from(token, 'base64url').toString('utf-8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid authorization header' });
  }
  const token = authHeader.split(' ')[1];
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Unauthorized: Expired or malformed token' });
  }
  const user = db.users.find(u => u.id === payload.sub);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized: User does not exist' });
  }
  (req as any).user = user;
  next();
}

// PROMETHEUS METRIC COUNTERS
const metricsCounters = {
  jobsCreated: 42,
  jobsCompleted: 38,
  jobsFailed: 2,
  jobsRetried: 6,
  integrityFailures: 0,
  bytesProcessed: 148590204
};

// ==========================================
// DISTRIBUTED WORKER SUPERVISOR & QUEUE SYSTEM
// ==========================================

// Lease Recovery Supervisor: runs every 2 seconds
// Detects expired leases from dead/crashed workers, re-queues or moves to RETRYING
setInterval(() => {
  const now = new Date().getTime();

  // 1. Worker heartbeat staleness detection (if last_heartbeat > 12s, mark as CRASHED/UNAVAILABLE)
  db.workers.forEach(w => {
    const lastHb = new Date(w.last_heartbeat).getTime();
    if (w.status !== 'CRASHED' && now - lastHb > 12000) {
      w.status = 'CRASHED';
      console.log(`[Worker Supervisor] Worker ${w.id} heartbeat expired (>12s). Marked status as CRASHED.`);
      db.audit_logs.unshift({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        user_id: 'system',
        action: 'WORKER_HEARTBEAT_EXPIRED',
        resource_type: 'WORKER',
        resource_id: w.id,
        details: `Worker ${w.id} failed to send heartbeat within lease deadline.`
      });
    }
  });

  // 2. Job Lease Expiration Check
  db.jobs.forEach(job => {
    if (job.status === 'RUNNING' && job.lease_expires_at) {
      const leaseExpiry = new Date(job.lease_expires_at).getTime();
      if (now > leaseExpiry) {
        // Abandoned job detected!
        console.warn(`[Worker Supervisor] Job ${job.id} lease expired from worker ${job.worker_id}. Initiating recovery...`);
        job.attempt_count += 1;
        job.worker_id = undefined;
        job.lease_expires_at = undefined;

        metricsCounters.jobsRetried += 1;

        if (job.attempt_count > job.max_retries) {
          job.status = 'FAILED';
          job.completed_at = new Date().toISOString();
          job.error_details = `Max retries (${job.max_retries}) exceeded after abandoned worker lease.`;
          metricsCounters.jobsFailed += 1;
          console.error(`[Worker Supervisor] Job ${job.id} permanently failed (dead-letter queue).`);
        } else {
          // Exponential backoff with jitter
          const backoffDelayMs = Math.min(30000, Math.pow(2, job.attempt_count) * 1000 + Math.floor(Math.random() * 500));
          job.status = 'RETRYING';
          job.retry_after = new Date(now + backoffDelayMs).toISOString();
          job.error_details = `Recovered from crashed/expired worker lease. Retry attempt ${job.attempt_count}/${job.max_retries} scheduled.`;
        }

        db.audit_logs.unshift({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          user_id: 'system',
          action: 'JOB_LEASE_EXPIRED_RECOVERED',
          resource_type: 'JOB',
          resource_id: job.id,
          details: `Job ${job.id} lease expired. Reassigned to retry state (attempt ${job.attempt_count}).`
        });

        saveDb();
      }
    } else if (job.status === 'RETRYING' && job.retry_after) {
      const retryTime = new Date(job.retry_after).getTime();
      if (now >= retryTime) {
        job.status = 'QUEUED';
        job.retry_after = undefined;
        saveDb();
      }
    }
  });
}, 2000);

// Worker Process Loop: Independent simulated workers pick up QUEUED jobs
setInterval(() => {
  const activeWorkers = db.workers.filter(w => w.status === 'ONLINE');
  if (activeWorkers.length === 0) return;

  // Find next QUEUED job prioritized by priority DESC and created_at ASC
  const queuedJob = db.jobs
    .filter(j => j.status === 'QUEUED')
    .sort((a, b) => b.priority - a.priority || new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];

  if (!queuedJob) return;

  // Pick an idle worker
  const idleWorker = activeWorkers.find(w => !w.current_job_id);
  if (!idleWorker) return;

  // ATOMIC CLAIM: Lease-based claim (15 seconds lease duration)
  const now = Date.now();
  queuedJob.status = 'RUNNING';
  queuedJob.worker_id = idleWorker.id;
  queuedJob.started_at = new Date().toISOString();
  queuedJob.lease_expires_at = new Date(now + 15000).toISOString();

  idleWorker.status = 'BUSY';
  idleWorker.current_job_id = queuedJob.id;
  idleWorker.last_heartbeat = new Date().toISOString();
  saveDb();

  console.log(`[Worker Engine] Worker ${idleWorker.id} acquired lease on Job ${queuedJob.id} (${queuedJob.job_type})`);

  // Execute Job Asynchronously
  const processDuration = 2500 + Math.floor(Math.random() * 1500); // 2.5s - 4.0s realistic time

  setTimeout(() => {
    // Check if worker was killed or job was reassigned/cancelled while running
    const freshJob = db.jobs.find(j => j.id === queuedJob.id);
    const freshWorker = db.workers.find(w => w.id === idleWorker.id);

    if (!freshJob || freshJob.status !== 'RUNNING' || freshJob.worker_id !== idleWorker.id) {
      console.log(`[Worker Engine] Job ${queuedJob.id} was cancelled, expired, or reassigned during execution.`);
      if (freshWorker && freshWorker.current_job_id === queuedJob.id) {
        freshWorker.current_job_id = undefined;
        if (freshWorker.status === 'BUSY') freshWorker.status = 'ONLINE';
        saveDb();
      }
      return;
    }

    if (!freshWorker || freshWorker.status === 'CRASHED') {
      console.log(`[Worker Engine] Worker ${idleWorker.id} was crashed; not committing job completion.`);
      return;
    }

    // Process job types
    try {
      if (freshJob.job_type === 'BACKUP') {
        const payload = freshJob.payload || {};
        const backup = db.backups.find(b => b.id === freshJob.backup_id);
        if (backup && payload.tempPath && fs.existsSync(payload.tempPath)) {
          // Idempotent commit: check if version already committed with this job_id
          const existingVer = db.versions.find(v => v.job_id === freshJob.id);
          if (!existingVer) {
            const nextVersionNum = db.versions.filter(v => v.backup_id === backup.id).length + 1;
            const destKey = `${backup.id}/v${nextVersionNum}_${payload.originalFilename}`;
            const destPath = path.join(STORAGE_DIR, destKey);
            fs.mkdirSync(path.dirname(destPath), { recursive: true });

            fs.copyFileSync(payload.tempPath, destPath);
            const fileBytes = fs.readFileSync(destPath);
            const sha256 = crypto.createHash('sha256').update(fileBytes).digest('hex');

            const newVersion: BackupVersion = {
              id: `ver_${crypto.randomUUID().slice(0, 8)}`,
              backup_id: backup.id,
              version_number: nextVersionNum,
              original_filename: payload.originalFilename,
              file_size_bytes: fileBytes.length,
              sha256_hash: sha256,
              storage_object_key: destKey,
              verification_status: 'VERIFIED',
              last_verified_at: new Date().toISOString(),
              job_id: freshJob.id,
              created_at: new Date().toISOString()
            };

            db.versions.push(newVersion);
            backup.updated_at = new Date().toISOString();
            metricsCounters.bytesProcessed += fileBytes.length;

            try { fs.unlinkSync(payload.tempPath); } catch {}
          }
        }
      } else if (freshJob.job_type === 'INTEGRITY_VERIFICATION') {
        const version = db.versions.find(v => v.id === freshJob.version_id);
        if (version) {
          const filePath = path.join(STORAGE_DIR, version.storage_object_key);
          if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath);
            const actualHash = crypto.createHash('sha256').update(content).digest('hex');
            if (actualHash === version.sha256_hash) {
              version.verification_status = 'VERIFIED';
              version.last_verified_at = new Date().toISOString();
            } else {
              version.verification_status = 'CORRUPTED';
              metricsCounters.integrityFailures += 1;
              freshJob.error_details = `INTEGRITY_FAILURE: Expected ${version.sha256_hash}, found ${actualHash}`;
              throw new Error(freshJob.error_details);
            }
          } else {
            version.verification_status = 'CORRUPTED';
            metricsCounters.integrityFailures += 1;
            throw new Error(`Object not found in storage: ${version.storage_object_key}`);
          }
        }
      } else if (freshJob.job_type === 'RESTORE') {
        const payload = freshJob.payload || {};
        const recoveryOp = db.recovery_ops.find(r => r.job_id === freshJob.id);
        const version = db.versions.find(v => v.id === payload.version_id);

        if (recoveryOp && version) {
          recoveryOp.status = 'VERIFYING';
          const srcPath = path.join(STORAGE_DIR, version.storage_object_key);
          if (!fs.existsSync(srcPath)) {
            throw new Error(`Storage object missing: ${version.storage_object_key}`);
          }
          const content = fs.readFileSync(srcPath);
          const computedHash = crypto.createHash('sha256').update(content).digest('hex');

          if (computedHash !== version.sha256_hash) {
            recoveryOp.status = 'FAILED';
            recoveryOp.sha256_verified = false;
            recoveryOp.error_details = 'Pre-restore SHA-256 hash verification failed! Aborting restore for data safety.';
            metricsCounters.integrityFailures += 1;
            throw new Error(recoveryOp.error_details);
          }

          // Restore to restore directory
          recoveryOp.status = 'RESTORING';
          const restoreTargetDir = path.join(RESTORES_DIR, recoveryOp.id);
          fs.mkdirSync(restoreTargetDir, { recursive: true });
          const restoreFilePath = path.join(restoreTargetDir, version.original_filename);
          fs.writeFileSync(restoreFilePath, content);

          recoveryOp.status = 'COMPLETED';
          recoveryOp.sha256_verified = true;
          recoveryOp.restored_file_path = restoreFilePath;
          recoveryOp.completed_at = new Date().toISOString();
        }
      } else if (freshJob.job_type === 'RETENTION_CLEANUP') {
        // Enforce retention policy
        const backupId = freshJob.backup_id;
        const backup = db.backups.find(b => b.id === backupId);
        if (backup && backup.retention_policy_id) {
          const policy = db.retention_policies.find(p => p.id === backup.retention_policy_id);
          if (policy) {
            const versions = db.versions.filter(v => v.backup_id === backup.id)
              .sort((a, b) => b.version_number - a.version_number);

            if (versions.length > policy.keep_versions) {
              const toRemove = versions.slice(policy.keep_versions);
              toRemove.forEach(ver => {
                // Safety check: is version being restored currently?
                const activeRecovery = db.recovery_ops.find(r => r.version_id === ver.id && (r.status === 'QUEUED' || r.status === 'VERIFYING' || r.status === 'RESTORING'));
                if (!activeRecovery) {
                  // delete physical file
                  const fullPath = path.join(STORAGE_DIR, ver.storage_object_key);
                  try { if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath); } catch {}
                  // remove version record
                  db.versions = db.versions.filter(v => v.id !== ver.id);
                  db.audit_logs.unshift({
                    id: crypto.randomUUID(),
                    timestamp: new Date().toISOString(),
                    user_id: 'system',
                    action: 'RETENTION_PRUNE',
                    resource_type: 'BACKUP_VERSION',
                    resource_id: ver.id,
                    details: `Pruned version ${ver.version_number} of backup ${backup.name} per retention policy ${policy.name}`
                  });
                }
              });
            }
          }
        }
      }

      // Mark Job Successful
      freshJob.status = 'COMPLETED';
      freshJob.completed_at = new Date().toISOString();
      freshJob.processing_duration_ms = processDuration;
      metricsCounters.jobsCompleted += 1;

      freshWorker.jobs_completed += 1;
      freshWorker.total_processing_duration_ms += processDuration;
    } catch (err: any) {
      console.error(`[Worker Engine] Error executing job ${freshJob.id}:`, err);
      freshJob.attempt_count += 1;
      if (freshJob.attempt_count > freshJob.max_retries) {
        freshJob.status = 'FAILED';
        freshJob.completed_at = new Date().toISOString();
        freshJob.error_details = err.message || 'Execution error';
        metricsCounters.jobsFailed += 1;
      } else {
        freshJob.status = 'RETRYING';
        freshJob.retry_after = new Date(Date.now() + 4000).toISOString();
        freshJob.error_details = err.message || 'Execution error';
        metricsCounters.jobsRetried += 1;
      }
      freshWorker.jobs_failed += 1;
    } finally {
      freshWorker.current_job_id = undefined;
      freshWorker.status = 'ONLINE';
      freshWorker.last_heartbeat = new Date().toISOString();
      saveDb();
    }
  }, processDuration);
}, 1000);

// Heartbeat emitter for simulated active workers (every 3s)
setInterval(() => {
  db.workers.forEach(w => {
    if (w.status !== 'CRASHED') {
      w.last_heartbeat = new Date().toISOString();
    }
  });
}, 3000);

// ==========================================
// REST API ROUTES (/api/v1)
// ==========================================

// --- AUTHENTICATION ---
app.post('/api/v1/auth/register', (req: Request, res: Response) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password, and name are required' });
  }

  if (db.users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: 'User with this email already exists' });
  }

  const newUser: User = {
    id: `usr_${crypto.randomUUID().slice(0, 8)}`,
    email: email.toLowerCase(),
    name,
    password_hash: hashPassword(password),
    role: db.users.length === 0 ? 'admin' : 'operator',
    created_at: new Date().toISOString()
  };

  db.users.push(newUser);
  saveDb();

  const token = createToken(newUser.id);
  res.status(201).json({
    token,
    user: {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      created_at: newUser.created_at
    }
  });
});

app.post('/api/v1/auth/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user || user.password_hash !== hashPassword(password)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = createToken(user.id);
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      created_at: user.created_at
    }
  });
});

app.get('/api/v1/auth/me', authMiddleware, (req: Request, res: Response) => {
  const user = (req as any).user as User;
  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    created_at: user.created_at
  });
});

// --- BACKUPS & VERSIONS ---
app.get('/api/v1/backups', authMiddleware, (req: Request, res: Response) => {
  const user = (req as any).user as User;
  // Role based filtering: admins see all, operators see their own
  const backups = user.role === 'admin' ? db.backups : db.backups.filter(b => b.user_id === user.id);

  // Enrich with latest version & status
  const enriched = backups.map(b => {
    const versions = db.versions.filter(v => v.backup_id === b.id).sort((a, b) => b.version_number - a.version_number);
    const latestVersion = versions[0];
    const totalSizeBytes = versions.reduce((acc, v) => acc + v.file_size_bytes, 0);
    const policy = db.retention_policies.find(p => p.id === b.retention_policy_id);

    return {
      ...b,
      version_count: versions.length,
      latest_version: latestVersion || null,
      total_size_bytes: totalSizeBytes,
      retention_policy_name: policy?.name || 'Default'
    };
  });

  res.json(enriched);
});

app.post('/api/v1/backups', authMiddleware, upload.single('file'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { name, description, retention_policy_id } = req.body;
  const file = req.file;

  if (!name) {
    return res.status(400).json({ error: 'Backup name is required' });
  }

  const backupId = `bkp_${crypto.randomUUID().slice(0, 8)}`;
  const newBackup: BackupRecord = {
    id: backupId,
    user_id: user.id,
    name,
    description: description || 'User-initiated backup archive',
    retention_policy_id: retention_policy_id || 'ret_prod_default',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  db.backups.unshift(newBackup);

  let initialJob: Job | null = null;

  if (file) {
    // Read file and compute hash
    const fileBytes = fs.readFileSync(file.path);
    const sha256 = crypto.createHash('sha256').update(fileBytes).digest('hex');

    // Create async backup job
    const jobId = `job_${crypto.randomUUID().slice(0, 8)}`;
    initialJob = {
      id: jobId,
      user_id: user.id,
      backup_id: newBackup.id,
      job_type: 'BACKUP',
      status: 'QUEUED',
      priority: 5,
      attempt_count: 0,
      max_retries: 3,
      created_at: new Date().toISOString(),
      idempotency_key: crypto.randomUUID(),
      payload: {
        tempPath: file.path,
        originalFilename: file.originalname,
        sha256
      }
    };
    db.jobs.unshift(initialJob);
    metricsCounters.jobsCreated += 1;
  }

  db.audit_logs.unshift({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    user_id: user.id,
    action: 'BACKUP_CREATED',
    resource_type: 'BACKUP',
    resource_id: newBackup.id,
    details: `Backup '${name}' created. Associated job: ${initialJob?.id || 'none'}`
  });

  saveDb();
  res.status(201).json({ backup: newBackup, job: initialJob });
});

app.get('/api/v1/backups/:id', authMiddleware, (req: Request, res: Response) => {
  const backup = db.backups.find(b => b.id === req.params.id);
  if (!backup) {
    return res.status(404).json({ error: 'Backup not found' });
  }
  const versions = db.versions.filter(v => v.backup_id === backup.id).sort((a, b) => b.version_number - a.version_number);
  res.json({ ...backup, versions });
});

app.delete('/api/v1/backups/:id', authMiddleware, (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const backupIndex = db.backups.findIndex(b => b.id === req.params.id);
  if (backupIndex === -1) {
    return res.status(404).json({ error: 'Backup not found' });
  }

  const backup = db.backups[backupIndex];
  if (user.role !== 'admin' && backup.user_id !== user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Remove versions & physical files
  const versions = db.versions.filter(v => v.backup_id === backup.id);
  versions.forEach(v => {
    const filePath = path.join(STORAGE_DIR, v.storage_object_key);
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
  });

  db.versions = db.versions.filter(v => v.backup_id !== backup.id);
  db.backups.splice(backupIndex, 1);

  db.audit_logs.unshift({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    user_id: user.id,
    action: 'BACKUP_DELETED',
    resource_type: 'BACKUP',
    resource_id: backup.id,
    details: `Backup '${backup.name}' and all associated versions removed`
  });

  saveDb();
  res.json({ message: 'Backup and all associated versions deleted' });
});

app.get('/api/v1/backups/:id/versions', authMiddleware, (req: Request, res: Response) => {
  const versions = db.versions.filter(v => v.backup_id === req.params.id).sort((a, b) => b.version_number - a.version_number);
  res.json(versions);
});

// Create new version for existing backup
app.post('/api/v1/backups/:id/versions', authMiddleware, upload.single('file'), (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const backup = db.backups.find(b => b.id === req.params.id);
  if (!backup) {
    return res.status(404).json({ error: 'Backup not found' });
  }
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'File upload is required to create a new version' });
  }

  const fileBytes = fs.readFileSync(file.path);
  const sha256 = crypto.createHash('sha256').update(fileBytes).digest('hex');

  const jobId = `job_${crypto.randomUUID().slice(0, 8)}`;
  const newJob: Job = {
    id: jobId,
    user_id: user.id,
    backup_id: backup.id,
    job_type: 'BACKUP',
    status: 'QUEUED',
    priority: 6,
    attempt_count: 0,
    max_retries: 3,
    created_at: new Date().toISOString(),
    idempotency_key: crypto.randomUUID(),
    payload: {
      tempPath: file.path,
      originalFilename: file.originalname,
      sha256
    }
  };

  db.jobs.unshift(newJob);
  metricsCounters.jobsCreated += 1;
  saveDb();

  res.status(202).json({ message: 'Backup version job queued', job: newJob });
});

// Trigger on-demand integrity verification job for a backup version
app.post('/api/v1/backups/:id/versions/:ver_id/verify', authMiddleware, (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const version = db.versions.find(v => v.id === req.params.ver_id && v.backup_id === req.params.id);
  if (!version) {
    return res.status(404).json({ error: 'Backup version not found' });
  }

  const jobId = `job_verify_${crypto.randomUUID().slice(0, 8)}`;
  const verifyJob: Job = {
    id: jobId,
    user_id: user.id,
    backup_id: req.params.id,
    version_id: version.id,
    job_type: 'INTEGRITY_VERIFICATION',
    status: 'QUEUED',
    priority: 8,
    attempt_count: 0,
    max_retries: 2,
    created_at: new Date().toISOString()
  };

  db.jobs.unshift(verifyJob);
  metricsCounters.jobsCreated += 1;
  saveDb();

  res.status(202).json({ message: 'Integrity verification job queued', job: verifyJob });
});

// TEST ENDPOINT: Simulate storage object corruption / bit rot
app.post('/api/v1/backups/:id/versions/:ver_id/corrupt', authMiddleware, (req: Request, res: Response) => {
  const version = db.versions.find(v => v.id === req.params.ver_id && v.backup_id === req.params.id);
  if (!version) {
    return res.status(404).json({ error: 'Version not found' });
  }

  const filePath = path.join(STORAGE_DIR, version.storage_object_key);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Physical object not found' });
  }

  // Corrupt by flipping some bytes
  const buffer = fs.readFileSync(filePath);
  buffer[0] = buffer[0] ^ 0xFF;
  fs.writeFileSync(filePath, buffer);

  version.verification_status = 'CORRUPTED';
  metricsCounters.integrityFailures += 1;

  db.audit_logs.unshift({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    user_id: (req as any).user.id,
    action: 'TEST_INJECT_CORRUPTION',
    resource_type: 'STORAGE_OBJECT',
    resource_id: version.storage_object_key,
    details: `Injected bit-flip into storage key ${version.storage_object_key} for fault-tolerance demonstration.`
  });

  saveDb();
  res.json({ message: 'Bit corruption injected successfully into object storage.', version });
});

// --- DISTRIBUTED JOBS API ---
app.get('/api/v1/jobs', authMiddleware, (req: Request, res: Response) => {
  const { status, type, limit = 50 } = req.query;
  let jobs = [...db.jobs];

  if (status && typeof status === 'string' && status !== 'ALL') {
    jobs = jobs.filter(j => j.status === status);
  }
  if (type && typeof type === 'string' && type !== 'ALL') {
    jobs = jobs.filter(j => j.job_type === type);
  }

  jobs = jobs.slice(0, Number(limit));
  res.json(jobs);
});

app.get('/api/v1/jobs/:id', authMiddleware, (req: Request, res: Response) => {
  const job = db.jobs.find(j => j.id === req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
});

app.post('/api/v1/jobs/:id/retry', authMiddleware, (req: Request, res: Response) => {
  const job = db.jobs.find(j => j.id === req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (job.status !== 'FAILED' && job.status !== 'CANCELLED') {
    return res.status(400).json({ error: `Cannot retry job in status ${job.status}` });
  }

  job.status = 'QUEUED';
  job.attempt_count = 0;
  job.worker_id = undefined;
  job.lease_expires_at = undefined;
  job.error_details = undefined;
  job.started_at = undefined;
  job.completed_at = undefined;

  metricsCounters.jobsRetried += 1;

  db.audit_logs.unshift({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    user_id: (req as any).user.id,
    action: 'JOB_MANUAL_RETRY',
    resource_type: 'JOB',
    resource_id: job.id,
    details: `Operator triggered manual retry for Job ${job.id}`
  });

  saveDb();
  res.json({ message: 'Job requeued for processing', job });
});

app.post('/api/v1/jobs/:id/cancel', authMiddleware, (req: Request, res: Response) => {
  const job = db.jobs.find(j => j.id === req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (job.status === 'COMPLETED' || job.status === 'FAILED') {
    return res.status(400).json({ error: `Cannot cancel finished job` });
  }

  job.status = 'CANCELLED';
  job.completed_at = new Date().toISOString();
  job.error_details = 'Cancelled by user';

  // Release worker if assigned
  if (job.worker_id) {
    const worker = db.workers.find(w => w.id === job.worker_id);
    if (worker && worker.current_job_id === job.id) {
      worker.current_job_id = undefined;
      worker.status = 'ONLINE';
    }
  }

  db.audit_logs.unshift({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    user_id: (req as any).user.id,
    action: 'JOB_CANCELLED',
    resource_type: 'JOB',
    resource_id: job.id,
    details: `Operator cancelled job ${job.id}`
  });

  saveDb();
  res.json({ message: 'Job cancelled successfully', job });
});

// --- RECOVERY API ---
app.get('/api/v1/recovery', authMiddleware, (req: Request, res: Response) => {
  const enriched = db.recovery_ops.map(op => {
    const backup = db.backups.find(b => b.id === op.backup_id);
    const version = db.versions.find(v => v.id === op.version_id);
    return {
      ...op,
      backup_name: backup?.name || 'Unknown',
      version_number: version?.version_number || 0,
      original_filename: version?.original_filename || 'unknown'
    };
  });
  res.json(enriched);
});

app.post('/api/v1/recovery', authMiddleware, (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const { backup_id, version_id, target_destination = 'restores/prod-restore' } = req.body;

  if (!backup_id || !version_id) {
    return res.status(400).json({ error: 'backup_id and version_id are required' });
  }

  const backup = db.backups.find(b => b.id === backup_id);
  const version = db.versions.find(v => v.id === version_id && v.backup_id === backup_id);

  if (!backup || !version) {
    return res.status(404).json({ error: 'Backup or version not found' });
  }

  const recoveryId = `rec_${crypto.randomUUID().slice(0, 8)}`;
  const jobId = `job_restore_${crypto.randomUUID().slice(0, 8)}`;

  const recoveryOp: RecoveryOperation = {
    id: recoveryId,
    user_id: user.id,
    backup_id,
    version_id,
    target_destination,
    status: 'QUEUED',
    sha256_verified: false,
    job_id: jobId,
    created_at: new Date().toISOString()
  };

  const restoreJob: Job = {
    id: jobId,
    user_id: user.id,
    backup_id,
    version_id,
    job_type: 'RESTORE',
    status: 'QUEUED',
    priority: 9, // Restores have higher priority
    attempt_count: 0,
    max_retries: 2,
    created_at: new Date().toISOString(),
    payload: {
      recovery_id: recoveryId,
      version_id
    }
  };

  db.recovery_ops.unshift(recoveryOp);
  db.jobs.unshift(restoreJob);
  metricsCounters.jobsCreated += 1;

  db.audit_logs.unshift({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    user_id: user.id,
    action: 'RECOVERY_REQUESTED',
    resource_type: 'RECOVERY',
    resource_id: recoveryId,
    details: `Initiated restore of '${version.original_filename}' v${version.version_number}`
  });

  saveDb();
  res.status(202).json({ recovery: recoveryOp, job: restoreJob });
});

app.get('/api/v1/recovery/:id', authMiddleware, (req: Request, res: Response) => {
  const op = db.recovery_ops.find(r => r.id === req.params.id);
  if (!op) {
    return res.status(404).json({ error: 'Recovery operation not found' });
  }
  const backup = db.backups.find(b => b.id === op.backup_id);
  const version = db.versions.find(v => v.id === op.version_id);
  res.json({ ...op, backup, version });
});

// Download verified restored file
app.get('/api/v1/recovery/:id/download', authMiddleware, (req: Request, res: Response) => {
  const op = db.recovery_ops.find(r => r.id === req.params.id);
  if (!op || op.status !== 'COMPLETED' || !op.restored_file_path) {
    return res.status(404).json({ error: 'Restored file not available or restore incomplete' });
  }

  if (!fs.existsSync(op.restored_file_path)) {
    return res.status(404).json({ error: 'Physical restored file missing from disk' });
  }

  const version = db.versions.find(v => v.id === op.version_id);
  const filename = version ? version.original_filename : 'restored_file';
  res.download(op.restored_file_path, filename);
});

// --- WORKER MANAGEMENT & MONITORING API ---
app.get('/api/v1/workers', authMiddleware, (req: Request, res: Response) => {
  const now = Date.now();
  const enriched = db.workers.map(w => {
    const ageSeconds = Math.max(0, Math.floor((now - new Date(w.last_heartbeat).getTime()) / 1000));
    const avgDuration = w.jobs_completed > 0 ? Math.round(w.total_processing_duration_ms / w.jobs_completed) : 0;
    return {
      ...w,
      heartbeat_age_seconds: ageSeconds,
      avg_processing_duration_ms: avgDuration,
      is_stale: ageSeconds > 10
    };
  });
  res.json(enriched);
});

// Worker Crash Simulation / Freeze endpoint
app.post('/api/v1/workers/:id/crash', authMiddleware, (req: Request, res: Response) => {
  const worker = db.workers.find(w => w.id === req.params.id);
  if (!worker) {
    return res.status(404).json({ error: 'Worker not found' });
  }

  worker.status = 'CRASHED';
  // set heartbeat age back 30 seconds so supervisor immediately detects crash
  worker.last_heartbeat = new Date(Date.now() - 30000).toISOString();

  db.audit_logs.unshift({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    user_id: (req as any).user.id,
    action: 'TEST_WORKER_SIMULATED_CRASH',
    resource_type: 'WORKER',
    resource_id: worker.id,
    details: `Simulated catastrophic crash on worker ${worker.id}. Heartbeat paused.`
  });

  saveDb();
  res.json({ message: `Worker ${worker.id} has been crashed. Lease expiration recovery will engage.`, worker });
});

// Worker Revive / Restart endpoint
app.post('/api/v1/workers/:id/revive', authMiddleware, (req: Request, res: Response) => {
  const worker = db.workers.find(w => w.id === req.params.id);
  if (!worker) {
    return res.status(404).json({ error: 'Worker not found' });
  }

  worker.status = 'ONLINE';
  worker.last_heartbeat = new Date().toISOString();
  worker.current_job_id = undefined;

  db.audit_logs.unshift({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    user_id: (req as any).user.id,
    action: 'WORKER_REVIVED',
    resource_type: 'WORKER',
    resource_id: worker.id,
    details: `Worker ${worker.id} restarted and rejoined cluster.`
  });

  saveDb();
  res.json({ message: `Worker ${worker.id} restored to online status.`, worker });
});

// Register new independent worker
app.post('/api/v1/workers/spawn', authMiddleware, (req: Request, res: Response) => {
  const count = db.workers.length + 1;
  const regions = ['us-east-1', 'us-west-2', 'eu-central-1', 'ap-southeast-1'];
  const region = regions[count % regions.length];

  const newWorker: WorkerInstance = {
    id: `worker-${region}-${Math.random().toString(36).substring(2, 5)}`,
    hostname: `ip-10-0-${Math.floor(Math.random() * 80)}-${Math.floor(Math.random() * 200)}.ec2.internal`,
    region,
    status: 'ONLINE',
    last_heartbeat: new Date().toISOString(),
    jobs_completed: 0,
    jobs_failed: 0,
    total_processing_duration_ms: 0,
    registered_at: new Date().toISOString()
  };

  db.workers.push(newWorker);
  saveDb();
  res.status(201).json({ worker: newWorker });
});

// --- SETTINGS, RETENTION & AUDIT ---
app.get('/api/v1/settings/retention', authMiddleware, (req: Request, res: Response) => {
  res.json(db.retention_policies);
});

app.post('/api/v1/settings/retention', authMiddleware, (req: Request, res: Response) => {
  const { name, keep_versions, retention_days } = req.body;
  if (!name || !keep_versions || !retention_days) {
    return res.status(400).json({ error: 'name, keep_versions, and retention_days required' });
  }

  const newPolicy: RetentionPolicy = {
    id: `ret_${crypto.randomUUID().slice(0, 8)}`,
    name,
    keep_versions: Number(keep_versions),
    retention_days: Number(retention_days),
    is_default: false,
    created_at: new Date().toISOString()
  };

  db.retention_policies.push(newPolicy);
  saveDb();
  res.status(201).json(newPolicy);
});

// Trigger retention cleanup job across backups
app.post('/api/v1/retention/run-cleanup', authMiddleware, (req: Request, res: Response) => {
  const user = (req as any).user as User;
  const queuedJobs: Job[] = [];

  db.backups.forEach(b => {
    const jobId = `job_retention_${crypto.randomUUID().slice(0, 8)}`;
    const job: Job = {
      id: jobId,
      user_id: user.id,
      backup_id: b.id,
      job_type: 'RETENTION_CLEANUP',
      status: 'QUEUED',
      priority: 3,
      attempt_count: 0,
      max_retries: 2,
      created_at: new Date().toISOString()
    };
    db.jobs.unshift(job);
    queuedJobs.push(job);
    metricsCounters.jobsCreated += 1;
  });

  saveDb();
  res.status(202).json({ message: `Triggered ${queuedJobs.length} retention evaluation jobs`, jobs: queuedJobs });
});

app.get('/api/v1/audit', authMiddleware, (req: Request, res: Response) => {
  res.json(db.audit_logs.slice(0, 100));
});

// --- DASHBOARD OVERVIEW METRICS API ---
app.get('/api/v1/dashboard/overview', authMiddleware, (req: Request, res: Response) => {
  const totalBackups = db.backups.length;
  const totalVersions = db.versions.length;
  const verifiedVersions = db.versions.filter(v => v.verification_status === 'VERIFIED').length;
  const corruptedVersions = db.versions.filter(v => v.verification_status === 'CORRUPTED').length;

  const runningJobs = db.jobs.filter(j => j.status === 'RUNNING').length;
  const queuedJobs = db.jobs.filter(j => j.status === 'QUEUED' || j.status === 'RETRYING').length;
  const failedJobs = db.jobs.filter(j => j.status === 'FAILED').length;
  const completedJobs = db.jobs.filter(j => j.status === 'COMPLETED').length;

  const activeWorkers = db.workers.filter(w => w.status === 'ONLINE' || w.status === 'BUSY').length;
  const totalWorkers = db.workers.length;

  const totalStorageBytes = db.versions.reduce((acc, v) => acc + v.file_size_bytes, 0);

  const successRate = (completedJobs + failedJobs) > 0
    ? Math.round((completedJobs / (completedJobs + failedJobs)) * 1000) / 10
    : 100;

  res.json({
    total_backups: totalBackups,
    total_versions: totalVersions,
    verified_versions: verifiedVersions,
    corrupted_versions: corruptedVersions,
    running_jobs: runningJobs,
    queue_depth: queuedJobs,
    failed_jobs: failedJobs,
    completed_jobs: completedJobs,
    active_workers: activeWorkers,
    total_workers: totalWorkers,
    storage_utilization_bytes: totalStorageBytes,
    backup_success_rate_percent: successRate,
    recent_jobs: db.jobs.slice(0, 8),
    recent_audit: db.audit_logs.slice(0, 8)
  });
});

// --- PROMETHEUS METRICS EXPORTER & HEALTH PROBES ---
app.get('/health/live', (req: Request, res: Response) => {
  res.status(200).json({ status: 'UP', timestamp: new Date().toISOString() });
});

app.get('/health/ready', (req: Request, res: Response) => {
  // Checks storage and db accessibility
  const dbOk = fs.existsSync(DATA_DIR);
  const storageOk = fs.existsSync(STORAGE_DIR);
  if (dbOk && storageOk) {
    res.status(200).json({
      status: 'READY',
      database: 'CONNECTED',
      object_storage: 'AVAILABLE',
      active_workers: db.workers.filter(w => w.status !== 'CRASHED').length
    });
  } else {
    res.status(503).json({ status: 'NOT_READY', database: dbOk, storage: storageOk });
  }
});

app.get('/metrics', (req: Request, res: Response) => {
  const queuedCount = db.jobs.filter(j => j.status === 'QUEUED' || j.status === 'RETRYING').length;
  const runningCount = db.jobs.filter(j => j.status === 'RUNNING').length;
  const onlineWorkers = db.workers.filter(w => w.status !== 'CRASHED').length;

  const metrics = `
# HELP resiliencex_jobs_created_total Total distributed jobs submitted
# TYPE resiliencex_jobs_created_total counter
resiliencex_jobs_created_total ${metricsCounters.jobsCreated}

# HELP resiliencex_jobs_completed_total Total distributed jobs processed successfully
# TYPE resiliencex_jobs_completed_total counter
resiliencex_jobs_completed_total ${metricsCounters.jobsCompleted}

# HELP resiliencex_jobs_failed_total Total distributed jobs permanently failed
# TYPE resiliencex_jobs_failed_total counter
resiliencex_jobs_failed_total ${metricsCounters.jobsFailed}

# HELP resiliencex_jobs_retried_total Total retry attempts following failure or expired leases
# TYPE resiliencex_jobs_retried_total counter
resiliencex_jobs_retried_total ${metricsCounters.jobsRetried}

# HELP resiliencex_jobs_running_current Current number of jobs being processed by workers
# TYPE resiliencex_jobs_running_current gauge
resiliencex_jobs_running_current ${runningCount}

# HELP resiliencex_queue_depth Number of jobs pending in distributed queue
# TYPE resiliencex_queue_depth gauge
resiliencex_queue_depth ${queuedCount}

# HELP resiliencex_bytes_processed_total Total bytes compressed and backed up to object storage
# TYPE resiliencex_bytes_processed_total counter
resiliencex_bytes_processed_total ${metricsCounters.bytesProcessed}

# HELP resiliencex_integrity_failures_total Total detected SHA-256 integrity mismatches or bit rot
# TYPE resiliencex_integrity_failures_total counter
resiliencex_integrity_failures_total ${metricsCounters.integrityFailures}

# HELP resiliencex_active_workers Current count of healthy heartbeat workers
# TYPE resiliencex_active_workers gauge
resiliencex_active_workers ${onlineWorkers}
`.trim();

  res.setHeader('Content-Type', 'text/plain; version=0.0.4');
  res.send(metrics);
});

// STARTUP FUNCTION: Mount Vite in development or serve static in production
async function startServer() {
  if (process.env.NODE_ENV === 'production' && fs.existsSync(path.resolve(process.cwd(), 'dist'))) {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(process.cwd(), 'dist/index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[ResilienceX] Server running on http://0.0.0.0:${PORT}`);
    console.log(`[ResilienceX] API endpoints ready at /api/v1/*`);
    console.log(`[ResilienceX] Prometheus metrics available at /metrics`);
    console.log(`[ResilienceX] Health checks at /health/live and /health/ready`);
  });
}

startServer();
