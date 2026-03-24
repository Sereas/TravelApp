from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


def _load_module(name: str, relative_path: str):
    repo_root = Path(__file__).resolve().parents[2]
    module_path = repo_root / relative_path
    spec = importlib.util.spec_from_file_location(name, module_path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


schema_dependents = _load_module("check_schema_dependents", "supabase/check_schema_dependents.py")


def test_parse_schema_extracts_tables_and_function_return_columns():
    sql = """
CREATE TABLE public.locations (
    location_id uuid NOT NULL,
    trip_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamptz NOT NULL
);

CREATE OR REPLACE FUNCTION public.get_itinerary_tree(p_trip_id uuid)
RETURNS TABLE (
    day_id uuid,
    loc_name text
)
LANGUAGE sql
AS $$ SELECT 1 $$;
"""

    parsed = schema_dependents.parse_schema(sql)

    assert parsed.tables["locations"] == {"location_id", "trip_id", "name", "created_at"}
    assert "get_itinerary_tree" in parsed.functions
    assert parsed.function_return_columns["get_itinerary_tree"] == {"day_id", "loc_name"}


def test_extract_file_references_resolves_string_constants(tmp_path):
    source = """
LOCATIONS_SELECT = "location_id, trip_id, name"

def run(supabase):
    return (
        supabase.table("locations")
        .select(LOCATIONS_SELECT)
        .eq("trip_id", "123")
        .execute()
    )
"""
    file_path = tmp_path / "example.py"
    file_path.write_text(source)

    refs = schema_dependents.extract_file_references(file_path)

    assert refs.tables["locations"] == {"location_id", "trip_id", "name"}
