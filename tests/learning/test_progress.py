from datetime import date, timedelta
from typing import Any

import pytest

from learning import progress, schema

TODAY = date(2026, 10, 10)
NOW = "2026-10-10T09:00:00+00:00"


def day(offset: int) -> str:
    return (TODAY + timedelta(days=offset)).isoformat()


def attempt(
    topic: str,
    result: str = "correct",
    help: str = "none",
    offset: int = 0,
    **extra: Any,
) -> dict[str, Any]:
    return {
        "topics": [topic],
        "text": f"{result} with {help}",
        "help": help,
        "result": result,
        "date": day(offset),
        **extra,
    }


def course(
    observations: list[dict[str, Any]] | None = None, **topic: Any
) -> dict[str, Any]:
    patch: dict[str, Any] = {"topics": {"rank": topic}}
    if observations:
        patch["observations"] = observations
    return schema.apply_patch(schema.empty(), patch, today=TODAY, now=NOW)[0]


def save(
    record: dict[str, Any], patch: dict[str, Any], today: date = TODAY
) -> tuple[dict[str, Any], progress.Scheduled]:
    now = f"{today.isoformat()}T09:00:00+00:00"
    patched, outcome = schema.apply_patch(record, patch, today=today, now=now)
    return progress.schedule(patched, outcome, today)


def level(observations: list[dict[str, Any]], **topic: Any) -> str:
    return str(progress.standing(course(observations, **topic), "rank")["level"])


@pytest.mark.parametrize(
    ("observations", "topic", "expected"),
    [
        ([], {}, "new"),
        ([], {"introduced": day(0)}, "introduced"),
        (
            [{"kind": "self_report", "topics": ["rank"], "text": "Lost"}],
            {"introduced": day(0)},
            "introduced",
        ),
        ([attempt("rank", "incorrect"), attempt("rank", "incorrect")], {}, "attempted"),
        ([attempt("rank", "incorrect"), attempt("rank", "partial")], {}, "assisted"),
        ([attempt("rank", "correct", "Hinted at row 3")], {}, "assisted"),
        ([attempt("rank", "incorrect"), attempt("rank")], {}, "assisted"),
        (
            [attempt("rank", offset=-5), attempt("rank", offset=-4), attempt("rank")],
            {},
            "retained",
        ),
        ([attempt("rank", offset=-2), attempt("rank")], {}, "independent"),
        ([attempt("rank", offset=-1), attempt("rank")], {}, "independent"),
        (
            [
                attempt("rank", offset=-5),
                attempt("rank", offset=-3),
                attempt("rank", "correct", "Hint", offset=0),
            ],
            {},
            "independent",
        ),
        ([attempt("rank", transfer=True)], {}, "assisted"),
        (
            [attempt("rank", offset=-1), attempt("rank", transfer=True)],
            {},
            "transferred",
        ),
        ([attempt("rank", "correct", "Hint", transfer=True)], {}, "assisted"),
        (
            [
                {
                    "kind": "exam",
                    "topics": ["rank"],
                    "text": "Midterm",
                    "result": "correct",
                }
            ],
            {},
            "independent",
        ),
    ],
)
def test_level_derivation(
    observations: list[dict[str, Any]], topic: dict[str, Any], expected: str
) -> None:
    assert level(observations, **topic) == expected


def test_corrected_observations_do_not_count() -> None:
    record = course([attempt("rank")])
    record = schema.apply_patch(
        record,
        {"observations": [attempt("rank", "incorrect", corrects=["o1"])]},
        today=TODAY,
        now=NOW,
    )[0]
    standing = progress.standing(record, "rank")
    assert standing["level"] == "attempted"
    assert standing["attempts"] == 1
    assert standing["last"]["id"] == "o2"


def test_standing_reports_counts_last_attempt_and_flags() -> None:
    record = course(
        [
            attempt("rank", offset=-8),
            attempt("rank", offset=-5),
            attempt("rank", "incorrect", "Hint", offset=-1),
        ],
        introduced=day(-9),
    )
    standing = progress.standing(record, "rank")
    assert standing == {
        "level": "retained",
        "attempts": 3,
        "unaided_days": 2,
        "last": {"id": "o3", "date": day(-1), "result": "incorrect", "unaided": False},
    }
    lapsed = course(
        [attempt("rank", offset=-5), attempt("rank", "incorrect", offset=-1)],
        introduced=day(-6),
    )
    assert progress.standing(lapsed, "rank")["lapsed"] is True
    never = course(
        [attempt("rank", "incorrect", offset=-5), attempt("rank", "incorrect")]
    )
    assert "lapsed" not in progress.standing(never, "rank")


def test_attempts_order_by_event_date_then_id() -> None:
    record = course(
        [attempt("rank", offset=0), attempt("rank", "incorrect", offset=-4)]
    )
    assert progress.standing(record, "rank")["last"]["id"] == "o1"


def test_a_judgement_older_than_the_latest_evidence_is_stale() -> None:
    record = course([attempt("rank", offset=-2)])
    judged = schema.apply_patch(
        record,
        {"topics": {"rank": {"gap": "Weak proofs"}}},
        today=TODAY - timedelta(days=3),
        now=NOW,
    )[0]
    assert progress.standing(judged, "rank")["stale"] is True
    fresh = schema.apply_patch(
        record, {"topics": {"rank": {"gap": "Weak proofs"}}}, today=TODAY, now=NOW
    )[0]
    assert "stale" not in progress.standing(fresh, "rank")


def test_a_mistake_answered_right_since_is_repaired_until_a_later_check() -> None:
    gap = {"gap": "Writes det as ad + bc"}
    slip = attempt("rank", "incorrect", sure="confident", offset=0)
    fixed = attempt("rank", help="Reminded him det is ad - bc", offset=0)
    repaired = progress.standing(course([slip, fixed], **gap), "rank")
    assert repaired["repaired"] is True
    assert repaired["confident_errors"] == 1
    assert "repaired" not in progress.standing(course([fixed, slip], **gap), "rank")
    assert "repaired" not in progress.standing(course([fixed]), "rank")
    diagnosed_after = course([attempt("rank", offset=-1)], **gap)
    assert "repaired" not in progress.standing(diagnosed_after, "rank")
    lapse = course(
        [
            attempt("rank", offset=-8),
            attempt("rank", "incorrect", offset=0),
            attempt("rank", "correct", "Pointed at the pivots", offset=0),
        ],
        introduced=day(-9),
    )
    standing = progress.standing(lapse, "rank")
    assert (standing["lapsed"], standing["repaired"]) == (True, True)


@pytest.mark.parametrize(
    ("verdict", "streak", "expected"),
    [
        ("missed", 0, 1),
        ("helped", 0, 2),
        ("solid", 1, 3),
        ("solid", 2, 7),
        ("solid", 3, 16),
        ("solid", 4, 35),
        ("solid", 5, 75),
        ("solid", 6, 160),
        ("solid", 9, 160),
    ],
)
def test_review_ladder_intervals(verdict: str, streak: int, expected: int) -> None:
    assert progress.interval(verdict, streak) == expected


@pytest.mark.parametrize(
    ("observation", "expected"),
    [
        ({"result": "correct", "help": "none"}, "solid"),
        ({"result": "correct", "help": "none", "uncertain": "Notes open"}, "helped"),
        ({"result": "correct", "help": "Hint"}, "helped"),
        ({"result": "partial", "help": "none"}, "helped"),
        ({"result": "incorrect", "help": "none"}, "missed"),
        ({"result": "incorrect", "help": "none", "uncertain": "x"}, "missed"),
        ({"kind": "exam", "result": "correct"}, "solid"),
    ],
)
def test_grades(observation: dict[str, Any], expected: str) -> None:
    assert progress.grade(observation) == expected


def exam(day_: date, lead: int = progress.FINAL_REVIEW_DAYS) -> progress.Exam:
    return progress.Exam(day_, day_ - timedelta(days=lead))


def test_an_exam_caps_reviews_at_its_final_review() -> None:
    base = date(2026, 10, 10)
    assert progress.review_day(base, 16, None) == date(2026, 10, 26)
    assert progress.review_day(base, 16, exam(date(2026, 10, 20))) == date(2026, 10, 14)
    assert progress.review_day(base, 2, exam(date(2026, 10, 30))) == date(2026, 10, 12)
    assert progress.review_day(base, 3, exam(date(2026, 10, 1))) == date(2026, 10, 13)


@pytest.mark.parametrize("days", [1, 2, 3, 160])
def test_after_the_final_review_the_next_review_is_after_the_exam(days: int) -> None:
    base = date(2026, 10, 10)
    soon = exam(date(2026, 10, 11))
    expected = progress.review_day(base, days, soon)
    assert expected == base + timedelta(days=days)
    after = max(expected, date(2026, 10, 12))
    assert progress.kept(base, expected, soon) == after
    assert progress.kept(base, expected, soon, solid=True) == after
    assert progress.kept(base, expected, exam(date(2026, 10, 1))) == expected


def test_a_miss_after_the_final_review_is_relearned_then_settles() -> None:
    record = schema.apply_patch(
        course(introduced=day(-20)),
        {"exam": {"date": day(5)}},
        today=TODAY,
        now=NOW,
    )[0]
    record, scheduled = save(record, {"observations": [attempt("rank", "incorrect")]})
    assert scheduled.reviews == {"rank": {"due": day(1), "by": "engine"}}
    later = TODAY + timedelta(days=1)
    record, scheduled = save(
        record, {"observations": [attempt("rank", offset=1)]}, later
    )
    assert record["topics"]["rank"]["review"]["due"] == day(6)
    assert scheduled.notes == [f"rank: next review {day(6)}, after the exam"]


def test_after_the_exam_reviews_go_on_at_their_dates() -> None:
    record = course(introduced=day(-30), review={"due": day(-1)})
    record = schema.apply_patch(
        record, {"exam": {"date": day(-2)}}, today=TODAY, now=NOW
    )[0]
    assert [item["topic"] for item in progress.due(record, TODAY)] == ["rank"]
    record, _ = save(record, {"exam": {"date": day(30)}})
    assert [item["topic"] for item in progress.due(record, TODAY)] == ["rank"]


def test_setting_an_exam_pulls_every_engine_date_before_it() -> None:
    record = course(introduced=day(-27))
    for offset in (-26, -23, -16, 0):
        record, _ = save(
            record,
            {"observations": [attempt("rank", offset=offset)]},
            TODAY + timedelta(days=offset),
        )
    assert record["topics"]["rank"]["review"]["due"] == day(35)
    moved, scheduled = save(record, {"exam": {"date": day(20)}})
    assert moved["topics"]["rank"]["review"] == {"due": day(14), "by": "engine"}
    assert scheduled.notes == [f"rank: review moved to {day(14)}, after the exam moved"]
    back, _ = save(moved, {"exam": None})
    assert back["topics"]["rank"]["review"] == record["topics"]["rank"]["review"]
    again, scheduled = save(moved, {"exam": {"date": day(20)}})
    assert again == moved and scheduled.reviews == {}


def test_a_tutor_date_after_a_moved_exam_goes_to_the_engine() -> None:
    record = course(introduced=day(-3), review={"due": day(30)})
    record, _ = save(record, {"exam": {"date": day(40)}})
    assert record["topics"]["rank"]["review"]["by"] == "tutor"
    record, scheduled = save(record, {"exam": {"date": day(20)}})
    assert record["topics"]["rank"]["review"] == {"due": day(-2), "by": "engine"}


def test_the_final_review_lead_is_a_course_preference() -> None:
    record = course(introduced=day(-40))
    record, _ = save(record, {"exam": {"date": day(20)}})
    record, _ = save(record, {"observations": [attempt("rank", offset=0)]})
    record, _ = save(
        record,
        {"observations": [attempt("rank", offset=3)]},
        TODAY + timedelta(days=3),
    )
    assert record["topics"]["rank"]["review"]["due"] == day(10)
    record, scheduled = save(record, {"preferences": {"final_review_days": "14"}})
    assert record["topics"]["rank"]["review"]["due"] == day(6)
    assert scheduled.notes == [f"rank: review moved to {day(6)}, after the exam moved"]
    with pytest.raises(ValueError, match="belongs to one course"):
        schema.check_patch({"global_preferences": {"final_review_days": "5"}})
    with pytest.raises(ValueError, match="whole number from 1 to 14"):
        schema.check_patch({"preferences": {"final_review_days": "a week"}})


def test_new_attempts_climb_the_ladder_and_keep_the_prompt() -> None:
    record = course(review={"prompt": "Rank of a 3x3, unaided"})
    record, scheduled = save(record, {"observations": [attempt("rank")]})
    assert scheduled.reviews == {"rank": {"due": day(1), "by": "engine"}}
    assert record["topics"]["rank"]["review"] == {
        "due": day(1),
        "prompt": "Rank of a 3x3, unaided",
        "by": "engine",
    }
    record, scheduled = save(
        record, {"observations": [attempt("rank", offset=1)]}, TODAY + timedelta(days=1)
    )
    assert scheduled.reviews["rank"]["due"] == day(1 + 3)
    record, scheduled = save(
        record, {"observations": [attempt("rank", offset=4)]}, TODAY + timedelta(days=4)
    )
    assert scheduled.reviews["rank"]["due"] == day(4 + 7)


def test_a_tutor_date_in_the_same_patch_wins_and_moves_before_the_exam() -> None:
    record = course()
    record = schema.apply_patch(
        record, {"exam": {"date": day(10)}}, today=TODAY, now=NOW
    )[0]
    record, scheduled = save(
        record,
        {
            "topics": {"rank": {"review": {"due": day(20)}}},
            "observations": [attempt("rank")],
        },
    )
    assert scheduled.reviews == {"rank": {"due": day(9), "by": "tutor"}}
    assert scheduled.notes == [
        f"rank: review moved from {day(20)} to {day(9)}, before the exam"
    ]


def test_introducing_a_topic_schedules_the_first_retrieval() -> None:
    record, scheduled = save(course(), {"topics": {"rank": {"introduced": True}}})
    assert scheduled.reviews == {"rank": {"due": day(1), "by": "engine"}}
    assert "first retrieval" in scheduled.notes[0]
    again, scheduled = save(record, {"topics": {"rank": {"introduced": True}}})
    assert scheduled.reviews == {}
    taught, scheduled = save(
        course(),
        {
            "topics": {"rank": {"introduced": True}},
            "observations": [attempt("rank", "partial")],
        },
    )
    assert scheduled.reviews == {"rank": {"due": day(1), "by": "engine"}}
    assert not any("first retrieval" in note for note in scheduled.notes)


def test_self_reports_never_reschedule() -> None:
    record, scheduled = save(
        course(review={"due": day(5)}),
        {
            "observations": [
                {"kind": "self_report", "topics": ["rank"], "text": "Confused"}
            ]
        },
    )
    assert scheduled.reviews == {}
    assert record["topics"]["rank"]["review"]["due"] == day(5)


def test_new_evidence_after_an_earlier_judgement_adds_a_note() -> None:
    earlier = schema.apply_patch(
        course(),
        {"topics": {"rank": {"gap": "Counts vectors", "note": "Fluent otherwise"}}},
        today=TODAY - timedelta(days=2),
        now=NOW,
    )[0]
    _, scheduled = save(earlier, {"observations": [attempt("rank")]})
    assert scheduled.notes == [
        "rank: gap and note were judged before o1; revise or clear them if the "
        "diagnosis changed"
    ]
    _, scheduled = save(
        earlier,
        {"observations": [attempt("rank")], "topics": {"rank": {"gap": None}}},
    )
    assert scheduled.notes == []


def test_a_same_day_judgement_is_not_stale() -> None:
    record = course(gap="Counts vectors")
    record, scheduled = save(record, {"observations": [attempt("rank")]})
    assert scheduled.notes == []
    assert "stale" not in progress.standing(record, "rank")


def test_an_attempt_corrected_in_the_same_save_does_not_schedule() -> None:
    record = course([attempt("rank", "incorrect")])
    record, scheduled = save(
        record,
        {
            "observations": [
                {
                    "kind": "self_report",
                    "topics": ["rank"],
                    "text": "That was a typo",
                    "corrects": ["o1"],
                }
            ]
        },
    )
    assert scheduled.reviews == {}


def path_course(order: list[str] | None = None) -> dict[str, Any]:
    patch: dict[str, Any] = {
        "topics": {
            "eigen": {"needs": ["rank"]},
            "rank": {"needs": ["systems"]},
            "systems": {},
            "basis": {},
            "aside": {},
        }
    }
    if order:
        patch["path"] = {"order": order}
    return schema.apply_patch(schema.empty(), patch, today=TODAY, now=NOW)[0]


def test_path_order_is_topological_with_order_then_handle_ties() -> None:
    assert progress.path_order(path_course()) == [
        "aside",
        "basis",
        "systems",
        "rank",
        "eigen",
    ]
    assert progress.path_order(path_course(["eigen", "basis", "systems"])) == [
        "basis",
        "systems",
        "aside",
        "rank",
        "eigen",
    ]


def test_due_puts_prerequisites_first_and_upcoming_sorts_by_day() -> None:
    record = path_course(["systems", "rank", "eigen"])
    record = schema.apply_patch(
        record,
        {
            "topics": {
                "eigen": {
                    "title": "Eigenvalues",
                    "review": {"due": day(-2), "prompt": "Diagonalize"},
                    "gap": "Signs",
                },
                "rank": {"review": {"due": day(-2)}},
                "systems": {"review": {"due": day(0)}},
                "basis": {"review": {"due": day(1)}},
                "aside": {"review": {"due": day(9)}},
            }
        },
        today=TODAY,
        now=NOW,
    )[0]
    due = progress.due(record, TODAY)
    assert [item["topic"] for item in due] == ["systems", "rank", "eigen"]
    assert due[2] == {
        "topic": "eigen",
        "title": "Eigenvalues",
        "due": day(-2),
        "overdue": 2,
        "level": "new",
        "prompt": "Diagonalize",
        "gap": "Signs",
    }
    assert due[0]["overdue"] == 0
    assert progress.upcoming(record, TODAY, 7) == [{"topic": "basis", "due": day(1)}]
    assert len(progress.upcoming(record, TODAY, 9)) == 2


def test_moving_the_exam_later_never_uncounts_a_review() -> None:
    record, _ = save(course(introduced=day(-1)), {"exam": {"date": day(20)}})
    when = TODAY
    while (due := record["topics"]["rank"].get("review", {}).get("due")) and (
        due < day(19)
    ):
        when = date.fromisoformat(due)
        record, _ = save(
            record,
            {"observations": [attempt("rank", offset=(when - TODAY).days)]},
            when,
        )
    counted = progress.replays(record)["rank"].verdicts
    assert counted[-1] == (day(14), "solid")
    moved, _ = save(record, {"exam": {"date": day(60)}}, when)
    assert progress.replays(moved)["rank"].verdicts == counted
    assert all(
        moved["observations"][key]["due_topics"] == ["rank"]
        for key in moved["observations"]
    )
