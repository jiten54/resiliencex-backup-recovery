import enum
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Integer, BigInteger, Boolean, DateTime,
    ForeignKey, Text, Enum, UniqueConstraint, Index, JSON
)
from sqlalchemy.orm import relationship, declarative_base

Base = declarative_base()

class JobStatus(str, enum.Enum):
    PENDING = "PENDING"
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    RETRYING = "RETRYING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"

class JobType(str, enum.Enum):
    BACKUP = "BACKUP"
    INTEGRITY_VERIFICATION = "INTEGRITY_VERIFICATION"
    RESTORE = "RESTORE"
    RETENTION_CLEANUP = "RETENTION_CLEANUP"

class VerificationStatus(str, enum.Enum):
    UNVERIFIED = "UNVERIFIED"
    VERIFIED = "VERIFIED"
    CORRUPTED = "CORRUPTED"

class WorkerStatus(str, enum.Enum):
    ONLINE = "ONLINE"
    BUSY = "BUSY"
    CRASHED = "CRASHED"
    DRAINING = "DRAINING"

class User(Base):
    __tablename__ = "users"
    id = Column(String(64), primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(32), default="operator", nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    backups = relationship("BackupRecord", back_populates="owner", cascade="all, delete-orphan")
    jobs = relationship("Job", back_populates="user")

class BackupRecord(Base):
    __tablename__ = "backup_records"
    id = Column(String(64), primary_key=True, index=True)
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    retention_policy_id = Column(String(64), ForeignKey("retention_policies.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    owner = relationship("User", back_populates="backups")
    versions = relationship("BackupVersion", back_populates="backup", cascade="all, delete-orphan")
    retention_policy = relationship("RetentionPolicy")

class BackupVersion(Base):
    __tablename__ = "backup_versions"
    id = Column(String(64), primary_key=True, index=True)
    backup_id = Column(String(64), ForeignKey("backup_records.id", ondelete="CASCADE"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)
    original_filename = Column(String(255), nullable=False)
    file_size_bytes = Column(BigInteger, nullable=False)
    sha256_hash = Column(String(64), nullable=False, index=True)
    storage_object_key = Column(String(512), nullable=False, unique=True)
    verification_status = Column(Enum(VerificationStatus), default=VerificationStatus.UNVERIFIED, nullable=False)
    last_verified_at = Column(DateTime(timezone=True), nullable=True)
    job_id = Column(String(64), nullable=False)
    metadata_json = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    backup = relationship("BackupRecord", back_populates="versions")

    __table_args__ = (
        UniqueConstraint("backup_id", "version_number", name="uq_backup_version_number"),
        Index("ix_backup_ver_lookup", "backup_id", "verification_status"),
    )

class Job(Base):
    __tablename__ = "jobs"
    id = Column(String(64), primary_key=True, index=True)
    user_id = Column(String(64), ForeignKey("users.id"), nullable=False, index=True)
    backup_id = Column(String(64), ForeignKey("backup_records.id", ondelete="SET NULL"), nullable=True, index=True)
    version_id = Column(String(64), ForeignKey("backup_versions.id", ondelete="SET NULL"), nullable=True)
    job_type = Column(Enum(JobType), nullable=False, index=True)
    status = Column(Enum(JobStatus), default=JobStatus.QUEUED, nullable=False, index=True)
    priority = Column(Integer, default=5, nullable=False, index=True)
    attempt_count = Column(Integer, default=0, nullable=False)
    max_retries = Column(Integer, default=3, nullable=False)
    worker_id = Column(String(64), nullable=True, index=True)
    lease_expires_at = Column(DateTime(timezone=True), nullable=True, index=True)
    retry_after = Column(DateTime(timezone=True), nullable=True, index=True)
    processing_duration_ms = Column(Integer, nullable=True)
    error_details = Column(Text, nullable=True)
    idempotency_key = Column(String(128), unique=True, nullable=True)
    payload = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="jobs")

    __table_args__ = (
        Index("ix_lease_recovery", "status", "lease_expires_at"),
        Index("ix_queue_schedule", "status", "priority", "created_at"),
    )

class WorkerHeartbeat(Base):
    __tablename__ = "worker_heartbeats"
    worker_id = Column(String(64), primary_key=True)
    hostname = Column(String(255), nullable=False)
    region = Column(String(64), nullable=False)
    status = Column(Enum(WorkerStatus), default=WorkerStatus.ONLINE, nullable=False)
    last_heartbeat = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    current_job_id = Column(String(64), nullable=True)
    jobs_completed = Column(Integer, default=0, nullable=False)
    jobs_failed = Column(Integer, default=0, nullable=False)
    total_processing_duration_ms = Column(BigInteger, default=0, nullable=False)
    registered_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

class RecoveryOperation(Base):
    __tablename__ = "recovery_operations"
    id = Column(String(64), primary_key=True, index=True)
    user_id = Column(String(64), ForeignKey("users.id"), nullable=False)
    backup_id = Column(String(64), ForeignKey("backup_records.id"), nullable=False)
    version_id = Column(String(64), ForeignKey("backup_versions.id"), nullable=False)
    target_destination = Column(String(512), nullable=False)
    status = Column(String(32), default="QUEUED", nullable=False)
    sha256_verified = Column(Boolean, default=False, nullable=False)
    restored_file_path = Column(String(512), nullable=True)
    error_details = Column(Text, nullable=True)
    job_id = Column(String(64), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime(timezone=True), nullable=True)

class RetentionPolicy(Base):
    __tablename__ = "retention_policies"
    id = Column(String(64), primary_key=True)
    name = Column(String(255), nullable=False)
    keep_versions = Column(Integer, default=5, nullable=False)
    retention_days = Column(Integer, default=30, nullable=False)
    is_default = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class AuditEvent(Base):
    __tablename__ = "audit_events"
    id = Column(String(64), primary_key=True)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    user_id = Column(String(64), nullable=False, index=True)
    action = Column(String(128), nullable=False, index=True)
    resource_type = Column(String(64), nullable=False)
    resource_id = Column(String(64), nullable=False)
    details = Column(Text, nullable=False)
    correlation_id = Column(String(64), nullable=True, index=True)

class OutboxEvent(Base):
    __tablename__ = "outbox_events"
    id = Column(String(64), primary_key=True)
    event_type = Column(String(128), nullable=False)
    payload = Column(JSON, nullable=False)
    published = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    published_at = Column(DateTime(timezone=True), nullable=True)
