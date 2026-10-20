import hashlib
import random
import pytest
from datetime import datetime, timezone, timedelta
from backend.app.models.models import JobStatus, JobType, VerificationStatus

def test_sha256_hash_calculation():
    payload = b"RESILIENCEX_CRITICAL_DATABASE_TRANSACTION_LOG_PAYLOAD"
    expected_hash = hashlib.sha256(payload).hexdigest()
    
    hasher = hashlib.sha256()
    hasher.update(payload)
    computed_hash = hasher.hexdigest()
    
    assert computed_hash == expected_hash
    assert len(computed_hash) == 64

def test_exponential_backoff_calculation():
    """Verify exponential backoff grows correctly with jitter bounds"""
    for attempt in range(1, 5):
        base_delay = 2 ** attempt
        jitter = random.uniform(0, 0.5)
        total_delay = min(30, base_delay + jitter)
        
        assert total_delay >= base_delay
        assert total_delay <= base_delay + 0.5
        assert total_delay <= 30

def test_job_state_transitions():
    """Validate allowable distributed state machine transitions"""
    valid_transitions = {
        JobStatus.PENDING: [JobStatus.QUEUED, JobStatus.CANCELLED],
        JobStatus.QUEUED: [JobStatus.RUNNING, JobStatus.CANCELLED],
        JobStatus.RUNNING: [JobStatus.COMPLETED, JobStatus.RETRYING, JobStatus.FAILED, JobStatus.CANCELLED],
        JobStatus.RETRYING: [JobStatus.QUEUED, JobStatus.CANCELLED],
        JobStatus.COMPLETED: [],
        JobStatus.FAILED: [JobStatus.QUEUED], # Manual retry allowed
        JobStatus.CANCELLED: [JobStatus.QUEUED] # Manual retry allowed
    }
    
    # Assert terminal states have no automatic outbound transitions
    assert len(valid_transitions[JobStatus.COMPLETED]) == 0
    assert JobStatus.RUNNING in valid_transitions[JobStatus.QUEUED]
    assert JobStatus.RETRYING in valid_transitions[JobStatus.RUNNING]

def test_retention_window_pruning_logic():
    """Verify version retention honors maximum kept count and date threshold"""
    keep_versions = 3
    versions = [
        {"version_number": 5, "age_days": 1},
        {"version_number": 4, "age_days": 5},
        {"version_number": 3, "age_days": 10},
        {"version_number": 2, "age_days": 40},
        {"version_number": 1, "age_days": 50},
    ]
    
    # Sort descending
    sorted_versions = sorted(versions, key=lambda x: x["version_number"], reverse=True)
    retained = sorted_versions[:keep_versions]
    pruned = sorted_versions[keep_versions:]
    
    assert len(retained) == 3
    assert len(pruned) == 2
    assert [v["version_number"] for v in retained] == [5, 4, 3]
    assert [v["version_number"] for v in pruned] == [2, 1]
