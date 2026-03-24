#!/usr/bin/env python3
from __future__ import annotations

import argparse
import difflib
import shutil
import subprocess
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
        "\\restrict ",
        "\\unrestrict ",
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


def _get_db_url() -> str:
    """Build a Postgres connection URL from the Supabase project ref and DB password."""
    import os

    dotenv_path = REPO_ROOT / ".env"
    env_vars: dict[str, str] = {}
    if dotenv_path.exists():
        for line in dotenv_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                env_vars[k.strip()] = v.strip()

    supabase_url = os.environ.get("SUPABASE_URL") or env_vars.get("SUPABASE_URL", "")
    db_password = os.environ.get("SUPABASE_DB_PASSWORD") or env_vars.get("SUPABASE_DB_PASSWORD", "")

    if not supabase_url:
        raise SystemExit("SUPABASE_URL not set in .env or environment.")
    if not db_password:
        raise SystemExit(
            "SUPABASE_DB_PASSWORD not set in .env or environment.\n"
            "Add it to your .env file. Find it in Supabase Dashboard → Settings → Database."
        )

    # Extract project ref from URL: https://<ref>.supabase.co
    ref = supabase_url.split("//")[1].split(".")[0]

    # Region is needed for the pooler host. Allow override via env, default to ap-south-1.
    region = os.environ.get("SUPABASE_DB_REGION") or env_vars.get(
        "SUPABASE_DB_REGION", "ap-south-1"
    )
    from urllib.parse import quote

    return (
        f"postgresql://postgres.{ref}:{quote(db_password, safe='')}"
        f"@aws-1-{region}.pooler.supabase.com:5432/postgres"
    )


def dump_remote_schema() -> str:
    """Dump the public schema using pg_dump (local binary) or supabase CLI."""
    # Try pg_dump directly first (no Docker needed)
    # Prefer Homebrew libpq (usually newer) over system pg_dump
    _homebrew_pg_dump = Path("/opt/homebrew/opt/libpq/bin/pg_dump")
    pg_dump = str(_homebrew_pg_dump) if _homebrew_pg_dump.exists() else shutil.which("pg_dump")
    if pg_dump:
        db_url = _get_db_url()
        with tempfile.NamedTemporaryFile(suffix=".sql", delete=False) as tmp:
            tmp_path = tmp.name
        try:
            result = subprocess.run(
                [pg_dump, db_url, "--schema=public", "--schema-only", f"--file={tmp_path}"],
                capture_output=True,
                text=True,
                check=False,
            )
            if result.returncode != 0:
                details = (result.stderr or result.stdout).strip()
                raise SystemExit(f"pg_dump failed.\n{details}")
            return Path(tmp_path).read_text()
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    # Fall back to supabase CLI (requires Docker)
    if not shutil.which("supabase"):
        raise SystemExit(
            "Neither pg_dump nor supabase CLI found on PATH.\n"
            "Install PostgreSQL client tools or the Supabase CLI."
        )

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
        description=(
            "Verify that the linked remote Supabase public schema matches supabase/schema.sql."
        )
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
