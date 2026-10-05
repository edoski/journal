"""The week in review and the exam run-up, as `plan` reports them."""

from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pytest

from learning import progress, records, schema
from learning.planning import plan
from learning.workspace import Workspace, initialize

TODAY = date(2026, 10, 10)
NOW = "2026-10-10T09:00:00+00:00"


@pytest.fixture(autouse=True)
def pinned_day(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LEARNING_TODAY", TODAY.isoformat())


def day(offset: int) -> str:
    return (TODAY + timedelta(days=offset)).isoformat()


def attempt(
    topic: str, offset: int, result: str = "correct", **extra: Any
) -> dict[str, Any]:
    return {
        "topics": [topic],
        "text": extra.pop("text", f"{topic} {offset} {result}"),
        "help": extra.pop("help", "none"),
        "result": result,
        "date": day(offset),
        **extra,
    }


def build(patch: dict[str, Any]) -> dict[str, Any]:
    return schema.apply_patch(schema.empty(), patch, today=TODAY, now=NOW)[0]


TOPICS = {
    "rank": {"introduced": day(-20)},
    "span": {"introduced": day(-3)},
    "eigen": {},
    "basis": {},
    "subst": {},
}
HISTORY = [
    attempt("rank", -20),
    attempt("rank", -17),
    attempt("rank", -4, "incorrect"),
    attempt("span", -2, "partial", help="Hint"),
    attempt("span", -1),
    attempt("eigen", -8),
    attempt("eigen", -5),
    attempt("basis", -9),
    attempt("basis", -6),
    attempt("basis", -6, "incorrect", text="retry", chose="subst"),
]


def test_the_week_replays_levels_from_the_window_start() -> None:
    record = build({"topics": TOPICS, "observations": HISTORY})
    start = TODAY - timedelta(days=6)
    earlier = build(
        {
            "topics": {
                key: {k: v for k, v in topic.items() if v < start.isoformat()}
                for key, topic in TOPICS.items()
            },
            "observations": [
                item for item in HISTORY if item["date"] < start.isoformat()
            ],
        }
    )

    def levels(course: dict[str, Any]) -> dict[str, tuple[Any, ...]]:
        return {
            key: (item["level"], item["unaided_days"], item.get("lapsed"))
            for key, item in progress.standings(course).items()
        }

    assert levels(progress.as_of(record, start)) == levels(earlier)
    summary = progress.week(record, TODAY)
    assert summary["levels"] == {
        "span": {"from": "new", "to": "assisted"},
        "eigen": {"from": "independent", "to": "retained"},
    }
    assert "rank" not in summary["levels"]


def test_first_tries_attempts_and_wrong_methods_are_counted_in_the_window() -> None:
    record = build({"topics": TOPICS, "observations": HISTORY})
    summary = progress.week(record, TODAY)
    assert summary["probes"] == {"total": 4, "solid": 1}
    assert summary["attempts"] == {"unaided": 5, "assisted": 1}
    assert summary["choice_errors"] == [{"topic": "basis", "chose": "subst"}]
    quiet = progress.week(record, TODAY + timedelta(days=30))
    assert quiet == {}


def write_protocol(vault: Path, *off: str) -> None:
    journal = vault / "journal"
    journal.mkdir(parents=True, exist_ok=True)
    rows = "".join(f"| DATE:{when} | OFF | OFF | | | |\n" for when in off)
    (journal / "PROTOCOL.md").write_text(
        "## SCHEDULE\n"
        "| RULE | STUDY_START | STUDY_END | LUNCH_START | LUNCH_END | WORKOUT_START |\n"
        "| --- | --- | --- | --- | --- | --- |\n"
        "| DEFAULT | 09:00 | 17:00 | 12:00 | 13:00 | 18:00 |\n" + rows,
        encoding="utf-8",
    )


def runup_course(tmp_path: Path, exam_offset: int) -> Workspace:
    directory = tmp_path / "course"
    directory.mkdir()
    workspace = initialize(directory)
    records.save(
        workspace,
        {
            "exam": {"date": day(exam_offset)},
            "topics": {
                "rank": {},
                "span": {"needs": ["rank"]},
                "eigen": {"needs": ["span"]},
                "basis": {},
            },
            "path": {"order": ["rank", "span", "eigen", "basis"]},
            "observations": [
                attempt("rank", -13),
                attempt("span", -15),
                attempt("basis", -3, "partial"),
            ],
        },
    )
    return workspace


def runup(workspace: Workspace, vault: Path, days: int = 7) -> Any:
    return plan(workspace, vault, everywhere=False, days=days)["courses"][0].get(
        "runup"
    )


@pytest.mark.parametrize(
    ("offset", "present"), [(21, True), (0, True), (22, False), (-1, False)]
)
def test_the_runup_appears_only_within_21_days(
    tmp_path: Path, offset: int, present: bool
) -> None:
    workspace = runup_course(tmp_path, offset)
    assert (runup(workspace, tmp_path / "vault") is not None) is present


def test_unready_uses_the_14_day_window_and_untaught_topics_are_listed(
    tmp_path: Path,
) -> None:
    result = runup(runup_course(tmp_path, 14), tmp_path / "vault")
    assert result["days_left"] == 14
    assert result["not_introduced"] == ["eigen"]
    assert result["unready"] == ["span", "eigen", "basis"]


def test_study_days_count_windows_until_a_week_before_the_exam(tmp_path: Path) -> None:
    vault = tmp_path / "vault"
    write_protocol(vault, day(1), day(2), day(7))
    workspace = runup_course(tmp_path, 14)
    result = runup(workspace, vault)
    assert result["study_days"] == 5
    assert result["pace"] == 0.2
    full = plan(workspace, vault, everywhere=False, days=7)
    assert len(full["journal"]["upcoming_schedule"]) == 21


def test_journal_errors_or_no_study_days_omit_study_days_and_pace(
    tmp_path: Path,
) -> None:
    vault = tmp_path / "vault"
    workspace = runup_course(tmp_path, 14)
    write_protocol(vault, *(day(offset) for offset in range(7)))
    result = runup(workspace, vault)
    assert "study_days" not in result and "pace" not in result
    write_protocol(vault)
    (vault / "journal" / f"{TODAY.isoformat()}.md").write_text(
        "no table\n", encoding="utf-8"
    )
    broken = runup(workspace, vault)
    assert "study_days" not in broken and "pace" not in broken
    assert broken["not_introduced"] == ["eigen"]


def test_the_journal_horizon_stays_short_without_a_near_exam(tmp_path: Path) -> None:
    vault = tmp_path / "vault"
    write_protocol(vault)
    workspace = runup_course(tmp_path, 40)
    result = plan(workspace, vault, everywhere=False, days=7)
    assert len(result["journal"]["upcoming_schedule"]) == 7
    assert "runup" not in result["courses"][0]


def test_week_minutes_cover_seven_days_whatever_the_plan_window(tmp_path: Path) -> None:
    vault = tmp_path / "vault"
    journal = vault / "journal"
    journal.mkdir(parents=True)
    for offset, minutes in ((0, "1h"), (-10, "2h")):
        (journal / f"{day(offset)}.md").write_text(
            "### **STUDY**\n| TIME | ACTIVITY | DURATION | INTERRUPT | BREAK |\n"
            f"| --- | --- | --- | --- | --- |\n| 09:00 - 10:00 | SMM | {minutes} | 0m | 0m |\n",
            encoding="utf-8",
        )
    directory = tmp_path / "course"
    directory.mkdir()
    workspace = initialize(directory)
    records.save(workspace, {"journal": "SMM", "topics": {"rank": {}}})
    entry = plan(workspace, vault, everywhere=False, days=14)["courses"][0]
    assert entry["journal"]["study_minutes"] == 180
    assert entry["week"] == {"minutes": 60}
