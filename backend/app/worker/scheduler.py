import time
import logging
import random
from datetime import datetime, timezone, timedelta
from sqlalchemy import create_engine, update, and_
from sqlalchemy.orm import sessionmaker
from backend.app.core.config import settings
from backend.app.models.models import Job, JobStatus, WorkerHeartbeat, WorkerStatus

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("lease_supervisor")

class LeaseRecoverySupervisor:
    def __init__(self):
        db_url = settings.get_database_url()
        try:
            self.engine = create_engine(db_url, pool_pre_ping=True)
            self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        except Exception:
            sqlite_url = "sqlite:///./data/resiliencex.db"
            self.engine = create_engine(sqlite_url, connect_args={"check_same_thread": False})
            self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)

    def scan_expired_leases(self):
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as db:
            # 1. Recover expired job leases
            expired_jobs = db.query(Job).filter(
                and_(
                    Job.status == JobStatus.RUNNING,
                    Job.lease_expires_at < now
                )
            ).all()

            for job in expired_jobs:
                job.attempt_count += 1
                job.worker_id = None
                job.lease_expires_at = None

                if job.attempt_count >= job.max_retries:
                    job.status = JobStatus.FAILED
                    job.completed_at = now
                    job.error_details = f"Lease expired. Reached max retries ({job.max_retries}). Sent to dead-letter queue."
                    logger.error(f"[SUPERVISOR] Job {job.id} lease expired and exceeded max retries. Marked as FAILED.")
                else:
                    # Exponential backoff with jitter
                    backoff = min(30, (2 ** job.attempt_count) + random.uniform(0, 1))
                    job.status = JobStatus.RETRYING
                    job.retry_after = now + timedelta(seconds=backoff)
                    job.error_details = f"Worker lease expired. Scheduled retry attempt {job.attempt_count}/{job.max_retries}."
                    logger.warning(f"[SUPERVISOR] Recovered abandoned job {job.id}. Rescheduled for retry.")
            
            # 2. Re-queue retrying jobs whose backoff window has passed
            ready_to_queue = db.query(Job).filter(
                and_(
                    Job.status == JobStatus.RETRYING,
                    Job.retry_after <= now
                )
            ).all()

            for job in ready_to_queue:
                job.status = JobStatus.QUEUED
                job.retry_after = None
                logger.info(f"[SUPERVISOR] Moving retried Job {job.id} back to QUEUED state.")

            # 3. Detect crashed workers (> 12s stale heartbeat)
            heartbeat_threshold = now - timedelta(seconds=12)
            crashed_workers = db.query(WorkerHeartbeat).filter(
                and_(
                    WorkerHeartbeat.status != WorkerStatus.CRASHED,
                    WorkerHeartbeat.last_heartbeat < heartbeat_threshold
                )
            ).all()

            for worker in crashed_workers:
                worker.status = WorkerStatus.CRASHED
                logger.warning(f"[SUPERVISOR] Worker {worker.worker_id} heartbeat expired (>12s). Marked status as CRASHED.")

            db.commit()

    def run(self):
        logger.info("Starting ResilienceX Lease Recovery Supervisor...")
        while True:
            try:
                self.scan_expired_leases()
            except Exception as e:
                logger.error(f"Error in supervisor loop: {str(e)}")
            time.sleep(2.0)

if __name__ == "__main__":
    supervisor = LeaseRecoverySupervisor()
    supervisor.run()
