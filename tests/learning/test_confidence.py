"""How sure the learner was of an answer: a guess caps the grade, a confident error shows."""

from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pytest

from learning import progress, records, retrieval, schema
from learning.workspace import Workspace

TODAY = date(2026, 10, 10)
NOW = "2026-10-10T09:00:00+00:00"
TOPICS = {"topics": {"rank": {"title": "Rank"}, "span": {"title": "Span"}}}


def day(offset: int) -> str:
    return (TODAY + timedelta(days=offset)).isoformat()


def attempt(result: str = "correct", **fields: Any) -> dict[str, Any]:
    return {
        "topics": fields.pop("topics", ["rank"]),
        "text": fields.pop("text", f"A question {result}"),
        "help": fields.pop("help", "none"),
        "result": result,
        **fields,
    }


def build(*observations: dict[str, Any]) -> dict[str, Any]:
    patch = {**TOPICS, "observations": list(observations)}
    return schema.apply_patch(schema.empty(), patch, today=TODAY, now=NOW)[0]


def saved(record: dict[str, Any], patch: dict[str, Any], today: date) -> dict[str, Any]:
    patched, changes = schema.apply_patch(record, patch, today=today, now=NOW)
    return progress.schedule(patched, changes, today)[0]


@pytest.fixture
def workspace(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Workspace:
    monkeypatch.setenv("LEARNING_TODAY", TODAY.isoformat())
    return Workspace(tmp_path)


# --- validation ---------------------------------------------------------------


@pytest.mark.parametrize("sure", ["guess", "neutral", "confident"])
def test_each_of_the_three_states_is_stored_and_validates(sure: str) -> None:
    record = build(attempt(sure=sure))
    assert record["observations"]["o1"]["sure"] == sure
    assert schema.validate_record(record) == record


def test_an_unmarked_answer_stores_no_state() -> None:
    record = build(attempt())
    assert "sure" not in record["observations"]["o1"]
    assert schema.validate_record(record) == record


@pytest.mark.parametrize(
    ("observation", "fragment"),
    [
        (
            attempt(sure="guesss"),
            "sure must be one of guess, neutral, confident, not 'guesss' "
            '(did you mean "guess"?)',
        ),
        (attempt(sure=0.8), "sure must be one of guess, neutral, confident"),
        (attempt(sure=True), "sure must be one of guess, neutral, confident"),
        (
            {
                "kind": "self_report",
                "topics": ["rank"],
                "text": "Sure",
                "sure": "confident",
            },
            "takes no sure",
        ),
    ],
)
def test_anything_else_is_refused(observation: dict[str, Any], fragment: str) -> None:
    with pytest.raises(ValueError) as caught:
        build(observation)
    assert fragment in str(caught.value), str(caught.value)


def test_a_stored_record_with_an_unknown_state_is_refused() -> None:
    record = build(attempt(sure="guess"))
    record["observations"]["o1"]["sure"] = "certain"
    with pytest.raises(ValueError, match=r"observations\.o1\.sure must be one of"):
        schema.validate_record(record)


# --- a guess caps the grade -----------------------------------------------------


def test_a_right_guess_on_the_learning_day_is_helped_and_returns_in_two_days() -> None:
    guessed = saved(
        schema.empty(), {**TOPICS, "observations": [attempt(sure="guess")]}, TODAY
    )
    assert progress.replays(guessed)["rank"].verdicts == [(day(0), "helped")]
    assert progress.standing(guessed, "rank")["level"] == "assisted"
    assert guessed["topics"]["rank"]["review"]["due"] == day(2)
    sure = saved(
        schema.empty(), {**TOPICS, "observations": [attempt(sure="confident")]}, TODAY
    )
    assert progress.replays(sure)["rank"].verdicts == [(day(0), "solid")]
    assert sure["topics"]["rank"]["review"]["due"] == day(3)


def test_a_right_guess_on_a_review_day_does_not_climb_the_ladder() -> None:
    first = saved(schema.empty(), {**TOPICS, "observations": [attempt()]}, TODAY)
    review = TODAY + timedelta(days=3)
    probe = {"observations": [attempt(text="Review", sure="guess")]}
    guessed = saved(first, probe, review)
    assert progress.replays(guessed)["rank"].verdicts[-1] == (day(3), "helped")
    assert guessed["topics"]["rank"]["review"]["due"] == day(5)
    assert progress.standing(guessed, "rank")["unaided_days"] == 1
    known = saved(first, {"observations": [attempt(text="Review")]}, review)
    assert known["topics"]["rank"]["review"]["due"] == day(10)


def test_a_guess_never_counts_as_transfer() -> None:
    record = build(attempt(sure="guess", transfer=True))
    assert progress.standing(record, "rank")["level"] == "assisted"


# --- confident errors -----------------------------------------------------------


def test_confident_errors_count_since_the_last_solid_verdict() -> None:
    record = build(
        attempt(date=day(-9)),
        attempt("incorrect", sure="confident", date=day(-5)),
        attempt("incorrect", sure="confident", text="Again", date=day(-4)),
        attempt("incorrect", sure="guess", text="Guessed", date=day(-4)),
        attempt("partial", sure="confident", text="Half", date=day(-4)),
    )
    assert progress.standing(record, "rank")["confident_errors"] == 2
    assert "confident_errors" not in progress.standing(record, "span")
    later = schema.apply_patch(
        record,
        {"observations": [attempt(text="Clean", date=day(-1))]},
        today=TODAY,
        now=NOW,
    )[0]
    assert "confident_errors" not in progress.standing(later, "rank")


def test_resume_lists_a_confident_error_as_weak(workspace: Workspace) -> None:
    records.save(
        workspace, {**TOPICS, "observations": [attempt("incorrect", sure="confident")]}
    )
    weak = retrieval.resume(workspace)["weak"]
    assert weak == [
        {
            "topic": "rank",
            "level": "attempted",
            "confident_errors": 1,
            "last": {
                "id": "o1",
                "date": day(0),
                "result": "incorrect",
                "unaided": True,
            },
        }
    ]


def test_the_week_counts_its_confident_errors() -> None:
    record = build(
        attempt("incorrect", sure="confident", date=day(-10)),
        attempt("incorrect", sure="confident", text="In the week", date=day(-6)),
        attempt("incorrect", sure="confident", topics=["span"], date=day(-1)),
        attempt("incorrect", text="Unmarked", date=day(-1)),
    )
    assert progress.week(record, TODAY)["confident_errors"] == 2
    corrected = schema.apply_patch(
        record,
        {"observations": [attempt("partial", text="Misheard", corrects=["o3"])]},
        today=TODAY,
        now=NOW,
    )[0]
    assert progress.week(corrected, TODAY)["confident_errors"] == 1


# --- records without the field ----------------------------------------------------


def test_neutral_and_unmarked_answers_replay_identically() -> None:
    history = [
        attempt(date=day(-12)),
        attempt("incorrect", date=day(-9)),
        attempt("partial", help="A hint", text="Retry", date=day(-9)),
        attempt(date=day(-5)),
        attempt("incorrect", topics=["span"], date=day(-2)),
    ]
    plain = build(*history)
    neutral = build(*({**item, "sure": "neutral"} for item in history))
    assert progress.standings(neutral) == progress.standings(plain)
    assert progress.week(neutral, TODAY) == progress.week(plain, TODAY)
    assert {key: item.verdicts for key, item in progress.replays(neutral).items()} == {
        key: item.verdicts for key, item in progress.replays(plain).items()
    }
    assert all(
        "confident_errors" not in item for item in progress.standings(plain).values()
    )
    assert "confident_errors" not in progress.week(plain, TODAY)
