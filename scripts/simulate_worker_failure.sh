#!/usr/bin/env bash
set -e

echo "=========================================================="
echo " ResilienceX — Distributed Fault Tolerance Demonstration"
echo "=========================================================="
python3 scripts/simulate_worker_failure.py
