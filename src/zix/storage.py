"""SQLite-backed storage for zix focus sessions and tasks.

The schema is intentionally simple. Every focus session is a row that
records when it started, how long it was supposed to last, when (if)
it completed, the kind of session (focus or break), the task label
and an optional tag.
"""
from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterator, List, Optional


SCHEMA_VERSION = 1


def default_data_dir() -> Path:
    """Return the directory where zix should store its data.

    Honours the ``ZIX_HOME`` environment variable for tests and power
    users, otherwise falls back to ``~/.zix``.
    """
    override = os.environ.get("ZIX_HOME")
    if override:
        return Path(override).expanduser()
    return Path.home() / ".zix"


def default_db_path() -> Path:
    return default_data_dir() / "zix.db"


@dataclass
class Session:
    """A single focus or break session record."""

    id: int
    kind: str  # "focus" or "break"
    task: str
    tag: Optional[str]
    planned_seconds: int
    started_at: datetime
    ended_at: Optional[datetime]
    completed: bool
    note: Optional[str]

    @property
    def actual_seconds(self) -> int:
        if self.ended_at is None:
            return 0
        return int((self.ended_at - self.started_at).total_seconds())


class Storage:
    """Lightweight SQLite wrapper.

    Connections are opened per call to keep things resilient to forks
    and to avoid holding locks. The DB is small, so the overhead is
    negligible.
    """

    def __init__(self, db_path: Optional[Path] = None) -> None:
        self.db_path = Path(db_path) if db_path else default_db_path()
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(
            self.db_path,
            detect_types=sqlite3.PARSE_DECLTYPES | sqlite3.PARSE_COLNAMES,
        )
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def _init_schema(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS meta (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    kind TEXT NOT NULL CHECK (kind IN ('focus', 'break')),
                    task TEXT NOT NULL,
                    tag TEXT,
                    planned_seconds INTEGER NOT NULL,
                    started_at TEXT NOT NULL,
                    ended_at TEXT,
                    completed INTEGER NOT NULL DEFAULT 0,
                    note TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_sessions_started_at
                    ON sessions(started_at);
                CREATE INDEX IF NOT EXISTS idx_sessions_kind
                    ON sessions(kind);
                """
            )
            conn.execute(
                "INSERT OR IGNORE INTO meta(key, value) VALUES (?, ?)",
                ("schema_version", str(SCHEMA_VERSION)),
            )

    # ------------------------------------------------------------------
    # Session CRUD
    # ------------------------------------------------------------------
    def start_session(
        self,
        *,
        kind: str,
        task: str,
        tag: Optional[str],
        planned_seconds: int,
        started_at: Optional[datetime] = None,
    ) -> int:
        if kind not in ("focus", "break"):
            raise ValueError(f"invalid kind: {kind!r}")
        if planned_seconds <= 0:
            raise ValueError("planned_seconds must be positive")
        started_at = started_at or _utcnow()
        with self._connect() as conn:
            cur = conn.execute(
                """
                INSERT INTO sessions (
                    kind, task, tag, planned_seconds, started_at, completed
                ) VALUES (?, ?, ?, ?, ?, 0)
                """,
                (
                    kind,
                    task,
                    tag,
                    planned_seconds,
                    _to_iso(started_at),
                ),
            )
            return int(cur.lastrowid)

    def finish_session(
        self,
        session_id: int,
        *,
        completed: bool,
        ended_at: Optional[datetime] = None,
        note: Optional[str] = None,
    ) -> None:
        ended_at = ended_at or _utcnow()
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE sessions
                SET ended_at = ?, completed = ?, note = COALESCE(?, note)
                WHERE id = ?
                """,
                (_to_iso(ended_at), 1 if completed else 0, note, session_id),
            )

    def active_session(self) -> Optional[Session]:
        """Return the most recent session that has not ended yet, if any."""
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT * FROM sessions
                WHERE ended_at IS NULL
                ORDER BY started_at DESC
                LIMIT 1
                """
            ).fetchone()
        return _row_to_session(row) if row else None

    def get_session(self, session_id: int) -> Optional[Session]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM sessions WHERE id = ?", (session_id,)
            ).fetchone()
        return _row_to_session(row) if row else None

    def recent_sessions(self, limit: int = 20) -> List[Session]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM sessions
                ORDER BY started_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [_row_to_session(r) for r in rows]

    def sessions_in_range(
        self, start: datetime, end: datetime, *, kind: Optional[str] = None
    ) -> List[Session]:
        query = (
            "SELECT * FROM sessions WHERE started_at >= ? AND started_at < ?"
        )
        params: list = [_to_iso(start), _to_iso(end)]
        if kind is not None:
            query += " AND kind = ?"
            params.append(kind)
        query += " ORDER BY started_at ASC"
        with self._connect() as conn:
            rows = conn.execute(query, params).fetchall()
        return [_row_to_session(r) for r in rows]

    # ------------------------------------------------------------------
    # Aggregates / stats helpers
    # ------------------------------------------------------------------
    def daily_focus_seconds(self, days: int = 7) -> List[tuple]:
        """Return a list of (date_iso, focus_seconds, completed_count)."""
        end = _utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        end = end + timedelta(days=1)
        start = end - timedelta(days=days)
        sessions = self.sessions_in_range(start, end, kind="focus")
        buckets: dict[str, list[int]] = {}
        for s in sessions:
            day = s.started_at.astimezone().date().isoformat()
            slot = buckets.setdefault(day, [0, 0])
            if s.ended_at:
                slot[0] += s.actual_seconds
            if s.completed:
                slot[1] += 1
        # Backfill empty days so the chart is contiguous.
        results = []
        cursor = (end - timedelta(days=days)).date()
        end_date = end.date()
        while cursor < end_date:
            key = cursor.isoformat()
            secs, count = buckets.get(key, (0, 0))
            results.append((key, secs, count))
            cursor += timedelta(days=1)
        return results


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------
def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _to_iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def _from_iso(value: str) -> datetime:
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _row_to_session(row: sqlite3.Row) -> Session:
    return Session(
        id=row["id"],
        kind=row["kind"],
        task=row["task"],
        tag=row["tag"],
        planned_seconds=row["planned_seconds"],
        started_at=_from_iso(row["started_at"]),
        ended_at=_from_iso(row["ended_at"]) if row["ended_at"] else None,
        completed=bool(row["completed"]),
        note=row["note"],
    )
