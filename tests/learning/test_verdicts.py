"""The verdict rule: one grade per counted day, replayed into levels and reviews."""

from datetime import date, datetime, timedelta
from typing import Any

from learning import progress, schema

DAY1 = date(2026, 1, 1)
TOPICS = {"topics": {"a": {"title": "A"}, "b": {"title": "B"}}}


def on(offset: int) -> date:
    return DAY1 + timedelta(days=offset - 1)


def att(result: str, help: str = "none", **extra: Any) -> dict[str, Any]:
    return {
        "topics": extra.pop("topics", ["a"]),
        "text": extra.pop("text", f"q-{result}-{help}"),
        "help": help,
        "result": result,
        **extra,
    }


class Course:
    """Saves applied day by day, with the engine's scheduling, like records.save."""

    def __init__(self, patch: dict[str, Any] | None = None, day: int = 1) -> None:
        self.record = schema.empty()
        self.scheduled = progress.Scheduled()
        self.minute = 0
        if patch is not None:
            self.save(day, patch)

    def save(self, day: int, patch: dict[str, Any]) -> "Course":
        today = on(day)
        self.minute += 40
        stamp = datetime(today.year, today.month, today.day, 8, tzinfo=None)
        now = (stamp + timedelta(minutes=self.minute)).isoformat() + "+00:00"
        patched, outcome = schema.apply_patch(self.record, patch, today=today, now=now)
        self.record, self.scheduled = progress.schedule(patched, outcome, today)
        return self

    def attempts(self, day: int, *observations: dict[str, Any]) -> "Course":
        return self.save(day, {"observations": list(observations)})

    @property
    def standing(self) -> dict[str, Any]:
        return progress.standing(self.record, "a")

    @property
    def due(self) -> str:
        return str(self.record["topics"]["a"]["review"]["due"])

    @property
    def verdicts(self) -> list[tuple[str, str]]:
        return progress.replays(self.record)["a"].verdicts


def started(*observations: dict[str, Any]) -> Course:
    return Course({**TOPICS, "observations": list(observations)})


def test_the_audit_bug_a_failed_probe_lapses_despite_a_correct_retry() -> None:
    course = started(att("correct"))
    course.attempts(5, att("incorrect", text="q1"))
    course.attempts(5, att("correct", text="q2"))
    assert course.standing["level"] == "independent"
    assert course.standing["lapsed"] is True
    assert course.standing["unaided_days"] == 1
    assert course.due == on(6).isoformat()


def test_the_learning_day_takes_its_best_grade() -> None:
    course = started(att("correct"), att("partial", text="Brain dump"))
    assert course.verdicts == [(on(1).isoformat(), "solid")]
    assert "lapsed" not in course.standing
    assert course.due == on(4).isoformat()


def test_multi_day_teaching_counts_only_unaided_failures() -> None:
    course = started(att("correct", "Worked example"))
    assert course.due == on(3).isoformat()
    course.attempts(2, att("correct", "Hint"), att("partial", "Hint", text="next"))
    assert course.verdicts == [(on(1).isoformat(), "helped")]
    assert course.scheduled.reviews == {}
    course.attempts(2, att("incorrect", text="alone"))
    assert course.verdicts[-1] == (on(2).isoformat(), "missed")
    assert course.due == on(3).isoformat()


def test_the_first_retrieval_after_teaching_is_a_probe() -> None:
    course = Course({"topics": {"a": {"introduced": True}}})
    assert course.due == on(2).isoformat()
    course.attempts(2, att("correct"))
    assert course.verdicts == [(on(2).isoformat(), "solid")]
    assert progress.replays(course.record)["a"].days == {on(2).isoformat(): "probe"}
    assert course.standing["level"] == "independent"


def test_a_missed_first_retrieval_counts_even_after_a_correct_retry() -> None:
    course = Course({"topics": {"a": {"introduced": True}}})
    course.attempts(2, att("incorrect", text="q1"))
    course.attempts(2, att("correct", text="q2"))
    assert course.verdicts == [(on(2).isoformat(), "missed")]
    assert course.standing["level"] == "attempted"
    assert course.due == on(3).isoformat()


def test_massed_daily_practice_does_not_climb_the_ladder() -> None:
    course = started(att("correct"))
    for day in (2, 3):
        course.attempts(day, att("correct", text=f"q{day}"))
        assert course.scheduled.reviews == {}
    assert course.standing["unaided_days"] == 1
    course.attempts(4, att("correct", text="q4"))
    assert course.standing["unaided_days"] == 2
    assert course.standing["level"] == "retained"
    assert course.due == on(11).isoformat()


def test_a_probe_counts_its_first_try_and_only_unaided_failures_lower_it() -> None:
    helped = started(att("correct"))
    helped.attempts(4, att("correct", "Hint", text="first"), att("incorrect"))
    assert helped.verdicts[-1] == (on(4).isoformat(), "missed")
    solid = started(att("correct"))
    solid.attempts(4, att("correct", text="first"), att("partial", text="dump"))
    assert solid.verdicts[-1] == (on(4).isoformat(), "solid")
    hinted = started(att("correct"))
    hinted.attempts(4, att("correct", text="first"), att("incorrect", "Hint"))
    assert hinted.verdicts[-1] == (on(4).isoformat(), "solid")


def test_transferred_needs_a_solid_transfer_on_a_day_not_missed() -> None:
    practice = started(att("correct"))
    practice.attempts(2, att("correct", text="new setting", transfer=True))
    assert progress.replays(practice.record)["a"].days[on(2).isoformat()] == "practice"
    assert practice.standing["level"] == "transferred"
    failed = started(att("correct"))
    failed.attempts(4, att("incorrect"), att("correct", text="t", transfer=True))
    assert failed.standing["level"] == "independent"
    doubtful = started(att("correct"))
    doubtful.attempts(
        2, att("correct", text="t", transfer=True, uncertain="Notes were open")
    )
    assert doubtful.standing["level"] == "independent"


def test_uncertain_answers_are_never_solid_but_can_lower_a_verdict() -> None:
    course = started(att("correct", uncertain="Read from the notes"))
    assert course.verdicts == [(on(1).isoformat(), "helped")]
    assert course.standing["level"] == "assisted"
    lowered = started(att("correct"))
    lowered.attempts(4, att("correct", text="first"))
    lowered.attempts(4, att("incorrect", uncertain="Garbled formula"))
    assert lowered.verdicts[-1] == (on(4).isoformat(), "missed")


def test_an_exam_always_counts_as_a_probe() -> None:
    course = started(att("correct"))
    course.attempts(
        2, {"kind": "exam", "topics": ["a"], "text": "Midterm", "result": "incorrect"}
    )
    assert progress.replays(course.record)["a"].days[on(2).isoformat()] == "probe"
    assert course.verdicts[-1] == (on(2).isoformat(), "missed")
    assert course.standing["lapsed"] is True


def test_overdue_practice_moves_the_review_to_the_expected_day() -> None:
    course = started(att("correct"))
    course.save(2, {"topics": {"a": {"review": {"due": on(2).isoformat()}}}})
    course.attempts(2, att("correct", "Hint", text="practice"))
    assert course.verdicts == [(on(1).isoformat(), "solid")]
    assert course.scheduled.reviews == {"a": {"due": on(4).isoformat(), "by": "engine"}}
    assert course.due == on(4).isoformat()


def test_a_tutor_pin_before_the_expected_day_makes_that_day_practice() -> None:
    course = started(att("correct"))
    course.save(1, {"topics": {"a": {"review": {"due": on(2).isoformat()}}}})
    course.attempts(2, att("correct", text="early"))
    assert course.standing["unaided_days"] == 1
    assert course.due == on(4).isoformat()
    course.save(3, {"topics": {"a": {"review": {"due": on(3).isoformat()}}}})
    course.attempts(3, att("incorrect", text="pinned early"))
    assert progress.replays(course.record)["a"].days[on(3).isoformat()] == "practice"
    assert course.verdicts[-1] == (on(3).isoformat(), "missed")
    assert course.standing["lapsed"] is True
    assert course.due == on(4).isoformat()


def test_a_correction_takes_the_place_of_what_it_replaced() -> None:
    course = started(att("correct"))
    course.attempts(5, att("incorrect", text="first try"))
    course.attempts(5, att("correct", text="retry"))
    course.attempts(6, att("correct", text="first try regraded", corrects=["o2"]))
    third = course.record["observations"]["o4"]
    assert third["date"] == on(5).isoformat()
    assert course.verdicts == [
        (on(1).isoformat(), "solid"),
        (on(5).isoformat(), "solid"),
    ]
    assert course.standing["level"] == "retained"
    assert course.due == on(12).isoformat()


def test_the_exam_clamp_applies_to_every_replayed_interval() -> None:
    course = Course({**TOPICS, "exam": {"date": on(10).isoformat()}})
    course.attempts(1, att("correct"))
    course.attempts(4, att("correct", text="probe"))
    assert course.due == on(6).isoformat()
    course.attempts(6, att("correct", text="probe 2"))
    assert course.due == on(7).isoformat()


def test_an_identical_attempt_is_skipped_at_5_minutes_and_kept_at_31() -> None:
    record = schema.apply_patch(
        schema.empty(), TOPICS, today=DAY1, now="2026-01-01T09:00:00+00:00"
    )[0]
    first = att("incorrect", text="same", response="non so")
    record, _ = schema.apply_patch(
        record, {"observations": [first]}, today=DAY1, now="2026-01-01T09:00:00+00:00"
    )
    _, soon = schema.apply_patch(
        record, {"observations": [first]}, today=DAY1, now="2026-01-01T09:05:00+00:00"
    )
    assert soon.duplicates == ["o1"]
    _, later = schema.apply_patch(
        record, {"observations": [first]}, today=DAY1, now="2026-01-01T09:31:00+00:00"
    )
    assert later.observations == ["o2"]


def test_a_review_missed_and_retried_in_one_conversation() -> None:
    course = started(att("correct"))
    course.attempts(
        4,
        att("incorrect", text="State the rank-nullity theorem"),
        att("correct", text="Rank of this 3x3 matrix with a repeated row"),
    )
    assert len(course.record["observations"]) == 3
    assert course.standing["level"] == "independent"
    assert course.standing["lapsed"] is True
    assert course.due == on(5).isoformat()


def test_a_helped_step_then_an_unaided_solve_before_the_review_changes_nothing() -> (
    None
):
    course = started(att("correct"))
    course.attempts(
        3,
        att("correct", "Showed the worked step", text="worked step"),
        att("correct", text="new problem"),
    )
    assert course.verdicts == [(on(1).isoformat(), "solid")]
    assert course.scheduled.reviews == {}
    assert course.due == on(4).isoformat()
