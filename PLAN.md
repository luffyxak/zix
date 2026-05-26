# zix — design plan

## What is zix?

`zix` is a small, beautiful command-line **focus timer and task tracker**. It's
inspired by the Pomodoro Technique but stays out of your way: one command to
start a session, a live progress bar in your terminal, and a local SQLite
database that records everything so you can look at honest stats later.

## Goals

1. **Useful.** It should help a real person focus for 25 minutes and be glad
   they used it. Not a toy.
2. **Zero-friction.** `pip install` and you're done. No accounts. No cloud.
3. **Honest data.** Sessions you stopped early are recorded as stopped, not
   silently dropped, so the streak/stats actually mean something.
4. **Hackable.** The DB is plain SQLite at a known path. The Python package
   is split into testable modules (`storage`, `core`, `display`, `cli`).

## Non-goals (for v0.1)

- Cloud sync, multi-device support, accounts.
- A full TUI app with screens — Rich progress bars and panels are enough.
- Calendar / external task-tracker integrations.

## User stories

- *As a developer*, I run `zix start "fix bug 1234" -m 25` and see a live
  progress bar; when it finishes, my terminal bell rings and the session is
  saved.
- *As anyone*, I run `zix break` and get a smart-suggested 5-minute break, with
  the 4th break of the day automatically being a 15-minute long break.
- *As a person who likes streaks*, I run `zix stats` and see how many
  pomodoros I completed today, my current daily streak, and a 7-day chart of
  focus minutes.
- *As a power user*, I run `sqlite3 ~/.zix/zix.db` and write my own queries.

## Commands (v0.1)

| Command            | Purpose                                                  |
|--------------------|----------------------------------------------------------|
| `zix start TASK`   | Start a focus session (`--minutes`, `--tag`).            |
| `zix break`        | Take a break (smart-suggested length, or `--minutes`).   |
| `zix done`         | Mark the active session as completed.                    |
| `zix stop`         | Abort the active session.                                |
| `zix status`       | Show the active session.                                 |
| `zix log`          | Show recent sessions.                                    |
| `zix stats`        | Today + streak + 7-day chart.                            |
| `zix version`      | Print the version.                                       |

## Architecture

```
src/zix/
├── __init__.py     package version
├── __main__.py     `python -m zix`
├── storage.py      SQLite persistence (no UI imports)
├── core.py         pure timer math, formatters, streak helper
├── display.py      Rich-based renderables
└── cli.py          Typer entry point that wires everything together
```

The split keeps unit tests fast and free of UI dependencies. `core.py` and
`storage.py` are tested directly; `cli.py` gets smoke tests via Typer's
`CliRunner`.

## Storage schema

Single `sessions` table:

| column            | type    | notes                                  |
|-------------------|---------|----------------------------------------|
| `id`              | INTEGER | autoincrement primary key              |
| `kind`            | TEXT    | `'focus'` or `'break'`                 |
| `task`            | TEXT    | what the user is working on            |
| `tag`             | TEXT?   | optional category                      |
| `planned_seconds` | INTEGER | configured duration                    |
| `started_at`      | TEXT    | ISO 8601 UTC                           |
| `ended_at`        | TEXT?   | ISO 8601 UTC, NULL while running       |
| `completed`       | INTEGER | 0/1 — did the timer reach the end?     |
| `note`            | TEXT?   | reserved for future free-text notes    |

The DB lives at `~/.zix/zix.db` by default and can be redirected with the
`ZIX_HOME` environment variable.

## Quality bar

- Unit tests for storage, core math, streaks, and CLI smoke tests.
- GitHub Actions matrix on Python 3.9 – 3.13 running `pytest`.
- README with install, quick start, full command table, and dev notes.
- MIT licensed.

## Roadmap (post-v0.1)

- `zix today` — single-screen dashboard for the day.
- Per-tag stats / filtering in `zix log` and `zix stats`.
- `zix export --format json` for analytics.
- Native desktop notifications (`notify-send`, `osascript`, `BurntToast`).
- A `--watch` mode for `zix stats`.
