"""Arcs in the course record: the hard checks, placement, the guards, and the
explicit migration between schema 6 and 7."""

from copy import deepcopy
from datetime import date
import json
from pathlib import Path
from typing import Any

import pytest

from learning import arc_rules, arcs, records, retrieval, schema, storage
from learning.workspace import Workspace

TODAY = "2026-11-20"
REASON = {"reason": "OpenStax Volume 1, chapters 2, 3 and 5"}


@pytest.fixture(autouse=True)
def pinned_day(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LEARNING_TODAY", TODAY)


@pytest.fixture
def workspace(tmp_path: Path) -> Workspace:
    return Workspace(tmp_path / "calculus")


def arc(title: str) -> dict[str, str]:
    return {
        "title": title,
        "question": f"What is {title.lower()} for?",
        "purpose": f"Use {title.lower()}.",
    }


ARCS = {
    "limits": arc("Limits and continuity"),
    "derivatives": arc("Derivatives"),
    "integrals": arc("Integrals"),
}
TOPICS = {
    "limit": {"title": "Limits", "arc": "limits"},
    "continuity": {"title": "Continuity", "needs": ["limit"], "arc": "limits"},
    "derivative": {"title": "The derivative", "needs": ["limit"], "arc": "derivatives"},
    "chain-rule": {
        "title": "Chain rule",
        "needs": ["derivative"],
        "arc": "derivatives",
    },
    "riemann": {"title": "Riemann sums", "needs": ["limit"], "arc": "integrals"},
    "ftc": {
        "title": "Fundamental theorem",
        "needs": ["riemann", "derivative"],
        "arc": "integrals",
    },
}
ORDER = ["limits", "derivatives", "integrals"]
FORMED = {
    "arcs": ARCS,
    "topics": TOPICS,
    "path": {"arcs": ORDER},
    "arc_change": REASON,
}


def attempt(topic: str, **fields: Any) -> dict[str, Any]:
    return {
        "topics": [topic],
        "text": fields.pop("text", f"A question on {topic}"),
        "help": "none",
        "result": "correct",
        **fields,
    }


def formed(workspace: Workspace, **extra: Any) -> dict[str, Any]:
    records.save(workspace, {**deepcopy(FORMED), **extra})
    return records.load(workspace)


def refused(workspace: Workspace, patch: dict[str, Any], *parts: str) -> None:
    before = workspace.record.read_bytes() if workspace.record.exists() else None
    with pytest.raises(ValueError) as error:
        records.save(workspace, patch)
    for part in parts:
        assert part in str(error.value), str(error.value)
    after = workspace.record.read_bytes() if workspace.record.exists() else None
    assert after == before, "a refused save writes nothing"


def stored(workspace: Workspace, record: dict[str, Any]) -> None:
    workspace.record.parent.mkdir(parents=True, exist_ok=True)
    workspace.record.write_text(json.dumps(record), encoding="utf-8")


def unreadable(workspace: Workspace, record: dict[str, Any], part: str) -> None:
    stored(workspace, record)
    with pytest.raises(storage.Unreadable, match=part):
        records.load(workspace)


def record_with(**changes: Any) -> dict[str, Any]:
    record = schema.validate_record(
        {
            "schema": schema.SCHEMA,
            "arcs": ARCS,
            "topics": TOPICS,
            "path": {"arcs": ORDER},
        }
    )
    record.update(deepcopy(changes))
    return record


# --- formation and the log --------------------------------------------------


def test_forming_arcs_logs_one_event_with_its_reason(workspace: Workspace) -> None:
    record = formed(workspace)
    assert record["arc_log"] == [{"day": TODAY, "kind": "formed", **REASON}]
    assert arc_rules.order(record) == ORDER
    assert {key: topic["arc"] for key, topic in record["topics"].items()} == {
        key: topic["arc"] for key, topic in TOPICS.items()
    }


def test_arc_handles_share_the_record_namespace(workspace: Workspace) -> None:
    formed(workspace)
    refused(
        workspace,
        {"topics": {"limits": {"title": "Limits again", "arc": "limits"}}},
        '"limits" already names a arc',
    )
    assert schema.locate(records.load(workspace), "integrals") == "arcs"


# --- structural rules (H1 to H8), on save and on load -------------------------


def test_every_topic_names_an_existing_arc(workspace: Workspace) -> None:
    formed(workspace)
    refused(
        workspace,
        {"topics": {"limit": {"arc": "limts"}}, "arc_change": REASON},
        'topics.limit.arc: no arc "limts" (did you mean "limits"?)',
    )
    unreadable(
        workspace,
        {**record_with(), "topics": {**TOPICS, "orphan": {"title": "Orphan"}}},
        "every topic needs one",
    )
    unreadable(
        workspace,
        {"schema": schema.SCHEMA, "topics": {"a": {"title": "A", "arc": "x"}}},
        'the course has no arcs; remove "arc"',
    )


def test_no_topic_needs_a_later_arc(workspace: Workspace) -> None:
    formed(workspace)
    refused(
        workspace,
        {"topics": {"continuity": {"needs": ["limit", "chain-rule"]}}},
        '"continuity" (in "Limits and continuity") needs "chain-rule", which sits '
        'in the later arc "Derivatives"; no topic may need a later arc',
        "Fix it by moving a boundary",
    )
    backward = deepcopy(TOPICS)
    backward["continuity"]["needs"] = ["limit", "riemann"]
    unreadable(workspace, record_with(topics=backward), "no topic may need a later arc")


def test_an_excluded_topic_still_keeps_the_needs_order(workspace: Workspace) -> None:
    formed(workspace)
    refused(
        workspace,
        {
            "topics": {
                "riemann": {"excluded": "Not examined"},
                "continuity": {"needs": ["limit", "riemann"]},
            }
        },
        "no topic may need a later arc",
    )


def test_path_arcs_lists_every_arc_exactly_once(workspace: Workspace) -> None:
    formed(workspace)
    refused(
        workspace,
        {"path": {"arcs": ["limits", "integrals", "nowhere"]}, "arc_change": REASON},
        'path.arcs must list every arc exactly once: missing "derivatives"; '
        'unknown "nowhere". Send the whole list',
    )
    unreadable(
        workspace,
        {"schema": schema.SCHEMA, "path": {"arcs": ["limits"]}},
        'path.arcs: the course has no arcs; remove "arcs"',
    )


def test_a_course_has_no_arcs_or_at_least_two_live_ones(workspace: Workspace) -> None:
    single = {key: {**topic, "arc": "limits"} for key, topic in TOPICS.items()}
    refused(
        workspace,
        {
            "arcs": {"limits": ARCS["limits"]},
            "topics": single,
            "path": {"arcs": ["limits"]},
            "arc_change": REASON,
        },
        "one live arc equal to the course adds nothing to orient by",
    )
    hidden = {
        key: {**topic, "excluded": "Not examined"}
        if topic["arc"] != "limits"
        else topic
        for key, topic in TOPICS.items()
    }
    refused(
        workspace,
        {**deepcopy(FORMED), "topics": hidden},
        "one live arc equal to the course",
    )
    refused(
        workspace,
        {**deepcopy(FORMED), "arcs": {**ARCS, "series": arc("Series")}},
        "path.arcs must list every arc exactly once",
    )
    refused(
        workspace,
        {
            **deepcopy(FORMED),
            "arcs": {**ARCS, "series": arc("Series")},
            "path": {"arcs": [*ORDER, "series"]},
        },
        'arcs.series: no topic is in "Series"; give it topics or remove it with '
        '"series": null',
    )


def test_a_hidden_arc_counts_for_nothing_but_stays(workspace: Workspace) -> None:
    formed(workspace)
    records.save(
        workspace,
        {
            "topics": {
                "riemann": {"excluded": "Not examined"},
                "ftc": {"excluded": "No"},
            }
        },
    )
    record = records.load(workspace)
    assert arc_rules.live(record) == ["limits", "derivatives"]
    assert arc_rules.order(record) == ORDER


def test_every_arc_has_its_title_question_and_purpose(workspace: Workspace) -> None:
    partial = {"title": "Derivatives", "purpose": "Differentiate."}
    refused(
        workspace,
        {**deepcopy(FORMED), "arcs": {**ARCS, "derivatives": partial}},
        "arcs.derivatives.question: required; every topic in the arc helps answer it",
    )


def test_the_exam_names_a_run_of_live_arcs(workspace: Workspace) -> None:
    formed(workspace)
    refused(
        workspace,
        {"exam": {"date": "2026-12-20", "arcs": ["limits", "integrals"]}},
        "exam.arcs must be a run of consecutive live arcs in path.arcs",
        '"derivatives" sits between them',
    )
    refused(
        workspace,
        {"exam": {"date": "2026-12-20", "arcs": ["derivatives", "limits"]}},
        ", in that order",
    )
    refused(
        workspace,
        {"exam": {"date": "2026-12-20", "arcs": ["limit"]}},
        'exam.arcs: no arc "limit" (did you mean "limits"?)',
    )
    records.save(workspace, {"exam": {"date": "2026-12-20", "arcs": ORDER[:2]}})
    assert records.load(workspace)["exam"]["arcs"] == ORDER[:2]
    unreadable(
        workspace,
        {"schema": schema.SCHEMA, "exam": {"arcs": ["limits"]}},
        "exam.arcs: the course has no arcs; remove it",
    )


def test_leaves_out_holds_topics_of_the_named_arcs_without_emptying_one(
    workspace: Workspace,
) -> None:
    formed(workspace)
    exam = {"date": "2026-12-20", "arcs": ORDER[:2]}
    refused(
        workspace,
        {"exam": {**exam, "leaves_out": ["riemann"]}},
        'exam.leaves_out: "riemann" is not in the exam\'s arcs "limits", "derivatives"',
    )
    refused(
        workspace,
        {"exam": {**exam, "leaves_out": ["limit", "continuity"]}},
        'exam.leaves_out holds every topic of "limits"; drop "limits" from '
        "exam.arcs instead",
    )
    records.save(workspace, {"exam": {**exam, "leaves_out": ["chain-rule"]}})
    record = records.load(workspace)
    assert arc_rules.examined(record) == {"limit", "continuity", "derivative"}
    assert records.forget(workspace, ["chain-rule"])["removed"] == ["chain-rule"]
    assert "leaves_out" not in records.load(workspace)["exam"]


def test_a_new_exam_date_states_its_scope(workspace: Workspace) -> None:
    formed(workspace)
    records.save(
        workspace,
        {
            "exam": {
                "date": "2026-12-20",
                "arcs": ORDER[:2],
                "leaves_out": ["chain-rule"],
            }
        },
    )
    refused(
        workspace,
        {"exam": {"date": "2027-01-20"}},
        "exam.date changes and exam.arcs does not; say the new exam's scope in "
        "exam.arcs (null for the whole course)",
    )
    refused(workspace, {"exam": {"date": None}}, "exam.date changes")
    records.save(workspace, {"exam": {"format": "Written, three hours"}})
    records.save(workspace, {"exam": {"date": "2027-01-20", "arcs": None}})
    exam = records.load(workspace)["exam"]
    assert exam == {"date": "2027-01-20", "format": "Written, three hours"}
    assert arc_rules.examined(records.load(workspace)) is None
    records.save(
        workspace,
        {"exam": {"arcs": ORDER[1:], "leaves_out": ["chain-rule"]}},
    )
    records.save(workspace, {"exam": {"arcs": ORDER[1:]}})
    assert "leaves_out" not in records.load(workspace)["exam"]


def test_the_brief_keeps_exam_arcs_as_handles_and_adds_their_titles(
    workspace: Workspace,
) -> None:
    formed(workspace, exam={"date": "2026-12-20", "arcs": ORDER[:2]})
    brief = retrieval.exam(records.load(workspace), date.fromisoformat(TODAY))
    assert brief is not None
    assert brief["arcs"] == ORDER[:2]
    assert brief["arc_titles"] == ["Limits and continuity", "Derivatives"]


# --- names: on save for new or changed titles, a warning on load -------------


@pytest.mark.parametrize(
    "title",
    [
        "The unit circle",
        "Eve modules",
        "Integration by parts",
        "I teoremi sui limiti",
        "Aritmetica modulo n",
        "Functions of x",
        "First-order logic",
        "IPv6 addressing",
        "Base64 encoding",
        "Europe after 1945",
        "Gli spazi e i sottospazi",
        "Limits of $f_2$",
    ],
)
def test_a_title_naming_an_idea_passes(title: str) -> None:
    assert not arc_rules.name_fault(title)


@pytest.mark.parametrize(
    "title",
    [
        "Part 2",
        "Unit III",
        "Capitolo 4",
        "Second lecture",
        "Seconda parte",
        "Week 1st",
        "Derivatives II",
        "Teoremi I",
        "Calculus 2",
        "2. Limits",
        "II: Derivatives",
        "3) Series",
    ],
)
def test_a_title_that_is_a_label_or_a_number_is_refused(title: str) -> None:
    assert arc_rules.name_fault(title)


def test_names_are_judged_on_save_for_new_or_changed_titles_only(
    workspace: Workspace,
) -> None:
    refused(
        workspace,
        {**deepcopy(FORMED), "arcs": {**ARCS, "integrals": arc("Derivatives II")}},
        'arcs.integrals.title "Derivatives II": name the arc\'s idea in the '
        'material\'s words, with no "Part 2"-style labels or numbering',
    )
    refused(
        workspace,
        {**deepcopy(FORMED), "arcs": {**ARCS, "integrals": arc("derivatives")}},
        '"Derivatives" already names the arc "integrals"; tell neighbours apart',
    )
    bad = {**ARCS, "integrals": arc("Derivatives II")}
    stored(workspace, record_with(arcs=bad))
    record = records.load(workspace)
    assert retrieval.resume(workspace)["path_health"]["arc_names"] == ["integrals"]
    records.save(
        workspace,
        {
            "arcs": {"integrals": {"purpose": "Add up change."}},
            "arc_change": {"reason": "A clearer purpose"},
        },
    )
    assert records.load(workspace)["arcs"]["integrals"]["title"] == "Derivatives II"
    assert record["arcs"]["integrals"]["title"] == "Derivatives II"


# --- placement (P1) -----------------------------------------------------------


def placed(workspace: Workspace, topics: dict[str, Any]) -> dict[str, str]:
    receipt = records.save(workspace, {"topics": topics})
    result: dict[str, str] = receipt.get("arcs_placed", {})
    stored = records.load(workspace)["topics"]
    assert all(stored[key]["arc"] == arc for key, arc in result.items())
    return result


def test_a_new_topic_lands_in_the_current_arc_when_its_range_allows(
    workspace: Workspace,
) -> None:
    formed(workspace, path={"arcs": ORDER, "current": "derivative"})
    assert placed(
        workspace, {"one-sided": {"title": "One-sided limits", "needs": ["limit"]}}
    ) == {"one-sided": "derivatives"}


def test_else_at_the_nearer_end_of_its_range(workspace: Workspace) -> None:
    formed(workspace, path={"arcs": ORDER, "current": "limit"})
    assert placed(
        workspace, {"implicit": {"title": "Implicit", "needs": ["chain-rule"]}}
    ) == {"implicit": "derivatives"}
    records.save(workspace, {"path": {"current": "ftc"}})
    assert placed(
        workspace,
        {
            "squeeze": {"title": "Squeeze theorem"},
            "continuity": {"needs": ["limit", "squeeze"]},
        },
    ) == {"squeeze": "limits"}


def test_several_new_topics_are_placed_in_prerequisite_order(
    workspace: Workspace,
) -> None:
    formed(workspace, path={"arcs": ORDER, "current": "limit"})
    assert placed(
        workspace,
        {
            "substitution": {"title": "Substitution", "needs": ["by-parts"]},
            "by-parts": {"title": "By parts", "needs": ["ftc"]},
        },
    ) == {"by-parts": "integrals", "substitution": "integrals"}


def test_a_topic_whose_range_is_empty_is_refused(workspace: Workspace) -> None:
    formed(workspace)
    refused(
        workspace,
        {
            "topics": {
                "rates": {"title": "Related rates", "needs": ["derivative"]},
                "continuity": {"needs": ["limit", "rates"]},
            }
        },
        'topics.rates: its prerequisite "derivative" sits in "Derivatives" and '
        '"continuity" in the earlier "Limits and continuity" needs it',
        'or place it with "arc"',
    )


def test_a_topic_the_lesson_moves_to_is_placed_where_the_learner_was(
    workspace: Workspace,
) -> None:
    formed(workspace, path={"arcs": ORDER, "current": "derivative"})
    receipt = records.save(
        workspace,
        {
            "topics": {"product": {"title": "Product rule", "needs": ["limit"]}},
            "path": {"current": "product"},
        },
    )
    assert receipt["arcs_placed"] == {"product": "derivatives"}


# --- cleanup (P2) and forget --------------------------------------------------


def test_forget_drops_an_emptied_arc_and_then_the_last_but_one(
    workspace: Workspace,
) -> None:
    formed(workspace, exam={"date": "2026-12-20", "arcs": ["integrals"]})
    receipt = records.forget(workspace, ["riemann", "ftc"])
    assert receipt["removed"] == ["riemann", "ftc", "integrals"]
    record = records.load(workspace)
    assert arc_rules.order(record) == ["limits", "derivatives"]
    assert record["exam"] == {"date": "2026-12-20"}
    assert record["arc_log"][-1] == {
        "day": TODAY,
        "kind": "removed",
        "arc": "integrals",
        "reason": "its last topic was removed",
    }
    records.forget(workspace, ["derivative", "chain-rule"])
    record = records.load(workspace)
    assert record["arcs"] == {} and "arcs" not in record.get("path", {})
    assert not any("arc" in topic for topic in record["topics"].values())
    assert [event["reason"] for event in record["arc_log"][-2:]] == [
        "its last topic was removed",
        "one live arc was left",
    ]


def test_an_arc_that_holds_topics_is_kept_by_forget_and_by_a_patch(
    workspace: Workspace,
) -> None:
    formed(workspace)
    with pytest.raises(
        ValueError, match="forget integrals: topics riemann, ftc are in"
    ):
        records.forget(workspace, ["integrals"])
    refused(
        workspace,
        {"arcs": {"integrals": None}, "arc_change": REASON},
        "arcs.integrals: topics riemann, ftc are in it; move them to another arc "
        "first, or keep the arc",
    )
    assert records.forget(workspace, ["integrals", "riemann", "ftc"])["removed"] == [
        "integrals",
        "riemann",
        "ftc",
    ]
    assert records.load(workspace)["arc_log"][-1]["reason"] == "forgotten"


def test_a_patch_removing_a_topic_prunes_and_logs_its_arc(
    workspace: Workspace,
) -> None:
    formed(workspace)
    records.save(workspace, {"topics": {"riemann": None, "ftc": None}})
    record = records.load(workspace)
    assert "integrals" not in record["arcs"]
    assert record["arc_log"][-1]["reason"] == "its last topic was removed"


# --- the guards (G0 to G5) and notes -------------------------------------------


SERIES = {
    "arcs": {**ARCS, "series": arc("Series")},
    "topics": {
        **TOPICS,
        "area": {
            "title": "Area between curves",
            "needs": ["riemann"],
            "arc": "integrals",
        },
        "geometric": {"title": "Geometric series", "needs": ["limit"], "arc": "series"},
    },
    "path": {"arcs": [*ORDER, "series"]},
}


def test_every_arc_change_says_why(workspace: Workspace) -> None:
    formed(workspace, **deepcopy(SERIES))
    refused(
        workspace,
        {"topics": {"riemann": {"arc": "derivatives"}, "ftc": {"arc": "derivatives"}}},
        'this save moves "riemann" from "integrals" to "derivatives"; say why in '
        '"arc_change"',
    )
    refused(workspace, {"arcs": {"integrals": {"title": "Integration"}}}, "renames")
    reorder = {"path": {"arcs": ["limits", "series", "derivatives", "integrals"]}}
    refused(workspace, reorder, "this save reorders path.arcs; say why")
    records.save(workspace, {**reorder, "arc_change": REASON})
    assert records.load(workspace)["arc_log"][-1]["kind"] == "reordered"


def test_a_studied_topic_moves_only_on_his_request(workspace: Workspace) -> None:
    formed(workspace)
    records.save(workspace, {"observations": [attempt("riemann")]})
    move = {
        "topics": {"riemann": {"arc": "derivatives"}, "ftc": {"arc": "derivatives"}}
    }
    refused(
        workspace,
        {**move, "arc_change": REASON},
        "topics.riemann has evidence, and a studied topic changes arc only when he "
        "asks for a re-plan",
    )
    asked = {**REASON, "asked": "Put Riemann sums with the derivatives, please"}
    records.save(
        workspace,
        {
            **move,
            "path": {"arcs": ["limits", "derivatives"]},
            "arcs": {"integrals": None},
            "arc_change": asked,
        },
    )
    log = records.load(workspace)["arc_log"]
    assert {
        "day": TODAY,
        "kind": "moved",
        "topic": "riemann",
        "from": "integrals",
        "to": "derivatives",
        **asked,
    } in log


def test_a_held_arc_is_not_re_cut_without_his_words(workspace: Workspace) -> None:
    formed(workspace, path={"arcs": ORDER, "current": "derivative"})
    refused(
        workspace,
        {"topics": {"chain-rule": {"arc": "integrals"}}, "arc_change": REASON},
        '"derivatives" is an arc he is in or has studied; only he can ask to re-cut it',
    )
    records.save(
        workspace,
        {
            **deepcopy(SERIES),
            "observations": [attempt("riemann")],
            "arc_change": REASON,
        },
    )
    refused(
        workspace,
        {"topics": {"area": {"arc": "series"}}, "arc_change": REASON},
        '"integrals" is an arc he is in or has studied',
    )


def test_moving_an_unstudied_topic_between_arcs_he_is_not_in_needs_a_reason(
    workspace: Workspace,
) -> None:
    topics = {**deepcopy(TOPICS), "series": {"title": "Series", "arc": "integrals"}}
    formed(workspace, topics=topics, path={"arcs": ORDER, "current": "limit"})
    records.save(
        workspace,
        {
            "arcs": {"series-arc": arc("Series and sequences")},
            "topics": {"series": {"arc": "series-arc"}},
            "path": {"arcs": [*ORDER, "series-arc"]},
            "arc_change": {"reason": "Volume 2 chapter 5 is its own unit"},
        },
    )
    kinds = [event["kind"] for event in records.load(workspace)["arc_log"]]
    assert kinds == ["formed", "added", "moved"]


def test_a_held_arc_keeps_its_name_and_place_but_takes_a_rewording(
    workspace: Workspace,
) -> None:
    formed(workspace, **deepcopy(SERIES))
    records.save(workspace, {"path": {"current": "geometric"}})
    refused(
        workspace,
        {"arcs": {"series": {"title": "Infinite series"}}, "arc_change": REASON},
        'arcs.series: "Series" is an arc he is in or has studied',
    )
    refused(
        workspace,
        {
            "path": {"arcs": ["limits", "series", "derivatives", "integrals"]},
            "arc_change": REASON,
        },
        'path.arcs: this save moves "series", an arc he is in or has studied',
    )
    records.save(
        workspace,
        {"arcs": {"integrals": {"title": "Integration"}}, "arc_change": REASON},
    )
    records.save(
        workspace,
        {
            "arcs": {"limits": {"question": "What happens near a point?"}},
            "arc_change": {"reason": "A sharper focus question"},
        },
    )
    log = records.load(workspace)["arc_log"]
    assert [event["kind"] for event in log[-2:]] == ["renamed", "reworded"]
    assert log[-2]["from"] == "Integrals" and log[-2]["to"] == "Integration"


def test_forming_arcs_over_studied_topics_needs_his_approval(
    workspace: Workspace,
) -> None:
    plain = {
        key: {k: v for k, v in t.items() if k != "arc"} for key, t in TOPICS.items()
    }
    records.save(workspace, {"topics": plain, "observations": [attempt("limit")]})
    refused(
        workspace,
        deepcopy(FORMED),
        "this save forms arcs in a course he has already studied",
    )
    approved = {**REASON, "asked": "approved by Edo on 2026-11-19: yes, these arcs"}
    records.save(workspace, {**deepcopy(FORMED), "arc_change": approved})
    assert records.load(workspace)["arc_log"] == [
        {"day": TODAY, "kind": "formed", **approved}
    ]


def test_a_reason_without_a_change_is_kept_as_a_note(workspace: Workspace) -> None:
    formed(workspace)
    note = {"reason": "The slides teach the chain rule before limits; kept the edge"}
    records.save(workspace, {"arc_change": note})
    assert records.load(workspace)["arc_log"][-1] == {
        "day": TODAY,
        "kind": "note",
        **note,
    }


# --- the current arc, studied and held -----------------------------------------


def test_the_current_arc_is_where_he_is_even_with_an_earlier_arc_unfinished(
    workspace: Workspace,
) -> None:
    formed(workspace, path={"arcs": ORDER, "current": "chain-rule"})
    record = records.load(workspace)
    assert "continuity" in arcs.untaught(record)
    assert arcs.current(record) == "derivatives"
    assert arcs.current(record, here="riemann") == "integrals"
    records.save(workspace, {"path": {"current": None}})
    record = records.load(workspace)
    assert arcs.current(record) == "limits"
    records.save(
        workspace,
        {"topics": {key: {"introduced": True} for key in TOPICS}},
    )
    assert arcs.current(records.load(workspace)) == "integrals"


def test_studied_counts_only_evidence_that_stands(workspace: Workspace) -> None:
    formed(workspace)
    records.save(
        workspace,
        {"observations": [attempt("riemann", result="incorrect", chose="derivative")]},
    )
    record = records.load(workspace)
    assert arcs.studied(record) == {"riemann", "derivative"}
    assert arcs.held(record) == {"integrals", "derivatives", "limits"}
    records.save(
        workspace,
        {
            "observations": [
                {
                    "kind": "self_report",
                    "topics": ["riemann"],
                    "text": "I never did that one",
                    "corrects": ["o1"],
                }
            ]
        },
    )
    assert arcs.studied(records.load(workspace)) == {"riemann"}


# --- the exam's scope moves with its topics -------------------------------------


def test_moving_a_topic_into_a_named_arc_reschedules_like_a_moved_exam(
    workspace: Workspace,
) -> None:
    formed(workspace, exam={"date": "2026-12-20", "arcs": ["derivatives"]})
    before = records.load(workspace)
    changes = schema.check_patch(
        {
            "topics": {
                "riemann": {"arc": "derivatives"},
                "ftc": {"arc": "derivatives"},
            },
            "path": {"arcs": ["limits", "derivatives"]},
            "arcs": {"integrals": None},
            "arc_change": REASON,
        }
    )
    today = date.fromisoformat(TODAY)
    patched, outcome = schema.apply_patch(
        before, changes, today=today, now=f"{TODAY}T09:00:00+00:00"
    )
    assert outcome.exam_moved is False
    arcs.settle(before, patched, changes, outcome, today)
    assert outcome.exam_moved is True
    patched, outcome = schema.apply_patch(
        before,
        {"topics": {"new": {"title": "New", "needs": ["derivative"]}}},
        today=today,
        now=f"{TODAY}T09:00:00+00:00",
    )
    arcs.settle(before, patched, {}, outcome, today)
    assert outcome.exam_moved is False


# --- check items and courses without questions ----------------------------------


def test_a_check_item_names_an_arc_that_holds_its_topic(workspace: Workspace) -> None:
    formed(workspace)
    refused(
        workspace,
        {"observations": [attempt("riemann", checkpoint="derivatives")]},
        'observations[0].checkpoint: "derivatives" holds none of riemann; tag a '
        "check item with the arc it checks",
    )
    refused(
        workspace,
        {"observations": [attempt("riemann", checkpoint="integral")]},
        'no arc "integral" (did you mean "integrals"?)',
    )
    refused(
        workspace,
        {
            "observations": [
                {
                    "kind": "self_report",
                    "topics": ["riemann"],
                    "text": "Easy",
                    "checkpoint": "integrals",
                }
            ]
        },
        "checkpoint tags an item of an arc's check, which is an attempt",
    )
    records.save(
        workspace, {"observations": [attempt("riemann", checkpoint="integrals")]}
    )
    assert records.load(workspace)["observations"]["o1"]["checkpoint"] == "integrals"


def test_a_course_that_takes_no_questions_has_no_check(workspace: Workspace) -> None:
    formed(workspace, preferences={"questions": "none"})
    refused(
        workspace,
        {"observations": [attempt("riemann", checkpoint="integrals")]},
        'this course takes no questions (preferences.questions is "none")',
    )
    refused(
        workspace,
        {"preferences": {"questions": "rarely"}},
        'preferences.questions must be "asked" or "none"',
    )
    refused(
        workspace,
        {"global_preferences": {"questions": "none"}},
        "global_preferences.questions belongs to one course",
    )
