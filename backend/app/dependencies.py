"""FastAPI dependencies: auth and shared services."""

from uuid import UUID

from fastapi import Depends, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from backend.app.core.config import get_settings

_scheme = HTTPBearer(auto_error=False)


async def get_current_user_id(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_scheme),
) -> UUID:
    """
    Validate Supabase JWT from Authorization: Bearer <token>.
    Set authenticated user id on request state; return 401 if missing or invalid.
    """
    settings = get_settings()
    if not settings.supabase_jwt_secret:
        raise _auth_error("JWT secret not configured")

    if not credentials:
        raise _auth_error("Missing Authorization header")

    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            options={
                "verify_signature": True,
                "verify_exp": True,
                "verify_aud": False,
                "require_sub": True,
            },
        )
    except JWTError:
        raise _auth_error("Invalid or expired token") from None

    sub = payload.get("sub")
    if not sub:
        raise _auth_error("Token missing subject")

    try:
        user_id = UUID(sub)
    except (ValueError, TypeError):
        raise _auth_error("Invalid subject in token") from None

    request.state.user_id = user_id
    return user_id


def _auth_error(detail: str):
    from fastapi import HTTPException

    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )
