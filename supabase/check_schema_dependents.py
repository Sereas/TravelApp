#!/usr/bin/env python3
from __future__ import annotations

import argparse
import ast
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = REPO_ROOT / "supabase" / "schema.sql"

MANUAL_FILE_RULES: dict[str, dict[str, object]] = {
    "backend/app/routers/itinerary_tree.py": {
        "function_return_columns": {
            "get_itinerary_tree": {
                "day_id",
                "day_date",
                "day_sort_order",
                "day_created_at",
                "option_id",
                "option_index",
                "option_starting_city",
                "option_ending_city",
                "option_created_by",
                "option_created_at",
                "location_id",
                "ol_sort_order",
                "time_period",
                "loc_name",
                "loc_city",
                "loc_address",
                "loc_google_link",
                "loc_category",
                "loc_note",
                "loc_working_hours",
                "loc_requires_booking",
                "loc_photo_url",
                "loc_user_image_url",
                "loc_attribution_name",
                "loc_attribution_uri",
            },
        },
    },
    "backend/tests/conftest.py": {
        "functions": {"get_itinerary_tree", "verify_resource_chain", "reorder_option_locations"},
        "function_return_columns": {
            "get_itinerary_tree": {
                "day_id",
                "day_date",
                "day_sort_order",
                "day_created_at",
                "option_id",
                "option_index",
                "option_starting_city",
                "option_ending_city",
                "option_created_by",
                "option_created_at",
                "location_id",
                "ol_sort_order",
                "time_period",
                "loc_name",
                "loc_city",
                "loc_address",
                "loc_google_link",
                "loc_category",
                "loc_note",
                "loc_working_hours",
                "loc_requires_booking",
                "loc_photo_url",
                "loc_user_image_url",
                "loc_attribution_name",
                "loc_attribution_uri",
            },
        },
    },
    "backend/app/services/place_photos.py": {
        "tables": {
            "place_photos": {
                "google_place_id",
                "storage_path",
                "photo_url",
                "width_px",
                "height_px",
                "attribution_name",
                "attribution_uri",
                "photo_resource",
            }
        }
    },
}

TABLE_RE = re.compile(
    r"CREATE TABLE(?: IF NOT EXISTS)?\s+public\.(?P<name>\w+)\s*\((?P<body>.*?)\n\);",
    re.DOTALL,
)
FUNCTION_RE = re.compile(
    r"CREATE(?: OR REPLACE)? FUNCTION\s+public\.(?P<name>\w+)\s*\(",
    re.IGNORECASE,
)
FUNCTION_RETURNS_TABLE_RE = re.compile(
    r"CREATE(?: OR REPLACE)? FUNCTION\s+public\.(?P<name>\w+)\s*\(.*?\)\s*"
    r"RETURNS TABLE\s*\((?P<body>.*?)\)\s*LANGUAGE",
    re.DOTALL | re.IGNORECASE,
)
TABLE_SELECT_RE = re.compile(
    r'table\("(?P<table>\w+)"\)(?P<chain>[\s\S]{0,500}?)\.select\((?P<arg>"[^"]*"|\'[^\']*\'|[A-Za-z_][A-Za-z0-9_]*)\)',
    re.MULTILINE,
)
RPC_RE = re.compile(r'\.rpc\(\s*"(?P<name>\w+)"')


@dataclass
class SchemaIndex:
    tables: dict[str, set[str]] = field(default_factory=dict)
    functions: set[str] = field(default_factory=set)
    function_return_columns: dict[str, set[str]] = field(default_factory=dict)


@dataclass
class FileReferences:
    tables: dict[str, set[str]] = field(default_factory=dict)
    functions: set[str] = field(default_factory=set)
    function_return_columns: dict[str, set[str]] = field(default_factory=dict)


def parse_schema(sql: str) -> SchemaIndex:
    index = SchemaIndex()

    for match in TABLE_RE.finditer(sql):
        table = match.group("name")
        body = match.group("body")
        columns: set[str] = set()
        for raw_line in body.splitlines():
            line = raw_line.strip().rstrip(",")
            if not line:
                continue
            upper = line.upper()
            if upper.startswith(("CONSTRAINT ", "PRIMARY KEY", "UNIQUE ", "CHECK ", "FOREIGN KEY")):
                continue
            name = line.split()[0].strip('"')
            if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name):
                columns.add(name)
        index.tables[table] = columns

    for match in FUNCTION_RE.finditer(sql):
        index.functions.add(match.group("name"))

    for match in FUNCTION_RETURNS_TABLE_RE.finditer(sql):
        fn = match.group("name")
        cols: set[str] = set()
        for raw_line in match.group("body").splitlines():
            line = raw_line.strip().rstrip(",")
            if not line:
                continue
            name = line.split()[0].strip('"')
            if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name):
                cols.add(name)
        if cols:
            index.function_return_columns[fn] = cols

    return index


def _eval_string_expr(node: ast.AST, constants: dict[str, str]) -> str | None:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.Name):
        return constants.get(node.id)
    if isinstance(node, ast.JoinedStr):
        parts: list[str] = []
        for value in node.values:
            if isinstance(value, ast.Constant) and isinstance(value.value, str):
                parts.append(value.value)
            else:
                return None
        return "".join(parts)
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        left = _eval_string_expr(node.left, constants)
        right = _eval_string_expr(node.right, constants)
        if left is not None and right is not None:
            return left + right
    return None


def extract_constants(source: str) -> dict[str, str]:
    tree = ast.parse(source)
    constants: dict[str, str] = {}
    for node in tree.body:
        if not isinstance(node, ast.Assign) or len(node.targets) != 1:
            continue
        target = node.targets[0]
        if not isinstance(target, ast.Name):
            continue
        value = _eval_string_expr(node.value, constants)
        if value is not None:
            constants[target.id] = value
    return constants


def parse_select_columns(raw: str) -> set[str]:
    columns: set[str] = set()
    for part in raw.split(","):
        token = part.strip()
        if not token or token == "*":
            continue
        if ":" in token:
            token = token.split(":", 1)[0].strip()
        if "(" in token or ")" in token:
            continue
        if token.endswith("!inner"):
            token = token[:-6]
        token = token.split()[0]
        if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", token):
            columns.add(token)
    return columns


def extract_file_references(path: Path) -> FileReferences:
    source = path.read_text()
    constants = extract_constants(source)
    refs = FileReferences()

    for match in TABLE_SELECT_RE.finditer(source):
        table = match.group("table")
        arg = match.group("arg")
        if arg.startswith(("'", '"')):
            select_raw = arg[1:-1]
        else:
            select_raw = constants.get(arg, "")
        if select_raw:
            refs.tables.setdefault(table, set()).update(parse_select_columns(select_raw))
        else:
            refs.tables.setdefault(table, set())

    for table in re.findall(r'table\("(\w+)"\)', source):
        refs.tables.setdefault(table, set())

    for fn in RPC_RE.findall(source):
        refs.functions.add(fn)

    try:
        rel = str(path.relative_to(REPO_ROOT))
    except ValueError:
        rel = str(path)
    manual = MANUAL_FILE_RULES.get(rel, {})
    for table, cols in manual.get("tables", {}).items():
        refs.tables.setdefault(table, set()).update(cols)
    refs.functions.update(manual.get("functions", set()))
    for fn, cols in manual.get("function_return_columns", {}).items():
        refs.function_return_columns.setdefault(fn, set()).update(cols)

    return refs


def discover_schema_files() -> list[Path]:
    files: list[Path] = []
    roots = [REPO_ROOT / "backend", REPO_ROOT / "tests"]
    for root in roots:
        if not root.exists():
            continue
        for path in root.rglob("*.py"):
            if "__pycache__" in path.parts:
                continue
            source = path.read_text()
            rel = str(path.relative_to(REPO_ROOT))
            if '.table("' in source or '.rpc("' in source or rel in MANUAL_FILE_RULES:
                files.append(path)
    for rel in MANUAL_FILE_RULES:
        path = REPO_ROOT / rel
        if path.exists() and path not in files:
            files.append(path)
    return sorted(files)


def check_dependents() -> None:
    if not SCHEMA_PATH.exists():
        raise SystemExit(
            "Missing supabase/schema.sql.\n"
            "Run:\n"
            "  ./.venv/bin/python supabase/check_remote_schema.py --update"
        )

    schema = parse_schema(SCHEMA_PATH.read_text())
    failures: list[str] = []
    files = discover_schema_files()

    for path in files:
        rel = str(path.relative_to(REPO_ROOT))
        refs = extract_file_references(path)

        for table, columns in refs.tables.items():
            actual_columns = schema.tables.get(table)
            if actual_columns is None:
                failures.append(f"{rel}: references missing table `{table}`")
                continue
            missing_columns = sorted(col for col in columns if col not in actual_columns)
            if missing_columns:
                failures.append(
                    f"{rel}: table `{table}` is missing columns {', '.join('`'+c+'`' for c in missing_columns)}"
                )

        for fn in sorted(refs.functions):
            if fn not in schema.functions:
                failures.append(f"{rel}: references missing function `{fn}`")

        for fn, columns in refs.function_return_columns.items():
            actual_columns = schema.function_return_columns.get(fn)
            if actual_columns is None:
                failures.append(
                    f"{rel}: expects return columns from `{fn}`, but that function is not a parsed RETURNS TABLE in supabase/schema.sql"
                )
                continue
            missing_columns = sorted(col for col in columns if col not in actual_columns)
            if missing_columns:
                failures.append(
                    f"{rel}: function `{fn}` is missing return columns {', '.join('`'+c+'`' for c in missing_columns)}"
                )

    if failures:
        joined = "\n".join(f"- {item}" for item in failures)
        raise SystemExit(
            "Schema-dependent files are out of sync with supabase/schema.sql.\n"
            "Update the database, refresh the schema snapshot, or fix the code references.\n\n"
            f"{joined}"
        )

    print(f"Schema-dependent files match supabase/schema.sql ({len(files)} files checked).")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Check schema-dependent code files against supabase/schema.sql."
    )
    parser.parse_args()
    check_dependents()


if __name__ == "__main__":
    main()
