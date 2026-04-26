-- ============================================================
-- Migration: pin search_path on SECURITY DEFINER membership RPCs
-- 2026-04-24
--
-- Consistent with 20260331100000 pattern. Prevents search-path
-- injection on functions that execute with elevated privileges.
-- ============================================================
ALTER FUNCTION public.verify_member_access(uuid, uuid, text, uuid, uuid) SET search_path = public;
ALTER FUNCTION public.list_user_trips(uuid) SET search_path = public;
ALTER FUNCTION public.create_trip_with_owner(character varying, date, date, uuid, text) SET search_path = public;
ALTER FUNCTION public.accept_invitation(text, uuid, text) SET search_path = public;
ALTER FUNCTION public.get_itinerary_tree(uuid, uuid) SET search_path = public;
