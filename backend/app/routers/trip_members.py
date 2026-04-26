"""Trip membership and invite link endpoints."""

import hashlib
import secrets
from typing import Annotated
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Path, Request, status
from slowapi.util import get_remote_address

from backend.app.core.config import get_settings
from backend.app.core.rate_limit import get_user_rate_limit_key, limiter
from backend.app.db.supabase import get_supabase_client
from backend.app.dependencies import get_current_user_email, get_current_user_id
from backend.app.models.schemas import (
    InviteAcceptResponse,
    InviteLinkResponse,
    InvitePreviewResponse,
    TripMemberResponse,
)
from backend.app.routers.trip_ownership import _ensure_resource_chain

logger: structlog.stdlib.BoundLogger = structlog.get_logger("trip_members")

_FRONTEND_BASE = get_settings().frontend_base_url

# ---------------------------------------------------------------------------
# Trip-scoped endpoints (under /trips/{trip_id}/...)
# ---------------------------------------------------------------------------
trip_router = APIRouter(prefix="/trips", tags=["trip-members"])


@trip_router.get("/{trip_id}/members", response_model=list[TripMemberResponse])
async def list_members(
    trip_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """List all members of a trip. Any member can call this."""
    _ensure_resource_chain(supabase, trip_id, user_id)
    result = (
        supabase.table("trip_members")
        .select("id, user_id, email, role, joined_at")
        .eq("trip_id", str(trip_id))
        .execute()
    )
    return [TripMemberResponse(**row) for row in (result.data or [])]


@trip_router.post(
    "/{trip_id}/invitations",
    response_model=InviteLinkResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("10/minute", key_func=get_user_rate_limit_key)
async def create_invitation(
    request: Request,
    trip_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """Generate a multi-use invite link (valid 7 days). Owner only.

    Idempotent: if an active link already exists, returns it instead
    of creating a duplicate.
    """
    from datetime import UTC, datetime

    _ensure_resource_chain(supabase, trip_id, user_id, required_role="owner")

    # Return existing active link if one exists
    existing = (
        supabase.table("trip_invitations")
        .select("id, token, expires_at, created_at")
        .eq("trip_id", str(trip_id))
        .is_("revoked_at", "null")
        .gt("expires_at", datetime.now(UTC).isoformat())
        .not_.is_("token", "null")
        .limit(1)
        .execute()
    )
    if existing.data:
        row = existing.data[0]
        return InviteLinkResponse(
            id=str(row["id"]),
            invite_url=f"{_FRONTEND_BASE}/invite/{row['token']}",
            expires_at=row["expires_at"],
            created_at=row["created_at"],
        )

    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

    result = (
        supabase.table("trip_invitations")
        .insert(
            {
                "trip_id": str(trip_id),
                "token_hash": token_hash,
                "token": raw_token,
                "role": "editor",
                "invited_by": str(user_id),
            }
        )
        .execute()
    )
    row = result.data[0]
    invite_url = f"{_FRONTEND_BASE}/invite/{raw_token}"
    logger.info("invitation_created", trip_id=str(trip_id), user_id=str(user_id))
    return InviteLinkResponse(
        id=str(row["id"]),
        invite_url=invite_url,
        expires_at=row["expires_at"],
        created_at=row["created_at"],
    )


@trip_router.get("/{trip_id}/invitations", response_model=list[InviteLinkResponse])
async def list_invitations(
    trip_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """List active (non-revoked, non-expired) invite links. Owner only."""
    from datetime import UTC, datetime

    _ensure_resource_chain(supabase, trip_id, user_id, required_role="owner")
    result = (
        supabase.table("trip_invitations")
        .select("id, token, expires_at, created_at")
        .eq("trip_id", str(trip_id))
        .is_("revoked_at", "null")
        .not_.is_("token", "null")
        .gt("expires_at", datetime.now(UTC).isoformat())
        .execute()
    )
    return [
        InviteLinkResponse(
            id=str(row["id"]),
            invite_url=f"{_FRONTEND_BASE}/invite/{row['token']}",
            expires_at=row["expires_at"],
            created_at=row["created_at"],
        )
        for row in (result.data or [])
    ]


@trip_router.delete(
    "/{trip_id}/invitations/{invitation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def revoke_invitation(
    trip_id: UUID,
    invitation_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """Revoke an invite link. Owner only."""
    from datetime import UTC, datetime

    _ensure_resource_chain(supabase, trip_id, user_id, required_role="owner")
    result = (
        supabase.table("trip_invitations")
        .update({"revoked_at": datetime.now(UTC).isoformat()})
        .eq("id", str(invitation_id))
        .eq("trip_id", str(trip_id))
        .is_("revoked_at", "null")
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active invitation not found",
        )


@trip_router.delete(
    "/{trip_id}/members/{member_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_member(
    trip_id: UUID,
    member_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    supabase=Depends(get_supabase_client),
):
    """Remove a member. Owner can remove editors; editors can remove themselves."""
    role = _ensure_resource_chain(supabase, trip_id, user_id)

    # Fetch the target member
    result = (
        supabase.table("trip_members")
        .select("id, user_id, role")
        .eq("id", str(member_id))
        .eq("trip_id", str(trip_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    target = result.data[0]
    target_user_id = target["user_id"]
    target_role = target["role"]

    # Owner cannot be removed
    if target_role == "owner":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove the trip owner",
        )

    # Editor can only remove themselves
    if role != "owner" and str(target_user_id) != str(user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the owner can remove other members",
        )

    supabase.table("trip_members").delete().eq("id", str(member_id)).eq(
        "trip_id", str(trip_id)
    ).execute()
    logger.info(
        "member_removed",
        trip_id=str(trip_id),
        removed_user_id=str(target_user_id),
        by_user_id=str(user_id),
    )


# ---------------------------------------------------------------------------
# Public invite endpoints (under /invitations/...)
# ---------------------------------------------------------------------------
invite_router = APIRouter(tags=["invitations"])


@invite_router.get("/invitations/{token}", response_model=InvitePreviewResponse)
@limiter.limit("30/minute", key_func=get_remote_address)
async def get_invite_preview(
    request: Request,
    token: Annotated[str, Path(max_length=128)],
    supabase=Depends(get_supabase_client),
):
    """
    Public endpoint. Returns minimal invite preview (trip name, status).
    No authentication required. Single DB round-trip via RPC.
    """
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    result = supabase.rpc("get_invite_preview", {"p_token_hash": token_hash}).execute()

    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")

    row = result.data[0]
    inv_status = row["inv_status"]

    return InvitePreviewResponse(
        trip_name=row["trip_name"] or "",
        expires_at=row["expires_at"] if inv_status == "active" else "",
        status=inv_status,
    )


@invite_router.post("/invitations/{token}/accept", response_model=InviteAcceptResponse)
@limiter.limit("5/minute", key_func=get_user_rate_limit_key)
async def accept_invitation(
    request: Request,
    token: Annotated[str, Path(max_length=128)],
    user_id: UUID = Depends(get_current_user_id),
    user_email: str | None = Depends(get_current_user_email),
    supabase=Depends(get_supabase_client),
):
    """Accept an invitation. Requires authentication."""
    token_hash = hashlib.sha256(token.encode()).hexdigest()

    try:
        result = supabase.rpc(
            "accept_invitation",
            {
                "p_token_hash": token_hash,
                "p_user_id": str(user_id),
                "p_user_email": user_email,
            },
        ).execute()
    except Exception as exc:
        err_msg = str(exc)
        if "INVITE_NOT_FOUND" in err_msg:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found"
            ) from exc
        if "INVITE_REVOKED" in err_msg:
            raise HTTPException(
                status_code=status.HTTP_410_GONE, detail="This invite is no longer valid"
            ) from exc
        if "INVITE_EXPIRED" in err_msg:
            raise HTTPException(
                status_code=status.HTTP_410_GONE, detail="This invite has expired"
            ) from exc
        if "ALREADY_MEMBER" in err_msg:
            # RPC embeds trip_id in exception: "ALREADY_MEMBER:<uuid>"
            import re

            match = re.search(
                r"ALREADY_MEMBER:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})",
                err_msg,
            )
            if match:
                return InviteAcceptResponse(trip_id=match.group(1), role="editor")
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Already a member"
            ) from exc
        # M5 fix: don't leak raw DB errors
        logger.exception("accept_invitation_error", user_id=str(user_id), error=err_msg)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to accept invitation",
        ) from exc

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to accept invitation",
        )

    row = result.data[0] if isinstance(result.data, list) else result.data
    trip_id = row["trip_id"] if isinstance(row, dict) else result.data
    role = row.get("role", "editor") if isinstance(row, dict) else "editor"

    logger.info(
        "invitation_accepted",
        trip_id=str(trip_id),
        user_id=str(user_id),
    )
    return InviteAcceptResponse(trip_id=str(trip_id), role=role)
