-- 1. Drop duplicate index on route_segments
DROP INDEX IF EXISTS public.route_segments_route_id_idx;

-- 2. Set search_path on all public functions missing it
ALTER FUNCTION public.batch_insert_option_locations(uuid, uuid[], integer[], text[]) SET search_path = public;
ALTER FUNCTION public.create_route_with_stops(uuid, varchar, varchar, uuid[]) SET search_path = public;
ALTER FUNCTION public.delete_days_batch(uuid, uuid[]) SET search_path = public;
ALTER FUNCTION public.delete_empty_dateless_days(uuid) SET search_path = public;
ALTER FUNCTION public.delete_location_cascade(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.get_itinerary_routes(uuid[]) SET search_path = public;
ALTER FUNCTION public.get_itinerary_tree(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.get_itinerary_tree(uuid) SET search_path = public;
ALTER FUNCTION public.get_option_routes(uuid) SET search_path = public;
ALTER FUNCTION public.move_option_to_day(uuid, uuid, uuid) SET search_path = public;
ALTER FUNCTION public.reconcile_clear_dates(uuid, uuid[]) SET search_path = public;
ALTER FUNCTION public.remove_location_from_option(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.reorder_day_options(uuid, uuid[]) SET search_path = public;
ALTER FUNCTION public.reorder_days_by_date(uuid) SET search_path = public;
ALTER FUNCTION public.reorder_option_locations(uuid, uuid[]) SET search_path = public;
ALTER FUNCTION public.reorder_trip_days(uuid, uuid[]) SET search_path = public;
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.shift_day_dates(uuid, integer) SET search_path = public;
ALTER FUNCTION public.update_route_with_stops(uuid, uuid, text, text, uuid[]) SET search_path = public;
ALTER FUNCTION public.verify_resource_chain(uuid, uuid, uuid, uuid) SET search_path = public;
