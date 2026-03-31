"""FastAPI dependencies: auth and shared services."""

import base64
from functools import lru_cache
from uuid import UUID

import jwt as pyjwt
import structlog
from fastapi import Depends, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

from backend.app.clients.google_places import GooglePlacesClient, GooglePlacesDisabledError
from backend.app.clients.google_routes import GoogleRoutesClient
from backend.app.core.config import get_settings

logger: structlog.stdlib.BoundLogger = structlog.get_logger("auth")

_scheme = HTTPBearer(auto_error=False)


@lru_cache
def _get_jwk_client() -> PyJWKClient | None:
    settings = get_settings()
    if settings.supabase_url:
        jwks_url = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
        return PyJWKClient(jwks_url, cache_keys=True)
    return None


def _verify_token(token: str) -> dict:
    """Verify JWT using JWKS (ES256) with HS256 fallback for tests."""
    settings = get_settings()

    jwk_client = _get_jwk_client()
    if jwk_client:
        try:
            signing_key = jwk_client.get_signing_key_from_jwt(token)
            return pyjwt.decode(
                token,
                signing_key.key,
                algorithms=["ES256"],
                audience="authenticated",
            )
        except Exception as exc:
            logger.debug("jwks_verification_failed", error=str(exc))

    if not settings.supabase_jwt_secret:
        raise pyjwt.InvalidTokenError("No verification method available")

    secret = settings.supabase_jwt_secret
    try:
        return pyjwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            audience=["authenticated"],
            options={"verify_aud": False},
        )
    except pyjwt.InvalidTokenError:
        raw = base64.b64decode(secret)
        return pyjwt.decode(
            token,
            raw,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )


async def get_current_user_id(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_scheme),
) -> UUID:
    """
    Validate Supabase JWT from Authorization: Bearer <token>.
    Set authenticated user id on request state; return 401 if missing or invalid.
    """
    settings = get_settings()
    if not settings.supabase_jwt_secret and not settings.supabase_url:
        logger.error("auth_failed", reason="no_jwt_verification_configured")
        raise _auth_error("JWT verification not configured")

    if not credentials:
        logger.info("auth_failed", reason="missing_authorization_header")
        raise _auth_error("Missing Authorization header")

    token = credentials.credentials
    try:
        payload = _verify_token(token)
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
    request.state.user_email = payload.get("email")
    logger.debug("auth_success", user_id=str(user_id))
    return user_id


async def get_current_user_email(request: Request) -> str | None:
    """Return the authenticated user's email from request state (set by get_current_user_id)."""
    return getattr(request.state, "user_email", None)


def get_google_places_client(request: Request) -> GooglePlacesClient:
    """Return the singleton GooglePlacesClient from app state, or raise if not configured."""
    client = getattr(request.app.state, "google_places_client", None)
    if client is None:
        raise GooglePlacesDisabledError("Google Places API not configured")
    return client


def get_google_places_client_optional(request: Request) -> GooglePlacesClient | None:
    """Return the singleton GooglePlacesClient from app state, or None if not configured."""
    return getattr(request.app.state, "google_places_client", None)


def get_google_routes_client(request: Request) -> GoogleRoutesClient | None:
    """Return the singleton GoogleRoutesClient from app state, or None if not configured."""
    return getattr(request.app.state, "google_routes_client", None)


def _auth_error(detail: str):
    from fastapi import HTTPException

    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )
