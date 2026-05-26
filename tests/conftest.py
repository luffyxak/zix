"""Shared test fixtures.

Each test gets its own isolated temporary ``ZIX_HOME`` so the suite never
touches the user's real database.
"""
from __future__ import annotations

import os
from pathlib import Path

import pytest

from zix.storage import Storage


@pytest.fixture
def zix_home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setenv("ZIX_HOME", str(tmp_path))
    return tmp_path


@pytest.fixture
def storage(zix_home: Path) -> Storage:
    return Storage(db_path=zix_home / "zix.db")
