"""Smoke tests for the Typer CLI.

We test the commands that don't require waiting on a real timer. The
timer-driven ``start`` / ``break`` paths are exercised through the
underlying ``core`` and ``storage`` units.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

from typer.testing import CliRunner

from zix import __version__
from zix.cli import app
from zix.storage import Storage


runner = CliRunner()


def test_version_command() -> None:
    result = runner.invoke(app, ["version"])
    assert result.exit_code == 0
    assert __version__ in result.stdout


def test_status_with_no_active_session(zix_home: Path) -> None:
    result = runner.invoke(app, ["status"])
    assert result.exit_code == 0
    assert "No active session" in result.stdout


def test_log_when_empty(zix_home: Path) -> None:
    result = runner.invoke(app, ["log"])
    assert result.exit_code == 0
    assert "No sessions yet" in result.stdout


def test_done_marks_active_session_complete(zix_home: Path) -> None:
    storage = Storage(db_path=zix_home / "zix.db")
    storage.start_session(
        kind="focus", task="ship it", tag=None, planned_seconds=60,
        started_at=datetime.now(timezone.utc) - timedelta(minutes=1),
    )

    result = runner.invoke(app, ["done"])
    assert result.exit_code == 0
    assert "ship it" in result.stdout

    # No more active session.
    assert storage.active_session() is None
    # And the most recent session was marked completed.
    recent = storage.recent_sessions(limit=1)
    assert recent and recent[0].completed is True


def test_stop_aborts_active_session(zix_home: Path) -> None:
    storage = Storage(db_path=zix_home / "zix.db")
    storage.start_session(
        kind="focus", task="abandon ship", tag=None, planned_seconds=60,
        started_at=datetime.now(timezone.utc) - timedelta(minutes=1),
    )

    result = runner.invoke(app, ["stop"])
    assert result.exit_code == 0

    recent = storage.recent_sessions(limit=1)
    assert recent and recent[0].completed is False
    assert recent[0].ended_at is not None


def test_stats_runs_without_data(zix_home: Path) -> None:
    result = runner.invoke(app, ["stats"])
    assert result.exit_code == 0
    # Should at least contain the summary panel header.
    assert "zix stats" in result.stdout
