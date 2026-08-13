"""Verifying the JWTs Better Auth issues.

Better Auth runs in the TanStack Start process and owns the `auth` schema. This
module is the entire contract between the two services: a signed token, verified
against the published JWKS. Python never reads Better Auth's tables, so the two
sides can migrate independently.

Tokens are EdDSA (Ed25519) signed and short-lived (~15 min). Because the caller's
workspace and role travel *inside* the token, a demotion or workspace switch only
takes effect at the next mint — that staleness window is the deliberate cost of
not doing a database read on every request, and it is bounded by the expiry.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

import httpx
import jwt
import structlog
from jwt import PyJWKClient

from app.core.config import Settings, get_settings

log = structlog.get_logger(__name__)


class AuthError(Exception):
    """The token is missing, malformed, expired, or not ours."""


@dataclass(frozen=True)
class Principal:
    """Who is making a request, and what they may do.

    `workspace_id` is None when the user is signed in but has not selected a
    workspace. Endpoints that need one must reject that case rather than falling
    back to a default, or a user with no workspace would read someone else's.
    """

    user_id: str
    email: str | None
    workspace_id: str | None
    role: str | None

    @property
    def is_service(self) -> bool:
        return False


#: Roles ordered least to most privileged. Better Auth's organization plugin
#: names the same four; the two must agree, and this side is the one that
#: actually enforces.
ROLE_ORDER = ("viewer", "member", "admin", "owner")


def role_at_least(role: str | None, minimum: str) -> bool:
    if role is None:
        return False
    try:
        return ROLE_ORDER.index(role) >= ROLE_ORDER.index(minimum)
    except ValueError:
        # An unknown role is not silently treated as privileged.
        return False


class JwtVerifier:
    """Verifies Better Auth tokens, caching the signing keys.

    The JWKS is fetched lazily and cached: it changes only on key rotation, so
    fetching per request would add a round trip to every call for nothing. A
    verification failure against a cached key triggers exactly one refetch, which
    is what makes rotation recover without a restart.
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client: PyJWKClient | None = None
        self._client_created_at = 0.0

    @property
    def jwks_url(self) -> str:
        return f"{self._settings.auth_base_url.rstrip('/')}/api/auth/jwks"

    def _get_client(self, *, force_refresh: bool = False) -> PyJWKClient:
        stale = time.monotonic() - self._client_created_at > self._settings.jwks_cache_seconds
        if self._client is None or force_refresh or stale:
            self._client = PyJWKClient(self.jwks_url, cache_keys=True, lifespan=3600)
            self._client_created_at = time.monotonic()
        return self._client

    def _decode(self, token: str, *, force_refresh: bool) -> dict[str, Any]:
        client = self._get_client(force_refresh=force_refresh)
        signing_key = client.get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["EdDSA"],
            audience=self._settings.resolved_auth_audience,
            issuer=self._settings.auth_base_url,
            options={"require": ["exp", "sub"]},
        )

    def verify(self, token: str) -> Principal:
        try:
            claims = self._decode(token, force_refresh=False)
        except jwt.ExpiredSignatureError as exc:
            raise AuthError("token has expired") from exc
        except jwt.InvalidAudienceError as exc:
            raise AuthError("token was issued for a different audience") from exc
        except jwt.InvalidIssuerError as exc:
            raise AuthError("token was issued by a different service") from exc
        except (jwt.InvalidSignatureError, jwt.exceptions.PyJWKClientError) as exc:
            # Most likely the signing key rotated. Refetch once before giving up,
            # so a rotation does not take the API down until it restarts.
            log.info("jwks_refetch", reason=type(exc).__name__)
            try:
                claims = self._decode(token, force_refresh=True)
            except Exception as retry_exc:
                raise AuthError("token signature could not be verified") from retry_exc
        except jwt.InvalidTokenError as exc:
            raise AuthError(f"invalid token: {exc}") from exc
        except httpx.HTTPError as exc:
            raise AuthError(f"could not reach the auth service at {self.jwks_url}") from exc

        subject = claims.get("sub")
        if not subject:
            raise AuthError("token has no subject")

        return Principal(
            user_id=str(subject),
            email=claims.get("email"),
            workspace_id=claims.get("workspaceId") or None,
            role=claims.get("role") or None,
        )


_verifier: JwtVerifier | None = None


def get_verifier() -> JwtVerifier:
    global _verifier
    if _verifier is None:
        _verifier = JwtVerifier(get_settings())
    return _verifier


def reset_verifier() -> None:
    """Drop the cached verifier. Used by tests."""
    global _verifier
    _verifier = None
