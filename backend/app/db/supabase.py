"""Supabase client for server-side operations.

Uses SUPABASE_SERVICE_ROLE_KEY exclusively. Anon key fallback was removed
(CRIT-03): the backend must never run with the anon key.

Includes lightweight instrumentation: every .execute() call is logged at DEBUG
level with table/rpc name, operation type, and duration.
"""

import time
from functools import lru_cache

import structlog

from backend.app.core.config import get_settings
from supabase import Client, create_client

logger: structlog.stdlib.BoundLogger = structlog.get_logger("db")


class _InstrumentedRequestBuilder:
    """Wraps SyncRequestBuilder to inject instrumentation into query chains."""

    def __init__(self, builder, table_name: str):
        self._builder = builder
        self._table_name = table_name

    def select(self, *args, **kwargs):
        result = self._builder.select(*args, **kwargs)
        return self._wrap(result, "select")

    def insert(self, *args, **kwargs):
        result = self._builder.insert(*args, **kwargs)
        return self._wrap(result, "insert")

    def update(self, *args, **kwargs):
        result = self._builder.update(*args, **kwargs)
        return self._wrap(result, "update")

    def upsert(self, *args, **kwargs):
        result = self._builder.upsert(*args, **kwargs)
        return self._wrap(result, "upsert")

    def delete(self, *args, **kwargs):
        result = self._builder.delete(*args, **kwargs)
        return self._wrap(result, "delete")

    def _wrap(self, query_builder, operation: str):
        """Patch the execute method on the returned query builder."""
        original_execute = query_builder.execute

        def instrumented_execute():
            start = time.perf_counter()
            result = original_execute()
            duration_ms = round((time.perf_counter() - start) * 1000, 1)
            data = result.data
            rows = len(data) if isinstance(data, list) else (1 if data else 0)
            logger.debug(
                "db_execute",
                table=self._table_name,
                operation=operation,
                duration_ms=duration_ms,
                rows=rows,
            )
            return result

        query_builder.execute = instrumented_execute
        return query_builder


class _InstrumentedRpcBuilder:
    """Wraps RPC builder to log execute() calls."""

    def __init__(self, builder, rpc_name: str):
        self._builder = builder
        self._rpc_name = rpc_name
        # Patch execute on the builder directly
        original_execute = builder.execute

        def instrumented_execute():
            start = time.perf_counter()
            result = original_execute()
            duration_ms = round((time.perf_counter() - start) * 1000, 1)
            data = result.data
            rows = len(data) if isinstance(data, list) else (1 if data else 0)
            logger.debug(
                "db_execute",
                table=rpc_name,
                operation="rpc",
                duration_ms=duration_ms,
                rows=rows,
            )
            return result

        self._instrumented_execute = instrumented_execute

    def execute(self):
        return self._instrumented_execute()

    def __getattr__(self, name):
        return getattr(self._builder, name)


class InstrumentedClient:
    """Wraps Supabase Client to add DEBUG-level logging on every execute()."""

    def __init__(self, client: Client):
        self._client = client

    def table(self, name: str):
        builder = self._client.table(name)
        return _InstrumentedRequestBuilder(builder, name)

    def rpc(self, fn_name: str, params: dict | None = None):
        builder = self._client.rpc(fn_name, params or {})
        return _InstrumentedRpcBuilder(builder, fn_name)

    @property
    def storage(self):
        return self._client.storage

    @property
    def auth(self):
        return self._client.auth

    def __getattr__(self, name):
        return getattr(self._client, name)


@lru_cache
def get_supabase_client():
    """Create and cache instrumented Supabase client (process lifetime).

    LOW-03: Cached for the process lifetime. Rotating SUPABASE_SERVICE_ROLE_KEY
    requires a process restart (container redeploy) for the new key to take effect.
    """
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    raw_client = create_client(settings.supabase_url, settings.supabase_key)
    return InstrumentedClient(raw_client)
