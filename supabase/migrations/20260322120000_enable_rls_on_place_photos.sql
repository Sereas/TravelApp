-- Enable RLS on place_photos (backend uses service role key, so no policies needed —
-- same pattern as route_segments and segment_cache).
ALTER TABLE public.place_photos ENABLE ROW LEVEL SECURITY;

-- Create place-photos storage bucket (public read, service-role write)
INSERT INTO storage.buckets (id, name, public)
VALUES ('place-photos', 'place-photos', true)
ON CONFLICT (id) DO NOTHING;
