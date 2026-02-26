"""FastAPI dependencies: auth and shared services."""

import base64
from uuid import UUID

import structlog
from fastapi import Depends, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from backend.app.core.config import get_settings

logger: structlog.stdlib.BoundLogger = structlog.get_logger("auth")

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
        logger.error("auth_failed", reason="jwt_secret_not_configured")
        raise _auth_error("JWT secret not configured")

    if not credentials:
        logger.info("auth_failed", reason="missing_authorization_header")
        raise _auth_error("Missing Authorization header")

    token = credentials.credentials
    decode_opts = {
        "verify_signature": True,
        "verify_exp": True,
        "verify_aud": False,
        "require_sub": True,
    }
    secret = settings.supabase_jwt_secret
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"], options=decode_opts)
    except JWTError:
        try:
            raw_secret = base64.b64decode(secret)
            payload = jwt.decode(token, raw_secret, algorithms=["HS256"], options=decode_opts)
        except Exception:
            logger.warning("auth_failed", reason="invalid_or_expired_token")
            raise _auth_error("Invalid or expired token") from None

    sub = payload.get("sub")
    if not sub:
        logger.warning("auth_failed", reason="token_missing_subject")
        raise _auth_error("Token missing subject")

    try:
        user_id = UUID(sub)
    except (ValueError, TypeError):
        logger.warning("auth_failed", reason="invalid_subject", sub=sub)
        raise _auth_error("Invalid subject in token") from None

    request.state.user_id = user_id
    logger.debug("auth_success", user_id=str(user_id))
    return user_id


def _auth_error(detail: str):
    from fastapi import HTTPException

    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )
