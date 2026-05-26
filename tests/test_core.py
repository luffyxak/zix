"""Tests for the pure timer / stats logic."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from zix.core import (
    DEFAULT_LONG_BREAK_MINUTES,
    DEFAULT_SHORT_BREAK_MINUTES,
    LONG_BREAK_EVERY,
    format_duration,
    format_minutes,
    snapshot,
    streak_days,
    suggested_break_minutes,
    total_completed,
    total_focus_seconds,
)
from zix.storage import Session


def _session(**overrides) -> Session:
    base = dict(
        id=1,
        kind="focus",
        task="t",
        tag=None,
        planned_seconds=60,
        started_at=datetime(2026, 1, 1, 9, 0, tzinfo=timezone.utc),
        ended_at=datetime(2026, 1, 1, 9, 1, tzinfo=timezone.utc),
        completed=True,
        note=None,
    )
    base.update(overrides)
    return Session(**base)


# --- format helpers -------------------------------------------------------
@pytest.mark.parametrize(
    "seconds,expected",
    [
        (0, "00:00"),
        (5, "00:05"),
        (65, "01:05"),
        (25 * 60, "25:00"),
        (3600, "1:00:00"),
        (3661, "1:01:01"),
    ],
)
def test_format_duration(seconds: int, expected: str) -> None:
    assert format_duration(seconds) == expected


def test_format_duration_clamps_negative() -> None:
    assert format_duration(-10) == "00:00"


@pytest.mark.parametrize(
    "seconds,expected",
    [
        (0, "0m"),
        (59, "0m"),
        (60, "1m"),
        (3600, "1h"),
        (3660, "1h 1m"),
        (3 * 3600 + 25 * 60, "3h 25m"),
    ],
)
def test_format_minutes(seconds: int, expected: str) -> None:
    assert format_minutes(seconds) == expected


# --- snapshot -------------------------------------------------------------
def test_snapshot_midway() -> None:
    started = datetime(2026, 1, 1, 9, 0, tzinfo=timezone.utc)
    now = started + timedelta(seconds=300)
    snap = snapshot(started, planned_seconds=600, now=now)
    assert snap.elapsed_seconds == 300
    assert snap.remaining_seconds == 300
    assert snap.total_seconds == 600
    assert snap.is_complete is False
    assert snap.progress == pytest.approx(0.5)


def test_snapshot_complete_clamps_progress() -> None:
    started = datetime(2026, 1, 1, 9, 0, tzinfo=timezone.utc)
    now = started + timedelta(seconds=999)
    snap = snapshot(started, planned_seconds=60, now=now)
    assert snap.is_complete
    assert snap.remaining_seconds == 0
    assert snap.progress == 1.0


def test_snapshot_handles_naive_datetime() -> None:
    started = datetime(2026, 1, 1, 9, 0)  # naive
    now = datetime(2026, 1, 1, 9, 0, 30, tzinfo=timezone.utc)
    snap = snapshot(started, planned_seconds=60, now=now)
    assert snap.elapsed_seconds == 30


def test_snapshot_rejects_zero_planned() -> None:
    now = datetime(2026, 1, 1, 9, 0, tzinfo=timezone.utc)
    with pytest.raises(ValueError):
        snapshot(now, planned_seconds=0, now=now)


# --- pomodoro logic -------------------------------------------------------
def test_suggested_break_short_by_default() -> None:
    assert suggested_break_minutes(0) == DEFAULT_SHORT_BREAK_MINUTES
    assert suggested_break_minutes(1) == DEFAULT_SHORT_BREAK_MINUTES


def test_suggested_break_long_every_n() -> None:
    assert suggested_break_minutes(LONG_BREAK_EVERY) == DEFAULT_LONG_BREAK_MINUTES
    assert suggested_break_minutes(2 * LONG_BREAK_EVERY) == DEFAULT_LONG_BREAK_MINUTES
    assert suggested_break_minutes(LONG_BREAK_EVERY + 1) == DEFAULT_SHORT_BREAK_MINUTES


# --- streaks --------------------------------------------------------------
def test_streak_zero_when_today_empty() -> None:
    daily = [("2026-01-01", 1500, 1), ("2026-01-02", 0, 0)]
    assert streak_days(daily) == 0


def test_streak_counts_consecutive_recent_days() -> None:
    daily = [
        ("2026-01-01", 0, 0),
        ("2026-01-02", 1500, 1),
        ("2026-01-03", 1500, 2),
        ("2026-01-04", 1500, 1),
    ]
    assert streak_days(daily) == 3


def test_streak_breaks_on_gap() -> None:
    daily = [
        ("2026-01-01", 1500, 1),
        ("2026-01-02", 0, 0),
        ("2026-01-03", 1500, 1),
    ]
    assert streak_days(daily) == 1


# --- aggregations ---------------------------------------------------------
def test_total_completed_only_counts_completed_focus() -> None:
    sessions = [
        _session(id=1, kind="focus", completed=True),
        _session(id=2, kind="focus", completed=False),
        _session(id=3, kind="break", completed=True),
    ]
    assert total_completed(sessions) == 1


def test_total_focus_seconds_sums_actual() -> None:
    sessions = [
        _session(
            id=1,
            kind="focus",
            started_at=datetime(2026, 1, 1, 9, 0, tzinfo=timezone.utc),
            ended_at=datetime(2026, 1, 1, 9, 25, tzinfo=timezone.utc),
        ),
        _session(
            id=2,
            kind="focus",
            started_at=datetime(2026, 1, 1, 10, 0, tzinfo=timezone.utc),
            ended_at=datetime(2026, 1, 1, 10, 10, tzinfo=timezone.utc),
        ),
        _session(
            id=3,
            kind="break",
            started_at=datetime(2026, 1, 1, 9, 25, tzinfo=timezone.utc),
            ended_at=datetime(2026, 1, 1, 9, 30, tzinfo=timezone.utc),
        ),
    ]
    assert total_focus_seconds(sessions) == 25 * 60 + 10 * 60
