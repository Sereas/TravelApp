from __future__ import annotations

import importlib.util
from pathlib import Path


def _load_module():
    repo_root = Path(__file__).resolve().parents[2]
    module_path = repo_root / "supabase" / "check_remote_schema.py"
    spec = importlib.util.spec_from_file_location("check_remote_schema", module_path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


schema_check = _load_module()


def test_normalize_sql_drops_dump_noise_and_collapses_blank_lines():
    raw = """
-- Dumped by pg_dump
SET statement_timeout = 0;

CREATE TABLE public.trips (
    trip_id uuid not null
);


SELECT pg_catalog.set_config('search_path', '', false);
"""

    normalized = schema_check.normalize_sql(raw)

    assert "-- Dumped by pg_dump" not in normalized
    assert "SET statement_timeout" not in normalized
    assert "SELECT pg_catalog.set_config" not in normalized
    assert normalized == "CREATE TABLE public.trips (\n    trip_id uuid not null\n);\n"


def test_normalize_sql_preserves_meaningful_sql():
    raw = """
CREATE FUNCTION public.example()
RETURNS void
LANGUAGE sql
AS $$
  SELECT 1;
$$;
"""

    normalized = schema_check.normalize_sql(raw)

    assert "CREATE FUNCTION public.example()" in normalized
    assert "SELECT 1;" in normalized
