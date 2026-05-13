from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import get_db
from ..models import SiteSetting, User
from ..schemas import AboutContent

router = APIRouter(prefix="/api/about")

ABOUT_KEY = "about_content"


async def _get_admin(current_user: User | None = Depends(get_current_user)) -> User:
    if current_user is None or current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return current_user


@router.get("", response_model=AboutContent)
async def get_about(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SiteSetting).where(SiteSetting.key == ABOUT_KEY))
    setting = result.scalar_one_or_none()
    return AboutContent(content=setting.value if setting else "")


@router.put("", status_code=204)
async def update_about(
    payload: AboutContent,
    _admin: User = Depends(_get_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(SiteSetting).where(SiteSetting.key == ABOUT_KEY))
    setting = result.scalar_one_or_none()
    if setting is None:
        db.add(SiteSetting(key=ABOUT_KEY, value=payload.content))
    else:
        setting.value = payload.content
    await db.commit()
