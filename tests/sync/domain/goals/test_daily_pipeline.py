"""Tests for goal note gateway period-key handling."""

from __future__ import annotations

import datetime

from sync.application.goal_note_gateway import GoalNoteGateway
from sync.contracts.goals import Goal, GoalSection, GoalWriteTarget
from sync.dates import iso_week_range


class _StubNoteStore:
    def __init__(self, weekly_lines: list[str] | None) -> None:
        self._weekly_lines = weekly_lines

    def read(self, _path: str) -> list[str] | None:
        return None if self._weekly_lines is None else self._weekly_lines[:]

    def read_or_create(self, _path: str, _template_path: str) -> list[str]:
        return ["## Goals", "", "## Metrics", "---"]

    def write(self, _path: str, _lines: list[str]) -> None:
        raise AssertionError("write should not be called")


class _CaptureGoalStore:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str | None, str | None]] = []

    def extract(
        self,
        _lines: list[str],
        section: str,
        horizon: str | None = None,
        period_key: str | None = None,
    ) -> list[object]:
        self.calls.append((section, horizon, period_key))
        return []

    def apply(
        self,
        lines: list[str],
        _sections: list[object],
        *,
        insert_after_idx: int | None = None,
    ) -> list[str]:
        _ = insert_after_idx
        return lines

    def write(
        self,
        _path: str,
        lines: list[str],
        _sections: list[object],
        *,
        insert_after_idx: int | None = None,
    ) -> list[str]:
        _ = insert_after_idx
        return lines


class _WriteCaptureGoalStore:
    def __init__(self) -> None:
        self.sections_by_path: dict[str, list[GoalSection]] = {}

    def extract(
        self,
        _lines: list[str],
        section: str,
        horizon: str | None = None,
        period_key: str | None = None,
    ) -> list[Goal]:
        _ = horizon, period_key
        if section == "YEARLY":
            return [Goal(id="gid-m111111111", body="Year Goal", done=False)]
        if section == "QUARTERLY":
            return [Goal(id="gid-m222222222", body="Quarter Goal", done=False)]
        return []

    def apply(
        self,
        lines: list[str],
        _sections: list[GoalSection],
        *,
        insert_after_idx: int | None = None,
    ) -> list[str]:
        _ = insert_after_idx
        return lines

    def write(
        self,
        path: str,
        lines: list[str],
        sections: list[GoalSection],
        *,
        insert_after_idx: int | None = None,
    ) -> list[str]:
        _ = insert_after_idx
        self.sections_by_path[path] = sections
        return lines


class _WritableNoteStore(_StubNoteStore):
    def __init__(self, lines: list[str]) -> None:
        super().__init__(weekly_lines=lines)
        self.written: dict[str, list[str]] = {}

    def read(self, _path: str) -> list[str] | None:
        return self._weekly_lines[:]

    def read_or_create(self, _path: str, _template_path: str) -> list[str]:
        return self._weekly_lines[:]

    def write(self, path: str, lines: list[str]) -> None:
        self.written[path] = lines[:]
        self._weekly_lines = lines[:]


def test_load_daily_sources_uses_week_start_period_key() -> None:
    day = datetime.date(2026, 2, 6)
    week_start, _ = iso_week_range(day)
    goal_store = _CaptureGoalStore()
    gateway = GoalNoteGateway(
        note_store=_StubNoteStore(weekly_lines=["## Goals"]),
        goal_store=goal_store,
    )

    gateway.load_daily_sources(day)

    weekly_calls = [call for call in goal_store.calls if call[0] == "WEEKLY"]
    assert len(weekly_calls) == 1
    _, horizon, period_key = weekly_calls[0]
    assert horizon == "weekly"
    assert period_key == week_start.isoformat()
    assert period_key != day.isoformat()


def test_write_daily_sources_clears_quarterly_sections_when_given_empty_lists(
    monkeypatch,
    tmp_path,
) -> None:
    day = datetime.date(2026, 2, 6)
    quarter_path = str(tmp_path / "2026-Q1.md")
    weekly_path = str(tmp_path / "2026-W06.md")
    goal_store = _WriteCaptureGoalStore()
    gateway = GoalNoteGateway(
        note_store=_StubNoteStore(weekly_lines=None),
        goal_store=goal_store,
    )

    def _journal_path(filename: str) -> str:
        if filename.endswith(".md") and "Q" in filename:
            return quarter_path
        if filename.endswith(".md") and "W" in filename:
            return weekly_path
        return str(tmp_path / filename)

    monkeypatch.setattr(
        "sync.application.goal_note_gateway.journal_path", _journal_path
    )

    gateway.write_daily_sources(
        day,
        weekly_tasks=[],
        quarterly_tasks=[],
        yearly_tasks=[],
    )

    quarter_sections = goal_store.sections_by_path[quarter_path]
    assert quarter_sections[0].section == "YEARLY"
    assert quarter_sections[0].lines == ["", "_No yearly goals have been defined yet._"]
    assert quarter_sections[1].section == "QUARTERLY"
    assert quarter_sections[1].lines == [
        "",
        "_No quarterly goals have been defined yet._",
    ]


def test_add_goal_replaces_empty_placeholder(tmp_path) -> None:
    note_path = str(tmp_path / "2026-02.md")
    template_path = tmp_path / "template.md"
    template_path.write_text("", encoding="utf-8")
    note_store = _WritableNoteStore(
        [
            "## Goals",
            "---",
            "### **MONTHLY**",
            "",
            "_No monthly goals have been defined yet._",
            "",
            "## Metrics",
            "---",
        ]
    )
    gateway = GoalNoteGateway(
        note_store=note_store,
        goal_store=_CaptureGoalStore(),
    )

    result = gateway.add_goal(
        GoalWriteTarget(
            note_path=note_path,
            template_path=str(template_path),
            section="MONTHLY",
            horizon="monthly",
            period_key="2026-02",
        ),
        "Ship feature",
    )

    assert result.duplicate is False
    written = note_store.written[note_path]
    assert any("Ship feature" in line for line in written)
    assert "_No monthly goals have been defined yet._" not in written


def test_add_goal_detects_canonical_duplicate(tmp_path) -> None:
    note_path = str(tmp_path / "2026-02.md")
    template_path = tmp_path / "template.md"
    template_path.write_text("", encoding="utf-8")
    note_store = _WritableNoteStore(
        [
            "## Goals",
            "---",
            "### **MONTHLY**",
            "- [ ] Ship feature ^gid-m111111111",
            "",
            "## Metrics",
            "---",
        ]
    )
    gateway = GoalNoteGateway(
        note_store=note_store,
        goal_store=_CaptureGoalStore(),
    )

    result = gateway.add_goal(
        GoalWriteTarget(
            note_path=note_path,
            template_path=str(template_path),
            section="MONTHLY",
            horizon="monthly",
            period_key="2026-02",
        ),
        "ship feature!",
    )

    assert result.duplicate is True
    assert note_store.written == {}


def test_add_goal_appends_missing_subsection_without_rewriting_other_subsections(
    tmp_path,
) -> None:
    note_path = str(tmp_path / "2026-02.md")
    template_path = tmp_path / "template.md"
    template_path.write_text("", encoding="utf-8")
    original_lines = [
        "## Goals",
        "---",
        "### **QUARTERLY**",
        "- [ ] Mirror line — `12d` ^gid-m111111111",
        "",
        "## Metrics",
        "---",
    ]
    note_store = _WritableNoteStore(original_lines)
    gateway = GoalNoteGateway(
        note_store=note_store,
        goal_store=_CaptureGoalStore(),
    )

    result = gateway.add_goal(
        GoalWriteTarget(
            note_path=note_path,
            template_path=str(template_path),
            section="MONTHLY",
            horizon="monthly",
            period_key="2026-02",
        ),
        "New monthly task",
    )

    assert result.duplicate is False
    written = note_store.written[note_path]
    assert "- [ ] Mirror line — `12d` ^gid-m111111111" in written
    assert any("New monthly task" in line for line in written)
