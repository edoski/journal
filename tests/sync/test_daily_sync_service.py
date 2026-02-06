"""Integration-style tests for the port-driven daily sync service."""

from __future__ import annotations

import datetime
import hashlib

import pytest

from sync.adapters.markdown_notes import MarkdownNoteStore
from sync.application.daily_sync_service import DailySyncService
from sync.contracts.daily import TrainingStatusBundle
from sync.models.screen_time import DailyScreenTimeData


class _StubStatusSource:
    def load_training(self, _day: datetime.date) -> TrainingStatusBundle:
        return TrainingStatusBundle(
            workout_done=False,
            stretch_done=False,
            meditate_done=False,
            workout_payload=None,
            stretch_payload=None,
            meditate_payload=None,
        )

    def load_sleep(self, _day: datetime.date):
        return None

    def load_screen_time(self, _day: datetime.date) -> DailyScreenTimeData | None:
        return None

    def write_study_times(self, _day: datetime.date, _sessions) -> None:
        return None


class _StubContextSource:
    def files_modified_on_date(self, _day: datetime.date):
        return []

    def links_for_window(
        self, _files, _start: datetime.datetime, _end: datetime.datetime
    ):
        return []


class _StubReminderStore:
    def load(self):
        return []

    def save(self, _rules):
        return None


class _StubGoalSyncService:
    def sync_daily_note(
        self,
        lines,
        *,
        day,
        note_path,
        yaml_end_idx,
        reminder_rules,
    ):
        _ = day, note_path, yaml_end_idx, reminder_rules
        return lines


def _session_for_day(day: datetime.date) -> dict:
    start = datetime.datetime.combine(day, datetime.time(9, 0))
    end = datetime.datetime.combine(day, datetime.time(10, 0))
    return {
        "start": start,
        "end": end,
        "title": "Flow",
        "actual_elapsed": 60.0,
        "interruptions_duration": 0,
        "break_expected": 5,
        "break_overrun": 0,
        "is_open": False,
        "completed_at": end,
    }


def _build_service(
    monkeypatch, tmp_path, reminder_store=None
) -> tuple[DailySyncService, str]:
    journal_dir = tmp_path / "journal"
    journal_dir.mkdir()
    template_path = tmp_path / "daily_template.md"
    template_path.write_text("---\nmood: 6.0\n---\n", encoding="utf-8")
    _ = monkeypatch

    service = DailySyncService(
        note_store=MarkdownNoteStore(),
        status_source=_StubStatusSource(),
        context_source=_StubContextSource(),
        reminder_store=reminder_store or _StubReminderStore(),
        goal_sync_service=_StubGoalSyncService(),
        journal_dir=str(journal_dir),
        template_path=str(template_path),
    )
    return service, str(journal_dir)


def test_sync_day_creates_and_populates_daily_note(monkeypatch, tmp_path):
    day = datetime.date.today()
    service, journal_dir = _build_service(monkeypatch, tmp_path)
    changed = service.sync_day(day, [_session_for_day(day)])
    assert changed is True

    note_path = f"{journal_dir}/{day:%Y-%m-%d}.md"
    content = open(note_path, "r", encoding="utf-8").read()
    assert "study: 1h00m" in content
    assert "workout: false" in content
    assert "stretch: false" in content
    assert "meditate: false" in content
    assert "## Goals" in content
    assert "## Metrics" in content
    assert "## Reflections" in content
    assert "### **STUDY**" in content
    assert (
        "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK | CONTEXT | NOTES |"
        in content
    )
    assert "| `09:00 - 10:00` | Study | `1h00m` | `+00m` | `5m` | – | – |" in content


def test_sync_day_is_idempotent(monkeypatch, tmp_path):
    day = datetime.date.today()
    service, _ = _build_service(monkeypatch, tmp_path)
    first = service.sync_day(day, [_session_for_day(day)])
    second = service.sync_day(day, [_session_for_day(day)])
    assert first is True
    assert second is False


def test_sync_day_output_characterization(monkeypatch, tmp_path):
    fixed_today = datetime.date(2025, 1, 15)

    class _FixedDate(datetime.date):
        @classmethod
        def today(cls):
            return cls(2025, 1, 15)

    monkeypatch.setattr("sync.daily.goals.datetime.date", _FixedDate)
    service, journal_dir = _build_service(monkeypatch, tmp_path)

    changed = service.sync_day(fixed_today, [_session_for_day(fixed_today)])
    assert changed is True

    note_path = f"{journal_dir}/{fixed_today:%Y-%m-%d}.md"
    content = open(note_path, "r", encoding="utf-8").read()
    assert "| `09:00 - 10:00` | Study | `1h00m` | `+00m` | `5m` | – | – |" in content
    content_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
    assert (
        content_hash
        == "2dc949bd8ef5dc305f717f44cafb171cbb76942acd851732750daececc2ba221"
    )


def test_sync_day_fails_without_reminders_config(monkeypatch, tmp_path):
    class _MissingReminderStore(_StubReminderStore):
        def load(self):
            raise FileNotFoundError("Required reminder config not found")

    day = datetime.date.today()
    service, _ = _build_service(
        monkeypatch, tmp_path, reminder_store=_MissingReminderStore()
    )

    with pytest.raises(FileNotFoundError, match="Required reminder config not found"):
        service.sync_day(day, [_session_for_day(day)])
