"""Admin API key endpoints."""

import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import get_db
from ..models import AdminApiKey

router = APIRouter(prefix="/api/admin/api-key")

_KEY_TTL_HOURS = 1


class ApiKeyResponse(BaseModel):
    api_key: str
    expires_at: datetime


async def _require_admin(current_user=Depends(get_current_user)):
    if current_user is None or current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return current_user


def _new_key() -> tuple[str, datetime]:
    key = "gbt_" + secrets.token_hex(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=_KEY_TTL_HOURS)
    return key, expires_at


async def _upsert_key(db: AsyncSession, steam_id: int) -> AdminApiKey:
    key, expires_at = _new_key()
    now = datetime.now(timezone.utc)
    stmt = pg_insert(AdminApiKey).values(
        steam_id=steam_id,
        api_key=key,
        expires_at=expires_at,
        created_at=now,
    ).on_conflict_do_update(
        index_elements=["steam_id"],
        set_={"api_key": key, "expires_at": expires_at, "created_at": now},
    )
    await db.execute(stmt)
    await db.commit()
    return AdminApiKey(steam_id=steam_id, api_key=key, expires_at=expires_at, created_at=now)


@router.get("", response_model=ApiKeyResponse)
async def get_api_key(
    admin=Depends(_require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Return the current API key for this admin, generating one if absent or expired."""
    now = datetime.now(timezone.utc)
    row = await db.scalar(
        select(AdminApiKey).where(
            AdminApiKey.steam_id == admin.steam_id,
            AdminApiKey.expires_at > now,
        )
    )
    if row is None:
        row = await _upsert_key(db, admin.steam_id)
    return ApiKeyResponse(api_key=row.api_key, expires_at=row.expires_at)


@router.post("/regenerate", response_model=ApiKeyResponse)
async def regenerate_api_key(
    admin=Depends(_require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Invalidate the current API key and issue a fresh one."""
    row = await _upsert_key(db, admin.steam_id)
    return ApiKeyResponse(api_key=row.api_key, expires_at=row.expires_at)
