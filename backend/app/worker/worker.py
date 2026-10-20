import os
import sys
import time
import signal
import socket
import logging
import random
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional
from sqlalchemy import create_engine, select, update, and_, or_
from sqlalchemy.orm import sessionmaker, Session
from backend.app.core.config import settings
from backend.app.models.models import (
    Job, JobStatus, JobType, WorkerHeartbeat, WorkerStatus,
    BackupRecord, BackupVersion, VerificationStatus, RecoveryOperation, RetentionPolicy, AuditEvent
)
from backend.app.storage.adapter import get_storage_adapter

logging.basicConfig(
    level=logging.INFO,
    format='{"timestamp":"%(asctime)s","level":"%(levelname)s","worker":"%(name)s","message":"%(message)s"}'
)

class DistributedBackupWorker:
    def __init__(self, worker_id: Optional[str] = None):
        self.hostname = socket.gethostname()
        self.region = settings.AWS_REGION
        self.worker_id = worker_id or os.getenv("WORKER_ID", f"worker-{self.region}-{uuid.uuid4().hex[:6]}")
        self.logger = logging.getLogger(self.worker_id)
        
        self.engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        self.storage = get_storage_adapter()
        
        self.running = True
        self.current_job_id: Optional[str] = None
        self.jobs_completed = 0
        self.jobs_failed = 0
        self.total_duration_ms = 0
        
        # Setup signal traps for graceful shutdown
        signal.signal(signal.SIGINT, self._handle_signal)
        signal.signal(signal.SIGTERM, self._handle_signal)

    def _handle_signal(self, signum, frame):
        self.logger.info("Received termination signal. Draining worker tasks...")
        self.running = False
        self._update_status(WorkerStatus.DRAINING)

    def register_node(self):
        with self.SessionLocal() as db:
            heartbeat = db.query(WorkerHeartbeat).filter_by(worker_id=self.worker_id).first()
            now = datetime.now(timezone.utc)
            if not heartbeat:
                heartbeat = WorkerHeartbeat(
                    worker_id=self.worker_id,
                    hostname=self.hostname,
                    region=self.region,
                    status=WorkerStatus.ONLINE,
                    last_heartbeat=now,
                    registered_at=now
                )
                db.add(heartbeat)
            else:
                heartbeat.status = WorkerStatus.ONLINE
                heartbeat.last_heartbeat = now
                heartbeat.hostname = self.hostname
            db.commit()
            self.logger.info(f"Registered distributed worker node: {self.worker_id}")

    def emit_heartbeat(self):
        with self.SessionLocal() as db:
            db.execute(
                update(WorkerHeartbeat)
                .where(WorkerHeartbeat.worker_id == self.worker_id)
                .values(
                    last_heartbeat=datetime.now(timezone.utc),
                    current_job_id=self.current_job_id,
                    jobs_completed=self.jobs_completed,
                    jobs_failed=self.jobs_failed,
                    total_processing_duration_ms=self.total_duration_ms
                )
            )
            db.commit()

    def _update_status(self, status: WorkerStatus):
        with self.SessionLocal() as db:
            db.execute(
                update(WorkerHeartbeat)
                .where(WorkerHeartbeat.worker_id == self.worker_id)
                .values(status=status, last_heartbeat=datetime.now(timezone.utc))
            )
            db.commit()

    def acquire_job_lease(self) -> Optional[Job]:
        """
        Atomic Compare-And-Swap (CAS) lease claim.
        Claims next eligible QUEUED job or expired lease.
        """
        now = datetime.now(timezone.utc)
        lease_deadline = now + timedelta(seconds=settings.WORKER_LEASE_SECONDS)
        
        with self.SessionLocal() as db:
            # Query candidate jobs ordered by priority DESC, created_at ASC
            candidate = db.query(Job).filter(
                or_(
                    Job.status == JobStatus.QUEUED,
                    and_(
                        Job.status == JobStatus.RUNNING,
                        Job.lease_expires_at < now
                    )
                )
            ).order_by(Job.priority.desc(), Job.created_at.asc()).with_for_update(skip_locked=True).first()
            
            if not candidate:
                return None
                
            # Atomic claim
            candidate.status = JobStatus.RUNNING
            candidate.worker_id = self.worker_id
            candidate.lease_expires_at = lease_deadline
            if not candidate.started_at:
                candidate.started_at = now
                
            db.commit()
            self.logger.info(f"Acquired lease for Job {candidate.id} (Type: {candidate.job_type}, Priority: {candidate.priority})")
            return candidate

    def process_job(self, job: Job):
        start_time = time.time()
        self.current_job_id = job.id
        self._update_status(WorkerStatus.BUSY)
        self.emit_heartbeat()

        try:
            with self.SessionLocal() as db:
                if job.job_type == JobType.BACKUP:
                    self._execute_backup_job(db, job)
                elif job.job_type == JobType.INTEGRITY_VERIFICATION:
                    self._execute_verify_job(db, job)
                elif job.job_type == JobType.RESTORE:
                    self._execute_restore_job(db, job)
                elif job.job_type == JobType.RETENTION_CLEANUP:
                    self._execute_retention_job(db, job)
                    
                duration_ms = int((time.time() - start_time) * 1000)
                
                # Mark completed
                db.execute(
                    update(Job)
                    .where(Job.id == job.id)
                    .values(
                        status=JobStatus.COMPLETED,
                        completed_at=datetime.now(timezone.utc),
                        processing_duration_ms=duration_ms,
                        lease_expires_at=None
                    )
                )
                db.commit()
                
                self.jobs_completed += 1
                self.total_duration_ms += duration_ms
                self.logger.info(f"Job {job.id} successfully completed in {duration_ms}ms")
                
        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            self.logger.error(f"Error executing Job {job.id}: {str(e)}")
            self.jobs_failed += 1
            
            with self.SessionLocal() as db:
                fresh_job = db.query(Job).filter_by(id=job.id).first()
                if fresh_job:
                    fresh_job.attempt_count += 1
                    if fresh_job.attempt_count >= fresh_job.max_retries:
                        fresh_job.status = JobStatus.FAILED
                        fresh_job.completed_at = datetime.now(timezone.utc)
                        fresh_job.error_details = str(e)
                        self.logger.error(f"Job {job.id} reached max retries ({fresh_job.max_retries}). Moved to Dead-Letter state.")
                    else:
                        # Exponential backoff with jitter
                        delay = min(30, (2 ** fresh_job.attempt_count) + random.uniform(0, 1))
                        fresh_job.status = JobStatus.RETRYING
                        fresh_job.retry_after = datetime.now(timezone.utc) + timedelta(seconds=delay)
                        fresh_job.worker_id = None
                        fresh_job.lease_expires_at = None
                        fresh_job.error_details = f"Attempt {fresh_job.attempt_count} failed: {str(e)}"
                    db.commit()
        finally:
            self.current_job_id = None
            self._update_status(WorkerStatus.ONLINE)
            self.emit_heartbeat()

    def _execute_backup_job(self, db: Session, job: Job):
        payload = job.payload or {}
        backup_id = job.backup_id
        temp_file_path = payload.get("temp_file_path")
        original_filename = payload.get("original_filename", "unnamed_payload")
        
        # Idempotency check: verify if version already committed
        existing = db.query(BackupVersion).filter_by(job_id=job.id).first()
        if existing:
            self.logger.info(f"Job {job.id} already committed Version {existing.version_number}. Idempotent return.")
            return

        if temp_file_path and os.path.exists(temp_file_path):
            with open(temp_file_path, "rb") as f:
                sha256, size = self.storage.upload_file(
                    object_key=f"{backup_id}/{job.id}_{original_filename}",
                    data=f
                )
            
            # Get next version number
            count = db.query(BackupVersion).filter_by(backup_id=backup_id).count()
            version = BackupVersion(
                id=f"ver_{uuid.uuid4().hex[:8]}",
                backup_id=backup_id,
                version_number=count + 1,
                original_filename=original_filename,
                file_size_bytes=size,
                sha256_hash=sha256,
                storage_object_key=f"{backup_id}/{job.id}_{original_filename}",
                verification_status=VerificationStatus.VERIFIED,
                last_verified_at=datetime.now(timezone.utc),
                job_id=job.id
            )
            db.add(version)
            db.commit()
            
            # Clean up temp upload
            try:
                os.remove(temp_file_path)
            except OSError:
                pass

    def _execute_verify_job(self, db: Session, job: Job):
        version = db.query(BackupVersion).filter_by(id=job.version_id).first()
        if not version:
            raise ValueError(f"Version {job.version_id} not found")
            
        is_valid = self.storage.verify_integrity(version.storage_object_key, version.sha256_hash)
        if is_valid:
            version.verification_status = VerificationStatus.VERIFIED
            version.last_verified_at = datetime.now(timezone.utc)
        else:
            version.verification_status = VerificationStatus.CORRUPTED
            raise ValueError(f"INTEGRITY_MISMATCH: Object {version.storage_object_key} does not match SHA-256 hash {version.sha256_hash}")
        db.commit()

    def _execute_restore_job(self, db: Session, job: Job):
        payload = job.payload or {}
        recovery_id = payload.get("recovery_id")
        version_id = payload.get("version_id")
        
        recovery_op = db.query(RecoveryOperation).filter_by(id=recovery_id).first()
        version = db.query(BackupVersion).filter_by(id=version_id).first()
        
        if not recovery_op or not version:
            raise ValueError("Invalid recovery reference")

        # Step 1: Pre-restore integrity check
        recovery_op.status = "VERIFYING"
        db.commit()
        
        is_intact = self.storage.verify_integrity(version.storage_object_key, version.sha256_hash)
        if not is_intact:
            recovery_op.status = "FAILED"
            recovery_op.sha256_verified = False
            recovery_op.error_details = "Pre-restore SHA-256 integrity validation failed! Aborting restore."
            db.commit()
            raise ValueError(recovery_op.error_details)
            
        recovery_op.status = "RESTORING"
        db.commit()
        
        # Step 2: Atomic extraction
        restore_dir = os.path.join("/tmp/restores", recovery_op.id)
        os.makedirs(restore_dir, exist_ok=True)
        dest_file = os.path.join(restore_dir, version.original_filename)
        
        with open(dest_file, "wb") as f:
            computed_hash = self.storage.download_file(version.storage_object_key, f)
            
        if computed_hash.lower() != version.sha256_hash.lower():
            recovery_op.status = "FAILED"
            db.commit()
            raise ValueError("Post-download hash mismatch")
            
        recovery_op.status = "COMPLETED"
        recovery_op.sha256_verified = True
        recovery_op.restored_file_path = dest_file
        recovery_op.completed_at = datetime.now(timezone.utc)
        db.commit()

    def _execute_retention_job(self, db: Session, job: Job):
        backup = db.query(BackupRecord).filter_by(id=job.backup_id).first()
        if not backup or not backup.retention_policy_id:
            return
            
        policy = db.query(RetentionPolicy).filter_by(id=backup.retention_policy_id).first()
        if not policy:
            return
            
        versions = db.query(BackupVersion).filter_by(backup_id=backup.id).order_by(BackupVersion.version_number.desc()).all()
        if len(versions) > policy.keep_versions:
            to_prune = versions[policy.keep_versions:]
            for ver in to_prune:
                # Check active recoveries
                in_use = db.query(RecoveryOperation).filter(
                    RecoveryOperation.version_id == ver.id,
                    RecoveryOperation.status.in_(["QUEUED", "VERIFYING", "RESTORING"])
                ).first()
                if not in_use:
                    self.storage.delete_file(ver.storage_object_key)
                    db.delete(ver)
                    self.logger.info(f"Pruned version {ver.version_number} of backup {backup.name} per policy {policy.name}")
            db.commit()

    def run(self):
        self.register_node()
        last_hb = time.time()
        
        self.logger.info(f"Worker {self.worker_id} entering polling loop...")
        while self.running:
            # Emit periodic heartbeat every 3 seconds
            if time.time() - last_hb > settings.WORKER_HEARTBEAT_SECONDS:
                self.emit_heartbeat()
                last_hb = time.time()

            job = self.acquire_job_lease()
            if job:
                self.process_job(job)
            else:
                time.sleep(1.0)
                
        self.logger.info(f"Worker {self.worker_id} terminated gracefully.")

if __name__ == "__main__":
    worker = DistributedBackupWorker()
    worker.run()
