"""Command-line interface for zix.

Commands:
    zix start TASK [--minutes N] [--tag TAG]   start a focus session
    zix break [--minutes N]                    take a break
    zix done                                   mark current session done
    zix stop                                   abort current session
    zix status                                 show current session
    zix log [--limit N]                        show recent sessions
    zix stats                                  show today + streak + chart
    zix version                                show version

The ``start`` and ``break`` commands run a live progress bar in the
terminal and persist the session to SQLite. They handle Ctrl-C cleanly
by recording the partial session as "stopped".
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Optional

import typer
from rich.console import Console
from rich.live import Live

from zix import __version__
from zix.core import (
    DEFAULT_FOCUS_MINUTES,
    DEFAULT_SHORT_BREAK_MINUTES,
    format_duration,
    snapshot,
    streak_days,
    suggested_break_minutes,
    today_window,
    total_completed,
    total_focus_seconds,
)
from zix.display import (
    announce_done,
    banner,
    make_progress,
    render_recent,
    render_streak_chart,
    render_summary,
    session_header,
)
from zix.storage import Session, Storage


app = typer.Typer(
    add_completion=False,
    no_args_is_help=True,
    help="zix — a beautiful focus timer and task tracker for your terminal.",
)
console = Console()


def _storage() -> Storage:
    return Storage()


def _abort_active_if_any(storage: Storage) -> None:
    """If there's a stale running session, mark it stopped before starting a new one."""
    active = storage.active_session()
    if active is not None:
        storage.finish_session(active.id, completed=False)


def _run_timer(
    storage: Storage,
    *,
    kind: str,
    task: str,
    tag: Optional[str],
    minutes: int,
) -> Session:
    planned = minutes * 60
    started_at = datetime.now(timezone.utc)
    session_id = storage.start_session(
        kind=kind, task=task, tag=tag, planned_seconds=planned, started_at=started_at
    )

    console.print(
        session_header(kind=kind, task=task, tag=tag, planned_seconds=planned)
    )
    progress = make_progress(kind)
    label = "Focusing" if kind == "focus" else "Break"
    task_id = progress.add_task(f"{label}: {task}", total=planned)

    completed = False
    interrupted = False
    try:
        with Live(progress, console=console, refresh_per_second=4):
            while True:
                snap = snapshot(started_at, planned)
                progress.update(task_id, completed=snap.elapsed_seconds)
                if snap.is_complete:
                    progress.update(task_id, completed=planned)
                    completed = True
                    break
                time.sleep(0.25)
    except KeyboardInterrupt:
        interrupted = True

    storage.finish_session(session_id, completed=completed)
    if completed:
        announce_done(console, kind=kind, task=task)
    elif interrupted:
        console.print()
        console.print(banner("Session stopped.", style="bold yellow"))
    fresh = storage.get_session(session_id)
    assert fresh is not None
    return fresh


# ----------------------------------------------------------------------
# Commands
# ----------------------------------------------------------------------
@app.command()
def start(
    task: str = typer.Argument(..., help="What you're focusing on."),
    minutes: int = typer.Option(
        DEFAULT_FOCUS_MINUTES, "--minutes", "-m", min=1, max=240,
        help="Focus duration in minutes.",
    ),
    tag: Optional[str] = typer.Option(
        None, "--tag", "-t", help="Optional tag/category for the task."
    ),
) -> None:
    """Start a focus session."""
    storage = _storage()
    _abort_active_if_any(storage)
    _run_timer(storage, kind="focus", task=task, tag=tag, minutes=minutes)


@app.command(name="break")
def break_(
    minutes: Optional[int] = typer.Option(
        None, "--minutes", "-m", min=1, max=120,
        help="Break duration in minutes (default: smart suggestion).",
    ),
) -> None:
    """Take a break. Length defaults to a Pomodoro-style suggestion."""
    storage = _storage()
    _abort_active_if_any(storage)

    if minutes is None:
        start_utc, end_utc = today_window()
        focus_today = storage.sessions_in_range(start_utc, end_utc, kind="focus")
        completed_count = total_completed(focus_today)
        minutes = suggested_break_minutes(completed_count)

    _run_timer(storage, kind="break", task="Break", tag=None, minutes=minutes)


@app.command()
def done() -> None:
    """Mark the active session as completed (if one is running)."""
    storage = _storage()
    active = storage.active_session()
    if active is None:
        console.print("[dim]No active session.[/dim]")
        raise typer.Exit(code=0)
    storage.finish_session(active.id, completed=True)
    console.print(f"[green]Marked '{active.task}' as done.[/green]")


@app.command()
def stop() -> None:
    """Abort the active session without marking it complete."""
    storage = _storage()
    active = storage.active_session()
    if active is None:
        console.print("[dim]No active session.[/dim]")
        raise typer.Exit(code=0)
    storage.finish_session(active.id, completed=False)
    console.print(f"[yellow]Stopped '{active.task}'.[/yellow]")


@app.command()
def status() -> None:
    """Show the active session, if any."""
    storage = _storage()
    active = storage.active_session()
    if active is None:
        console.print("[dim]No active session.[/dim]")
        return
    snap = snapshot(active.started_at, active.planned_seconds)
    console.print(
        session_header(
            kind=active.kind,
            task=active.task,
            tag=active.tag,
            planned_seconds=active.planned_seconds,
        )
    )
    console.print(
        f"Elapsed: [bold]{format_duration(snap.elapsed_seconds)}[/bold] · "
        f"Remaining: [bold]{format_duration(snap.remaining_seconds)}[/bold]"
    )


@app.command()
def log(
    limit: int = typer.Option(
        20, "--limit", "-n", min=1, max=200, help="How many sessions to show."
    ),
) -> None:
    """Show recent sessions."""
    storage = _storage()
    sessions = storage.recent_sessions(limit=limit)
    if not sessions:
        console.print("[dim]No sessions yet — run `zix start \"my task\"` to begin.[/dim]")
        return
    console.print(render_recent(sessions))


@app.command()
def stats() -> None:
    """Show today's progress, daily streak, and a 7-day chart."""
    storage = _storage()
    daily = storage.daily_focus_seconds(days=7)
    start_utc, end_utc = today_window()
    today = storage.sessions_in_range(start_utc, end_utc, kind="focus")
    completed_today = total_completed(today)
    focus_today_seconds = total_focus_seconds(today)
    all_focus = storage.sessions_in_range(
        datetime.fromtimestamp(0, tz=timezone.utc),
        datetime.now(timezone.utc),
        kind="focus",
    )
    console.print(
        render_summary(
            focus_today_seconds=focus_today_seconds,
            completed_today=completed_today,
            streak=streak_days(daily),
            completed_total=total_completed(all_focus),
            focus_total_seconds=total_focus_seconds(all_focus),
        )
    )
    console.print(render_streak_chart(daily))


@app.command()
def version() -> None:
    """Show the installed version of zix."""
    console.print(f"zix {__version__}")


# Default short break helper exported for convenience in tests.
__all__ = ["app", "DEFAULT_SHORT_BREAK_MINUTES"]
