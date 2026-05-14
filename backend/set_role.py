#!/usr/bin/env python3
"""Set or clear a user's role (admin/moderator).

Usage:
    python set_role.py <steam_id> <role>     # role: admin or moderator
    python set_role.py <steam_id> none       # clear role
"""

import asyncio
import sys

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import SteamPlayerCache, User

VALID_ROLES = {"admin", "moderator", "none"}


async def main(steam_id: int, role: str | None) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.steam_id == steam_id))
        user = result.scalar_one_or_none()
        if user is None:
            print(f"No user found with steam_id {steam_id}.")
            sys.exit(1)

        user.role = role
        await db.commit()

        cache = await db.scalar(select(SteamPlayerCache).where(SteamPlayerCache.steam_id == steam_id))
        display = role if role else "none (cleared)"
        print(f"Set {cache.player_name if cache else steam_id} ({steam_id}) role → {display}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)

    try:
        steam_id_arg = int(sys.argv[1])
    except ValueError:
        print(f"Invalid steam_id: {sys.argv[1]!r}")
        sys.exit(1)

    role_arg = sys.argv[2].lower()
    if role_arg not in VALID_ROLES:
        print(f"Invalid role {role_arg!r}. Must be one of: {', '.join(sorted(VALID_ROLES))}")
        sys.exit(1)

    asyncio.run(main(steam_id_arg, None if role_arg == "none" else role_arg))
