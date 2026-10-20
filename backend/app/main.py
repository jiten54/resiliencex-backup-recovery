import uuid
import hashlib
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from fastapi.responses import Response, FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from prometheus_client import Counter, Gauge, generate_latest, CONTENT_TYPE_LATEST

from backend.app.core.config import settings
from backend.app.core.security import verify_password, get_password_hash, create_access_token
from backend.app.models.models import (
    Base, User, BackupRecord, BackupVersion, Job, JobStatus, JobType,
    WorkerHeartbeat, WorkerStatus, RecoveryOperation, RetentionPolicy, AuditEvent, VerificationStatus
)
from backend.app.schemas.schemas import (
    UserCreate, UserLogin, UserOut, TokenOut,
    BackupCreate, BackupOut, BackupVersionOut,
    JobOut, WorkerOut, RecoveryCreate, RecoveryOut,
    RetentionPolicyCreate, RetentionPolicyOut
)
from backend.app.storage.adapter import get_storage_adapter

# Database engine & session
engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    from jose import jwt, JWTError
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Could not validate credentials")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
        
    user = db.query(User).filter_by(id=user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

# Prometheus Metrics
PROM_JOBS_CREATED = Counter("resiliencex_jobs_created_total", "Total distributed jobs submitted")
PROM_JOBS_COMPLETED = Counter("resiliencex_jobs_completed_total", "Total distributed jobs processed successfully")
PROM_JOBS_FAILED = Counter("resiliencex_jobs_failed_total", "Total distributed jobs permanently failed")
PROM_JOBS_RETRIED = Counter("resiliencex_jobs_retried_total", "Total retry attempts")
PROM_QUEUE_DEPTH = Gauge("resiliencex_queue_depth", "Jobs currently queued")
PROM_RUNNING_JOBS = Gauge("resiliencex_jobs_running_current", "Jobs currently running on workers")

app = FastAPI(
    title="ResilienceX — Distributed Backup & Recovery Engine",
    description="Production-inspired distributed backup platform with lease-based recovery, SHA-256 data integrity, and multi-version snapshots.",
    version="2.4.0",
    openapi_url="/api/v1/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- HEALTH & OBSERVABILITY PROBES ---
@app.get("/health/live", tags=["Monitoring"])
def health_live():
    return {"status": "UP", "timestamp": datetime.now(timezone.utc).isoformat()}

@app.get("/health/ready", tags=["Monitoring"])
def health_ready(db: Session = Depends(get_db)):
    try:
        db.execute("SELECT 1")
        return {"status": "READY", "database": "CONNECTED", "timestamp": datetime.now(timezone.utc).isoformat()}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Database probe failed: {str(e)}")

@app.get("/metrics", tags=["Monitoring"])
def metrics(db: Session = Depends(get_db)):
    queued = db.query(Job).filter_by(status=JobStatus.QUEUED).count()
    running = db.query(Job).filter_by(status=JobStatus.RUNNING).count()
    PROM_QUEUE_DEPTH.set(queued)
    PROM_RUNNING_JOBS.set(running)
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

# --- AUTHENTICATION ---
@app.post(f"{settings.API_V1_STR}/auth/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED, tags=["Auth"])
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter_by(email=user_in.email).first():
        raise HTTPException(status_code=409, detail="User with this email already exists")
    
    user = User(
        id=f"usr_{uuid.uuid4().hex[:8]}",
        email=user_in.email,
        name=user_in.name,
        password_hash=get_password_hash(user_in.password),
        role="operator"
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(user.id)
    return {"token": token, "user": user}

@app.post(f"{settings.API_V1_STR}/auth/login", response_model=TokenOut, tags=["Auth"])
def login(login_in: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter_by(email=login_in.email).first()
    if not user or not verify_password(login_in.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    token = create_access_token(user.id)
    return {"token": token, "user": user}

@app.get(f"{settings.API_V1_STR}/auth/me", response_model=UserOut, tags=["Auth"])
def get_me(current_user: User = Depends(get_current_user)):
    return current_user

# --- BACKUPS API ---
@app.get(f"{settings.API_V1_STR}/backups", response_model=List[BackupOut], tags=["Backups"])
def list_backups(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    backups = db.query(BackupRecord).filter_by(user_id=current_user.id).all()
    results = []
    for b in backups:
        versions = db.query(BackupVersion).filter_by(backup_id=b.id).order_by(BackupVersion.version_number.desc()).all()
        total_size = sum(v.file_size_bytes for v in versions)
        latest = versions[0] if versions else None
        results.append(BackupOut(
            id=b.id,
            user_id=b.user_id,
            name=b.name,
            description=b.description,
            retention_policy_id=b.retention_policy_id,
            version_count=len(versions),
            total_size_bytes=total_size,
            latest_version=latest,
            created_at=b.created_at,
            updated_at=b.updated_at
        ))
    return results

@app.post(f"{settings.API_V1_STR}/backups", status_code=status.HTTP_201_CREATED, tags=["Backups"])
def create_backup(
    name: str = Form(...),
    description: Optional[str] = Form(None),
    retention_policy_id: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    backup = BackupRecord(
        id=f"bkp_{uuid.uuid4().hex[:8]}",
        user_id=current_user.id,
        name=name,
        description=description,
        retention_policy_id=retention_policy_id or "ret_prod_default"
    )
    db.add(backup)
    
    created_job = None
    if file:
        temp_path = f"/tmp/{uuid.uuid4().hex}_{file.filename}"
        with open(temp_path, "wb") as f:
            f.write(file.file.read())
            
        created_job = Job(
            id=f"job_{uuid.uuid4().hex[:8]}",
            user_id=current_user.id,
            backup_id=backup.id,
            job_type=JobType.BACKUP,
            status=JobStatus.QUEUED,
            priority=5,
            attempt_count=0,
            max_retries=3,
            payload={
                "temp_file_path": temp_path,
                "original_filename": file.filename
            }
        )
        db.add(created_job)
        PROM_JOBS_CREATED.inc()
        
    db.commit()
    return {"backup": backup, "job": created_job}

@app.delete(f"{settings.API_V1_STR}/backups/{{backup_id}}", tags=["Backups"])
def delete_backup(backup_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    backup = db.query(BackupRecord).filter_by(id=backup_id, user_id=current_user.id).first()
    if not backup:
        raise HTTPException(status_code=404, detail="Backup not found")
        
    storage = get_storage_adapter()
    for ver in backup.versions:
        storage.delete_file(ver.storage_object_key)
        
    db.delete(backup)
    db.commit()
    return {"message": "Backup and storage versions permanently deleted"}

# --- JOBS API ---
@app.get(f"{settings.API_V1_STR}/jobs", response_model=List[JobOut], tags=["Jobs"])
def list_jobs(
    status: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    limit: int = Query(50, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(Job)
    if status and status != "ALL":
        query = query.filter(Job.status == status)
    if type and type != "ALL":
        query = query.filter(Job.job_type == type)
    return query.order_by(Job.created_at.desc()).limit(limit).all()

@app.post(f"{settings.API_V1_STR}/jobs/{{job_id}}/retry", tags=["Jobs"])
def retry_job(job_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    job = db.query(Job).filter_by(id=job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status not in [JobStatus.FAILED, JobStatus.CANCELLED]:
        raise HTTPException(status_code=400, detail=f"Cannot retry job in status {job.status}")
        
    job.status = JobStatus.QUEUED
    job.attempt_count = 0
    job.worker_id = None
    job.lease_expires_at = None
    job.error_details = None
    db.commit()
    PROM_JOBS_RETRIED.inc()
    return {"message": "Job requeued", "job": job}

@app.post(f"{settings.API_V1_STR}/jobs/{{job_id}}/cancel", tags=["Jobs"])
def cancel_job(job_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    job = db.query(Job).filter_by(id=job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status in [JobStatus.COMPLETED, JobStatus.FAILED]:
        raise HTTPException(status_code=400, detail="Job already finished")
        
    job.status = JobStatus.CANCELLED
    job.completed_at = datetime.now(timezone.utc)
    job.error_details = "Cancelled by operator"
    db.commit()
    return {"message": "Job cancelled", "job": job}

# --- RECOVERY API ---
@app.post(f"{settings.API_V1_STR}/recovery", response_model=RecoveryOut, status_code=status.HTTP_202_ACCEPTED, tags=["Recovery"])
def initiate_recovery(rec_in: RecoveryCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    backup = db.query(BackupRecord).filter_by(id=rec_in.backup_id).first()
    version = db.query(BackupVersion).filter_by(id=rec_in.version_id, backup_id=rec_in.backup_id).first()
    if not backup or not version:
        raise HTTPException(status_code=404, detail="Backup or version not found")
        
    recovery_id = f"rec_{uuid.uuid4().hex[:8]}"
    job_id = f"job_rec_{uuid.uuid4().hex[:8]}"
    
    rec_op = RecoveryOperation(
        id=recovery_id,
        user_id=current_user.id,
        backup_id=backup.id,
        version_id=version.id,
        target_destination=rec_in.target_destination,
        status="QUEUED",
        sha256_verified=False,
        job_id=job_id
    )
    
    job = Job(
        id=job_id,
        user_id=current_user.id,
        backup_id=backup.id,
        version_id=version.id,
        job_type=JobType.RESTORE,
        status=JobStatus.QUEUED,
        priority=9,
        max_retries=2,
        payload={"recovery_id": recovery_id, "version_id": version.id}
    )
    
    db.add(rec_op)
    db.add(job)
    db.commit()
    PROM_JOBS_CREATED.inc()
    return rec_op

# --- WORKERS API ---
@app.get(f"{settings.API_V1_STR}/workers", response_model=List[WorkerOut], tags=["Workers"])
def list_workers(db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    workers = db.query(WorkerHeartbeat).all()
    results = []
    for w in workers:
        age_seconds = int((now - w.last_heartbeat).total_seconds())
        avg_dur = int(w.total_processing_duration_ms / w.jobs_completed) if w.jobs_completed > 0 else 0
        results.append(WorkerOut(
            worker_id=w.worker_id,
            hostname=w.hostname,
            region=w.region,
            status=w.status,
            last_heartbeat=w.last_heartbeat,
            heartbeat_age_seconds=max(0, age_seconds),
            current_job_id=w.current_job_id,
            jobs_completed=w.jobs_completed,
            jobs_failed=w.jobs_failed,
            avg_processing_duration_ms=avg_dur,
            is_stale=age_seconds > 10,
            registered_at=w.registered_at
        ))
    return results
