"""Shared helpers for enforcing trip ownership across routers."""

from uuid import UUID

from fastapi import HTTPException, status


def _ensure_trip_owned(supabase, trip_id: UUID, user_id: UUID) -> None:
    """Raise 404 if trip does not exist or is not owned by user."""
    result = (
        supabase.table("trips")
        .select("trip_id, user_id")
        .eq("trip_id", str(trip_id))
        .execute()
    )
    if not result.data or len(result.data) == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found")
    if result.data[0].get("user_id") != str(user_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not owned by user",
        )

