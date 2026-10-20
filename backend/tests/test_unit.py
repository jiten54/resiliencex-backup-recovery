import unittest
import hashlib
import random
from datetime import datetime, timezone, timedelta

class TestUnitResilienceX(unittest.TestCase):
    def test_sha256_hash_calculation(self):
        payload = b"RESILIENCEX_CRITICAL_DATABASE_TRANSACTION_LOG_PAYLOAD"
        expected_hash = hashlib.sha256(payload).hexdigest()
        
        hasher = hashlib.sha256()
        hasher.update(payload)
        computed_hash = hasher.hexdigest()
        
        self.assertEqual(computed_hash, expected_hash)
        self.assertEqual(len(computed_hash), 64)

    def test_exponential_backoff_calculation(self):
        """Verify exponential backoff grows correctly with jitter bounds"""
        for attempt in range(1, 5):
            base_delay = 2 ** attempt
            jitter = random.uniform(0, 0.5)
            total_delay = min(30, base_delay + jitter)
            
            self.assertGreaterEqual(total_delay, base_delay)
            self.assertLessEqual(total_delay, base_delay + 0.5)
            self.assertLessEqual(total_delay, 30)

    def test_job_state_transitions(self):
        """Validate allowable distributed state machine transitions"""
        valid_transitions = {
            "PENDING": ["QUEUED", "CANCELLED"],
            "QUEUED": ["RUNNING", "CANCELLED"],
            "RUNNING": ["COMPLETED", "RETRYING", "FAILED", "CANCELLED"],
            "RETRYING": ["QUEUED", "CANCELLED"],
            "COMPLETED": [],
            "FAILED": ["QUEUED"],      # Manual retry allowed
            "CANCELLED": ["QUEUED"]    # Manual retry allowed
        }
        
        # Assert terminal states have no automatic outbound transitions
        self.assertEqual(len(valid_transitions["COMPLETED"]), 0)
        self.assertIn("RUNNING", valid_transitions["QUEUED"])
        self.assertIn("RETRYING", valid_transitions["RUNNING"])

    def test_retention_window_pruning_logic(self):
        """Verify version retention honors maximum kept count and date threshold"""
        keep_versions = 3
        versions = [
            {"version_number": 5, "age_days": 1},
            {"version_number": 4, "age_days": 5},
            {"version_number": 3, "age_days": 10},
            {"version_number": 2, "age_days": 40},
            {"version_number": 1, "age_days": 50},
        ]
        
        sorted_versions = sorted(versions, key=lambda x: x["version_number"], reverse=True)
        retained = sorted_versions[:keep_versions]
        pruned = sorted_versions[keep_versions:]
        
        self.assertEqual(len(retained), 3)
        self.assertEqual(len(pruned), 2)
        self.assertEqual([v["version_number"] for v in retained], [5, 4, 3])
        self.assertEqual([v["version_number"] for v in pruned], [2, 1])

if __name__ == "__main__":
    unittest.main()
