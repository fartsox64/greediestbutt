"""Steam OpenID 2.0 authentication and JWT session helpers."""

import re
import urllib.parse
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .database import get_db


@dataclass
class AuthenticatedUser:
    """Lightweight current-user object: auth fields from users + name/avatar from steam_player_cache."""
    steam_id: int
    role: str | None
    player_name: str | None
    avatar_url: str | None

STEAM_OPENID_URL = "https://steamcommunity.com/openid/login"
_STEAM_ID_RE = re.compile(r"https://steamcommunity\.com/openid/id/(\d+)$")

_TOKEN_ALGORITHM = "HS256"
_TOKEN_EXPIRE_DAYS = 30

_bearer = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------------------
# Steam OpenID
# ---------------------------------------------------------------------------

def steam_login_url(return_to: str, realm: str) -> str:
    params = {
        "openid.ns": "http://specs.openid.net/auth/2.0",
        "openid.mode": "checkid_setup",
        "openid.return_to": return_to,
        "openid.realm": realm,
        "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
        "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
    }
    return f"{STEAM_OPENID_URL}?{urllib.parse.urlencode(params)}"


async def verify_steam_callback(params: dict[str, str]) -> int | None:
    """Verify a Steam OpenID assertion. Returns the Steam ID on success, None on failure."""
    import httpx

    verify_params = {**params, "openid.mode": "check_authentication"}
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(STEAM_OPENID_URL, data=verify_params, timeout=15)
    except Exception:
        return None

    if "is_valid:true" not in resp.text:
        return None

    m = _STEAM_ID_RE.match(params.get("openid.claimed_id", ""))
    return int(m.group(1)) if m else None


# ---------------------------------------------------------------------------
# JWT
# ---------------------------------------------------------------------------

def create_token(steam_id: int) -> str:
    payload = {
        "sub": str(steam_id),
        "exp": datetime.now(timezone.utc) + timedelta(days=_TOKEN_EXPIRE_DAYS),
    }
    return jwt.encode(payload, settings.session_secret, algorithm=_TOKEN_ALGORITHM)


def _decode_token(token: str) -> int | None:
    try:
        payload = jwt.decode(token, settings.session_secret, algorithms=[_TOKEN_ALGORITHM])
        return int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------

async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
):
    """Returns AuthenticatedUser with name/avatar from steam_player_cache, or None if unauthenticated.

    Accepts either a Bearer JWT or an X-API-Key header (admin API keys only).
    """
    from .models import AdminApiKey, SteamPlayerCache, User

    api_key = request.headers.get("X-API-Key")
    if api_key:
        now = datetime.now(timezone.utc)
        result = await db.execute(
            select(User.steam_id, User.role, SteamPlayerCache.player_name, SteamPlayerCache.avatar_url)
            .join(AdminApiKey, AdminApiKey.steam_id == User.steam_id)
            .outerjoin(SteamPlayerCache, SteamPlayerCache.steam_id == User.steam_id)
            .where(AdminApiKey.api_key == api_key, AdminApiKey.expires_at > now)
        )
        row = result.first()
        if row is not None:
            return AuthenticatedUser(
                steam_id=row.steam_id,
                role=row.role,
                player_name=row.player_name,
                avatar_url=row.avatar_url,
            )

    if credentials is None:
        return None
    steam_id = _decode_token(credentials.credentials)
    if steam_id is None:
        return None
    result = await db.execute(
        select(User.steam_id, User.role, SteamPlayerCache.player_name, SteamPlayerCache.avatar_url)
        .outerjoin(SteamPlayerCache, SteamPlayerCache.steam_id == User.steam_id)
        .where(User.steam_id == steam_id)
    )
    row = result.first()
    if row is None:
        return None
    return AuthenticatedUser(
        steam_id=row.steam_id,
        role=row.role,
        player_name=row.player_name,
        avatar_url=row.avatar_url,
    )
