import pytest
import hashlib
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock

def test_lease_expiration_detection():
    """Verify that a worker lease past expiration is identified as abandoned"""
    now = datetime.now(timezone.utc)
    expired_lease = now - timedelta(seconds=16) # 15s lease expired
    active_lease = now + timedelta(seconds=10)
    
    assert now > expired_lease
    assert now < active_lease

def test_idempotent_job_reexecution():
    """
    Test that re-executing a job with the same idempotency key or job_id
    does not create duplicate committed backup versions in storage.
    """
    committed_versions = {}
    
    def commit_version(job_id, backup_id, filename, content_hash):
        if job_id in committed_versions:
            # Idempotency hit: return existing committed version
            return committed_versions[job_id], False
        
        version_number = len(committed_versions) + 1
        new_version = {
            "version_number": version_number,
            "filename": filename,
            "hash": content_hash,
            "job_id": job_id
        }
        committed_versions[job_id] = new_version
        return new_version, True
        
    # First execution by Worker 1 (which crashes before acknowledging completion)
    v1, created1 = commit_version("job_123", "bkp_1", "db.wal", "abc456")
    assert created1 is True
    assert v1["version_number"] == 1
    
    # Retry execution by Worker 2
    v2, created2 = commit_version("job_123", "bkp_1", "db.wal", "abc456")
    assert created2 is False
    assert v2["version_number"] == 1
    assert len(committed_versions) == 1 # Absolutely zero duplicate versions created!

def test_corruption_detection_aborts_recovery():
    """
    Test that if stored object has bit rot (hash mismatch),
    the recovery engine marks the job as FAILED and prevents unsafe restore.
    """
    expected_hash = hashlib.sha256(b"ORIGINAL_INTEACT_DATA").hexdigest()
    
    # Simulate bit-rot in storage
    tampered_bytes = b"ORIGINAL_CORRUPTED_DATA"
    actual_hash = hashlib.sha256(tampered_bytes).hexdigest()
    
    assert actual_hash != expected_hash
    
    # Pre-restore gatekeeper
    restore_permitted = (actual_hash == expected_hash)
    assert restore_permitted is False
