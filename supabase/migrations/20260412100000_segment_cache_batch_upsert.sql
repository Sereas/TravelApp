-- Phase 4: batch upsert for segment_cache to replace per-segment upsert+refetch.
-- Returns all upserted rows so the caller doesn't need a follow-up SELECT.
CREATE OR REPLACE FUNCTION batch_upsert_segment_cache(p_rows jsonb)
RETURNS SETOF segment_cache
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  INSERT INTO segment_cache (
    cache_key,
    transport_mode,
    origin_place_id,
    destination_place_id,
    origin_lat,
    origin_lng,
    destination_lat,
    destination_lng,
    distance_meters,
    duration_seconds,
    encoded_polyline,
    provider,
    raw_provider_response,
    status,
    error_message,
    error_type,
    error_code,
    provider_http_status,
    input_fingerprint,
    last_attempt_at,
    next_retry_at,
    cache_expires_at,
    retry_count,
    calculated_at
  )
  SELECT
    (r->>'cache_key')::text,
    (r->>'transport_mode')::text,
    (r->>'origin_place_id')::text,
    (r->>'destination_place_id')::text,
    (r->>'origin_lat')::double precision,
    (r->>'origin_lng')::double precision,
    (r->>'destination_lat')::double precision,
    (r->>'destination_lng')::double precision,
    (r->>'distance_meters')::integer,
    (r->>'duration_seconds')::integer,
    (r->>'encoded_polyline')::text,
    COALESCE((r->>'provider')::text, 'google'),
    (r->'raw_provider_response')::jsonb,
    (r->>'status')::text,
    (r->>'error_message')::text,
    (r->>'error_type')::text,
    (r->>'error_code')::text,
    (r->>'provider_http_status')::integer,
    (r->>'input_fingerprint')::text,
    (r->>'last_attempt_at')::timestamptz,
    (r->>'next_retry_at')::timestamptz,
    (r->>'cache_expires_at')::timestamptz,
    COALESCE((r->>'retry_count')::integer, 0),
    COALESCE((r->>'calculated_at')::timestamptz, now())
  FROM jsonb_array_elements(p_rows) AS r
  ON CONFLICT (cache_key) DO UPDATE SET
    transport_mode        = EXCLUDED.transport_mode,
    origin_place_id       = EXCLUDED.origin_place_id,
    destination_place_id  = EXCLUDED.destination_place_id,
    origin_lat            = EXCLUDED.origin_lat,
    origin_lng            = EXCLUDED.origin_lng,
    destination_lat       = EXCLUDED.destination_lat,
    destination_lng       = EXCLUDED.destination_lng,
    distance_meters       = EXCLUDED.distance_meters,
    duration_seconds      = EXCLUDED.duration_seconds,
    encoded_polyline      = EXCLUDED.encoded_polyline,
    provider              = EXCLUDED.provider,
    raw_provider_response = EXCLUDED.raw_provider_response,
    status                = EXCLUDED.status,
    error_message         = EXCLUDED.error_message,
    error_type            = EXCLUDED.error_type,
    error_code            = EXCLUDED.error_code,
    provider_http_status  = EXCLUDED.provider_http_status,
    input_fingerprint     = EXCLUDED.input_fingerprint,
    last_attempt_at       = EXCLUDED.last_attempt_at,
    next_retry_at         = EXCLUDED.next_retry_at,
    cache_expires_at      = EXCLUDED.cache_expires_at,
    retry_count           = EXCLUDED.retry_count,
    calculated_at         = EXCLUDED.calculated_at
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION batch_upsert_segment_cache(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION batch_upsert_segment_cache(jsonb) TO service_role;
