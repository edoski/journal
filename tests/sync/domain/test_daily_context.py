"""Tests for daily context file discovery and session attribution."""

from __future__ import annotations

import datetime
from pathlib import Path

from sync.daily.context import files_for_session, get_vault_files_modified_on_date


class _FakeStat:
    def __init__(self, *, mtime: float, birthtime: float | None = None) -> None:
        self.st_mtime = mtime
        if birthtime is not None:
            self.st_birthtime = birthtime


def _record(
    *,
    basename: str,
    mtime: datetime.datetime,
    created_at: datetime.datetime,
) -> dict[str, datetime.datetime | str]:
    return {
        "path": f"/tmp/{basename}.md",
        "basename": basename,
        "mtime": mtime,
        "created_at": created_at,
    }


def test_files_for_session_matches_when_created_at_inside_window_and_mtime_outside():
    session_start = datetime.datetime(2026, 3, 2, 12, 46, 31)
    session_end = datetime.datetime(2026, 3, 2, 13, 30, 0)
    files = [
        _record(
            basename="MNC-STUDY-CH1",
            mtime=datetime.datetime(2026, 3, 2, 13, 32, 33),
            created_at=datetime.datetime(2026, 3, 2, 13, 27, 14),
        )
    ]

    links = files_for_session(files, session_start, session_end, buffer_minutes=0)
    assert links == ["[[MNC-STUDY-CH1]]"]


def test_files_for_session_matches_when_mtime_inside_window_and_created_at_outside():
    session_start = datetime.datetime(2026, 3, 2, 12, 46, 31)
    session_end = datetime.datetime(2026, 3, 2, 13, 30, 0)
    files = [
        _record(
            basename="MNC-STUDY-CH1",
            mtime=datetime.datetime(2026, 3, 2, 13, 27, 14),
            created_at=datetime.datetime(2026, 3, 2, 11, 0, 0),
        )
    ]

    links = files_for_session(files, session_start, session_end, buffer_minutes=0)
    assert links == ["[[MNC-STUDY-CH1]]"]


def test_files_for_session_does_not_match_when_both_timestamps_outside():
    session_start = datetime.datetime(2026, 3, 2, 12, 46, 31)
    session_end = datetime.datetime(2026, 3, 2, 13, 30, 0)
    files = [
        _record(
            basename="MNC-STUDY-CH1",
            mtime=datetime.datetime(2026, 3, 2, 13, 32, 33),
            created_at=datetime.datetime(2026, 3, 2, 13, 30, 1),
        )
    ]

    links = files_for_session(files, session_start, session_end, buffer_minutes=0)
    assert links == []


def test_files_for_session_uses_strict_zero_buffer():
    session_start = datetime.datetime(2026, 3, 2, 12, 46, 31)
    session_end = datetime.datetime(2026, 3, 2, 13, 30, 0)
    files = [
        _record(
            basename="MNC-STUDY-CH1",
            mtime=datetime.datetime(2026, 3, 2, 13, 30, 1),
            created_at=datetime.datetime(2026, 3, 2, 12, 0, 0),
        )
    ]

    links = files_for_session(files, session_start, session_end, buffer_minutes=0)
    assert links == []


def test_get_vault_files_modified_on_date_keeps_created_at_when_birthtime_present(
    tmp_path: Path, monkeypatch
):
    from sync.daily import context as context_module

    note_path = tmp_path / "MNC-STUDY-CH1.md"
    note_path.write_text("note", encoding="utf-8")
    target_date = datetime.date(2026, 3, 2)
    mtime = datetime.datetime(2026, 3, 1, 23, 59, 0).timestamp()
    birthtime = datetime.datetime(2026, 3, 2, 13, 27, 14).timestamp()

    def fake_stat(_path: str) -> _FakeStat:
        return _FakeStat(mtime=mtime, birthtime=birthtime)

    monkeypatch.setattr(context_module.os, "stat", fake_stat)
    files = get_vault_files_modified_on_date(target_date, vault_path=str(tmp_path))

    assert len(files) == 1
    assert files[0]["basename"] == "MNC-STUDY-CH1"
    assert files[0]["mtime"] == datetime.datetime.fromtimestamp(mtime)
    assert files[0]["created_at"] == datetime.datetime.fromtimestamp(birthtime)


def test_get_vault_files_modified_on_date_falls_back_to_mtime_without_birthtime(
    tmp_path: Path, monkeypatch
):
    from sync.daily import context as context_module

    note_path = tmp_path / "MNC-STUDY-CH1.md"
    note_path.write_text("note", encoding="utf-8")
    target_date = datetime.date(2026, 3, 2)
    mtime = datetime.datetime(2026, 3, 2, 13, 27, 14).timestamp()

    def fake_stat(_path: str) -> _FakeStat:
        return _FakeStat(mtime=mtime)

    monkeypatch.setattr(context_module.os, "stat", fake_stat)
    files = get_vault_files_modified_on_date(target_date, vault_path=str(tmp_path))

    assert len(files) == 1
    assert files[0]["basename"] == "MNC-STUDY-CH1"
    assert files[0]["mtime"] == datetime.datetime.fromtimestamp(mtime)
    assert files[0]["created_at"] == datetime.datetime.fromtimestamp(mtime)
