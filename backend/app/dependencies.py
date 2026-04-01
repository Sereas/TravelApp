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
    """Create and cache the JWKS client (process lifetime).

    LOW-04: ``cache_keys=True`` caches signing keys but automatically fetches
    new keys when a token presents an unknown ``kid`` (key ID). This handles
    Supabase key rotation without needing a process restart.
    """
    settings = get_settings()
    if settings.supabase_url:
        jwks_url = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
        return PyJWKClient(jwks_url, cache_keys=True)
    return None


def _verify_token(token: str) -> dict:
    """Verify JWT using JWKS (ES256) with HS256 fallback for local/test only.

    CRIT-01: HS256 path always enforces audience="authenticated".
    CRIT-02: Only JWT-specific errors fall through to HS256; network errors
    (ConnectionError, TimeoutError, etc.) propagate and cause 401.
    """
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
        except pyjwt.exceptions.PyJWKClientConnectionError:
            # Network failure reaching JWKS endpoint — fail closed, do NOT
            # fall through to HS256.  Let the outer handler return 401.
            raise
        except pyjwt.PyJWTError as exc:
            # Token-level errors (bad signature, expired, wrong algorithm,
            # key-not-found) — fall through to HS256 for local/test envs.
            logger.debug("jwks_verification_failed", error=str(exc), error_type=type(exc).__name__)

    if not settings.supabase_jwt_secret:
        raise pyjwt.InvalidTokenError("No verification method available")

    secret = settings.supabase_jwt_secret
    try:
        return pyjwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except pyjwt.InvalidTokenError:
        raw = base64.b64decode(secret)
        return pyjwt.decode(
            token,
            raw,
            algorithms=["HS256"],
            audience="authenticated",
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
        logger.error("auth_failed", reason="no_jwt_verification_configured", error_category="auth")
        raise _auth_error("JWT verification not configured")

    if not credentials:
        logger.warning("auth_failed", reason="missing_authorization_header", error_category="auth")
        raise _auth_error("Missing Authorization header")

    token = credentials.credentials
    try:
        payload = _verify_token(token)
    except Exception:
        logger.warning("auth_failed", reason="invalid_or_expired_token", error_category="auth")
        raise _auth_error("Invalid or expired token") from None

    sub = payload.get("sub")
    if not sub:
        logger.warning("auth_failed", reason="token_missing_subject", error_category="auth")
        raise _auth_error("Token missing subject")

    try:
        user_id = UUID(sub)
    except (ValueError, TypeError):
        logger.warning("auth_failed", reason="invalid_subject", sub=sub, error_category="auth")
        raise _auth_error("Invalid subject in token") from None

    request.state.user_id = user_id
    request.state.user_email = payload.get("email")
    structlog.contextvars.bind_contextvars(user_id=str(user_id))
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
