#!/usr/bin/env python3
"""Prepare dedicated UI perf user and clone source artifacts into it."""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from tests.perf.workspace_perf import get_perf_source_user_id, prepare_ui_perf_context


def main() -> int:
    context = prepare_ui_perf_context(source_user_id=get_perf_source_user_id())
    print(json.dumps(context, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
