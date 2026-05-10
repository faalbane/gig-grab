"""Async Postgres writer for transcript turns and session updates.

Uses asyncpg with a single shared connection pool. Cloud Run mounts Cloud SQL
via unix socket at /cloudsql/PROJECT:REGION:INSTANCE — DATABASE_URL points at it.
"""

from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from typing import Optional

import asyncpg


_pool: Optional[asyncpg.Pool] = None


def _parse_unix_socket_url(url: str) -> dict:
    """Parse postgres://user:pass@/db?host=/cloudsql/... into asyncpg kwargs."""
    m = re.match(
        r"^postgres(?:ql)?://([^:]+):([^@]+)@/([^?]+)\?host=(.+)$",
        url,
    )
    if not m:
        raise ValueError(f"Could not parse unix-socket DATABASE_URL")
    user, password, database, host = m.groups()
    return {
        "user": user,
        "password": password,
        "database": database,
        "host": host,
    }


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is not None:
        return _pool

    url = os.environ["DATABASE_URL"]
    is_unix_socket = "?host=/cloudsql/" in url and "@/" in url

    if is_unix_socket:
        kwargs = _parse_unix_socket_url(url)
        _pool = await asyncpg.create_pool(min_size=1, max_size=4, **kwargs)
    else:
        _pool = await asyncpg.create_pool(url, min_size=1, max_size=4)
    return _pool


async def write_transcript_turn(
    *,
    session_id: str,
    ord_: int,
    speaker: str,  # "candidate" | "ai"
    text: str,
    ms_offset: int,
) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO transcript_turns (session_id, ord, speaker, text, ms_offset)
            VALUES ($1, $2, $3::speaker, $4, $5)
            ON CONFLICT (session_id, ord) DO NOTHING
            """,
            session_id,
            ord_,
            speaker,
            text,
            ms_offset,
        )


async def update_session_status(
    *,
    session_id: str,
    status: str,
    ended: bool = False,
) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        if ended:
            await conn.execute(
                "UPDATE sessions SET status=$2::session_status, ended_at=now() WHERE id=$1",
                session_id,
                status,
            )
        else:
            await conn.execute(
                "UPDATE sessions SET status=$2::session_status WHERE id=$1",
                session_id,
                status,
            )


async def fetch_session(session_id: str) -> Optional[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, kind, candidate_id, employer_id, language, status FROM sessions WHERE id=$1",
            session_id,
        )
        return dict(row) if row else None


async def fetch_profile_for_session(session_id: str) -> Optional[dict]:
    """Returns the profile_card joined to the session's candidate.

    None if the session has no candidate or that candidate has no profile
    yet (first call ever)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT pc.candidate_id, pc.name, pc.title, pc.years_experience,
                   pc.location, pc.summary, pc.tickets_and_cards,
                   pc.recent_projects, pc.updated_at
            FROM sessions s
            JOIN profile_cards pc ON pc.candidate_id = s.candidate_id
            WHERE s.id = $1
            """,
            session_id,
        )
        return dict(row) if row else None


async def store_match_signals(
    *, candidate_id: str, signals: dict
) -> None:
    """Persist extracted intake signals on the candidate row."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE candidates SET match_signals=$2::jsonb, last_call_at=now() WHERE id=$1",
            candidate_id,
            json.dumps(signals),
        )
