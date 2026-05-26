"""Rendering helpers built on top of `rich`.

Everything here is side-effect-light: functions either build renderables
or call directly into a passed-in ``Console`` instance, so the CLI layer
can compose them however it wants.
"""
from __future__ import annotations

from datetime import datetime
from typing import Iterable, List, Optional

from rich.align import Align
from rich.console import Console, Group, RenderableType
from rich.panel import Panel
from rich.progress import (
    BarColumn,
    Progress,
    TextColumn,
    TimeRemainingColumn,
)
from rich.table import Table
from rich.text import Text

from zix.core import format_duration, format_minutes
from zix.storage import Session


FOCUS_STYLE = "bold cyan"
BREAK_STYLE = "bold green"
DONE_STYLE = "bold green"
INTERRUPT_STYLE = "bold yellow"


def make_progress(kind: str) -> Progress:
    """Build a Progress widget styled for ``kind`` (focus/break)."""
    color = "cyan" if kind == "focus" else "green"
    return Progress(
        TextColumn("[bold]{task.description}"),
        BarColumn(bar_width=None, complete_style=color, finished_style=color),
        TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
        TextColumn("•"),
        TimeRemainingColumn(compact=True),
        expand=True,
    )


def session_header(
    *, kind: str, task: str, tag: Optional[str], planned_seconds: int
) -> Panel:
    title = "Focus" if kind == "focus" else "Break"
    style = FOCUS_STYLE if kind == "focus" else BREAK_STYLE
    body = Text()
    body.append("Task:    ", style="dim")
    body.append(task or "(no task)", style="bold")
    body.append("\n")
    if tag:
        body.append("Tag:     ", style="dim")
        body.append(tag, style="magenta")
        body.append("\n")
    body.append("Planned: ", style="dim")
    body.append(format_duration(planned_seconds), style="bold")
    return Panel(
        body,
        title=f"[{style}]{title} session",
        title_align="left",
        border_style=style,
        padding=(1, 2),
    )


def render_recent(sessions: Iterable[Session]) -> Table:
    table = Table(
        title="Recent sessions",
        title_style="bold",
        header_style="bold dim",
        expand=True,
    )
    table.add_column("When", no_wrap=True)
    table.add_column("Kind", no_wrap=True)
    table.add_column("Task", overflow="fold")
    table.add_column("Tag", no_wrap=True)
    table.add_column("Planned", justify="right", no_wrap=True)
    table.add_column("Actual", justify="right", no_wrap=True)
    table.add_column("Status", no_wrap=True)

    for s in sessions:
        when = s.started_at.astimezone().strftime("%a %H:%M")
        kind_text = Text(
            s.kind, style=FOCUS_STYLE if s.kind == "focus" else BREAK_STYLE
        )
        if s.completed:
            status = Text("done", style=DONE_STYLE)
        elif s.ended_at is None:
            status = Text("running", style="bold yellow")
        else:
            status = Text("stopped", style=INTERRUPT_STYLE)
        table.add_row(
            when,
            kind_text,
            s.task,
            s.tag or "",
            format_duration(s.planned_seconds),
            format_duration(s.actual_seconds),
            status,
        )
    return table


def render_streak_chart(daily: List[tuple]) -> RenderableType:
    """Render daily focus minutes as a tiny bar chart.

    ``daily`` is a list of ``(iso_date, seconds, count)`` tuples ordered
    oldest-first.
    """
    if not daily:
        return Text("No data yet — run `zix start` to begin.", style="dim")

    max_secs = max((secs for _, secs, _ in daily), default=0)
    blocks = " ▁▂▃▄▅▆▇█"

    table = Table.grid(padding=(0, 1))
    table.add_column(justify="right")
    table.add_column(justify="left")
    table.add_column(justify="right")
    for date_iso, secs, count in daily:
        ratio = (secs / max_secs) if max_secs else 0
        idx = min(int(ratio * (len(blocks) - 1)), len(blocks) - 1)
        bar = Text(blocks[idx] * 10, style="cyan" if secs else "dim")
        label = datetime.fromisoformat(date_iso).strftime("%a %d")
        meta = f"{format_minutes(secs)} • {count} pomos"
        table.add_row(label, bar, meta)
    return Panel(table, title="Last 7 days", border_style="cyan")


def render_summary(
    *,
    focus_today_seconds: int,
    completed_today: int,
    streak: int,
    completed_total: int,
    focus_total_seconds: int,
) -> Panel:
    table = Table.grid(padding=(0, 2))
    table.add_column(justify="right", style="dim")
    table.add_column(justify="left", style="bold")
    table.add_row("Today", f"{format_minutes(focus_today_seconds)} • {completed_today} pomos")
    table.add_row("Streak", f"{streak} day{'s' if streak != 1 else ''}")
    table.add_row(
        "All-time",
        f"{format_minutes(focus_total_seconds)} • {completed_total} pomos",
    )
    return Panel(
        Align.center(table),
        title="[bold]zix stats",
        border_style="cyan",
        padding=(1, 2),
    )


def banner(message: str, *, style: str = "bold cyan") -> Panel:
    return Panel(Align.center(Text(message, style=style)), border_style=style)


def announce_done(console: Console, *, kind: str, task: str) -> None:
    label = "Focus" if kind == "focus" else "Break"
    style = FOCUS_STYLE if kind == "focus" else BREAK_STYLE
    console.print()
    console.print(
        Panel(
            Group(
                Align.center(Text(f"{label} complete!", style=style)),
                Align.center(Text(task, style="dim")),
            ),
            border_style=style,
            padding=(1, 2),
        )
    )
    # Terminal bell — works in most terminals and is silent if disabled.
    console.bell()
