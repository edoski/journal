"""Integration-style tests for the port-driven daily sync service."""

from __future__ import annotations

import datetime
import logging
from pathlib import Path

import pytest

from sync.adapters.json_daily_cache import JsonDailyTrainingCacheStore
from sync.adapters.markdown_notes import MarkdownNoteStore
from sync.application.daily_sync_service import DailySyncService
from sync.contracts.schedule import DayScheduleProfile
from sync.contracts.screen_time import DailyScreenTimeData
from sync.contracts.status import TrainingEntryPayload, TrainingStatus
from sync.daily.composer import build_deviation_data
from sync.target_policy import effective_study_minutes


class _StubStatusSource:
    def target_days(self, anchor_day: datetime.date) -> tuple[datetime.date, ...]:
        return (anchor_day,)

    def load_training(self, _day: datetime.date) -> TrainingStatus:
        return TrainingStatus()

    def load_sleep(self, _day: datetime.date):
        return None

    def load_screen_time(self, _day: datetime.date) -> DailyScreenTimeData | None:
        return None

    def write_study_times(
        self,
        _day: datetime.date,
        _sessions,
        _day_schedule: DayScheduleProfile,
    ) -> None:
        return None


class _CountingStatusSource(_StubStatusSource):
    def __init__(self) -> None:
        self.write_calls = 0

    def write_study_times(
        self,
        _day: datetime.date,
        _sessions,
        _day_schedule: DayScheduleProfile,
    ) -> None:
        self.write_calls += 1


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


class _ConflictNoteStore(MarkdownNoteStore):
    def __init__(self, *, mutate_on_reads: int) -> None:
        self.mutate_on_reads = mutate_on_reads
        self.read_calls = 0

    def read(self, path: str) -> list[str] | None:
        self.read_calls += 1
        if self.read_calls <= self.mutate_on_reads:
            marker = f"<!-- external-change-{self.read_calls} -->"
            current = super().read(path) or []
            if marker not in current:
                current.append(marker)
                super().write(path, current)
        return super().read(path)


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


def _default_schedule() -> DayScheduleProfile:
    return DayScheduleProfile(
        study_start=datetime.time(8, 0),
        study_end=datetime.time(18, 0),
        lunch_start=datetime.time(13, 30),
        lunch_end=datetime.time(14, 30),
        workout_start=datetime.time(18, 0),
        is_off_day=False,
    )


def _build_service(
    monkeypatch,
    tmp_path,
    reminder_store=None,
    status_source=None,
    note_store=None,
) -> tuple[DailySyncService, str]:
    journal_dir = tmp_path / "journal"
    journal_dir.mkdir()
    template_path = tmp_path / "daily_template.md"
    template_path.write_text("---\nmood: 6.0\n---\n", encoding="utf-8")
    _ = monkeypatch
    training_cache_store = JsonDailyTrainingCacheStore(
        cache_dir=str(tmp_path / "cache" / "daily" / "training"),
        lock_root=str(tmp_path / "cache" / "locks" / "state"),
    )

    service = DailySyncService(
        note_store=note_store or MarkdownNoteStore(),
        status_source=status_source or _StubStatusSource(),
        reminder_store=reminder_store or _StubReminderStore(),
        goal_sync_service=_StubGoalSyncService(),
        training_cache_store=training_cache_store,
        journal_dir=str(journal_dir),
        template_path=str(template_path),
    )
    return service, str(journal_dir)


def _seed_daily_note(
    *,
    journal_dir: str,
    day: datetime.date,
    reflections_lines: list[str],
) -> Path:
    note_path = Path(journal_dir) / f"{day:%Y-%m-%d}.md"
    lines = [
        "---",
        "mood: 6.0",
        "---",
        "## Goals",
        "---",
        "",
        "## Metrics",
        "---",
        "",
        "## Reflections",
        "---",
        "",
        *reflections_lines,
        "",
    ]
    note_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return note_path


def test_sync_day_creates_and_populates_daily_note(monkeypatch, tmp_path):
    day = datetime.date.today()
    service, journal_dir = _build_service(monkeypatch, tmp_path)
    changed = service.sync_day(day, [_session_for_day(day)], _default_schedule())
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
    assert "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK |" in content
    assert "| `09:00 - 10:00` | Study | `1h00m` | `+00m` | `5m` |" in content


def test_sync_day_is_idempotent(monkeypatch, tmp_path):
    day = datetime.date.today()
    service, _ = _build_service(monkeypatch, tmp_path)
    first = service.sync_day(day, [_session_for_day(day)], _default_schedule())
    second = service.sync_day(day, [_session_for_day(day)], _default_schedule())
    assert first is True
    assert second is False


def test_sync_day_output_uses_canonical_sections_and_schema(monkeypatch, tmp_path):
    fixed_today = datetime.date(2025, 1, 15)
    service, journal_dir = _build_service(monkeypatch, tmp_path)

    changed = service.sync_day(
        fixed_today,
        [_session_for_day(fixed_today)],
        _default_schedule(),
    )
    assert changed is True

    note_path = f"{journal_dir}/{fixed_today:%Y-%m-%d}.md"
    content = open(note_path, "r", encoding="utf-8").read()
    lines = content.splitlines()

    assert "| `09:00 - 10:00` | Study | `1h00m` | `+00m` | `5m` |" in lines
    assert "| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK |" in lines

    level_two_headers = [line for line in lines if line.startswith("## ")]
    assert level_two_headers[:3] == ["## Goals", "## Metrics", "## Reflections"]

    level_three_headers = [line for line in lines if line.startswith("### **")]
    assert "### **STUDY**" in level_three_headers


def test_sync_day_fails_without_reminders_config(monkeypatch, tmp_path):
    class _MissingReminderStore(_StubReminderStore):
        def load(self):
            raise FileNotFoundError("Required reminder config not found")

    day = datetime.date.today()
    service, _ = _build_service(
        monkeypatch, tmp_path, reminder_store=_MissingReminderStore()
    )

    with pytest.raises(FileNotFoundError, match="Required reminder config not found"):
        service.sync_day(day, [_session_for_day(day)], _default_schedule())


def test_sync_day_tolerates_missing_sleep_payload(monkeypatch, tmp_path):
    day = datetime.date(2025, 1, 15)
    service, journal_dir = _build_service(monkeypatch, tmp_path)
    changed = service.sync_day(day, [_session_for_day(day)], _default_schedule())
    assert changed is True
    note_path = f"{journal_dir}/{day:%Y-%m-%d}.md"
    content = open(note_path, "r", encoding="utf-8").read()
    assert "### **SLEEP**" in content


def test_sync_day_skips_write_when_note_changes_before_write(
    monkeypatch, tmp_path, caplog
):
    day = datetime.date(2025, 1, 15)
    status_source = _CountingStatusSource()
    service, journal_dir = _build_service(
        monkeypatch,
        tmp_path,
        status_source=status_source,
        note_store=_ConflictNoteStore(mutate_on_reads=1),
    )

    caplog.set_level(logging.WARNING)
    journal_logger = logging.getLogger("journal")
    prior_level = journal_logger.level
    journal_logger.setLevel(logging.WARNING)
    journal_logger.addHandler(caplog.handler)
    try:
        changed = service.sync_day(day, [_session_for_day(day)], _default_schedule())
    finally:
        journal_logger.removeHandler(caplog.handler)
        journal_logger.setLevel(prior_level)

    assert changed is False
    assert status_source.write_calls == 1
    assert any("skipped write" in rec.getMessage() for rec in caplog.records)
    content = Path(journal_dir, f"{day:%Y-%m-%d}.md").read_text(encoding="utf-8")
    assert "<!-- external-change-1 -->" in content


def _extract_reflections_lines(note_path: Path) -> list[str]:
    lines = note_path.read_text(encoding="utf-8").splitlines()
    reflections_idx = lines.index("## Reflections")
    start = reflections_idx + 2
    if start < len(lines) and lines[start] == "":
        start += 1

    end = len(lines)
    for idx in range(start, len(lines)):
        if lines[idx].startswith("## "):
            end = idx
            break

    while end > start and lines[end - 1] == "":
        end -= 1
    return lines[start:end]


def test_sync_day_normalizes_reflections_header_and_colon_divider(
    monkeypatch, tmp_path
):
    day = datetime.date(2025, 1, 15)
    service, journal_dir = _build_service(monkeypatch, tmp_path)
    reflections_lines = [
        "| TIME    | ENTRY                                                                 |",
        "| :------- | -------: |",
        "| `7:18` | keep timestamp exactly as typed |",
    ]
    note_path = _seed_daily_note(
        journal_dir=journal_dir,
        day=day,
        reflections_lines=reflections_lines,
    )

    changed = service.sync_day(day, [], _default_schedule())
    assert changed is True
    normalized = _extract_reflections_lines(note_path)
    assert normalized[0] == "| TIME | ENTRY |"
    assert normalized[1] == "| ---- | ----- |"
    assert ":" not in normalized[1]
    assert normalized[2:] == reflections_lines[2:]


def test_sync_day_normalizes_reflections_long_dash_divider(monkeypatch, tmp_path):
    day = datetime.date(2025, 1, 15)
    service, journal_dir = _build_service(monkeypatch, tmp_path)
    reflections_lines = [
        "| TIME | ENTRY |",
        "| ----------- | ------------------------------------------------ |",
        "| `08:43` | long entry that should remain untouched |",
    ]
    note_path = _seed_daily_note(
        journal_dir=journal_dir,
        day=day,
        reflections_lines=reflections_lines,
    )

    changed = service.sync_day(day, [], _default_schedule())
    assert changed is True
    normalized = _extract_reflections_lines(note_path)
    assert normalized[0] == "| TIME | ENTRY |"
    assert normalized[1] == "| ---- | ----- |"
    assert normalized[2:] == reflections_lines[2:]


def test_sync_day_inserts_missing_reflections_divider_before_first_row(
    monkeypatch, tmp_path
):
    day = datetime.date(2025, 1, 15)
    service, journal_dir = _build_service(monkeypatch, tmp_path)
    reflections_lines = [
        "| TIME | ENTRY |",
        "| `08:43` | long reflection entry that should be preserved |",
    ]
    note_path = _seed_daily_note(
        journal_dir=journal_dir,
        day=day,
        reflections_lines=reflections_lines,
    )

    changed = service.sync_day(day, [], _default_schedule())
    assert changed is True
    normalized = _extract_reflections_lines(note_path)
    assert normalized == [
        "| TIME | ENTRY |",
        "| ---- | ----- |",
        "| `08:43` | long reflection entry that should be preserved |",
    ]


def test_sync_day_preserves_reflections_rows_verbatim_after_header_normalization(
    monkeypatch, tmp_path
):
    day = datetime.date(2025, 1, 15)
    service, journal_dir = _build_service(monkeypatch, tmp_path)
    reflections_lines = [
        "| TIME    | ENTRY                                                                 |",
        "| ----------- | ------------------------------------------------ |",
        "| `7:18` | keep timestamp exactly as typed |",
        "| `08:43` | part one | part two |",
        "| broken time text | |",
    ]
    note_path = _seed_daily_note(
        journal_dir=journal_dir,
        day=day,
        reflections_lines=reflections_lines,
    )

    changed = service.sync_day(day, [], _default_schedule())
    assert changed is True
    normalized = _extract_reflections_lines(note_path)
    assert normalized[0] == "| TIME | ENTRY |"
    assert normalized[1] == "| ---- | ----- |"
    assert normalized[2:] == reflections_lines[2:]


def test_sync_day_does_not_emit_reflections_repair_warnings(
    monkeypatch, tmp_path, caplog
):
    day = datetime.date(2025, 1, 15)
    service, journal_dir = _build_service(monkeypatch, tmp_path)
    _seed_daily_note(
        journal_dir=journal_dir,
        day=day,
        reflections_lines=[
            "| TIME is corrupted text | ENTRY |",
            "| :------- | -------: |",
            "| broken time text | |",
        ],
    )

    caplog.set_level(logging.WARNING)
    journal_logger = logging.getLogger("journal")
    prior_level = journal_logger.level
    journal_logger.setLevel(logging.WARNING)
    journal_logger.addHandler(caplog.handler)
    try:
        changed = service.sync_day(day, [], _default_schedule())
    finally:
        journal_logger.removeHandler(caplog.handler)
        journal_logger.setLevel(prior_level)

    assert changed is True
    note_path = Path(journal_dir, f"{day:%Y-%m-%d}.md")
    normalized = _extract_reflections_lines(note_path)
    assert normalized[0] == "| TIME | ENTRY |"
    assert normalized[1] == "| ---- | ----- |"
    assert ":" not in normalized[1]
    assert not any("Repaired Reflections" in rec.getMessage() for rec in caplog.records)


def test_sync_day_reflections_header_normalization_is_idempotent(monkeypatch, tmp_path):
    day = datetime.date(2025, 1, 15)
    service, journal_dir = _build_service(monkeypatch, tmp_path)
    note_path = _seed_daily_note(
        journal_dir=journal_dir,
        day=day,
        reflections_lines=[
            "| TIME is corrupted text | ENTRY |",
            "| :------- | -------: |",
            "| `08:3 collapsed reflection content | |",
        ],
    )

    first = service.sync_day(day, [], _default_schedule())
    second = service.sync_day(day, [], _default_schedule())

    assert first is True
    assert second is False
    normalized = _extract_reflections_lines(note_path)
    assert normalized[0] == "| TIME | ENTRY |"
    assert normalized[1] == "| ---- | ----- |"
    assert normalized[2] == "| `08:3 collapsed reflection content | |"


def test_sync_day_passes_schedule_cap_to_procrastination_section(monkeypatch, tmp_path):
    captured_max_total: dict[str, float | None] = {"value": None}

    def _capture_procrastination_section(
        screen_time_data,
        deviation_data=None,
        max_total_minutes=None,
    ) -> list[str]:
        _ = screen_time_data, deviation_data
        captured_max_total["value"] = max_total_minutes
        return [
            "### **PROCRASTINATION**",
            "",
            "_No screen time data available._",
        ]

    monkeypatch.setattr(
        "sync.daily.composer.build_procrastination_section",
        _capture_procrastination_section,
    )

    day = datetime.date(2026, 2, 19)
    schedule = DayScheduleProfile(
        study_start=datetime.time(15, 0),
        study_end=datetime.time(22, 0),
        lunch_start=datetime.time(13, 30),
        lunch_end=datetime.time(14, 30),
        workout_start=datetime.time(22, 0),
        is_off_day=False,
    )

    service, _ = _build_service(monkeypatch, tmp_path)
    changed = service.sync_day(day, [], schedule)

    assert changed is True
    assert captured_max_total["value"] == float(effective_study_minutes(schedule))


def test_build_deviation_data_accrues_full_study_window_without_sessions():
    day = datetime.date(2026, 2, 18)
    schedule = DayScheduleProfile(
        study_start=datetime.time(14, 30),
        study_end=datetime.time(18, 0),
        lunch_start=datetime.time(13, 30),
        lunch_end=datetime.time(14, 30),
        workout_start=datetime.time(18, 0),
        is_off_day=False,
    )

    deviation = build_deviation_data(
        day,
        schedule,
        [],
        TrainingStatus(),
    )

    assert deviation.late_study_start_minutes == 210.0


def test_build_deviation_data_uses_schedule_study_start_for_lateness():
    day = datetime.date(2026, 2, 19)
    schedule = DayScheduleProfile(
        study_start=datetime.time(14, 30),
        study_end=datetime.time(18, 0),
        lunch_start=datetime.time(13, 30),
        lunch_end=datetime.time(14, 30),
        workout_start=datetime.time(18, 0),
        is_off_day=False,
    )
    session_start = datetime.datetime.combine(day, datetime.time(15, 0))
    session_end = datetime.datetime.combine(day, datetime.time(16, 0))
    sessions = [
        {
            "start": session_start,
            "end": session_end,
            "interruptions_duration": 0,
            "break_overrun": 0,
        }
    ]

    deviation = build_deviation_data(
        day,
        schedule,
        sessions,
        TrainingStatus(),
    )

    assert deviation.late_study_start_minutes == 30.0


def test_build_deviation_data_uses_schedule_workout_start_for_lateness():
    day = datetime.date(2026, 2, 20)
    schedule = DayScheduleProfile(
        study_start=datetime.time(8, 0),
        study_end=datetime.time(18, 0),
        lunch_start=datetime.time(13, 30),
        lunch_end=datetime.time(14, 30),
        workout_start=datetime.time(19, 0),
        is_off_day=False,
    )
    training = TrainingStatus(
        workout_entries=(
            TrainingEntryPayload(
                date=day.isoformat(),
                start="19:15",
                end="20:00",
                duration=45.0,
                type="Workout",
            ),
        )
    )

    deviation = build_deviation_data(
        day,
        schedule,
        [],
        training,
    )

    assert deviation.late_workout_start_minutes == 15.0


def test_build_deviation_data_off_day_has_no_late_study_start_penalty():
    day = datetime.date(2026, 2, 21)
    schedule = DayScheduleProfile(
        study_start=datetime.time(8, 0),
        study_end=datetime.time(18, 0),
        lunch_start=datetime.time(13, 30),
        lunch_end=datetime.time(14, 30),
        workout_start=datetime.time(19, 0),
        is_off_day=True,
    )
    session_start = datetime.datetime.combine(day, datetime.time(15, 0))
    session_end = datetime.datetime.combine(day, datetime.time(16, 0))
    sessions = [
        {
            "start": session_start,
            "end": session_end,
            "interruptions_duration": 30,
            "break_overrun": 5,
        }
    ]

    no_sessions_deviation = build_deviation_data(
        day,
        schedule,
        [],
        TrainingStatus(),
    )
    with_sessions_deviation = build_deviation_data(
        day,
        schedule,
        sessions,
        TrainingStatus(),
    )

    assert no_sessions_deviation.late_study_start_minutes == 0.0
    assert with_sessions_deviation.late_study_start_minutes == 0.0
    assert with_sessions_deviation.interrupt_minutes == 0.5
    assert with_sessions_deviation.overrun_minutes == 5
