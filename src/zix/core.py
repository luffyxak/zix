"""Pure timer / session math.

Kept separate from storage and display so it is trivial to unit-test.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import List

from zix.storage import Session


# Sensible defaults inspired by the classic Pomodoro technique.
DEFAULT_FOCUS_MINUTES = 25
DEFAULT_SHORT_BREAK_MINUTES = 5
DEFAULT_LONG_BREAK_MINUTES = 15
LONG_BREAK_EVERY = 4  # every 4th break is a long one


@dataclass(frozen=True)
class TimerSnapshot:
    """A point-in-time view of a running timer.

    All numbers are integer seconds for predictable rendering. ``progress``
    is clamped to the [0.0, 1.0] range so it can be fed straight into a
    progress bar.
    """

    elapsed_seconds: int
    remaining_seconds: int
    total_seconds: int
    is_complete: bool

    @property
    def progress(self) -> float:
        if self.total_seconds <= 0:
            return 1.0
        ratio = self.elapsed_seconds / self.total_seconds
        if ratio < 0.0:
            return 0.0
        if ratio > 1.0:
            return 1.0
        return ratio


def snapshot(
    started_at: datetime, planned_seconds: int, now: datetime | None = None
) -> TimerSnapshot:
    """Compute a :class:`TimerSnapshot` for a session that started at
    ``started_at`` and was planned for ``planned_seconds`` seconds.
    """
    if planned_seconds <= 0:
        raise ValueError("planned_seconds must be positive")
    now = now or datetime.now(timezone.utc)
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=timezone.utc)
    elapsed = int((now - started_at).total_seconds())
    if elapsed < 0:
        elapsed = 0
    remaining = max(planned_seconds - elapsed, 0)
    return TimerSnapshot(
        elapsed_seconds=elapsed,
        remaining_seconds=remaining,
        total_seconds=planned_seconds,
        is_complete=elapsed >= planned_seconds,
    )


def format_duration(seconds: int) -> str:
    """Format ``seconds`` as ``MM:SS`` or ``H:MM:SS``."""
    seconds = max(int(seconds), 0)
    hours, remainder = divmod(seconds, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


def format_minutes(seconds: int) -> str:
    """Format ``seconds`` as a friendly ``Xh Ym`` string for stats."""
    seconds = max(int(seconds), 0)
    hours, remainder = divmod(seconds, 3600)
    minutes = remainder // 60
    if hours and minutes:
        return f"{hours}h {minutes}m"
    if hours:
        return f"{hours}h"
    return f"{minutes}m"


def suggested_break_minutes(completed_focus_count: int) -> int:
    """Return the suggested break length given how many focus sessions
    have been completed so far today.

    Every ``LONG_BREAK_EVERY``-th break is a longer one.
    """
    if completed_focus_count <= 0:
        return DEFAULT_SHORT_BREAK_MINUTES
    if completed_focus_count % LONG_BREAK_EVERY == 0:
        return DEFAULT_LONG_BREAK_MINUTES
    return DEFAULT_SHORT_BREAK_MINUTES


def streak_days(daily: List[tuple]) -> int:
    """Compute the current daily-focus streak.

    ``daily`` is the structure returned by
    :meth:`zix.storage.Storage.daily_focus_seconds` and must be ordered
    oldest-first. A day counts toward the streak if at least one focus
    session was completed.
    """
    streak = 0
    for _, _, count in reversed(daily):
        if count > 0:
            streak += 1
        else:
            break
    return streak


def total_completed(sessions: List[Session]) -> int:
    return sum(1 for s in sessions if s.completed and s.kind == "focus")


def total_focus_seconds(sessions: List[Session]) -> int:
    return sum(s.actual_seconds for s in sessions if s.kind == "focus")


def today_window(now: datetime | None = None) -> tuple[datetime, datetime]:
    """Return the [start, end) UTC range covering the user's local 'today'."""
    now = now or datetime.now().astimezone()
    local_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    local_end = local_start + timedelta(days=1)
    return (
        local_start.astimezone(timezone.utc),
        local_end.astimezone(timezone.utc),
    )
