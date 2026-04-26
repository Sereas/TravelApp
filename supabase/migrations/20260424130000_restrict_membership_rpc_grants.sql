-- ============================================================
-- Migration: restrict membership RPCs to service_role only
-- 2026-04-24
--
-- Prevents direct Supabase client calls with arbitrary user_id
-- parameters. All access flows through the Python layer which
-- validates user identity from the JWT.
-- ============================================================
REVOKE ALL ON FUNCTION public.verify_member_access(uuid, uuid, text, uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.list_user_trips(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.create_trip_with_owner(character varying, date, date, uuid, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.accept_invitation(text, uuid, text) FROM authenticated;

-- Also restrict get_itinerary_tree (2-arg) — accepts arbitrary p_user_id,
-- and NULL bypasses the membership check entirely.
REVOKE ALL ON FUNCTION public.get_itinerary_tree(uuid, uuid) FROM authenticated;
