"""Today's review: key points, wrong-method choices, competing methods, the due list."""

from datetime import date, timedelta
import json
from pathlib import Path
from typing import Any

import pytest

from learning import progress, records, retrieval, schema
from learning.workspace import Workspace

TODAY = date(2026, 10, 10)
NOW = "2026-10-10T09:00:00+00:00"


def day(offset: int) -> str:
    return (TODAY + timedelta(days=offset)).isoformat()


def apply(record: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    return schema.apply_patch(record, patch, today=TODAY, now=NOW)[0]


def course(patch: dict[str, Any]) -> dict[str, Any]:
    return apply(schema.empty(), patch)


def attempt(*topics: str, **fields: Any) -> dict[str, Any]:
    return {
        "topics": list(topics),
        "text": fields.pop("text", "An exercise"),
        "help": fields.pop("help", "none"),
        "result": fields.pop("result", "correct"),
        **fields,
    }


def fails(record: dict[str, Any], patch: dict[str, Any], *fragments: str) -> None:
    with pytest.raises(ValueError) as caught:
        apply(record, patch)
    for fragment in fragments:
        assert fragment in str(caught.value), str(caught.value)


METHODS = {
    "topics": {
        "substitution": {"title": "Substitution"},
        "parts": {"title": "Integration by parts"},
        "series": {},
    }
}


# --- validation ---------------------------------------------------------------


@pytest.mark.parametrize(
    ("observation", "fragment"),
    [
        (
            attempt("parts", result="correct", chose="substitution"),
            "a correct result takes none",
        ),
        (attempt("parts", result="incorrect", chose="subs"), 'unknown topic "subs"'),
        (
            attempt("parts", result="partial", chose="parts"),
            "not one of the observation's own topics",
        ),
        (
            {
                "kind": "self_report",
                "topics": ["parts"],
                "text": "Lost",
                "chose": "series",
            },
            "takes no chose",
        ),
    ],
)
def test_chose_is_validated(observation: dict[str, Any], fragment: str) -> None:
    fails(course(METHODS), {"observations": [observation]}, fragment)


def test_a_wrong_method_is_recorded_on_the_topic_that_should_have_been_chosen() -> None:
    record = apply(
        course(METHODS),
        {"observations": [attempt("parts", result="incorrect", chose="substitution")]},
    )
    assert record["observations"]["o1"]["chose"] == "substitution"


def test_contrasts_are_validated() -> None:
    record = course(METHODS)
    fails(
        record,
        {"topics": {"parts": {"contrasts": ["parts"]}}},
        "must not include the topic itself",
    )
    fails(
        record, {"topics": {"parts": {"contrasts": ["subst"]}}}, 'unknown topic "subst"'
    )
    linked = apply(record, {"topics": {"parts": {"contrasts": ["substitution"]}}})
    assert progress.contrasts(linked)["substitution"] == ["parts"]


def test_review_points_hold_one_to_five_short_key_points_and_merge() -> None:
    record = apply(
        course(METHODS),
        {
            "topics": {
                "parts": {"review": {"prompt": "When does it apply?", "in_days": 2}}
            }
        },
    )
    record = apply(
        record, {"topics": {"parts": {"review": {"points": ["u dv", "LIATE"]}}}}
    )
    assert record["topics"]["parts"]["review"] == {
        "due": day(2),
        "prompt": "When does it apply?",
        "points": ["u dv", "LIATE"],
        "by": "tutor",
    }
    fails(
        record,
        {"topics": {"parts": {"review": {"points": [f"p{i}" for i in range(6)]}}}},
        "1-5 key points",
    )
    fails(
        record, {"topics": {"parts": {"review": {"points": ["x" * 201]}}}}, "under 200"
    )
    cleared = apply(record, {"topics": {"parts": {"review": {"points": None}}}})
    assert "points" not in cleared["topics"]["parts"]["review"]


# --- removal --------------------------------------------------------------------


def test_removing_a_topic_strips_it_from_contrasts() -> None:
    record = course(
        {
            "topics": {
                **METHODS["topics"],
                "parts": {"contrasts": ["substitution", "series"]},
            }
        }
    )
    record = apply(record, {"topics": {"series": None}})
    assert record["topics"]["parts"]["contrasts"] == ["substitution"]
    record = apply(record, {"topics": {"substitution": None}})
    assert "contrasts" not in record["topics"]["parts"]


def test_a_topic_named_by_chose_cannot_be_removed() -> None:
    record = apply(
        course(METHODS),
        {"observations": [attempt("parts", result="incorrect", chose="substitution")]},
    )
    fails(
        record, {"topics": {"substitution": None}}, "cannot remove substitution", "o1"
    )
    with pytest.raises(ValueError, match="observations o1 reference it"):
        schema.remove(record, ["substitution"])
    assert "substitution" not in schema.remove(record, ["substitution", "o1"])["topics"]


# --- choice errors ----------------------------------------------------------------


def test_choice_errors_count_wrong_methods_since_the_last_solid_verdict() -> None:
    record = course(
        {
            **METHODS,
            "observations": [
                attempt("parts", date=day(-10)),
                attempt(
                    "parts", result="incorrect", chose="substitution", date=day(-7)
                ),
                attempt(
                    "parts",
                    result="partial",
                    chose="substitution",
                    date=day(-6),
                    text="b",
                ),
            ],
        }
    )
    standing = progress.standing(record, "parts")
    assert standing["choice_errors"] == {"substitution": 2}
    record = apply(
        record, {"observations": [attempt("parts", text="clean", date=day(-4))]}
    )
    assert "choice_errors" not in progress.standing(record, "parts")


# --- the due list -------------------------------------------------------------------


@pytest.fixture
def workspace(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Workspace:
    monkeypatch.setenv("LEARNING_TODAY", TODAY.isoformat())
    return Workspace(tmp_path)


def due(record: dict[str, Any]) -> list[str]:
    return [item["topic"] for item in progress.due(record, TODAY)]


def pinned(offsets: dict[str, int], **extra: Any) -> dict[str, Any]:
    topics = {key: {"review": {"due": day(offset)}} for key, offset in offsets.items()}
    for key, fields in extra.items():
        topics[key].update(fields)
    return course({"topics": topics})


def test_a_lapsed_topic_comes_before_a_more_overdue_one() -> None:
    record = course(
        {
            "topics": {"old": {}, "lapsed": {}},
            "observations": [
                attempt("lapsed", date=day(-9)),
                attempt("lapsed", result="incorrect", date=day(-2), text="probe"),
            ],
        }
    )
    record = apply(
        record,
        {
            "topics": {
                "old": {"review": {"due": day(-8)}},
                "lapsed": {"review": {"due": day(-1)}},
            }
        },
    )
    assert progress.standing(record, "lapsed")["lapsed"] is True
    assert due(record) == ["lapsed", "old"]


def test_within_21_days_of_the_exam_unready_topics_come_before_overdue_ones() -> None:
    patch = {
        "topics": {"overdue": {}, "unready": {}},
        "observations": [attempt("overdue", date=day(-3))],
    }
    record = apply(
        course(patch),
        {
            "topics": {
                "overdue": {"review": {"due": day(-3)}},
                "unready": {"review": {"due": day(0)}},
            }
        },
    )
    assert due(record) == ["overdue", "unready"]
    near = apply(record, {"exam": {"date": day(21)}})
    assert due(near) == ["unready", "overdue"]
    far = apply(record, {"exam": {"date": day(22)}})
    assert due(far) == ["overdue", "unready"]


def test_today_s_review_is_capped_at_five(workspace: Workspace) -> None:
    records.save(
        workspace,
        {
            "topics": {
                f"t{index}": {"review": {"due": day(-index)}} for index in range(8)
            }
        },
    )
    result = retrieval.resume(workspace)
    assert [item["topic"] for item in result["due"]] == ["t7", "t6", "t5", "t4", "t3"]
    assert result["due_more"] == 3


def test_a_prerequisite_precedes_its_dependent_even_at_lower_priority() -> None:
    record = pinned({"basis": 0, "rank": -5}, rank={"needs": ["basis"]})
    assert due(record) == ["basis", "rank"]


def test_a_competing_method_follows_once_its_prerequisites_are_placed() -> None:
    record = pinned(
        {"parts": -5, "other": -4, "substitution": -1, "chain": -3},
        parts={"contrasts": ["substitution"]},
        substitution={"needs": ["chain"]},
    )
    assert due(record) == ["parts", "other", "chain", "substitution"]
    ready = pinned(
        {"parts": -5, "other": -4, "substitution": -1},
        substitution={"contrasts": ["parts"]},
    )
    assert due(ready) == ["parts", "substitution", "other"]


def test_points_appear_in_due_but_not_again_for_a_topic_shown_whole(
    workspace: Workspace,
) -> None:
    review = {"due": day(-1), "prompt": "When?", "points": ["u dv", "LIATE"]}
    records.save(
        workspace,
        {
            "topics": {
                "parts": {"review": review},
                "series": {"review": {**review, "points": ["Ratio test"]}},
            },
            "path": {"current": "parts"},
        },
    )
    result = retrieval.resume(workspace)
    items = {item["topic"]: item for item in result["due"]}
    assert "points" not in items["parts"] and "prompt" not in items["parts"]
    assert result["topics"]["parts"]["review"]["points"] == ["u dv", "LIATE"]
    assert items["series"]["points"] == ["Ratio test"]


def test_a_topic_leaves_due_after_a_verdict_creating_save(workspace: Workspace) -> None:
    records.save(
        workspace,
        {
            "topics": {"parts": {"review": {"due": day(0)}}},
            "observations": [attempt("parts", date=day(-4))],
        },
    )
    assert [item["topic"] for item in retrieval.resume(workspace)["due"]] == ["parts"]
    records.save(workspace, {"observations": [attempt("parts", text="today")]})
    assert "due" not in retrieval.resume(workspace)


def test_weak_shows_choice_errors(workspace: Workspace) -> None:
    records.save(
        workspace,
        {
            **METHODS,
            "observations": [
                attempt("parts", result="incorrect", chose="substitution")
            ],
        },
    )
    weak = retrieval.resume(workspace)["weak"]
    assert weak == [
        {
            "topic": "parts",
            "level": "attempted",
            "choice_errors": {"substitution": 1},
            "last": {
                "id": "o1",
                "date": day(0),
                "result": "incorrect",
                "unaided": True,
            },
        }
    ]


def test_five_due_topics_with_points_keep_resume_within_its_budget(
    workspace: Workspace,
) -> None:
    point = "State the condition and why it is needed, in one sentence " * 3
    records.save(
        workspace,
        {
            "topics": {
                f"topic-{index}": {
                    "title": f"Topic {index}",
                    "gap": "Mixes up the two conditions " * 3,
                    "review": {
                        "due": day(-index),
                        "prompt": "Explain when the theorem applies and give a counterexample",
                        "points": [point[:190]] * 5,
                    },
                }
                for index in range(9)
            }
        },
    )
    result = retrieval.resume(workspace)
    assert len(result["due"]) == 5
    assert len(json.dumps(result, ensure_ascii=False).encode()) <= 12 * 1024


# --- new week ---------------------------------------------------------------------


@pytest.mark.parametrize(
    ("saved", "opened", "expected"),
    [
        ("2026-10-04", "2026-10-05", True),
        ("2026-10-05", "2026-10-11", False),
        ("2026-12-31", "2027-01-03", False),
        ("2027-01-03", "2027-01-04", True),
    ],
)
def test_new_week_compares_iso_weeks(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    saved: str,
    opened: str,
    expected: bool,
) -> None:
    workspace = Workspace(tmp_path)
    monkeypatch.setenv("LEARNING_TODAY", saved)
    records.save(workspace, {"topics": {"parts": {}}})
    monkeypatch.setenv("LEARNING_TODAY", opened)
    assert retrieval.resume(workspace).get("new_week", False) is expected
