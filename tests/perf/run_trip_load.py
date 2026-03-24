#!/usr/bin/env python3
"""Backward-compatible CLI wrapper for backend perf reporting."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from tests.perf.workspace_perf import (
    get_perf_backend_url,
    get_perf_source_user_id,
    load_env,
    run_backend_report,
)


def main() -> int:
    load_env()
    parser = argparse.ArgumentParser(description="Run live backend trip workspace perf report.")
    parser.add_argument("--backend-url", default=get_perf_backend_url())
    parser.add_argument("--trip-id", default=None)
    parser.add_argument("--user-id", default=get_perf_source_user_id())
    parser.add_argument("--runs", type=int, default=3)
    args = parser.parse_args()

    report = run_backend_report(
        backend_url=args.backend_url,
        user_id=args.user_id,
        trip_id=args.trip_id,
        runs=args.runs,
    )

    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
