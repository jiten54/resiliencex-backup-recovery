# ResilienceX Distributed Systems Architecture & Engineering Decisions

## 1. System Overview

ResilienceX is a distributed, fault-tolerant backup and point-in-time recovery platform modeled after modern enterprise cloud data protection architectures (e.g., Rubrik Cloud Data Management, AWS Backup).

The platform guarantees:
1. **At-Least-Once Execution with Idempotent Commits**: No duplicate committed backup versions upon worker crash or retry.
2. **Lease-Based Mutual Exclusion**: Jobs are claimed via time-bounded leases in PostgreSQL with Compare-And-Swap (CAS) semantics.
3. **Cryptographic Immutability**: All storage payloads are indexed with SHA-256 digests. Pre-flight checks prevent corrupted or tampered data from ever being restored.
4. **Deterministic Failover**: Crashed nodes lose their leases within 12 seconds; orphan jobs are automatically re-queued with exponential backoff and jitter.

---

## 2. Distributed Queueing Architecture & Lease Semantics

### Why Database-Backed Leases over Pure Redis Queues?
In high-integrity data protection platforms, storing job states strictly in an ephemeral in-memory broker risks silent job loss if the broker crashes before completion acknowledgement.

ResilienceX couples **PostgreSQL durable state** with a **Lease Recovery Supervisor**:
- **Lease Acquisition**: A worker executes `UPDATE jobs SET status = 'RUNNING', worker_id = :worker_id, lease_expires_at = NOW() + INTERVAL '15 seconds' WHERE id = :job_id AND (status = 'QUEUED' OR (status = 'RUNNING' AND lease_expires_at < NOW()))`.
- **Atomic Concurrency**: PostgreSQL row-level locks (`FOR UPDATE SKIP LOCKED`) ensure that even with dozens of parallel workers, exactly one worker acquires an exclusive execution lease on a given job.
- **Heartbeat Contract**: Active workers refresh their lease every 3 seconds.
- **Orphan Reclamation**: If a worker crashes, experiences network partition, or is OOM-killed, its lease expires after 15 seconds. The supervisor automatically detects the expired lease, increments `attempt_count`, and triggers retry or routes to the dead-letter queue.

```
       [ Client Request ]
               |
               v
     +-------------------+
     |   FastAPI REST    |
     +-------------------+
               |
               v (Durable Insert)
   +-----------------------+
   | PostgreSQL Job Record | <----+
   | Status: QUEUED        |      |
   +-----------------------+      |
               |                  | (Lease Expired? Re-queue)
     (Atomic CAS Lease)           |
               |                  |
      +--------+--------+         |
      |                 |         |
      v                 v         |
+------------+   +------------+   |
| Worker 1   |   | Worker 2   |   |
| (us-east)  |   | (us-west)  |   |
+------------+   +------------+   |
      | (Crash!)        |         |
      x                 +---------+
```

---

## 3. Idempotent Processing & Duplicate Prevention

When a worker crashes after uploading data to object storage but before marking the job completed in PostgreSQL, the replacement worker will pick up the re-queued job.

To prevent duplicate versions:
1. Every backup execution carries a deterministic **Idempotency Key**.
2. Unique constraint `uq_backup_version_number (backup_id, version_number)` and index `(backup_id, job_id)` in the metadata store enforce that only a single version can be committed for any logical job execution.
3. If a replacement worker encounters an already uploaded object key matching the job ID, it validates the SHA-256 hash and completes the transaction without committing duplicate database versions.

---

## 4. Failure Modes & Resilience Analysis

| Component Failure | Consequence | Mitigation Mechanism |
| :--- | :--- | :--- |
| **Worker Node Crash** | Worker ceases heartbeats mid-job | Lease expires after 15s. Supervisor moves job to `RETRYING` with backoff; another worker resumes. |
| **Network Partition** | Split-brain risk | Atomic database lease prevents old worker from committing if lease expired. |
| **Storage Bit-Rot** | Corrupted object on disk/S3 | Pre-restore SHA-256 validation detects mismatch, marks version `CORRUPTED`, alerts admin, and blocks restore. |
| **PostgreSQL Transient Outage** | Workers cannot acquire new leases | Workers back off gracefully and retain local queues; API returns 503 until connection restores. |
| **Object Store Outage** | Upload/Download failures | Worker increments attempt count and retries up to `max_retries` (3) before dead-lettering. |

---

## 5. Metrics & Observability

ResilienceX exports Prometheus OpenMetrics at `/metrics`:
- `resiliencex_jobs_created_total`
- `resiliencex_jobs_completed_total`
- `resiliencex_jobs_failed_total`
- `resiliencex_jobs_retried_total`
- `resiliencex_queue_depth`
- `resiliencex_jobs_running_current`
- `resiliencex_bytes_processed_total`
- `resiliencex_integrity_failures_total`
- `resiliencex_active_workers`
