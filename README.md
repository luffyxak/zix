# zix

> A beautiful, zero-friction focus timer and task tracker for your terminal.

`zix` is a Pomodoro-style focus timer that lives in your terminal. It runs a live
progress bar while you work, persists every session to a local SQLite database,
and shows you a clean stats view with daily streaks and a 7-day chart.

No accounts. No cloud. No yak-shaving. Just `pip install` and start focusing.

```text
╭─ Focus session ─────────────────────────────────────────────────────╮
│  Task:    Write the launch blog post                                │
│  Tag:     writing                                                   │
│  Planned: 25:00                                                     │
╰─────────────────────────────────────────────────────────────────────╯
 Focusing: Write the launch blog post ████████████░░░░░░░░  62% • 0:09:30
```

## Why zix?

Most focus apps want your email, your calendar, and a subscription. `zix` is
the opposite: a single command, a single binary on your `$PATH`, and your data
stays in `~/.zix/zix.db` where you can `sqlite3` it any time.

Use it to:

- Run timed focus sessions on a specific task.
- Track how many real pomodoros you actually completed today.
- Build a daily focus streak you can see at a glance.
- Tag sessions (`--tag deep-work`, `--tag email`) and audit later.

## Install

Requires Python 3.9 or newer.

```bash
# from a clone of this repo
pip install .

# or, from the repo URL directly
pip install git+https://github.com/luffyxak/zix.git
```

After install you'll have a `zix` command on your `$PATH`.

## Quick start

```bash
zix start "Write the launch blog post" --minutes 25 --tag writing
zix break                       # smart-suggested 5- or 15-min break
zix status                      # peek at the current session
zix done                        # mark the running session as completed
zix stop                        # abort without marking complete
zix log --limit 10              # recent session history
zix stats                       # today + streak + 7-day chart
zix version
```

The CLI is also available as a Python module:

```bash
python -m zix start "deep work" -m 50
```

## Commands

| Command            | What it does                                                      |
|--------------------|-------------------------------------------------------------------|
| `zix start TASK`   | Start a focus session. `--minutes/-m` sets length, `--tag/-t` tags it. |
| `zix break`        | Take a break. Length defaults to a Pomodoro-style suggestion (long every 4th break). |
| `zix done`         | Mark the active session as completed.                             |
| `zix stop`         | Abort the active session without marking it complete.             |
| `zix status`       | Show the active session, with elapsed/remaining time.             |
| `zix log [-n N]`   | Show recent sessions (default 20).                                |
| `zix stats`        | Show today's focus + completed pomodoros, streak, and 7-day chart.|
| `zix version`      | Print the installed version.                                      |

While a timer is running, press `Ctrl-C` to stop early. The session is recorded
as `stopped` so your stats stay honest.

## Where does my data live?

By default, `zix` stores its SQLite database at:

- `~/.zix/zix.db`

You can override the location with the `ZIX_HOME` environment variable, which
is also handy for sandboxing and tests:

```bash
ZIX_HOME=/tmp/zix-test zix start "ad-hoc task" -m 1
```

The schema is intentionally simple — one row per session with start/end
timestamps, planned vs. actual duration, kind (`focus` or `break`), task,
optional tag, and a `completed` flag. You can `sqlite3 ~/.zix/zix.db` and run
your own queries any time.

## Development

```bash
# clone and install in editable mode with dev dependencies
git clone https://github.com/luffyxak/zix.git
cd zix
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

# run the test suite
pytest
```

The codebase is split into small, independently testable modules:

- `zix.storage` — SQLite persistence (no UI imports).
- `zix.core` — pure timer math, formatting, streak/aggregation helpers.
- `zix.display` — Rich-based renderables (panels, tables, charts).
- `zix.cli` — the Typer entry point that wires it all together.

Tests live under `tests/` and run on Python 3.9 – 3.13 in CI.

## Roadmap

Ideas for v0.2+:

- `zix today` — a one-screen dashboard for the current day.
- Per-tag stats and filtering in `zix log`.
- JSON export (`zix export --format json`).
- Optional desktop notifications via `notify-send` / `osascript` / `BurntToast`.
- A `--watch` mode for `zix stats`.

PRs welcome.

## License

[MIT](./LICENSE)
