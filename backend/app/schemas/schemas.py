from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, EmailStr, Field
from backend.app.models.models import JobStatus, JobType, VerificationStatus, WorkerStatus

# Auth schemas
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    id: str
    email: EmailStr
    name: str
    role: str
    created_at: datetime
    class Config:
        from_attributes = True

class TokenOut(BaseModel):
    token: str
    user: UserOut

# Backup schemas
class BackupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    retention_policy_id: Optional[str] = None

class BackupVersionOut(BaseModel):
    id: str
    backup_id: str
    version_number: int
    original_filename: str
    file_size_bytes: int
    sha256_hash: str
    storage_object_key: str
    verification_status: VerificationStatus
    last_verified_at: Optional[datetime] = None
    job_id: str
    created_at: datetime
    class Config:
        from_attributes = True

class BackupOut(BaseModel):
    id: str
    user_id: str
    name: str
    description: Optional[str] = None
    retention_policy_id: Optional[str] = None
    retention_policy_name: Optional[str] = None
    version_count: Optional[int] = 0
    total_size_bytes: Optional[int] = 0
    latest_version: Optional[BackupVersionOut] = None
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True

# Job schemas
class JobOut(BaseModel):
    id: str
    user_id: str
    backup_id: Optional[str] = None
    version_id: Optional[str] = None
    job_type: JobType
    status: JobStatus
    priority: int
    attempt_count: int
    max_retries: int
    worker_id: Optional[str] = None
    lease_expires_at: Optional[datetime] = None
    retry_after: Optional[datetime] = None
    processing_duration_ms: Optional[int] = None
    error_details: Optional[str] = None
    idempotency_key: Optional[str] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    class Config:
        from_attributes = True

# Worker schemas
class WorkerOut(BaseModel):
    worker_id: str
    hostname: str
    region: str
    status: WorkerStatus
    last_heartbeat: datetime
    heartbeat_age_seconds: int
    current_job_id: Optional[str] = None
    jobs_completed: int
    jobs_failed: int
    avg_processing_duration_ms: int
    is_stale: bool
    registered_at: datetime
    class Config:
        from_attributes = True

# Recovery schemas
class RecoveryCreate(BaseModel):
    backup_id: str
    version_id: str
    target_destination: Optional[str] = "/mnt/restores/production-node-01"

class RecoveryOut(BaseModel):
    id: str
    user_id: str
    backup_id: str
    version_id: str
    target_destination: str
    status: str
    sha256_verified: bool
    restored_file_path: Optional[str] = None
    error_details: Optional[str] = None
    job_id: str
    created_at: datetime
    completed_at: Optional[datetime] = None
    class Config:
        from_attributes = True

# Retention & Settings
class RetentionPolicyCreate(BaseModel):
    name: str
    keep_versions: int = Field(..., ge=1, le=100)
    retention_days: int = Field(..., ge=1, le=3650)

class RetentionPolicyOut(BaseModel):
    id: str
    name: str
    keep_versions: int
    retention_days: int
    is_default: bool
    created_at: datetime
    class Config:
        from_attributes = True
