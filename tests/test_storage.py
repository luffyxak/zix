"""Tests for the SQLite storage layer."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from zix.storage import Storage


def _utc(year=2026, month=1, day=1, hour=9, minute=0):
    return datetime(year, month, day, hour, minute, tzinfo=timezone.utc)


def test_start_and_finish_session(storage: Storage) -> None:
    started = _utc(hour=9)
    sid = storage.start_session(
        kind="focus",
        task="write tests",
        tag="dev",
        planned_seconds=25 * 60,
        started_at=started,
    )
    assert sid > 0

    active = storage.active_session()
    assert active is not None
    assert active.task == "write tests"
    assert active.completed is False
    assert active.ended_at is None

    storage.finish_session(sid, completed=True, ended_at=started + timedelta(minutes=25))
    fresh = storage.get_session(sid)
    assert fresh is not None
    assert fresh.completed is True
    assert fresh.ended_at is not None
    assert fresh.actual_seconds == 25 * 60


def test_active_session_returns_none_when_finished(storage: Storage) -> None:
    sid = storage.start_session(
        kind="focus", task="t", tag=None, planned_seconds=60
    )
    storage.finish_session(sid, completed=True)
    assert storage.active_session() is None


def test_active_session_returns_most_recent_running(storage: Storage) -> None:
    # Older running session — shouldn't normally exist, but the API
    # must still cope and return the newest.
    storage.start_session(
        kind="focus", task="old", tag=None, planned_seconds=60,
        started_at=_utc(hour=8),
    )
    new_id = storage.start_session(
        kind="focus", task="new", tag=None, planned_seconds=60,
        started_at=_utc(hour=10),
    )
    active = storage.active_session()
    assert active is not None
    assert active.id == new_id
    assert active.task == "new"


def test_recent_sessions_orders_newest_first(storage: Storage) -> None:
    a = storage.start_session(
        kind="focus", task="A", tag=None, planned_seconds=60,
        started_at=_utc(hour=8),
    )
    b = storage.start_session(
        kind="focus", task="B", tag=None, planned_seconds=60,
        started_at=_utc(hour=10),
    )
    storage.finish_session(a, completed=True)
    storage.finish_session(b, completed=True)
    rows = storage.recent_sessions(limit=10)
    assert [r.task for r in rows] == ["B", "A"]


def test_sessions_in_range_filters_by_kind(storage: Storage) -> None:
    base = _utc(hour=9)
    storage.start_session(
        kind="focus", task="f", tag=None, planned_seconds=60, started_at=base
    )
    storage.start_session(
        kind="break", task="b", tag=None, planned_seconds=60,
        started_at=base + timedelta(minutes=30),
    )
    end = base + timedelta(hours=2)
    only_focus = storage.sessions_in_range(base - timedelta(hours=1), end, kind="focus")
    assert len(only_focus) == 1
    assert only_focus[0].kind == "focus"


def test_invalid_kind_rejected(storage: Storage) -> None:
    with pytest.raises(ValueError):
        storage.start_session(
            kind="snack", task="t", tag=None, planned_seconds=60
        )


def test_planned_seconds_must_be_positive(storage: Storage) -> None:
    with pytest.raises(ValueError):
        storage.start_session(kind="focus", task="t", tag=None, planned_seconds=0)


def test_daily_focus_seconds_backfills_empty_days(storage: Storage) -> None:
    # Single completed session today.
    started = datetime.now(timezone.utc).replace(hour=9, minute=0, second=0, microsecond=0)
    sid = storage.start_session(
        kind="focus", task="x", tag=None, planned_seconds=60, started_at=started
    )
    storage.finish_session(sid, completed=True, ended_at=started + timedelta(minutes=1))

    daily = storage.daily_focus_seconds(days=7)
    assert len(daily) == 7
    # Every entry has a valid ISO date and non-negative numbers.
    for date_iso, secs, count in daily:
        datetime.fromisoformat(date_iso)
        assert secs >= 0
        assert count >= 0
    # Total completed across the window should equal the one we created.
    assert sum(c for _, _, c in daily) == 1
