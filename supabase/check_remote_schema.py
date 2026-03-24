#!/usr/bin/env python3
from __future__ import annotations

import argparse
import difflib
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT_PATH = REPO_ROOT / "supabase" / "schema.sql"


def normalize_sql(text: str) -> str:
    ignored_prefixes = (
        "--",
        "SET ",
        "RESET ",
        "SELECT pg_catalog.set_config",
        "\\connect ",
    )
    kept_lines: list[str] = []
    previous_blank = False

    for raw_line in text.splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()

        if any(stripped.startswith(prefix) for prefix in ignored_prefixes):
            continue

        if not stripped:
            if previous_blank:
                continue
            previous_blank = True
            kept_lines.append("")
            continue

        previous_blank = False
        kept_lines.append(line)

    normalized = "\n".join(kept_lines).strip()
    return normalized + "\n"


def ensure_supabase_cli() -> None:
    if shutil.which("supabase"):
        return
    raise SystemExit(
        "Supabase CLI is not installed or not on PATH. "
        "Install it, link this repo to your Supabase project, then rerun this check."
    )


def dump_remote_schema() -> str:
    ensure_supabase_cli()

    with tempfile.NamedTemporaryFile(suffix=".sql") as tmp:
        cmd = [
            "supabase",
            "db",
            "dump",
            "--linked",
            "--schema",
            "public",
            "-f",
            tmp.name,
        ]
        result = subprocess.run(
            cmd,
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            details = (result.stderr or result.stdout).strip()
            raise SystemExit(f"Supabase schema dump failed.\n{details}")
        return Path(tmp.name).read_text()


def write_snapshot() -> None:
    remote_sql = normalize_sql(dump_remote_schema())
    SNAPSHOT_PATH.write_text(remote_sql)
    print(f"Updated schema snapshot: {SNAPSHOT_PATH.relative_to(REPO_ROOT)}")


def check_snapshot() -> None:
    if not SNAPSHOT_PATH.exists():
        raise SystemExit(
            "Missing supabase/schema.sql.\n"
            "Bootstrap it with:\n"
            "  ./.venv/bin/python supabase/check_remote_schema.py --update"
        )

    expected = SNAPSHOT_PATH.read_text()
    actual = normalize_sql(dump_remote_schema())

    if expected == actual:
        print("Supabase schema snapshot matches the linked remote database.")
        return

    diff = "".join(
        difflib.unified_diff(
            expected.splitlines(keepends=True),
            actual.splitlines(keepends=True),
            fromfile="supabase/schema.sql",
            tofile="remote(public)",
        )
    )
    raise SystemExit(
        "Supabase schema drift detected.\n"
        "The linked remote database does not match supabase/schema.sql.\n\n"
        "Refresh the snapshot with:\n"
        "  ./.venv/bin/python supabase/check_remote_schema.py --update\n\n"
        f"{diff}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Verify that the linked remote Supabase public schema matches supabase/schema.sql."
    )
    parser.add_argument(
        "--update",
        action="store_true",
        help="Pull the linked remote public schema and overwrite supabase/schema.sql.",
    )
    args = parser.parse_args()

    if args.update:
        write_snapshot()
        return

    check_snapshot()


if __name__ == "__main__":
    main()
