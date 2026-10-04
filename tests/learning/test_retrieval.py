from datetime import date, timedelta
import json
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
        "exam": {"date": day(23), "days_left": 23},
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
            ["systems", "independent"],
            ["span", "new"],
            ["rank", "attempted"],
            ["eigen", "independent"],
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


def test_due_and_weak_entries_do_not_repeat_shown_topics(workspace: Workspace) -> None:
    records.save(
        workspace,
        {
            "topics": {
                "rank": {
                    "title": "Rank",
                    "gap": "Counts vectors",
                    "review": {"due": day(-1), "prompt": "Unaided rank"},
                },
                "span": {"title": "Span", "gap": "Spans", "review": {"due": day(0)}},
            },
            "path": {"current": "rank"},
        },
    )
    result = retrieval.resume(workspace)
    assert list(result["topics"]) == ["rank"]
    assert result["due"] == [
        {"topic": "rank", "due": day(-1), "overdue": 1, "level": "new"},
        {
            "topic": "span",
            "title": "Span",
            "due": day(0),
            "overdue": 0,
            "level": "new",
            "gap": "Spans",
        },
    ]
    assert result["weak"] == [
        {"topic": "rank", "level": "new"},
        {"topic": "span", "level": "new", "gap": "Spans"},
    ]


def test_weak_due_and_preferences(workspace: Workspace) -> None:
    preferences.save_global({"language": "Italian", "pace": "Slow"})
    topics = {f"t{index}": {"review": {"due": day(-index)}} for index in range(10)}
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
        {"topic": "t1", "level": "new", "gap": "Mixes up rows and columns"}
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
    assert rank["standing"]["level"] == "independent"
    assert result["items"]["o2"]["kind"] == "attempt"
    assert result["items"]["o2"]["corrected_by"] == ["o5"]
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
    courses = retrieval.every_course(private)
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
