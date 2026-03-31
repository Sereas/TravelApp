---
name: postgres-patterns
description: PostgreSQL database patterns for query optimization, schema design, indexing, and security. Based on Supabase best practices.
origin: ECC
---

# PostgreSQL Patterns

Quick reference for PostgreSQL best practices. For detailed guidance, use the `database-reviewer` agent.

## When to Activate

- Writing SQL queries or migrations
- Designing database schemas
- Troubleshooting slow queries
- Implementing Row Level Security
- Setting up connection pooling

## Quick Reference

### Index Cheat Sheet

| Query Pattern | Index Type | Example |
|--------------|------------|---------|
| `WHERE col = value` | B-tree (default) | `CREATE INDEX idx ON t (col)` |
| `WHERE col > value` | B-tree | `CREATE INDEX idx ON t (col)` |
| `WHERE a = x AND b > y` | Composite | `CREATE INDEX idx ON t (a, b)` |
| `WHERE jsonb @> '{}'` | GIN | `CREATE INDEX idx ON t USING gin (col)` |
| `WHERE tsv @@ query` | GIN | `CREATE INDEX idx ON t USING gin (col)` |
| Time-series ranges | BRIN | `CREATE INDEX idx ON t USING brin (col)` |

### Data Type Quick Reference

| Use Case | Correct Type | Avoid |
|----------|-------------|-------|
| IDs | `bigint` | `int`, random UUID |
| Strings | `text` | `varchar(255)` |
| Timestamps | `timestamptz` | `timestamp` |
| Money | `numeric(10,2)` | `float` |
| Flags | `boolean` | `varchar`, `int` |

### Common Patterns

**Composite Index Order:**
```sql
-- Equality columns first, then range columns
CREATE INDEX idx ON orders (status, created_at);
-- Works for: WHERE status = 'pending' AND created_at > '2024-01-01'
```

**Covering Index:**
```sql
CREATE INDEX idx ON users (email) INCLUDE (name, created_at);
-- Avoids table lookup for SELECT email, name, created_at
```

**Partial Index:**
```sql
CREATE INDEX idx ON users (email) WHERE deleted_at IS NULL;
-- Smaller index, only includes active users
```

**RLS Policy (Optimized):**
```sql
CREATE POLICY policy ON orders
  USING ((SELECT auth.uid()) = user_id);  -- Wrap in SELECT!
```

**UPSERT:**
```sql
INSERT INTO settings (user_id, key, value)
VALUES (123, 'theme', 'dark')
ON CONFLICT (user_id, key)
DO UPDATE SET value = EXCLUDED.value;
```

**Cursor Pagination:**
```sql
SELECT * FROM products WHERE id > $last_id ORDER BY id LIMIT 20;
-- O(1) vs OFFSET which is O(n)
```

**Queue Processing:**
```sql
UPDATE jobs SET status = 'processing'
WHERE id = (
  SELECT id FROM jobs WHERE status = 'pending'
  ORDER BY created_at LIMIT 1
  FOR UPDATE SKIP LOCKED
) RETURNING *;
```

### Anti-Pattern Detection

```sql
-- Find unindexed foreign keys
SELECT conrelid::regclass, a.attname
FROM pg_constraint c
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
WHERE c.contype = 'f'
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = c.conrelid AND a.attnum = ANY(i.indkey)
  );

-- Find slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY mean_exec_time DESC;

-- Check table bloat
SELECT relname, n_dead_tup, last_vacuum
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY n_dead_tup DESC;
```

### Configuration Template

```sql
-- Connection limits (adjust for RAM)
ALTER SYSTEM SET max_connections = 100;
ALTER SYSTEM SET work_mem = '8MB';

-- Timeouts
ALTER SYSTEM SET idle_in_transaction_session_timeout = '30s';
ALTER SYSTEM SET statement_timeout = '30s';

-- Monitoring
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Security defaults
REVOKE ALL ON SCHEMA public FROM public;

SELECT pg_reload_conf();
```

## This Project's Patterns

Patterns specific to this travel app — copy these instead of inventing new ones.

### Ownership verification (one round-trip)
```python
# CORRECT — single DB call resolves the full chain
await _ensure_resource_chain(supabase, trip_id=trip_id, user_id=user_id,
                              day_id=day_id, option_id=option_id)

# WRONG — each is a separate DB round-trip
await _ensure_trip_owned(supabase, trip_id, user_id)
await _ensure_day_in_trip(supabase, day_id, trip_id)
await _ensure_option_in_day(supabase, option_id, day_id)
```

### Batch insert via unnest RPC
```sql
-- batch_insert_option_locations — single INSERT via unnest
INSERT INTO option_locations (option_id, location_id, sort_order, time_period)
SELECT p_option_id, unnest(p_location_ids), unnest(p_sort_orders), unnest(p_time_periods);
```

### Batch update via UPDATE FROM unnest
```sql
-- reorder_option_locations — single UPDATE, no loop
UPDATE option_locations ol
SET sort_order = ord.sort_order
FROM unnest(p_location_ids) WITH ORDINALITY AS ord(location_id, sort_order)
WHERE ol.option_id = p_option_id AND ol.location_id = ord.location_id;
```

### Aggregated read with LEFT JOIN LATERAL
```sql
-- get_itinerary_routes — mark STABLE, aggregate with LATERAL
CREATE OR REPLACE FUNCTION get_itinerary_routes(p_option_ids uuid[])
RETURNS TABLE(...) LANGUAGE sql STABLE AS $$
  SELECT o.id, ...
  FROM day_options o
  LEFT JOIN LATERAL (
    SELECT json_agg(...) FROM option_routes r WHERE r.option_id = o.id
  ) routes ON true
  WHERE o.id = ANY(p_option_ids);
$$;
```

### Ownership baked into read RPC
```sql
-- get_itinerary_tree — skip ownership round-trip if RPC returns data
CREATE OR REPLACE FUNCTION get_itinerary_tree(p_trip_id uuid, p_user_id uuid)
RETURNS TABLE(...) LANGUAGE sql STABLE AS $$
  SELECT ... FROM trips t
  WHERE t.id = p_trip_id
    AND EXISTS (SELECT 1 FROM trips WHERE id = p_trip_id AND user_id = p_user_id);
$$;
```

### Column selection constant (never SELECT *)
```python
# backend/app/routers/ — use the named constant, not inline strings
_LOCATIONS_SELECT = "id, name, address, city, category, ..."  # no google_raw
_LOCATIONS_SELECT_WITH_RAW = _LOCATIONS_SELECT + ", google_raw"  # only for single POST response
```

## Related

- Agent: `database-reviewer` - Full database review workflow
- Skill: `clickhouse-io` - ClickHouse analytics patterns
- Skill: `backend-patterns` - API and backend patterns

---

*Based on Supabase Agent Skills (credit: Supabase team) (MIT License)*
