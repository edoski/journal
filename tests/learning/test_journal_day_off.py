"""The Journal's day off starts no new topic (Edo, 23 Nov 2026).

Reviews may fall on the day off (settled), but a first lesson is the
heaviest study: on lens 2's world the plan started two new topics on Sat
14 Nov, the Journal's day off. The plan now starts none on it; the day's
starts go to the next study day, and every other day keeps its own.
"""

from datetime import date
from pathlib import Path
from typing import Any

import pytest

from learning import agenda, retrieval
from tests.learning.test_agenda import (
    EVERY_DAY,
    answer,
    course,
    on,
    saved_at,
    started,
    taught,
    week,
)

SATURDAY, SUNDAY = on(5), on(6)
REST = frozenset({SATURDAY, on(12)})


def starts_per_day(result: agenda.Plan, days: int) -> list[int]:
    return [
        sum(len(course_days[n]["new"]) for course_days in result.days.values())
        for n in range(days)
    ]


def test_the_day_off_holds_its_reviews_and_starts_no_topic() -> None:
    records = {"open": course(10), "due": taught(course(2), SATURDAY)}
    before = agenda.plan(records, on(0), 14, week(10, 1, EVERY_DAY))
    after = agenda.plan(records, on(0), 14, week(10, 1, EVERY_DAY), rests=REST)
    assert starts_per_day(before, 14)[5] == 1, "the plan started a topic on the day off"
    assert starts_per_day(after, 14)[5] == 0
    assert starts_per_day(after, 14)[12] == 0
    assert after.days["due"][5]["reviews"] == before.days["due"][5]["reviews"] != []
    # The topics start in the same order, none on a day off; a fresh plan
    # still starts a second unrelated topic in a day only when his rate holds
    # two, so the rest follow a day later.
    assert [day["new"] for day in before.days["open"][:11]] == [
        [f"t{n:02d}"] for n in range(10)
    ] + [[]]
    assert [day["new"] for day in after.days["open"][:11]] == [
        *([f"t{n:02d}"] for n in range(5)),
        [],
        *([f"t{n:02d}"] for n in range(5, 10)),
    ]


def test_an_exam_pace_spreads_over_the_days_that_take_starts() -> None:
    records = {"exam": course(8, exam=20)}
    rests = frozenset(on(n) for n in range(20) if on(n).weekday() == 5)
    result = agenda.plan(records, on(0), 20, week(10, 1, EVERY_DAY), rests=rests)
    for day in result.days["exam"]:
        if date.fromisoformat(day["date"]) in rests:
            assert day["new"] == [], day
    assert result.does_not_fit == {}
    assert len(started(result.days["exam"])) == 8


def test_a_start_he_was_told_for_the_day_off_goes_to_the_next_study_day() -> None:
    """The night after a day he studied: a start the plan as that day ended
    put on the Journal's day off moves to the next day, every other day he
    was told kept."""
    studied = saved_at(
        course(10),
        {"topics": {"t00": {"introduced": True}}, "observations": [answer("t00")]},
        on(0),
        "10:00",
    )
    records = {"c": studied}
    capacity_ = week(10, 1, EVERY_DAY)
    told = agenda.plan(records, on(0), 14, capacity_)
    assert told.days["c"][5]["new"], (
        "the plan as Monday ended started a topic on Saturday"
    )
    ended = agenda.Ended(on(0), told, None, {}, {"c": agenda.structure(studied)})
    night = agenda.replay(records, on(1), 13, capacity_, ended=ended, rests=REST).now
    was = {day["date"]: day["new"] for day in told.days["c"][1:]}
    now = {day["date"]: day["new"] for day in night.days["c"]}
    assert now[SATURDAY.isoformat()] == []
    assert sorted(now[SUNDAY.isoformat()]) == sorted(
        was[SATURDAY.isoformat()] + was[SUNDAY.isoformat()]
    )
    for day, new in was.items():
        if day not in {
            SATURDAY.isoformat(),
            SUNDAY.isoformat(),
            on(12).isoformat(),
            on(13).isoformat(),
        }:
            assert now[day] == new, day


@pytest.fixture
def journal(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    vault = tmp_path / "journal-vault"
    (vault / "journal").mkdir(parents=True)
    monkeypatch.setattr(retrieval, "journal_vault", lambda: vault)
    return vault


def schedule(vault: Path, rows: str) -> None:
    (vault / "journal" / "PROTOCOL.md").write_text(
        "## SCHEDULE\n\n"
        "| RULE | STUDY_START | STUDY_END | LUNCH_START | LUNCH_END | WORKOUT_START |\n"
        "| ---- | ----------- | --------- | ----------- | --------- | ------------- |\n"
        "| DEFAULT | 09:00 | 18:00 | 13:00 | 14:00 | 07:00 |\n" + rows,
        encoding="utf-8",
    )


def test_the_plan_reads_the_journals_days_off(journal: Path) -> None:
    assert retrieval.journal_rests(date(2026, 11, 8)) == frozenset()
    schedule(journal, "| WEEKDAY:SAT | OFF | OFF | | | |\n")
    rests = retrieval.journal_rests(date(2026, 11, 8))
    assert date(2026, 11, 14) in rests and date(2026, 11, 7) in rests
    assert all(day.weekday() == 5 for day in rests)
    assert max(rests) >= date(2026, 11, 8) + (agenda.MAX_DAYS - 7) * (
        date(2026, 1, 2) - date(2026, 1, 1)
    )


def test_every_verb_reads_one_plan_with_the_days_off(
    journal: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    schedule(journal, "| WEEKDAY:SAT | OFF | OFF | | | |\n")
    seen: list[frozenset[date]] = []
    real = agenda.replay

    def spy(*args: Any, **kwargs: Any) -> agenda.Replay:
        seen.append(kwargs.get("rests", frozenset()))
        return real(*args, **kwargs)

    monkeypatch.setattr(agenda, "replay", spy)
    retrieval.daily({"c": course(3)}, on(0))
    assert seen and SATURDAY in seen[0]
