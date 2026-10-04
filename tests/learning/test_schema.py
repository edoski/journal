from datetime import date
from typing import Any

import pytest

from learning import schema

TODAY = date(2026, 10, 10)
NOW = "2026-10-10T09:00:00+00:00"
LATER = "2026-10-10T18:00:00+00:00"
NEXT_DAY = "2026-10-11T10:00:00+00:00"


def apply(
    record: dict[str, Any],
    patch: dict[str, Any],
    *,
    today: date = TODAY,
    now: str = NOW,
) -> tuple[dict[str, Any], schema.PatchResult]:
    return schema.apply_patch(record, patch, today=today, now=now)


def course(patch: dict[str, Any], **options: Any) -> dict[str, Any]:
    return apply(schema.empty(), patch, **options)[0]


def attempt(*topics: str, **fields: Any) -> dict[str, Any]:
    return {
        "topics": list(topics),
        "text": fields.pop("text", "Worked an exercise"),
        "help": fields.pop("help", "none"),
        "result": fields.pop("result", "correct"),
        **fields,
    }


def fails(record: dict[str, Any], patch: Any, *fragments: str) -> str:
    with pytest.raises(ValueError) as caught:
        apply(record, patch)
    message = str(caught.value)
    for fragment in fragments:
        assert fragment in message, message
    return message


BASE = {
    "title": "Linear Algebra",
    "sources": {"slides": {"path": "slides.pdf", "title": "Slides"}},
    "topics": {
        "systems": {"title": "Systems"},
        "span": {"title": "Span", "needs": ["systems"]},
        "rank": {"title": "Rank", "needs": ["systems", "span"]},
    },
    "path": {"current": "rank", "order": ["systems", "span", "rank"]},
    "knowledge": {"notation": {"text": "g is h", "topics": ["rank"]}},
    "tasks": {"ex5": {"title": "Exercise 5", "topics": ["rank", "span"]}},
    "focus": "ex5",
}


def test_empty_course_is_canonical_and_validates() -> None:
    record = schema.empty()
    assert record == {
        "schema": 6,
        "sources": {},
        "topics": {},
        "observations": {},
        "knowledge": {},
        "tasks": {},
        "preferences": {},
        "next_observation": 1,
    }
    assert schema.validate_record(record) == record


def test_scalars_replace_and_null_clears() -> None:
    record = course({"title": "Algebra", "goal": "Pass", "journal": "SMM"})
    assert (record["title"], record["goal"], record["journal"]) == (
        "Algebra",
        "Pass",
        "SMM",
    )
    record = apply(record, {"title": "Linear Algebra", "goal": None, "journal": None})[
        0
    ]
    assert record["title"] == "Linear Algebra"
    assert "goal" not in record and "journal" not in record
    fails(record, {"title": ""}, "title must be a nonempty string", "null to clear")


def test_exam_and_path_merge_by_field_and_null_clears() -> None:
    record = course(
        {
            "topics": {"rank": {}, "span": {}},
            "exam": {"date": "2026-11-02", "format": "Written", "criteria": ["a"]},
            "path": {"current": "rank", "basis": "Syllabus"},
        }
    )
    record = apply(
        record,
        {"exam": {"format": None, "coverage": "Ch. 1-4"}, "path": {"current": "span"}},
    )[0]
    assert record["exam"] == {
        "date": "2026-11-02",
        "coverage": "Ch. 1-4",
        "criteria": ["a"],
    }
    assert record["path"] == {"current": "span", "basis": "Syllabus"}
    record = apply(record, {"exam": None, "path": {"current": None, "basis": None}})[0]
    assert "exam" not in record and "path" not in record


def test_map_entries_merge_by_field_null_field_clears_null_entry_removes() -> None:
    record = course(BASE)
    record = apply(
        record,
        {
            "topics": {"span": {"title": None, "aliases": ["generato"]}},
            "knowledge": {"notation": None},
            "sources": {"slides": {"title": "Lecture slides"}},
        },
    )[0]
    assert record["topics"]["span"] == {"needs": ["systems"], "aliases": ["generato"]}
    assert record["knowledge"] == {}
    assert record["sources"]["slides"] == {
        "path": "slides.pdf",
        "title": "Lecture slides",
    }


def test_lists_replace_and_deduplicate() -> None:
    record = course(BASE)
    record = apply(record, {"topics": {"rank": {"needs": ["span", "span"]}}})[0]
    assert record["topics"]["rank"]["needs"] == ["span"]
    record = apply(record, {"topics": {"rank": {"needs": []}}})[0]
    assert "needs" not in record["topics"]["rank"]


def test_review_patches_merge_and_record_the_tutor() -> None:
    record = course(
        {"topics": {"rank": {"review": {"in_days": 3, "prompt": "Unaided"}}}}
    )
    review = record["topics"]["rank"]["review"]
    assert review == {"due": "2026-10-13", "prompt": "Unaided", "by": "tutor"}
    record, outcome = apply(
        record, {"topics": {"rank": {"review": {"prompt": "Other"}}}}
    )
    assert record["topics"]["rank"]["review"]["due"] == "2026-10-13"
    assert outcome.tutor_reviews == []
    record = apply(record, {"topics": {"rank": {"review": {"due": None}}}})[0]
    assert record["topics"]["rank"]["review"] == {"prompt": "Other"}
    record = apply(record, {"topics": {"rank": {"review": None}}})[0]
    assert "review" not in record["topics"]["rank"]
    fails(
        record,
        {"topics": {"rank": {"review": {"due": "2026-10-12", "in_days": 1}}}},
        "either due or in_days",
    )
    fails(
        record,
        {"topics": {"rank": {"review": {"in_days": -1}}}},
        "topics.rank.review.in_days must be a whole number",
    )


def test_observations_append_in_order_with_defaults_and_helper_fields() -> None:
    record = course({"topics": {"rank": {}}})
    record, outcome = apply(
        record,
        {
            "observations": [
                attempt("rank", help="None"),
                {"kind": "self_report", "topics": ["rank"], "text": "Feels unsure"},
            ]
        },
    )
    assert outcome.observations == ["o1", "o2"]
    first = record["observations"]["o1"]
    assert first["kind"] == "attempt"
    assert first["help"] == "none"
    assert first["date"] == "2026-10-10"
    assert first["recorded"] == NOW
    assert list(first)[:3] == ["kind", "topics", "text"]
    assert record["next_observation"] == 3


@pytest.mark.parametrize(
    ("patch", "fragment"),
    [
        ({"revision": 3}, "revision is helper-owned"),
        (
            {"topics": {"rank": {"judged": "2026-10-10"}}},
            "topics.rank.judged is helper-owned",
        ),
        (
            {"topics": {"rank": {"standing": {}}}},
            "topics.rank.standing is helper-owned",
        ),
        (
            {"topics": {"rank": {"review": {"by": "engine"}}}},
            "topics.rank.review.by is helper-owned",
        ),
        (
            {"observations": [attempt("rank", recorded=NOW)]},
            "observations[0].recorded is helper-owned",
        ),
        (
            {"knowledge": {"k": {"text": "x", "updated": "2026-10-10"}}},
            "knowledge.k.updated is helper-owned",
        ),
        (
            {"tasks": {"t": {"created": "2026-10-10"}}},
            "tasks.t.created is helper-owned",
        ),
    ],
)
def test_helper_fields_are_rejected_at_every_level(
    patch: dict[str, Any], fragment: str
) -> None:
    fails(course({"topics": {"rank": {}}}), patch, fragment)


@pytest.mark.parametrize(
    ("patch", "fragments"),
    [
        ({"titel": "x"}, ('Unknown field "titel"', '"title"')),
        (
            {"topics": {"rank": {"neds": []}}},
            ('topics.rank: unknown field "neds"', '"needs"'),
        ),
        (
            {"topics": {"rank": {"review": {"promt": "x"}}}},
            ('topics.rank.review: unknown field "promt"', '"prompt"'),
        ),
        ({"exam": {"dat": "2026-11-01"}}, ('exam: unknown field "dat"', '"date"')),
        ({"path": {"curent": "rank"}}, ('path: unknown field "curent"', '"current"')),
        (
            {"observations": [attempt("rank", respons="x")]},
            ('observations[0]: unknown field "respons"', '"response"'),
        ),
        (
            {"topics": {"rank": {"refs": [{"source": "slides", "locater": "p. 3"}]}}},
            ('topics.rank.refs[0]: unknown field "locater"', '"locator"'),
        ),
        (
            {"tasks": {"t": {"stepp": "x"}}},
            ('tasks.t: unknown field "stepp"', '"step"'),
        ),
        (
            {"observations": [attempt("rank", result="corect")]},
            ("observations[0].result must be one of", '"correct"'),
        ),
    ],
)
def test_unknown_fields_name_the_path_and_close_matches(
    patch: dict[str, Any], fragments: tuple[str, ...]
) -> None:
    fails(course(BASE), patch, *fragments)


def test_unknown_handles_say_how_to_create_them_and_suggest_close_ones() -> None:
    record = course(BASE)
    fails(
        record,
        {"observations": [attempt("spam")]},
        'observations[0].topics[0]: unknown topic "spam"',
        '"topics": {"spam"',
        'did you mean "span"',
    )
    fails(record, {"focus": "ex6"}, 'focus: unknown task "ex6"', '"ex5"')
    fails(
        record,
        {"topics": {"rank": {"refs": [{"source": "slide"}]}}},
        'topics.rank.refs[0].source: unknown source "slide"',
        '"slides"',
        "sources --add",
    )
    fails(
        record,
        {"path": {"current": "rnak"}},
        'path.current: unknown topic "rnak"',
        '"rank"',
    )
    fails(
        record,
        {"tasks": {"ex6": {"topics": ["eigen"]}}},
        'tasks.ex6.topics[0]: unknown topic "eigen"',
    )


def test_topics_created_in_the_same_patch_can_be_referenced() -> None:
    record, outcome = apply(
        course(BASE),
        {
            "topics": {"eigen": {"title": "Eigenvalues", "needs": ["rank"]}},
            "tasks": {"ex6": {"topics": ["eigen"]}},
            "focus": "ex6",
            "observations": [attempt("eigen", task="ex6")],
        },
    )
    assert outcome.observations == ["o1"]
    assert record["focus"] == "ex6"


def test_invalid_and_reserved_handles_are_explained() -> None:
    fails(
        course({}),
        {"topics": {"Rank and Nullità": {}}},
        "is not a handle",
        '"rank-and-nullita"',
    )
    fails(course({}), {"tasks": {"o12": {}}}, "reserved for observation ids")


def test_topics_knowledge_tasks_and_sources_share_one_namespace() -> None:
    record = course(BASE)
    fails(
        record,
        {"tasks": {"rank": {"title": "Rank drill"}}},
        'tasks.rank: "rank" already names a topic',
        "share one namespace",
    )
    fails(
        record,
        {"sources": {"notation": {"path": "n.md"}}},
        'sources.notation: "notation" already names a knowledge entry',
    )
    fails(
        course({}),
        {"topics": {"x": {}}, "knowledge": {"x": {"text": "t"}}},
        'knowledge.x: "x" already names a topic',
    )
    stored = {**schema.empty(), "topics": {"x": {}}, "tasks": {"x": {}}}
    with pytest.raises(ValueError, match="share one namespace"):
        schema.validate_record(stored)


def test_removing_a_topic_strips_it_everywhere_unless_observations_cite_it() -> None:
    record = course(BASE)
    record = apply(record, {"topics": {"span": None}})[0]
    assert "span" not in record["topics"]
    assert record["topics"]["rank"]["needs"] == ["systems"]
    assert record["path"]["order"] == ["systems", "rank"]
    assert record["tasks"]["ex5"]["topics"] == ["rank"]
    record = apply(record, {"observations": [attempt("rank")]})[0]
    message = fails(record, {"topics": {"rank": None}}, "cannot remove rank", "o1")
    assert "forget" in message
    fails(
        course(BASE),
        {"topics": {"rank": None}, "observations": [attempt("rank")]},
        "observations[0]",
    )
    record = apply(course(BASE), {"topics": {"rank": None}})[0]
    assert "current" not in record["path"]
    assert "topics" not in record["knowledge"]["notation"]


def test_removing_the_focused_task_clears_focus_and_cited_sources_stay() -> None:
    record = apply(course(BASE), {"tasks": {"ex5": None}})[0]
    assert "focus" not in record
    record = course(
        {**BASE, "topics": {**BASE["topics"], "rank": {"refs": [{"source": "slides"}]}}}
    )
    fails(record, {"sources": {"slides": None}}, "cannot remove slides", "topics.rank")
    record = apply(
        record, {"topics": {"rank": {"refs": None}}, "sources": {"slides": None}}
    )[0]
    assert record["sources"] == {}


def test_removing_an_absent_entry_is_an_error_with_close_handles() -> None:
    record = course({**BASE, "tasks": {"exercise-5": {}}, "focus": "exercise-5"})
    message = fails(
        record,
        {"tasks": {"exercise5": None}},
        'tasks.exercise5: there is no task "exercise5" to remove',
        'did you mean "exercise-5"',
        "may already have been removed",
    )
    assert "focus" not in message
    fails(record, {"tasks": {"rank": None}}, '"rank" is a topic')
    fails(record, {"topics": {"rnak": None}}, 'did you mean "rank"')


def test_a_handle_can_move_between_maps_in_one_patch() -> None:
    record = course(BASE)
    moved = apply(
        record,
        {
            "knowledge": {"notation": None},
            "topics": {"notation": {"title": "Notation"}},
        },
    )[0]
    assert "notation" not in moved["knowledge"]
    assert moved["topics"]["notation"] == {"title": "Notation"}
    back = apply(
        moved,
        {
            "topics": {"notation": None},
            "tasks": {"notation": {"title": "Fix notation"}},
        },
    )[0]
    assert "notation" in back["tasks"] and "notation" not in back["topics"]


@pytest.mark.parametrize(
    ("observation", "fragment"),
    [
        (
            {"topics": ["rank"], "text": "x", "result": "correct"},
            "an attempt needs help",
        ),
        ({"topics": ["rank"], "text": "x", "help": "none"}, "an attempt needs result"),
        ({"kind": "exam", "topics": ["rank"], "text": "x"}, "an exam needs result"),
        (
            {
                "kind": "exam",
                "topics": ["rank"],
                "text": "x",
                "result": "correct",
                "help": "none",
            },
            "exams count as unaided",
        ),
        (
            {
                "kind": "self_report",
                "topics": ["rank"],
                "text": "x",
                "result": "correct",
            },
            "takes no result",
        ),
        (attempt("rank", result="partial", transfer=True), "transfer is allowed only"),
        (attempt("rank", date="2026-10-11"), "date must not be after today"),
        (attempt("rank", corrects=["o9"]), "'o9' is not a recorded observation"),
        (attempt("rank", task="ex9"), 'unknown task "ex9"'),
        (
            {"topics": [], "text": "x", "help": "none", "result": "correct"},
            'needs "topics"',
        ),
        ({"topics": ["rank"], "help": "none", "result": "correct"}, 'needs "text"'),
        (
            attempt("rank", kind="quiz"),
            "kind must be one of attempt, exam, self_report",
        ),
    ],
)
def test_new_observation_rules(observation: dict[str, Any], fragment: str) -> None:
    fails(course(BASE), {"observations": [observation]}, fragment)


def test_observation_rules_apply_to_stored_records_too() -> None:
    record = course(BASE)
    record = apply(record, {"observations": [attempt("rank")]})[0]
    del record["observations"]["o1"]["help"]
    with pytest.raises(ValueError, match="an attempt needs help"):
        schema.validate_record(record)


def test_an_observation_may_name_a_task_closed_in_the_same_patch() -> None:
    record, outcome = apply(
        course(BASE),
        {"tasks": {"ex5": None}, "observations": [attempt("rank", task="ex5")]},
    )
    assert outcome.observations == ["o1"]
    assert record["observations"]["o1"]["task"] == "ex5"
    assert "focus" not in record


def test_corrections_name_earlier_observations() -> None:
    record = apply(
        course(BASE), {"observations": [attempt("rank", result="incorrect")]}
    )[0]
    record = apply(record, {"observations": [attempt("rank", corrects=["o1"])]})[0]
    assert record["observations"]["o2"]["corrects"] == ["o1"]
    stored = {**record, "observations": dict(record["observations"])}
    stored["observations"]["o1"] = {**stored["observations"]["o1"], "corrects": ["o2"]}
    with pytest.raises(ValueError, match="not an earlier observation"):
        schema.validate_record(stored)


@pytest.mark.parametrize(("minutes", "skipped"), [(5, True), (30, True), (31, False)])
def test_identical_observations_within_30_minutes_are_skipped(
    minutes: int, skipped: bool
) -> None:
    record = apply(course(BASE), {"observations": [attempt("rank")]})[0]
    later = f"2026-10-10T09:{minutes:02d}:00+00:00"
    retried, outcome = apply(record, {"observations": [attempt("rank")]}, now=later)
    if skipped:
        assert (outcome.observations, outcome.duplicates) == ([], ["o1"])
        assert retried == record
    else:
        assert (outcome.observations, outcome.duplicates) == (["o2"], [])


def test_only_identical_content_is_a_duplicate() -> None:
    record = apply(course(BASE), {"observations": [attempt("rank")]})[0]
    _, outcome = apply(
        record, {"observations": [attempt("rank", date="2026-10-09")]}, now=NOW
    )
    assert outcome.observations == ["o2"]
    twice = apply(course(BASE), {"observations": [attempt("rank"), attempt("rank")]})[1]
    assert (twice.observations, twice.duplicates) == (["o1"], ["o1"])


def test_a_correction_without_a_date_takes_the_corrected_day() -> None:
    record = apply(
        course(BASE),
        {
            "observations": [
                attempt("rank", date="2026-10-03", text="Early"),
                attempt("rank", date="2026-10-05", text="Later"),
            ]
        },
    )[0]
    record = apply(
        record,
        {"observations": [attempt("rank", text="Regraded", corrects=["o2", "o1"])]},
    )[0]
    assert record["observations"]["o3"]["date"] == "2026-10-03"
    dated = apply(
        record,
        {
            "observations": [
                attempt("rank", text="Dated", date="2026-10-09", corrects=["o3"])
            ]
        },
    )[0]
    assert dated["observations"]["o4"]["date"] == "2026-10-09"


def test_gap_and_note_changes_stamp_judged() -> None:
    record, outcome = apply(
        course(BASE), {"topics": {"rank": {"gap": "Counts vectors"}}}
    )
    assert record["topics"]["rank"]["judged"] == "2026-10-10"
    assert outcome.judged == ["rank"]
    later = date(2026, 10, 12)
    same, outcome = apply(
        record, {"topics": {"rank": {"gap": "Counts vectors"}}}, today=later
    )
    assert same["topics"]["rank"]["judged"] == "2026-10-10"
    assert outcome.judged == []
    cleared = apply(record, {"topics": {"rank": {"gap": None}}}, today=later)[0]
    assert "judged" not in cleared["topics"]["rank"]


def test_introduced_true_stamps_the_first_teaching_day_only() -> None:
    record, outcome = apply(course(BASE), {"topics": {"rank": {"introduced": True}}})
    assert record["topics"]["rank"]["introduced"] == "2026-10-10"
    assert outcome.introduced == ["rank"]
    again, outcome = apply(
        record, {"topics": {"rank": {"introduced": True}}}, today=date(2026, 10, 12)
    )
    assert again["topics"]["rank"]["introduced"] == "2026-10-10"
    assert outcome.introduced == []
    fails(
        record,
        {"topics": {"span": {"introduced": "2026-10-11"}}},
        "must not be after today",
    )
    fails(record, {"topics": {"span": {"introduced": "yes"}}}, "must be true")


def test_knowledge_and_task_stamps_follow_content_changes() -> None:
    record = course(BASE)
    assert record["knowledge"]["notation"]["updated"] == "2026-10-10"
    assert record["tasks"]["ex5"]["created"] == "2026-10-10"
    later = date(2026, 10, 12)
    unchanged = apply(record, {"tasks": {"ex5": {"title": "Exercise 5"}}}, today=later)[
        0
    ]
    assert unchanged == record
    changed = apply(record, {"tasks": {"ex5": {"step": "Why unique?"}}}, today=later)[0]
    assert changed["tasks"]["ex5"]["created"] == "2026-10-10"
    assert changed["tasks"]["ex5"]["updated"] == "2026-10-12"
    fails(
        record, {"knowledge": {"k2": {"topics": ["rank"]}}}, 'knowledge.k2 needs "text"'
    )
    fails(
        record,
        {"knowledge": {"notation": {"text": None}}},
        'knowledge.notation needs "text"',
    )
    fails(
        record, {"sources": {"notes": {"title": "Notes"}}}, 'sources.notes needs "path"'
    )


def test_flags_store_only_true() -> None:
    record = apply(course(BASE), {"knowledge": {"notation": {"pinned": True}}})[0]
    assert record["knowledge"]["notation"]["pinned"] is True
    record = apply(record, {"knowledge": {"notation": {"pinned": False}}})[0]
    assert "pinned" not in record["knowledge"]["notation"]


def test_prerequisites_must_stay_acyclic() -> None:
    fails(
        course(BASE), {"topics": {"systems": {"needs": ["rank"]}}}, "needs form a cycle"
    )
    fails(
        course(BASE),
        {"topics": {"rank": {"needs": ["rank"]}}},
        "must not include the topic itself",
    )


def test_course_preferences_merge_by_dimension() -> None:
    record = course(
        {"preferences": {"teaching_style": "Examples first", "pace": "Slow"}}
    )
    record = apply(record, {"preferences": {"pace": None}})[0]
    assert record["preferences"] == {"teaching_style": "Examples first"}
    fails(record, {"preferences": {"Teaching Style": "x"}}, "teaching_style")


def test_global_preferences_are_validated_and_handed_back() -> None:
    record, outcome = apply(course({}), {"global_preferences": {"language": "Italian"}})
    assert outcome.global_preferences == {"language": "Italian"}
    assert record["preferences"] == {}


def test_patch_and_record_shapes_are_explained() -> None:
    fails(course({}), [], "one JSON object")
    fails(
        course(BASE),
        {"observations": {"o1": {}}},
        "list of new observations",
        "corrects",
    )
    fails(course(BASE), {"topics": []}, "topics must map handles to objects")
    with pytest.raises(ValueError, match="schema 6"):
        schema.validate_record({"schema": 5})
    with pytest.raises(
        ValueError, match='Unknown field "scopes"|course: unknown field "scopes"'
    ):
        schema.validate_record({"schema": 6, "scopes": {}})


def test_typed_shapes_list_exactly_the_stored_fields() -> None:
    for kind, shape in schema.SHAPES.items():
        declared = shape.__required_keys__ | shape.__optional_keys__
        assert declared == {*schema.FIELDS[kind], *schema.HELPERS.get(kind, {})}, kind


def test_remove_forgets_exact_items_and_their_links() -> None:
    record = apply(
        course(BASE),
        {"observations": [attempt("rank", result="incorrect"), attempt("span")]},
    )[0]
    record = apply(record, {"observations": [attempt("rank", corrects=["o1"])]})[0]
    result = schema.remove(record, ["o1", "ex5"])
    assert "o1" not in result["observations"]
    assert "corrects" not in result["observations"]["o3"]
    assert "focus" not in result
    with pytest.raises(ValueError, match="observations o3 reference it"):
        schema.remove(record, ["rank", "o1"])
    gone = schema.remove(record, ["rank", "o1", "o3"])
    assert "rank" not in gone["topics"]
    assert gone["tasks"]["ex5"]["topics"] == ["span"]
    with pytest.raises(ValueError, match='did you mean "notation"'):
        schema.remove(record, ["notaton"])
    with pytest.raises(ValueError, match="observation ids run o1-o3"):
        schema.remove(record, ["o7"])
