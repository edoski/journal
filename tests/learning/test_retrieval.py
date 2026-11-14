from datetime import date, timedelta
import json
import os
from pathlib import Path
from typing import Any

import pytest

from learning import packing, preferences, records, retrieval
from learning.workspace import Workspace, initialize

TODAY = date(2026, 10, 10)


@pytest.fixture(autouse=True)
def pinned_day(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LEARNING_TODAY", TODAY.isoformat())


@pytest.fixture
def workspace(tmp_path: Path) -> Workspace:
    return Workspace(tmp_path)


def day(offset: int) -> str:
    return (TODAY + timedelta(days=offset)).isoformat()


def attempt(*topics: str, **fields: Any) -> dict[str, Any]:
    return {
        "topics": list(topics),
        "text": fields.pop("text", "Worked an exercise"),
        "help": fields.pop("help", "none"),
        "result": fields.pop("result", "correct"),
        **fields,
    }


def size(value: Any) -> int:
    return len(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode())


def empty_values(value: Any, path: str = "") -> list[str]:
    found = []
    if isinstance(value, dict):
        for key, item in value.items():
            here = f"{path}.{key}"
            if item is None or item == [] or item == {}:
                found.append(here)
            found.extend(empty_values(item, here))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            found.extend(empty_values(item, f"{path}[{index}]"))
    return found


def synthetic_course(
    topics: int = 12, observations: int = 60, knowledge: int = 10
) -> dict[str, Any]:
    """A realistic mid-course record: a chain of topics, mixed evidence, notes."""
    names = [f"topic-{index:02d}" for index in range(topics)]
    patch: dict[str, Any] = {
        "title": "Analisi Matematica II",
        "goal": "Pass the written exam with a confident oral",
        "exam": {
            "date": day(30),
            "format": "Written 3h + oral",
            "coverage": "Chapters 1-9 of the notes",
            "criteria": ["Correct method", "Justified steps"],
            "refs": [{"source": "syllabus", "locator": "Assessment"}],
        },
        "journal": "AM2",
        "sources": {
            "syllabus": {"path": "syllabus.md", "title": "Syllabus"},
            "notes": {"path": "notes/analisi.pdf", "title": "Lecture notes"},
        },
        "topics": {
            name: {
                "title": f"Topic {index}: integrali e derivate parziali",
                **({"needs": [names[index - 1]]} if index else {}),
                "refs": [{"source": "notes", "locator": f"Chapter {index + 1}"}],
                "aliases": [f"argomento {index}"],
                **(
                    {
                        "gap": "Confuses the order of integration",
                        "note": "Strong on computation",
                    }
                    if index % 3 == 0
                    else {}
                ),
            }
            for index, name in enumerate(names)
        },
        "path": {"current": names[topics // 2], "basis": "Syllabus order"},
        "knowledge": {
            f"fact-{index}": {
                "text": "The lecturer writes the Jacobian as J_f and expects it "
                "to be justified with the chain rule in every exercise; "
                f"variant {index}.",
                "topics": [names[index % topics]],
                **(
                    {"uncertain": "Not checked in the slides"} if index % 4 == 0 else {}
                ),
                **({"pinned": True} if index == 0 else {}),
            }
            for index in range(knowledge)
        },
        "tasks": {
            "sheet-4": {
                "title": "Exercise sheet 4, problem 2",
                "topics": [names[topics // 2]],
                "goal": "Justify the change of variables",
                "step": "Why is the Jacobian determinant nonzero on the region?",
                "help": "Explained the polar substitution",
            },
            "sheet-3": {"title": "Exercise sheet 3", "topics": [names[1]]},
        },
        "focus": "sheet-4",
        "preferences": {"teaching_style": "Concrete example first"},
    }
    patch["observations"] = [
        {
            "topics": [names[index % topics]],
            "text": f"Computed a double integral over a triangle, attempt {index}; "
            "set up the bounds after one question about the region",
            "response": "∫∫ x dy dx = 1/6",
            "help": "none" if index % 2 else "Asked which variable to fix first",
            "result": ("correct", "partial", "incorrect")[index % 3],
            "date": day(-observations + index),
            **({"task": "sheet-4"} if index % 7 == 0 else {}),
        }
        for index in range(observations)
    ]
    return patch


def test_resume_of_a_new_course_is_minimal(workspace: Workspace) -> None:
    assert retrieval.resume(workspace) == {
        "today": TODAY.isoformat(),
        "revision": 0,
        "new_course": True,
        "task": None,
    }


def test_resume_selects_the_focused_task_and_its_topics(workspace: Workspace) -> None:
    records.save(
        workspace,
        {
            "title": "Algebra",
            "exam": {"date": day(23)},
            "journal": "SMM",
            "sources": {"sheet": {"path": "sheet.pdf"}, "unused": {"path": "u.pdf"}},
            "topics": {
                "systems": {"title": "Systems"},
                "span": {"needs": ["systems"]},
                "rank": {
                    "needs": ["span"],
                    "refs": [{"source": "sheet", "locator": "Ex. 5"}],
                },
                "eigen": {"needs": ["rank"]},
            },
            "path": {"current": "eigen", "basis": "Syllabus"},
            "tasks": {
                "ex5": {"title": "Exercise 5", "topics": ["rank"], "step": "Why?"},
                "ex6": {"title": "Exercise 6"},
            },
            "focus": "ex5",
            "observations": [
                attempt("systems", text="Old systems work"),
                attempt("rank", text="Task work", task="ex5", result="incorrect"),
                attempt("eigen", text="Eigen work"),
            ],
        },
    )
    result = retrieval.resume(workspace)
    assert result["course"] == {
        "title": "Algebra",
        "exam": {"date": day(23), "final_review": day(21), "days_left": 23},
        "journal": "SMM",
    }
    assert result["last_activity"] == {"date": TODAY.isoformat(), "days_ago": 0}
    assert result["task"]["key"] == "ex5"
    assert result["task"]["step"] == "Why?"
    assert [item["key"] for item in result["tasks"]] == ["ex6"]
    assert list(result["topics"]) == ["span", "rank"]
    assert result["topics"]["rank"]["standing"]["level"] == "attempted"
    assert result["path"] == {
        "current": "eigen",
        "basis": "Syllabus",
        "topics": [
            ["systems", "assisted"],
            ["span", "new"],
            ["rank", "attempted"],
            ["eigen", "assisted"],
        ],
    }
    assert list(result["evidence"]) == ["o3", "o2", "o1"]
    assert result["sources"] == {"sheet": {"path": "sheet.pdf"}}
    other = retrieval.resume(workspace, task="ex6")
    assert other["task"] == {
        "key": "ex6",
        "title": "Exercise 6",
        "created": TODAY.isoformat(),
        "updated": TODAY.isoformat(),
    }
    assert list(other["topics"]) == ["rank", "eigen"]
    with pytest.raises(ValueError, match='unknown task "ex7".*"ex5"'):
        retrieval.resume(workspace, task="ex7")


def test_without_a_focus_every_open_task_is_listed_with_its_step(
    workspace: Workspace,
) -> None:
    records.save(
        workspace,
        {
            "tasks": {
                "ex5": {"title": "Exercise 5", "step": "Finish part b"},
                "ex6": {"title": "Exercise 6", "step": "Check the base case"},
            }
        },
    )
    result = retrieval.resume(workspace)
    assert result["task"] is None
    assert sorted((item["key"], item["step"]) for item in result["tasks"]) == [
        ("ex5", "Finish part b"),
        ("ex6", "Check the base case"),
    ]


def test_resume_without_tasks_follows_the_path(workspace: Workspace) -> None:
    records.save(
        workspace,
        {
            "topics": {
                "systems": {},
                "rank": {"needs": ["systems"]},
                "eigen": {"needs": ["rank"]},
            },
            "path": {"current": "rank"},
        },
    )
    result = retrieval.resume(workspace)
    assert result["task"] is None
    assert list(result["topics"]) == ["systems", "rank"]
    assert "tasks" not in result and "evidence" not in result


def test_resume_never_emits_empty_keys_except_task(workspace: Workspace) -> None:
    records.save(workspace, {"topics": {"rank": {}}})
    result = retrieval.resume(workspace)
    assert result["task"] is None
    without_task = {key: value for key, value in result.items() if key != "task"}
    assert empty_values(without_task) == []


def test_evidence_keeps_correction_partners_together(workspace: Workspace) -> None:
    records.save(
        workspace,
        {
            "topics": {"rank": {}, "other": {}},
            "path": {"current": "rank"},
            "observations": [attempt("other", text="Wrong", result="incorrect")]
            + [
                attempt("other", text=f"Filler {index}", date=day(-5))
                for index in range(3)
            ],
        },
    )
    records.save(
        workspace,
        {"observations": [attempt("rank", text="Fixed it", corrects=["o1"])]},
    )
    result = retrieval.resume(workspace)
    assert "o1" in result["evidence"] and "o5" in result["evidence"]


def test_evidence_fits_its_budget_and_counts_what_was_left_out(
    workspace: Workspace,
) -> None:
    records.save(
        workspace,
        {
            "topics": {"rank": {}},
            "path": {"current": "rank"},
            "observations": [
                attempt(
                    "rank",
                    text=f"Long attempt {index} " + "detail " * 60,
                    date=day(-index),
                )
                for index in range(40)
            ],
        },
    )
    result = retrieval.resume(workspace)
    assert size(result["evidence"]) <= retrieval.EVIDENCE_BYTES
    assert list(result["evidence"])[0] == "o1"
    omitted = result["evidence_omitted"]
    assert len(omitted) == retrieval.OMITTED_LIMIT
    assert omitted[0] == "o4"
    assert len(result["evidence"]) + 12 + result["evidence_omitted_more"] == 40
    assert not set(omitted) & set(result["evidence"])


def test_oversized_task_evidence_is_named_not_lost(workspace: Workspace) -> None:
    records.save(
        workspace,
        {
            "topics": {"rank": {}},
            "tasks": {"ex5": {"topics": ["rank"]}},
            "observations": [
                attempt("rank", text="Huge task answer " + "x" * 7000, task="ex5"),
                attempt("rank", text="Small follow-up", task="ex5"),
            ],
        },
    )
    result = retrieval.resume(workspace)
    assert list(result["evidence"]) == ["o2"]
    assert result["evidence_omitted"] == ["o1"]
    assert "evidence_omitted_more" not in result


def test_knowledge_order_budget_omissions_and_index(workspace: Workspace) -> None:
    long = "A long qualified note. " * 40
    records.save(
        workspace,
        {
            "topics": {"rank": {}, "other": {}},
            "path": {"current": "rank"},
            "knowledge": {
                "pinned-note": {
                    "text": "Always show working",
                    "pinned": True,
                    "topics": ["other"],
                },
                "linked": {"text": "Rank equals pivots", "topics": ["rank"]},
                "doubtful": {
                    "text": "Lecturer may skip proofs",
                    "topics": ["rank"],
                    "uncertain": "Hearsay",
                },
                "general": {"text": "Exam allows notes"},
                "huge-1": {"text": long, "topics": ["rank"]},
                "huge-2": {"text": long, "topics": ["rank"]},
                "huge-3": {"text": long, "topics": ["rank"]},
                "huge-4": {"text": long, "topics": ["rank"]},
                "elsewhere": {"text": "Unrelated", "topics": ["other"]},
            },
        },
    )
    result = retrieval.resume(workspace)
    assert list(result["knowledge"])[:2] == ["pinned-note", "doubtful"]
    assert "linked" in result["knowledge"]
    assert "general" in result["knowledge"]
    assert size(result["knowledge"]) <= retrieval.KNOWLEDGE_BYTES
    assert result["knowledge_omitted"]
    assert set(result["knowledge_omitted"]) <= {"huge-1", "huge-2", "huge-3", "huge-4"}
    assert result["knowledge_index"] == ["elsewhere"]


def test_pinned_knowledge_at_its_budget_always_loads(workspace: Workspace) -> None:
    long = "A long topic note. " * 40
    conventions = {
        f"convention-{index}": {"text": "Use column vectors. " * 12, "pinned": True}
        for index in range(5)
    }
    assert size(conventions) <= records.PINNED_BYTES
    records.save(
        workspace,
        {
            "topics": {"rank": {}},
            "path": {"current": "rank"},
            "knowledge": {
                **conventions,
                **{
                    f"huge-{index}": {"text": long, "topics": ["rank"]}
                    for index in range(4)
                },
            },
        },
    )
    result = retrieval.resume(workspace)
    assert set(conventions) <= set(result["knowledge"])
    assert result["knowledge_omitted"]


def test_evidence_takes_the_newest_few_per_task_and_topic(
    workspace: Workspace,
) -> None:
    records.save(
        workspace,
        {
            "topics": {"rank": {}, "span": {}, "other": {}},
            "tasks": {"ex5": {"topics": ["rank", "span"]}},
            "observations": [
                attempt(
                    "other", text=f"Task {index}", task="ex5", date=day(-30 + index)
                )
                for index in range(7)
            ]
            + [
                attempt("rank", text=f"Rank {index}", date=day(-20 + index))
                for index in range(5)
            ]
            + [
                attempt("span", text=f"Span {index}", date=day(-10 + index))
                for index in range(5)
            ],
        },
    )
    result = retrieval.resume(workspace)
    texts = [item["text"] for item in result["evidence"].values()]
    assert [text for text in texts if text.startswith("Task")] == [
        "Task 6",
        "Task 5",
        "Task 4",
        "Task 3",
        "Task 2",
    ]
    assert [text for text in texts if text.startswith("Rank")] == [
        "Rank 4",
        "Rank 3",
        "Rank 2",
    ]
    assert [text for text in texts if text.startswith("Span")] == [
        "Span 4",
        "Span 3",
        "Span 2",
    ]
    assert result["evidence_omitted"] == ["o2", "o1", "o14", "o13", "o9", "o8"]
    assert all("recorded" not in item for item in result["evidence"].values())


@pytest.mark.usefixtures("every_day")
def test_due_and_weak_entries_do_not_repeat_shown_topics(workspace: Workspace) -> None:
    records.save(
        workspace,
        {
            "topics": {
                "rank": {
                    "title": "Rank",
                    "gap": "Counts vectors",
                    "introduced": day(-20),
                    "review": {"due": day(-1), "prompt": "Unaided rank"},
                },
                "span": {
                    "title": "Span",
                    "gap": "Spans",
                    "introduced": day(-20),
                    "review": {"due": day(0)},
                },
            },
            "path": {"current": "rank"},
        },
    )
    result = retrieval.resume(workspace)
    assert list(result["topics"]) == ["rank"]
    assert result["due"] == [
        {"topic": "rank", "due": day(-1), "overdue": 1, "level": "introduced"},
        {
            "topic": "span",
            "title": "Span",
            "due": day(0),
            "overdue": 0,
            "level": "introduced",
            "gap": "Spans",
        },
    ]
    assert result["weak"] == [
        {"topic": "rank", "level": "introduced"},
        {"topic": "span", "level": "introduced", "gap": "Spans"},
    ]


@pytest.mark.usefixtures("every_day")
def test_weak_due_and_preferences(workspace: Workspace) -> None:
    preferences.save_global({"language": "Italian", "pace": "Slow"})
    topics = {
        f"t{index}": {"introduced": day(-20), "review": {"due": day(-index)}}
        for index in range(10)
    }
    topics["t1"]["gap"] = "Mixes up rows and columns"
    records.save(
        workspace,
        {"topics": topics, "preferences": {"pace": "Fast"}},
    )
    result = retrieval.resume(workspace)
    assert len(result["due"]) == retrieval.DUE_LIMIT
    assert result["due_more"] == 5
    assert result["due"][0]["topic"] == "t9"
    assert result["weak"] == [
        {"topic": "t1", "level": "introduced", "gap": "Mixes up rows and columns"}
    ]
    assert result["preferences"] == {"language": "Italian", "pace": "Fast"}


def test_a_realistic_resume_stays_small(workspace: Workspace) -> None:
    records.save(workspace, synthetic_course())
    result = retrieval.resume(workspace)
    total = size(result)
    print(
        f"\nresume bytes: {total} (evidence {size(result['evidence'])}, knowledge {size(result.get('knowledge', {}))})"
    )
    assert total <= 12 * 1024
    assert result["task"]["key"] == "sheet-4"
    task_work = [f"o{index + 1}" for index in range(60) if index % 7 == 0]
    newest_work = task_work[-retrieval.TASK_OBSERVATIONS :]
    assert set(newest_work) <= set(result["evidence"])
    assert result["evidence_omitted"]
    assert empty_values({k: v for k, v in result.items() if k != "task"}) == []


def test_show_returns_whole_items_with_context(workspace: Workspace) -> None:
    records.save(
        workspace,
        {
            "sources": {"notes": {"path": "notes.md"}},
            "topics": {"rank": {"refs": [{"source": "notes"}]}, "span": {}},
            "tasks": {"ex5": {"topics": ["rank"]}},
            "knowledge": {"pivots": {"text": "Rank equals pivots", "topics": ["rank"]}},
            "observations": [
                attempt("rank", text=f"Try {index}", result="incorrect")
                for index in range(4)
            ],
        },
    )
    records.save(
        workspace, {"observations": [attempt("rank", text="Fixed", corrects=["o2"])]}
    )
    result = retrieval.show(
        workspace, ["rank", "o2", "pivots", "notes", "ex5"], limit=2
    )
    rank = result["items"]["rank"]
    assert rank["kind"] == "topic"
    assert rank["observations"] == ["o5", "o4", "o3", "o2", "o1"]
    assert rank["tasks"] == ["ex5"] and rank["knowledge"] == ["pivots"]
    assert rank["standing"]["level"] == "assisted"
    assert result["items"]["o2"]["kind"] == "attempt"
    assert result["items"]["o2"]["corrected_by"] == ["o5"]
    assert result["items"]["o2"]["grade"] == "missed"
    assert result["items"]["pivots"]["kind"] == "knowledge"
    assert result["items"]["notes"] == {"kind": "source", "path": "notes.md"}
    assert result["items"]["ex5"]["kind"] == "task"
    assert list(result["evidence"]) == ["o5", "o4"]
    assert result["evidence_more"] == 2
    union = retrieval.show(workspace, ["rank", "span"], limit=2)
    assert union["evidence_more"] == 3
    assert result["sources"] == {"notes": {"path": "notes.md"}}
    with pytest.raises(ValueError, match='unknown handle "rnak".*"rank"'):
        retrieval.show(workspace, ["rnak"])
    with pytest.raises(ValueError, match="observation ids run o1-o5"):
        retrieval.show(workspace, ["o9"])


def test_show_all_returns_the_record_with_standings(workspace: Workspace) -> None:
    records.save(workspace, {"topics": {"rank": {}}, "preferences": {"pace": "Slow"}})
    result = retrieval.show(workspace, [], all=True)
    assert result["revision"] == 1
    assert result["standings"] == {
        "rank": {"level": "new", "attempts": 0, "unaided_days": 0}
    }
    assert result["effective_preferences"] == {"pace": "Slow"}
    with pytest.raises(ValueError, match="no handles"):
        retrieval.show(workspace, ["rank"], all=True)


def test_map_lists_every_topic_uncapped_with_symmetric_contrasts(
    workspace: Workspace,
) -> None:
    names = [f"step-{index}" for index in range(8)]
    records.save(
        workspace,
        {
            "title": "Algebra",
            "exam": {"date": day(23)},
            "topics": {
                **{
                    name: {
                        "title": f"Step {index}",
                        **({"needs": [names[index - 1]]} if index else {}),
                        "gap": "Mixes up the signs",
                    }
                    for index, name in enumerate(names)
                },
                "cramer": {"needs": ["step-7"], "contrasts": ["step-0"]},
            },
            "path": {"current": "step-3"},
            "tasks": {"sheet": {"title": "Sheet 1", "topics": ["step-2"]}},
            "focus": "sheet",
            "observations": [
                attempt(name, text="Private working", date=day(-9)) for name in names
            ],
        },
    )
    stored = (workspace.root / "course.json").read_bytes()
    result = retrieval.course_map(workspace)
    assert (workspace.root / "course.json").read_bytes() == stored
    assert result["today"] == TODAY.isoformat()
    assert result["exam"] == {"date": day(23), "days_left": 23, "final_review": day(21)}
    assert result["current"] == "step-3" and result["focus"] == "sheet"
    assert result["tasks"] == [
        {"key": "sheet", "title": "Sheet 1", "updated": TODAY.isoformat()}
    ]
    topics = {item["topic"]: item for item in result["topics"]}
    assert [item["topic"] for item in result["topics"]] == [*names, "cramer"]
    assert all("overdue" in topics[name] for name in names)
    assert len(names) > retrieval.DUE_LIMIT
    assert all(topics[name]["weak"] for name in names)
    assert len(names) > retrieval.WEAK_LIMIT
    assert topics["step-0"]["contrasts"] == ["cramer"]
    assert topics["cramer"] == {
        "topic": "cramer",
        "needs": ["step-7"],
        "contrasts": ["step-0"],
        "level": "new",
        "starts": day(0),
        "starts_why": {"kind": "next"},
        "weak": False,
        "tasks": [],
    }
    assert topics["step-2"]["tasks"] == ["sheet"]
    assert "Private working" not in json.dumps(result)


def test_map_says_how_a_topic_not_yet_solid_was_best_answered(
    workspace: Workspace,
) -> None:
    records.save(
        workspace,
        {
            "topics": {
                "handshake": {"introduced": TODAY.isoformat()},
                "connectivity": {"introduced": TODAY.isoformat()},
            },
            "observations": [
                attempt("handshake", sure="confident"),
                attempt("connectivity", result="partial"),
            ],
        },
    )
    topics = {item["topic"]: item for item in retrieval.course_map(workspace)["topics"]}
    assert (topics["handshake"]["level"], topics["handshake"]["right"]) == (
        "assisted",
        "unaided",
    )
    assert topics["connectivity"]["right"] == "partial"


def test_map_of_a_new_course_has_no_topics(workspace: Workspace) -> None:
    assert retrieval.course_map(workspace) == {
        "today": TODAY.isoformat(),
        "revision": 0,
        "topics": [],
    }


SEARCH_COURSE = {
    "topics": {
        "derivative": {"title": "Derivata direzionale", "aliases": ["perché funziona"]},
        "integrals": {"title": "Integrali doppi", "gap": "Order of integration"},
    },
    "knowledge": {"notation": {"text": "The integrale is written with dx last"}},
    "tasks": {"sheet": {"title": "Sheet on functions"}},
    "sources": {"notes": {"path": "derivate.md", "title": "Note sulle derivate"}},
    "observations": [
        attempt("integrals", text="First integrali doppi attempt", date=day(-3)),
        attempt("integrals", text="Second integrali doppi attempt", date=day(-1)),
        attempt("derivative", text="The derivate came out right"),
    ],
}


def test_search_folds_accents_and_stems_lightly(workspace: Workspace) -> None:
    records.save(workspace, SEARCH_COURSE)

    def handles(query: str) -> list[str]:
        return [hit["handle"] for hit in retrieval.search(workspace, query)["hits"]]

    assert handles("perche") == ["derivative"]
    assert handles("PERCHÉ") == ["derivative"]
    assert "derivative" in handles("derivate")
    assert handles("integrale") == ["notation", "integrals", "o2", "o1"]
    assert handles("function") == ["sheet"]
    assert handles("doppi integrali") == ["integrals", "o2", "o1"]


def test_search_ranks_phrase_hits_first_then_kind(workspace: Workspace) -> None:
    records.save(workspace, SEARCH_COURSE)
    result = retrieval.search(workspace, "integrali doppi")
    assert [hit["handle"] for hit in result["hits"]] == ["integrals", "o2", "o1"]
    reordered = retrieval.search(workspace, "doppi integrali")
    assert reordered["total"] == 3
    hits = retrieval.search(workspace, "derivat")["hits"]
    assert [hit["kind"] for hit in hits] == ["topic", "source", "observation"]
    assert hits[0] == {
        "kind": "topic",
        "handle": "derivative",
        "title": "Derivata direzionale",
        "excerpt": "Derivata direzionale",
    }
    limited = retrieval.search(workspace, "integrali", limit=1)
    assert (len(limited["hits"]), limited["total"]) == (1, 4)
    assert retrieval.search(workspace, "absent")["hits"] == []
    with pytest.raises(ValueError, match="nonempty query"):
        retrieval.search(workspace, "  ")


def test_excerpts_are_short_and_around_the_match() -> None:
    text = "x" * 300 + " L'integrale è definito " + "y" * 300
    snippet = retrieval.excerpt(text, "integrale")
    assert len(snippet) <= retrieval.EXCERPT_CHARS
    assert "integrale" in snippet
    assert snippet.startswith("…") and snippet.endswith("…")
    accented = retrieval.excerpt("Perché " * 50 + "funziona", "funziona")
    assert accented.endswith("funziona")


@pytest.mark.parametrize(
    ("first", "second"),
    [
        ("eigenvalues", "eigenvalue"),
        ("processes", "process"),
        ("values", "value"),
        ("derivata", "derivate"),
        ("integrale", "integrali"),
        ("funzione", "funzioni"),
        ("classes", "classe"),
        ("classe", "classi"),
    ],
)
def test_word_forms_meet_after_stemming(first: str, second: str) -> None:
    assert retrieval.stem(first) == retrieval.stem(second)
    assert retrieval.stem("rank") == "rank"


def test_phrase_hits_respect_word_boundaries(workspace: Workspace) -> None:
    records.save(
        workspace,
        {
            "topics": {
                "subsets": {"title": "Every subset of a set"},
                "resets": {"title": "Reset the counter"},
                "sets": {"title": "Set notation"},
            }
        },
    )
    hits = retrieval.search(workspace, "set")["hits"]
    assert [hit["handle"] for hit in hits] == ["sets", "subsets"]
    assert retrieval.search(workspace, "notation set")["hits"][0]["handle"] == "sets"


def test_phrase_excerpts_contain_the_match_across_lines_and_accents(
    workspace: Workspace,
) -> None:
    text = "Intro. " * 40 + "La derivata\n  parziale,  è definita qui. " + "Coda. " * 40
    records.save(workspace, {"topics": {"calc": {"note": text}}})
    [hit] = retrieval.search(workspace, "derivata parziale")["hits"]
    assert "derivata parziale" in hit["excerpt"]
    assert len(hit["excerpt"]) <= retrieval.EXCERPT_CHARS
    accented = retrieval.excerpt("x " * 120 + "Perché funziona", "perche funziona")
    assert "Perché funziona" in accented


def test_search_everywhere_spans_registered_courses(tmp_path: Path) -> None:
    for name in ("a", "b", "c"):
        (tmp_path / name).mkdir()
    first, second, _ = (initialize(tmp_path / name) for name in ("a", "b", "c"))
    records.save(first, {"title": "Algebra", "topics": {"rank": {"title": "Rank"}}})
    records.save(
        second,
        {
            "title": "Analysis",
            "knowledge": {"rank-note": {"text": "Rank of the Hessian"}},
        },
    )
    result = retrieval.search(None, "rank", everywhere=True)
    assert result["total"] == 2
    assert result["hits"][0] == {
        "kind": "topic",
        "handle": "rank",
        "title": "Rank",
        "excerpt": "Rank",
        "workspace": str(first.directory),
        "course": "Algebra",
    }
    assert result["hits"][1]["course"] == "Analysis"
    second.record.write_text("{", encoding="utf-8")
    broken = retrieval.search(first, "rank", everywhere=True)
    assert broken["total"] == 1
    assert broken["errors"][0]["workspace"] == str(second.directory)


def test_a_private_session_stands_in_for_its_registered_course(
    tmp_path: Path,
) -> None:
    (tmp_path / "course").mkdir()
    (tmp_path / "other").mkdir()
    (tmp_path / "private").mkdir()
    registered = initialize(tmp_path / "course")
    other = initialize(tmp_path / "other")
    records.save(registered, {"title": "Algebra", "topics": {"rank": {}}})
    records.save(other, {"title": "Analysis", "topics": {"rank": {}}})
    private = Workspace(tmp_path / "private", source_directory=registered.sources)
    private.root.mkdir()
    private.record.write_bytes(registered.record.read_bytes())
    courses = records.courses(private)
    assert [item.directory for item in courses] == [other.directory, private.directory]
    result = retrieval.search(private, "rank", everywhere=True)
    assert [hit["workspace"] for hit in result["hits"]] == [
        str(other.directory),
        str(private.directory),
    ]


def test_packer_counts_bytes_exactly_and_keeps_groups_whole() -> None:
    entries = [(f"o{index}", {"text": "é" * index}) for index in range(1, 30)]
    packed = packing.pack(([entry] for entry in entries), 300)
    assert packed.used == size(packed.items) <= 300
    assert packed.omitted == [key for key, _ in entries if key not in packed.items]
    shared = packing.pack(
        [[("a", 1), ("b", 2)], [("b", 2), ("c", 3)], [("d", "x" * 50)], [("e", 5)]], 30
    )
    assert shared.items == {"a": 1, "b": 2, "c": 3, "e": 5}
    assert shared.omitted == ["d"]
    assert shared.used == size(shared.items)
    with pytest.raises(ValueError, match="at least 2 bytes"):
        packing.pack([], 1)


# --- goldens ----------------------------------------------------------------

GOLDEN = Path(__file__).parent / "golden"
# The demo world's day (the seed's LEARNING_TODAY), when its records were played.
SEED_DAY = "2026-11-08"


def _golden(name: str, value: Any) -> None:
    """Compare ``value`` with ``golden/<name>.json`` byte for byte; with
    ``LEARNING_GOLDEN=write`` set, write it instead."""
    path = GOLDEN / f"{name}.json"
    text = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    if os.environ.get("LEARNING_GOLDEN") == "write":
        path.write_text(text, encoding="utf-8")
    assert text == path.read_text(encoding="utf-8"), f"{path.name} changed"


@pytest.mark.parametrize("course", ["linear-algebra", "linear-algebra-arcs"])
def test_the_demo_courses_read_as_their_goldens(
    course: str, workspace: Workspace, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("LEARNING_TODAY", SEED_DAY)
    workspace.root.mkdir()
    workspace.record.write_bytes((GOLDEN / f"{course}.course.json").read_bytes())
    _golden(f"{course}.map", retrieval.course_map(workspace))
    _golden(f"{course}.resume", retrieval.resume(workspace))
    _golden(f"{course}.arcs", retrieval.course_arcs(workspace, report=True))


# --- arcs -------------------------------------------------------------------


def _arc(title: str) -> dict[str, str]:
    return {
        "title": title,
        "question": f"What is {title.lower()} for?",
        "purpose": f"Use {title.lower()}.",
    }


ARCS = {
    "limits": _arc("Limits and continuity"),
    "derivatives": _arc("Derivatives"),
    "integrals": _arc("Integrals"),
}
ARC_TOPICS = {
    "limit": {"title": "Limits", "arc": "limits"},
    "continuity": {"title": "Continuity", "needs": ["limit"], "arc": "limits"},
    "derivative": {"title": "The derivative", "needs": ["limit"], "arc": "derivatives"},
    "chain-rule": {
        "title": "Chain rule",
        "needs": ["derivative"],
        "arc": "derivatives",
    },
    "riemann": {"title": "Riemann sums", "needs": ["limit"], "arc": "integrals"},
    "substitution": {
        "title": "Substitution",
        "needs": ["riemann", "chain-rule"],
        "contrasts": ["chain-rule", "parts"],
        "arc": "integrals",
    },
    "parts": {
        "title": "Integration by parts",
        "needs": ["riemann"],
        "arc": "integrals",
    },
}
ARC_ORDER = ["limits", "derivatives", "integrals"]


def with_arcs(workspace: Workspace, **extra: Any) -> None:
    records.save(
        workspace,
        {
            "arcs": ARCS,
            "topics": ARC_TOPICS,
            "path": {"arcs": ARC_ORDER},
            "arc_change": {"reason": "Chapters 2, 3 and 5"},
            **extra,
        },
    )


def taught(workspace: Workspace, on: int, *topics: str) -> None:
    records.save(
        workspace, {"topics": {topic: {"introduced": day(on)} for topic in topics}}
    )


def answered(workspace: Workspace, on: int, *topics: str, **fields: Any) -> None:
    records.save(
        workspace,
        {"observations": [attempt(topic, date=day(on), **fields) for topic in topics]},
    )


def states(workspace: Workspace) -> dict[str, str]:
    return {arc["arc"]: arc["state"] for arc in retrieval.course_map(workspace)["arcs"]}


def test_an_arc_is_ready_after_a_solid_answer_on_a_later_day_than_its_teaching(
    workspace: Workspace,
) -> None:
    with_arcs(workspace)
    assert states(workspace) == dict.fromkeys(ARC_ORDER, "new")
    taught(workspace, -10, "limit", "continuity")
    answered(workspace, -10, "limit", "continuity")
    assert states(workspace)["limits"] == "learning", "a teaching day's answer"
    answered(workspace, -5, "limit")
    assert states(workspace)["limits"] == "learning", "every topic rests on one"
    answered(workspace, -5, "continuity")
    assert states(workspace) == {
        "limits": "ready",
        "derivatives": "new",
        "integrals": "new",
    }


def test_an_arc_is_checked_when_each_topics_latest_check_item_stands_solid(
    workspace: Workspace,
) -> None:
    with_arcs(workspace)
    taught(workspace, -10, "limit", "continuity")
    answered(workspace, -10, "limit", "continuity")
    answered(workspace, -5, "limit", "continuity")
    answered(workspace, -2, "limit", checkpoint="limits")
    assert states(workspace)["limits"] == "ready", "one topic still unchecked"
    answered(workspace, -2, "continuity", checkpoint="limits")
    assert states(workspace)["limits"] == "checked"
    remarked = attempt(
        "continuity",
        date=day(-2),
        result="incorrect",
        corrects=["o6"],
        disputed="The limit was wrong",
        ruling="The limit at 0 is 1, not 0",
    )
    records.save(workspace, {"observations": [remarked]})
    assert states(workspace)["limits"] == "ready", "a superseded item counts no more"
    answered(workspace, -1, "continuity", checkpoint="limits")
    assert states(workspace)["limits"] == "checked", "a fresh item rechecks it"
    taught(workspace, 0, "limit")
    answered(workspace, 0, "limit", checkpoint="limits")
    assert states(workspace)["limits"] == "ready", "never on a teaching day"


def test_a_course_that_takes_no_questions_reads_new_learning_or_taught(
    workspace: Workspace,
) -> None:
    with_arcs(workspace, preferences={"questions": "none"})
    taught(workspace, -3, "limit")
    assert states(workspace) == {
        "limits": "learning",
        "derivatives": "new",
        "integrals": "new",
    }
    taught(workspace, -2, "continuity")
    assert states(workspace)["limits"] == "taught"
    assert "arcs_ready" not in retrieval.resume(workspace)


def test_an_arcs_entry_is_what_it_needs_from_earlier_arcs_lapsed_first(
    workspace: Workspace,
) -> None:
    with_arcs(workspace)
    taught(workspace, -20, "limit", "derivative", "chain-rule")
    answered(workspace, -15, "limit", "derivative", "chain-rule")
    answered(workspace, -10, "chain-rule", result="incorrect")
    arcs = {arc["arc"]: arc for arc in retrieval.course_map(workspace)["arcs"]}
    assert arcs["integrals"]["entry"] == ["chain-rule", "limit"]
    assert arcs["derivatives"]["entry"] == ["limit"]
    assert arcs["limits"]["entry"] == []
    records.save(
        workspace,
        {
            "topics": {
                key: {"excluded": "Not examined"}
                for key in ("riemann", "substitution", "parts")
            }
        },
    )
    hidden = retrieval.course_map(workspace)["arcs"][2]
    assert (hidden["hidden"], hidden["entry"]) == (True, [])
    assert [arc for arc, *_ in retrieval.resume(workspace)["path"]["arcs"]] == [
        "limits",
        "derivatives",
    ], "a hidden arc is drawn nowhere"


def test_with_every_live_topic_taught_the_current_arc_is_the_last_drawn_one(
    workspace: Workspace,
) -> None:
    with_arcs(workspace)
    taught(workspace, -20, "limit", "continuity", "derivative", "chain-rule")
    integrals = ("riemann", "substitution", "parts")
    hide = {key: {"excluded": "Not examined"} for key in integrals}
    records.save(workspace, {"topics": hide})
    mapped = retrieval.course_map(workspace)
    assert mapped["current_arc"] == "derivatives", "never an arc drawn nowhere"
    assert [arc["arc"] for arc in mapped["arcs"] if arc["current"]] == ["derivatives"]


def test_the_current_arc_follows_the_lesson_in_progress(
    workspace: Workspace,
) -> None:
    with_arcs(workspace, path={"arcs": ARC_ORDER, "current": "derivative"})
    mapped = retrieval.course_map(workspace)
    assert mapped["current_arc"] == "derivatives"
    assert [arc["arc"] for arc in mapped["arcs"] if arc["current"]] == ["derivatives"]
    assert [topic["arc"] for topic in mapped["topics"]][:3] == [
        "limits",
        "limits",
        "derivatives",
    ]
    assert retrieval.course_map(workspace, here="parts")["current_arc"] == "integrals"
    brief = retrieval.resume(workspace, here="parts")
    assert brief["arc"] == {
        "arc": "integrals",
        "title": "Integrals",
        "question": "What is integrals for?",
        "purpose": "Use integrals.",
        "state": "new",
        "entry": ["limit", "chain-rule"],
        "first": True,
    }
    assert brief["path"]["topics"][0] == ["limit", "new", "limits"]


def test_an_arc_stays_first_until_one_of_its_topics_is_taught(
    workspace: Workspace,
) -> None:
    with_arcs(workspace)
    answered(workspace, -2, "riemann", result="incorrect")
    assert retrieval.resume(workspace, here="parts")["arc"]["first"] is True
    taught(workspace, -1, "riemann")
    assert retrieval.resume(workspace, here="parts")["arc"]["first"] is False


def test_the_brief_offers_each_ready_arcs_check_with_its_pairs(
    workspace: Workspace,
) -> None:
    with_arcs(workspace)
    every = [*ARC_TOPICS]
    taught(workspace, -10, *every)
    answered(workspace, -10, *every)
    answered(workspace, -5, *every)
    ready = retrieval.resume(workspace)["arcs_ready"]
    assert [arc["arc"] for arc in ready] == ARC_ORDER
    assert ready[2] == {
        "arc": "integrals",
        "title": "Integrals",
        "question": "What is integrals for?",
        "topics": ["riemann", "parts", "substitution"],
        "pairs": [["parts", "substitution"], ["substitution", "chain-rule"]],
    }
    assert ready[1]["pairs"] == [], "a pair reaching a later arc is that arc's"


def test_the_brief_lists_arc_notes_since_the_last_formation_or_replan(
    workspace: Workspace,
) -> None:
    with_arcs(workspace)
    records.save(workspace, {"arc_change": {"reason": "Sheet 3 orders it otherwise"}})
    assert retrieval.resume(workspace)["arc_notes"] == [
        {"day": TODAY.isoformat(), "reason": "Sheet 3 orders it otherwise"}
    ]
    records.save(
        workspace,
        {
            "topics": {"continuity": {"arc": "derivatives"}},
            "arc_change": {
                "reason": "He studies continuity with derivatives",
                "asked": "Move continuity next to the derivative",
            },
        },
    )
    assert "arc_notes" not in retrieval.resume(workspace)


def test_where_he_stands_counts_his_open_lessons(workspace: Workspace) -> None:
    with_arcs(workspace, path={"arcs": ARC_ORDER, "current": "continuity"})
    answered(workspace, -3, "limit", result="incorrect", chose="derivative")
    standing = retrieval.course_arcs(workspace)
    assert standing["current_arc"] == "limits"
    assert standing["studied"] == ["limit", "continuity", "derivative"]
    assert standing["held"] == ["limits", "derivatives"]
    opened = retrieval.course_arcs(workspace, here="parts", lessons=["parts", "ghost"])
    assert opened["current_arc"] == "integrals"
    assert opened["studied"] == ["limit", "continuity", "derivative", "parts"]
    assert opened["held"] == ARC_ORDER
    listed = opened["arcs"][2]
    assert listed["topics"] == ["riemann", "parts", "substitution"]
    assert (listed["question"], listed["state"], listed["current"]) == (
        "What is integrals for?",
        "new",
        True,
    )
    assert opened["arc_log"][0]["kind"] == "formed"


def test_a_course_without_arcs_has_no_arc_blocks(workspace: Workspace) -> None:
    records.save(workspace, {"topics": {"rank": {"title": "Rank"}}})
    answered(workspace, -1, "rank")
    assert retrieval.course_arcs(workspace, report=True) == {
        "studied": ["rank"],
        "held": [],
        "arcs": [],
    }
    mapped = retrieval.course_map(workspace, here="rank")
    assert not {"arcs", "current_arc"} & mapped.keys()
    assert "arc" not in mapped["topics"][0]
    assert retrieval.resume(workspace)["path"]["topics"] == [["rank", "assisted"]]


def test_the_report_computes_the_rubrics_structural_checks(
    workspace: Workspace,
) -> None:
    with_arcs(
        workspace,
        exam={"date": day(30), "arcs": ["limits", "derivatives"]},
        path={"arcs": ARC_ORDER, "current": "limit"},
    )
    records.save(
        workspace,
        {
            "exam": {
                "date": day(30),
                "arcs": ["derivatives"],
                "leaves_out": ["chain-rule"],
            }
        },
    )

    def report() -> dict[str, Any]:
        found: dict[str, Any] = retrieval.course_arcs(workspace, report=True)["report"]
        return found

    mixed = ["limit", "continuity", "derivative", "riemann", "chain-rule"]
    records.save(workspace, {"path": {"order": [*mixed, "parts", "substitution"]}})
    assert report()["path"]["stored"] == ["chain-rule"]
    arc_major = ["limit", "continuity", "derivative", "chain-rule", "riemann"]
    records.save(workspace, {"path": {"order": [*arc_major, "parts", "substitution"]}})
    checks = report()
    assert checks["partition"] == {"unplaced": [], "empty": []}
    assert checks["backward"] == []
    assert checks["path"] == {"stored": [], "derived": []}
    assert checks["arcs"][2] == {
        "arc": "integrals",
        "topics": 3,
        "pieces": [["riemann", "parts", "substitution"]],
        "roots": ["riemann"],
        "entry": ["limit", "chain-rule"],
        "entry_arcs": ["limits", "derivatives"],
    }
    assert checks["long_skips"] == [{"topic": "riemann", "needs": "limit", "arcs": 2}]
    assert checks["split_contrasts"] == [["chain-rule", "substitution"]]
    assert checks["sizes"] == {"arcs": 3, "live": 3, "one_topic": []}
    assert checks["scope"] == [
        {
            "arc": "derivatives",
            "examined": ["derivative"],
            "not_examined": ["chain-rule"],
            "leaves_out": True,
            "held": False,
        }
    ]


def test_show_search_and_the_run_up_read_arcs(workspace: Workspace) -> None:
    with_arcs(workspace, exam={"date": day(30), "arcs": ["limits"]})
    shown = retrieval.show(workspace, ["integrals"])["items"]["integrals"]
    assert shown == {
        "kind": "arc",
        **ARCS["integrals"],
        "topics": ["riemann", "parts", "substitution"],
        "standing": {
            "state": "new",
            "current": False,
            "hidden": False,
            "entry": ["limit", "chain-rule"],
        },
        "log": [
            {
                "day": TODAY.isoformat(),
                "kind": "formed",
                "reason": "Chapters 2, 3 and 5",
            }
        ],
    }
    hits = retrieval.search(workspace, "derivatives")["hits"]
    assert hits[0] == {
        "kind": "arc",
        "handle": "derivatives",
        "title": "Derivatives",
        "excerpt": "Derivatives",
    }
    assert retrieval.course_map(workspace)["exam"]["arcs"] == ["limits"]
