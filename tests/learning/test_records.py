from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
from typing import Any

import pytest

from learning import clock, preferences, records, schema, storage
from learning.workspace import Workspace

TODAY = "2026-10-10"


@pytest.fixture(autouse=True)
def pinned_day(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LEARNING_TODAY", TODAY)


@pytest.fixture
def workspace(tmp_path: Path) -> Workspace:
    return Workspace(tmp_path)


def attempt(topic: str = "rank", **fields: Any) -> dict[str, Any]:
    return {
        "topics": [topic],
        "text": fields.pop("text", "Found the rank"),
        "help": fields.pop("help", "none"),
        "result": fields.pop("result", "correct"),
        **fields,
    }


COURSE = {
    "title": "Linear Algebra",
    "topics": {
        "systems": {"title": "Systems"},
        "rank": {"title": "Rank", "needs": ["systems"], "gap": "Counts vectors"},
    },
    "path": {"current": "rank"},
    "tasks": {"ex5": {"title": "Exercise 5", "topics": ["rank"]}},
    "focus": "ex5",
}


def test_a_missing_course_loads_empty_and_the_first_save_creates_it(
    workspace: Workspace,
) -> None:
    assert records.load(workspace)["schema"] == schema.SCHEMA
    assert "revision" not in records.load(workspace)
    receipt = records.save(
        workspace, {**COURSE, "observations": [attempt(result="partial", help="Hint")]}
    )
    assert receipt == {
        "revision": 1,
        "changed": True,
        "observations": ["o1"],
        "duplicates": [],
        "saved": ["o1"],
        "reviews": {"rank": {"due": "2026-10-11", "by": "engine"}},
        "reviewed": [],
        "levels": {"rank": {"from": "new", "to": "assisted"}},
        "focus": "ex5",
        "path_current": "rank",
        "due_count": 0,
        "notes": [],
    }
    stored = json.loads(workspace.record.read_text(encoding="utf-8"))
    assert stored["revision"] == 1
    assert (
        clock.local_day(stored["observations"]["o1"]["recorded"]).isoformat() == TODAY
    )
    assert records.load(workspace)["revision"] == 1


def test_receipts_report_level_changes_reviews_and_stale_judgements(
    workspace: Workspace, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("LEARNING_TODAY", "2026-10-08")
    records.save(workspace, COURSE)
    monkeypatch.setenv("LEARNING_TODAY", TODAY)
    receipt = records.save(workspace, {"observations": [attempt()]})
    assert receipt["levels"] == {"rank": {"from": "new", "to": "assisted"}}
    assert receipt["reviews"] == {"rank": {"due": "2026-10-11", "by": "engine"}}
    assert receipt["notes"] == [
        "rank: gap was judged before o1; revise or clear it if the diagnosis changed"
    ]
    same_day = records.save(workspace, {"observations": [attempt(text="Again")]})
    assert same_day["notes"] == [
        "rank: gap was judged before o2; revise or clear it if the diagnosis changed"
    ]
    records.save(workspace, {"topics": {"rank": {"gap": "Still counts vectors"}}})
    fresh = records.save(workspace, {"observations": [attempt(text="Third")]})
    assert fresh["notes"] == []


def test_due_count_counts_reviews_due_after_the_save(workspace: Workspace) -> None:
    receipt = records.save(
        workspace,
        {
            "topics": {
                "a": {"review": {"due": "2026-10-01"}},
                "b": {"review": {"in_days": 0}},
                "c": {"review": {"in_days": 1}},
            }
        },
    )
    assert receipt["due_count"] == 2
    assert receipt["reviews"] == {
        "a": {"due": "2026-10-01", "by": "tutor"},
        "b": {"due": TODAY, "by": "tutor"},
        "c": {"due": "2026-10-11", "by": "tutor"},
    }


def test_an_unchanged_save_publishes_nothing(workspace: Workspace) -> None:
    records.save(workspace, COURSE)
    before = workspace.record.read_bytes()
    receipt = records.save(
        workspace,
        {"title": "Linear Algebra", "tasks": {"ex5": {"title": "Exercise 5"}}},
    )
    assert receipt["changed"] is False
    assert receipt["revision"] == 1
    assert receipt["focus"] == "ex5"
    assert workspace.record.read_bytes() == before


def test_an_empty_save_on_a_new_course_creates_nothing(workspace: Workspace) -> None:
    receipt = records.save(workspace, {})
    assert receipt["changed"] is False
    assert receipt["revision"] == 0
    assert receipt["focus"] is None and receipt["path_current"] is None
    records.save(workspace, {"title": None})
    assert not workspace.record.exists()


def test_a_retried_observation_is_reported_as_a_duplicate(workspace: Workspace) -> None:
    records.save(workspace, {**COURSE, "observations": [attempt()]})
    receipt = records.save(workspace, {"observations": [attempt()]})
    assert receipt["changed"] is False
    assert receipt["observations"] == []
    assert receipt["duplicates"] == ["o1"]
    assert receipt["revision"] == 1


def test_saved_names_each_observation_of_the_patch_in_its_order(
    workspace: Workspace,
) -> None:
    records.save(workspace, {**COURSE, "observations": [attempt(text="First")]})
    receipt = records.save(
        workspace,
        {
            "observations": [
                attempt(text="Second"),
                attempt(text="First"),
                attempt(text="Third"),
            ]
        },
    )
    assert receipt["observations"] == ["o2", "o3"]
    assert receipt["duplicates"] == ["o1"]
    assert receipt["saved"] == ["o2", "o1", "o3"]


def test_reviewed_names_only_the_topics_whose_due_review_an_answer_counted_as(
    workspace: Workspace, monkeypatch: pytest.MonkeyPatch
) -> None:
    records.save(workspace, {**COURSE, "observations": [attempt()]})
    receipt = records.save(workspace, {"observations": [attempt(text="Early")]})
    assert receipt["reviewed"] == []
    monkeypatch.setenv("LEARNING_TODAY", "2026-10-11")
    receipt = records.save(workspace, {"observations": [attempt(text="On the day")]})
    assert receipt["reviewed"] == ["rank"]


def test_invalid_patches_fail_before_anything_is_written(workspace: Workspace) -> None:
    records.save(workspace, COURSE)
    before = workspace.record.read_bytes()
    with pytest.raises(ValueError, match="helper-owned"):
        records.save(workspace, {"next_observation": 4})
    with pytest.raises(ValueError, match='unknown topic "spam"'):
        records.save(workspace, {"observations": [attempt("spam")]})
    assert workspace.record.read_bytes() == before


def test_global_preferences_write_the_per_user_file(workspace: Workspace) -> None:
    receipt = records.save(workspace, {"global_preferences": {"language": "Italian"}})
    assert receipt["changed"] is True
    assert receipt["revision"] == 0
    assert not workspace.record.exists()
    assert preferences.read_global() == {"language": "Italian"}
    receipt = records.save(
        workspace,
        {
            "preferences": {"language": "English"},
            "global_preferences": {"language": "Italian"},
        },
    )
    assert receipt["revision"] == 1
    assert records.load(workspace)["preferences"] == {"language": "English"}
    assert preferences.effective(records.load(workspace)["preferences"]) == {
        "language": "English"
    }
    with pytest.raises(ValueError, match="global_preferences"):
        records.save(workspace, {"global_preferences": {"Bad Name": "x"}})


def test_concurrent_saves_each_land_on_the_latest_record(workspace: Workspace) -> None:
    records.save(workspace, COURSE)

    def record(index: int) -> dict[str, Any]:
        return records.save(
            workspace, {"observations": [attempt(text=f"Attempt {index}")]}
        )

    with ThreadPoolExecutor(max_workers=6) as pool:
        receipts = list(pool.map(record, range(12)))
    stored = records.load(workspace)
    assert len(stored["observations"]) == 12
    assert sorted(receipt["revision"] for receipt in receipts) == list(range(2, 14))
    assert stored["next_observation"] == 13


def test_forget_removes_exact_items_and_their_links(workspace: Workspace) -> None:
    records.save(workspace, {**COURSE, "observations": [attempt(result="incorrect")]})
    records.save(workspace, {"observations": [attempt(corrects=["o1"])]})
    result = records.forget(workspace, ["o1", "ex5"])
    assert result == {"removed": ["o1", "ex5"], "revision": 3}
    stored = records.load(workspace)
    assert "corrects" not in stored["observations"]["o2"]
    assert "focus" not in stored and stored["tasks"] == {}
    with pytest.raises(ValueError, match="observations o2 reference it"):
        records.forget(workspace, ["rank"])
    records.forget(workspace, ["rank", "o2"])
    assert set(records.load(workspace)["topics"]) == {"systems"}
    with pytest.raises(ValueError, match='did you mean "systems"'):
        records.forget(workspace, ["sytems"])


def test_forget_course_deletes_only_the_record(workspace: Workspace) -> None:
    records.save(workspace, COURSE)
    lesson = workspace.notes / "note.md"
    lesson.parent.mkdir(parents=True)
    lesson.write_text("kept", encoding="utf-8")
    assert records.forget(workspace, [], course=True) == {
        "removed": ["course"],
        "revision": 0,
    }
    assert not workspace.record.exists()
    assert lesson.exists()
    assert records.forget(workspace, [], course=True)["removed"] == []
    with pytest.raises(ValueError, match="no handles"):
        records.forget(workspace, ["rank"], course=True)


def test_stored_records_are_validated_on_load(workspace: Workspace) -> None:
    workspace.record.parent.mkdir(parents=True)
    workspace.record.write_text(
        '{"schema": 7, "topics": {"rank": {"level": "x"}}}', encoding="utf-8"
    )
    with pytest.raises(ValueError, match="topics.rank.level is helper-owned"):
        records.load(workspace)
    workspace.record.write_text("{", encoding="utf-8")
    with pytest.raises(ValueError, match="invalid JSON"):
        records.load(workspace)


def test_a_corrupt_global_file_fails_the_save_before_the_course_changes(
    workspace: Workspace,
) -> None:
    records.save(workspace, COURSE)
    before = workspace.record.read_bytes()
    preferences.global_path().parent.mkdir(parents=True, exist_ok=True)
    preferences.global_path().write_text('{"schema": 9}', encoding="utf-8")
    with pytest.raises(storage.Unreadable):
        records.save(
            workspace,
            {"title": "Renamed", "global_preferences": {"language": "Italian"}},
        )
    assert workspace.record.read_bytes() == before


@pytest.mark.parametrize(
    "content",
    ["{", "[]", '{"schema": 6}', '{"schema": 7, "topics": {"Bad Handle": {}}}'],
)
def test_unreadable_stored_courses_are_io_failures(
    workspace: Workspace, content: str
) -> None:
    workspace.record.parent.mkdir(parents=True)
    workspace.record.write_text(content, encoding="utf-8")
    with pytest.raises(storage.Unreadable):
        records.load(workspace)
    with pytest.raises(storage.Unreadable):
        records.save(workspace, {"title": "x"})
    assert workspace.record.read_text(encoding="utf-8") == content


def pinned(text: str, **fields: Any) -> dict[str, Any]:
    return {"text": text, "pinned": True, **fields}


def test_pinned_knowledge_stays_within_its_budget(workspace: Workspace) -> None:
    note = "Write vectors as columns. " * 20
    receipt = records.save(
        workspace, {"knowledge": {"columns": pinned(note), "dx": pinned(note)}}
    )
    assert receipt["pinned"]["budget"] == records.PINNED_BYTES
    assert 2 * len(note) < receipt["pinned"]["bytes"] <= records.PINNED_BYTES
    assert "pinned" not in records.save(workspace, COURSE)
    before = workspace.record.read_bytes()
    with pytest.raises(ValueError) as caught:
        records.save(workspace, {"knowledge": {"bases": pinned(note)}})
    message = str(caught.value)
    assert f"of {records.PINNED_BYTES} bytes" in message
    assert "bases (" in message and "columns (" in message and "dx (" in message
    assert workspace.record.read_bytes() == before
    merged = records.save(
        workspace,
        {
            "knowledge": {
                "columns": pinned("Vectors are columns; dx comes last"),
                "dx": None,
                "bases": pinned(note),
            }
        },
    )
    assert merged["changed"] and merged["pinned"]["bytes"] <= records.PINNED_BYTES


def test_pinned_knowledge_over_budget_may_shrink_but_not_grow(
    workspace: Workspace,
) -> None:
    note = "A standing convention. " * 40
    storage.publish_text(
        workspace.record,
        storage.encode(
            {
                "schema": 7,
                "knowledge": {name: pinned(note) for name in ("a", "b", "c")},
            }
        ),
    )
    with pytest.raises(ValueError, match="pinned entries would take"):
        records.save(workspace, {"knowledge": {"a": {"text": note + "More."}}})
    receipt = records.save(workspace, {"knowledge": {"a": {"pinned": None}}})
    assert records.PINNED_BYTES < receipt["pinned"]["bytes"]
    assert "pinned" not in records.load(workspace)["knowledge"]["a"]


def test_an_answer_to_a_review_due_in_an_exam_course_is_saved_as_that_review(
    workspace: Workspace, monkeypatch: pytest.MonkeyPatch
) -> None:
    records.save(
        workspace,
        {
            **COURSE,
            "exam": {"date": "2026-11-20"},
            "topics": {**COURSE["topics"], "rank": {"introduced": True}},
        },
    )
    monkeypatch.setenv("LEARNING_TODAY", "2026-10-11")
    receipt = records.save(workspace, {"observations": [attempt()]})
    stored = json.loads(workspace.record.read_text())
    assert stored["observations"][receipt["saved"][0]]["due_topics"] == ["rank"]


def test_a_final_review_is_stored_once_begun_and_moving_the_exam_drops_it(
    workspace: Workspace, monkeypatch: pytest.MonkeyPatch
) -> None:
    def stored_exam() -> dict[str, Any]:
        exam: dict[str, Any] = json.loads(workspace.record.read_text())["exam"]
        return exam

    records.save(workspace, {**COURSE, "exam": {"date": "2026-10-20"}})
    assert stored_exam() == {"date": "2026-10-20"}
    # No review on record yet: the shortest final review.
    assert records.load(workspace)["exam"]["final_review"] == "2026-10-18"
    monkeypatch.setenv("LEARNING_TODAY", "2026-10-18")
    records.save(workspace, {"observations": [attempt()]})
    assert stored_exam()["final_review"] == "2026-10-18"
    monkeypatch.setenv("LEARNING_TODAY", "2026-10-19")
    assert records.load(workspace)["exam"]["final_review"] == "2026-10-18"
    records.save(workspace, {"exam": {"date": "2026-10-30"}})
    assert stored_exam() == {"date": "2026-10-30"}
    assert records.load(workspace)["exam"]["final_review"] == "2026-10-28"
    # Begun on the 25th, as a save then stored it: read today, it would start
    # no earlier than today.
    stored = json.loads(workspace.record.read_text())
    stored["exam"]["final_review"] = "2026-10-25"
    storage.publish_text(workspace.record, storage.encode(stored))
    monkeypatch.setenv("LEARNING_TODAY", "2026-10-28")
    assert records.load(workspace)["exam"]["final_review"] == "2026-10-25"


DIAGONAL = {"diag": {"title": "Diagonalization", "needs": ["rank"]}}


def test_a_prediction_alone_never_teaches_marks_dates_or_moves_to_its_topic(
    workspace: Workspace,
) -> None:
    records.save(workspace, {**COURSE, "topics": {**COURSE["topics"], **DIAGONAL}})
    records.save(
        workspace,
        {"observations": [attempt("diag", result="partial", predicted=True)]},
    )
    claims = {
        "introduced": {"topics": {"diag": {"introduced": True}}},
        "gap": {"topics": {"diag": {"gap": "Takes the identity for any diagonal"}}},
        "review": {"topics": {"diag": {"review": {"in_days": 1}}}},
        "path": {"path": {"current": "diag"}},
    }
    for claim in claims.values():
        with pytest.raises(ValueError, match=r"only answers are predictions \(o1\)"):
            records.save(workspace, claim)
    stored = records.load(workspace)
    assert stored["topics"]["diag"] == DIAGONAL["diag"]
    assert stored["path"]["current"] == "rank"
    with pytest.raises(ValueError, match="only answers are predictions"):
        records.save(
            workspace,
            {
                "observations": [attempt("diag", text="Guess again", predicted=True)],
                "topics": {"diag": {"introduced": True}},
            },
        )
    receipt = records.save(
        workspace,
        {
            "observations": [attempt("diag", text="Checked the step")],
            **claims["introduced"],
            **claims["path"],
        },
    )
    assert receipt["path_current"] == "diag"
    assert records.load(workspace)["topics"]["diag"]["introduced"] == TODAY


def test_a_save_whose_only_answer_on_a_taught_topic_is_a_prediction_sets_no_gap(
    workspace: Workspace,
) -> None:
    records.save(workspace, {**COURSE, "observations": [attempt()]})
    prediction = attempt(text="Guess the next step", result="partial", predicted=True)
    with pytest.raises(
        ValueError, match=r"only answers on rank in this save are predictions"
    ):
        records.save(
            workspace,
            {"observations": [prediction], "topics": {"rank": {"gap": "Misreads it"}}},
        )
    records.save(
        workspace,
        {
            "observations": [
                prediction,
                attempt(text="Checked the step", result="partial"),
            ],
            "topics": {"rank": {"gap": "Misreads it"}},
        },
    )
    assert records.load(workspace)["topics"]["rank"]["gap"] == "Misreads it"


def test_a_gap_beside_a_wrong_prediction_and_only_right_answers_is_refused(
    workspace: Workspace,
) -> None:
    """Round 7: a save held a right answer and a wrong prediction on eigen,
    and the gap it set was the prediction's miss, which then read as a
    mistake to fix."""
    records.save(workspace, {**COURSE, "observations": [attempt(result="incorrect")]})
    prediction = attempt(
        text="Read it off the diagonal", result="incorrect", predicted=True
    )
    right = attempt(text="Found both eigenvalues")
    with pytest.raises(
        ValueError, match=r"the only miss on rank in this save is a prediction"
    ):
        records.save(
            workspace,
            {
                "observations": [prediction, right],
                "topics": {"rank": {"gap": "Reads eigenvalues off the diagonal"}},
            },
        )
    assert records.load(workspace)["topics"]["rank"]["gap"] == "Counts vectors"
    records.save(workspace, {"observations": [prediction, right]})
    records.save(workspace, {"topics": {"rank": {"gap": "Misreads the rank"}}})
    assert records.load(workspace)["topics"]["rank"]["gap"] == "Misreads the rank"


def test_a_wrong_prediction_never_becomes_another_topics_gap(
    workspace: Workspace,
) -> None:
    """Round 8 (2 M2): a wrong prediction saved on rank wrote the gap of
    diag, a topic never answered, in the same save and in a later one."""
    records.save(
        workspace,
        {**COURSE, "topics": {**COURSE["topics"], **DIAGONAL}},
    )
    prediction = attempt(
        text="Guess which matrices diagonalise", result="incorrect", predicted=True
    )
    gap = {"topics": {"diag": {"gap": "Thinks only symmetric ones diagonalise"}}}
    with pytest.raises(ValueError, match=r"topics\.diag\.gap: a prediction missed"):
        records.save(workspace, {"observations": [prediction], **gap})
    records.save(workspace, {"observations": [prediction]})
    with pytest.raises(ValueError, match=r"topics\.diag\.gap: a prediction missed"):
        records.save(workspace, gap)
    assert "gap" not in records.load(workspace)["topics"]["diag"]
    records.save(
        workspace,
        {"observations": [attempt("diag", text="Diagonalise B", result="partial")]},
    )
    records.save(workspace, gap)
    assert records.load(workspace)["topics"]["diag"]["gap"] == (
        "Thinks only symmetric ones diagonalise"
    )


def test_a_topic_taught_without_any_question_is_still_introduced(
    workspace: Workspace,
) -> None:
    records.save(workspace, {**COURSE, "topics": {**COURSE["topics"], **DIAGONAL}})
    receipt = records.save(
        workspace,
        {"topics": {"diag": {"introduced": True}}, "path": {"current": "diag"}},
    )
    assert receipt["reviews"]["diag"]["by"] == "engine"
    assert receipt["path_current"] == "diag"


def test_a_re_marked_answer_keeps_the_confidence_he_gave_it(
    workspace: Workspace,
) -> None:
    records.save(workspace, COURSE)
    records.save(
        workspace,
        {
            "observations": [
                attempt(result="partial"),
                attempt(text="Again", sure="guess"),
            ]
        },
    )
    remark = {"disputed": "It was right", "ruling": "It was right", "result": "correct"}
    records.save(
        workspace,
        {
            "observations": [
                attempt(corrects=["o1"], sure="confident", **remark),
                attempt(text="Again", corrects=["o2"], sure="confident", **remark),
            ]
        },
    )
    stored = records.load(workspace)["observations"]
    assert "sure" not in stored["o3"]
    assert stored["o4"]["sure"] == "guess"
