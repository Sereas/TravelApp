-- INFO-01/02: Restrict RPC grants — revoke anon access from internal RPCs.
-- Only get_shared_trip_data should be callable by the anon role (public shared trips).
-- The backend always uses service_role, so authenticated/service_role grants remain.

-- Revoke anon from all internal RPCs
REVOKE ALL ON FUNCTION public.batch_insert_option_locations(uuid, uuid[], integer[], text[]) FROM anon;
REVOKE ALL ON FUNCTION public.create_route_with_stops(uuid, varchar, varchar, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.delete_days_batch(uuid, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.delete_empty_dateless_days(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.delete_location_cascade(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_itinerary_routes(uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.get_itinerary_tree(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_itinerary_tree(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_option_routes(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.move_option_to_day(uuid, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_clear_dates(uuid, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.remove_location_from_option(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.reorder_day_options(uuid, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.reorder_days_by_date(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.reorder_option_locations(uuid, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.reorder_trip_days(uuid, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.shift_day_dates(uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.update_route_with_stops(uuid, uuid, text, text, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.verify_resource_chain(uuid, uuid, uuid, uuid) FROM anon;

-- Revoke anon from all tables (backend uses service_role exclusively)
REVOKE ALL ON TABLE public.trips FROM anon;
REVOKE ALL ON TABLE public.locations FROM anon;
REVOKE ALL ON TABLE public.trip_days FROM anon;
REVOKE ALL ON TABLE public.day_options FROM anon;
REVOKE ALL ON TABLE public.option_locations FROM anon;
REVOKE ALL ON TABLE public.option_routes FROM anon;
REVOKE ALL ON TABLE public.route_stops FROM anon;
REVOKE ALL ON TABLE public.route_segments FROM anon;
REVOKE ALL ON TABLE public.segment_cache FROM anon;
REVOKE ALL ON TABLE public.place_photos FROM anon;
REVOKE ALL ON TABLE public.trip_shares FROM anon;

-- Also revoke trigger utility function
REVOKE ALL ON FUNCTION public.set_updated_at() FROM anon;

-- Prevent future functions/tables from auto-granting to anon
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES FROM anon;

-- Explicitly grant get_shared_trip_data to anon (public shared trips)
GRANT EXECUTE ON FUNCTION public.get_shared_trip_data(text) TO anon;
