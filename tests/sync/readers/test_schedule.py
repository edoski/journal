"""Tests for strict PROTOCOL.md schedule parsing and day resolution."""

from __future__ import annotations

import datetime

import pytest

from sync.readers.schedule import (
    _find_schedule_header,
    _find_table_start,
    _parse_optional_time,
    _parse_rule,
    parse_schedule_rules,
)


_HEADER = "| RULE | STUDY_START | STUDY_END | LUNCH_START | LUNCH_END | WORKOUT_START |"
_DIVIDER = (
    "| ---- | ----------- | --------- | ----------- | --------- | ------------- |"
)


def _protocol_lines(table_lines: list[str]) -> list[str]:
    return [
        "## SUPPLEMENTS",
        "",
        "## SCHEDULE",
        "",
        *table_lines,
        "",
        "## WORKOUT",
        "",
    ]


def _default_row(
    *,
    study_start: str = "08:00",
    study_end: str = "18:00",
    lunch_start: str = "13:30",
    lunch_end: str = "14:30",
    workout_start: str = "18:00",
) -> str:
    return (
        f"| DEFAULT | {study_start} | {study_end} | {lunch_start} |"
        f" {lunch_end} | {workout_start} |"
    )


def test_schedule_rules_resolve_default_weekday_and_date_precedence():
    lines = _protocol_lines(
        [
            _HEADER,
            _DIVIDER,
            _default_row(),
            "| WEEKDAY:WED,FRI | 14:30 | | | | |",
            "| DATE:2026-02-20 | 15:00 | | | | |",
        ],
    )

    rules = parse_schedule_rules(lines)

    monday = rules.resolve_day(datetime.date(2026, 2, 16))
    wednesday = rules.resolve_day(datetime.date(2026, 2, 18))
    friday_with_date_override = rules.resolve_day(datetime.date(2026, 2, 20))

    assert monday.study_start == datetime.time(8, 0)
    assert monday.study_end == datetime.time(18, 0)
    assert monday.workout_start == datetime.time(18, 0)
    assert monday.is_off_day is False
    assert wednesday.study_start == datetime.time(14, 30)
    assert wednesday.study_end == datetime.time(18, 0)
    assert wednesday.workout_start == datetime.time(18, 0)
    assert wednesday.is_off_day is False
    assert friday_with_date_override.study_start == datetime.time(15, 0)
    assert friday_with_date_override.workout_start == datetime.time(18, 0)
    assert friday_with_date_override.is_off_day is False


def test_schedule_rules_date_override_updates_end_lunch_and_workout_fields():
    lines = _protocol_lines(
        [
            _HEADER,
            _DIVIDER,
            _default_row(),
            "| DATE:2026-02-20 | | 17:30 | | 14:00 | 19:30 |",
        ],
    )
    rules = parse_schedule_rules(lines)
    profile = rules.resolve_day(datetime.date(2026, 2, 20))

    assert profile.study_start == datetime.time(8, 0)
    assert profile.study_end == datetime.time(17, 30)
    assert profile.lunch_start == datetime.time(13, 30)
    assert profile.lunch_end == datetime.time(14, 0)
    assert profile.workout_start == datetime.time(19, 30)


def test_find_schedule_header_returns_exact_section_index():
    lines = ["# Protocol", "## OTHER", "  ## SCHEDULE  ", "| RULE | ... |"]
    assert _find_schedule_header(lines) == 2


def test_find_table_start_returns_first_table_before_next_section():
    lines = [
        "## SCHEDULE",
        "",
        "notes",
        "| RULE | STUDY_START | STUDY_END | LUNCH_START | LUNCH_END | WORKOUT_START |",
        "## NEXT",
        "| should not be used |",
    ]
    assert _find_table_start(lines, 0) == 3


def test_find_table_start_allows_table_immediately_after_schedule_header():
    lines = [
        "## SCHEDULE",
        "| RULE | STUDY_START | STUDY_END | LUNCH_START | LUNCH_END | WORKOUT_START |",
        "| ---- | ----------- | --------- | ----------- | --------- | ------------- |",
    ]
    assert _find_table_start(lines, 0) == 1


def test_find_table_start_raises_when_next_section_reached_first():
    lines = [
        "## SCHEDULE",
        "",
        "notes",
        "## NEXT",
        "| RULE | STUDY_START | STUDY_END | LUNCH_START | LUNCH_END | WORKOUT_START |",
    ]
    with pytest.raises(ValueError, match="## SCHEDULE must contain a markdown table"):
        _find_table_start(lines, 0)


def test_find_schedule_header_raises_with_exact_message():
    with pytest.raises(ValueError) as excinfo:
        _find_schedule_header(["# PROTOCOL", "## WORKOUT"])
    assert str(excinfo.value) == "PROTOCOL.md must contain a '## SCHEDULE' section"


def test_find_table_start_raises_with_exact_message():
    with pytest.raises(ValueError) as excinfo:
        _find_table_start(["## SCHEDULE", "notes"], 0)
    assert str(excinfo.value) == (
        "## SCHEDULE must contain a markdown table with the canonical headers"
    )


def test_parse_optional_time_invalid_value_reports_exact_context():
    with pytest.raises(ValueError) as excinfo:
        _parse_optional_time("8:00", line_no=19, column="WORKOUT_START")
    assert (
        str(excinfo.value)
        == "PROTOCOL.md line 19: WORKOUT_START must be HH:MM (24-hour), got '8:00'"
    )


def test_parse_rule_weekday_without_tokens_reports_exact_message():
    with pytest.raises(ValueError) as excinfo:
        _parse_rule("WEEKDAY:", line_no=17)
    assert (
        str(excinfo.value)
        == "PROTOCOL.md line 17: WEEKDAY rule must include weekday tokens"
    )


def test_parse_rule_date_returns_canonical_kind_literal():
    kind, selector = _parse_rule("DATE:2026-02-20", line_no=12)
    assert kind == "date"
    assert selector == datetime.date(2026, 2, 20)


@pytest.mark.parametrize(
    ("default_row", "expected"),
    [
        (
            _default_row(study_start="8:00"),
            "PROTOCOL.md line 7: STUDY_START must be HH:MM (24-hour), got '8:00'",
        ),
        (
            _default_row(study_end="18:0"),
            "PROTOCOL.md line 7: STUDY_END must be HH:MM (24-hour), got '18:0'",
        ),
        (
            _default_row(lunch_start="13:3"),
            "PROTOCOL.md line 7: LUNCH_START must be HH:MM (24-hour), got '13:3'",
        ),
        (
            _default_row(lunch_end="14:3"),
            "PROTOCOL.md line 7: LUNCH_END must be HH:MM (24-hour), got '14:3'",
        ),
        (
            _default_row(workout_start="18:0"),
            "PROTOCOL.md line 7: WORKOUT_START must be HH:MM (24-hour), got '18:0'",
        ),
    ],
)
def test_schedule_rules_invalid_default_time_reports_exact_line_and_column(
    default_row: str,
    expected: str,
):
    lines = _protocol_lines([_HEADER, _DIVIDER, default_row])
    with pytest.raises(ValueError) as excinfo:
        parse_schedule_rules(lines)
    assert str(excinfo.value) == expected


def test_schedule_rules_reject_noncanonical_header():
    lines = _protocol_lines(
        [
            "| TIME | ACTIVITY |",
            "| ---- | -------- |",
            "| `08:00 - 09:30` | Study |",
        ],
    )

    with pytest.raises(ValueError) as excinfo:
        parse_schedule_rules(lines)
    assert str(excinfo.value) == (
        "## SCHEDULE table header must be exactly: "
        "| RULE | STUDY_START | STUDY_END | LUNCH_START | LUNCH_END | WORKOUT_START |"
    )


def test_schedule_rules_reject_duplicate_weekday_selector():
    lines = _protocol_lines(
        [
            _HEADER,
            _DIVIDER,
            _default_row(),
            "| WEEKDAY:WED | 14:30 | | | | |",
            "| WEEKDAY:WED | 15:00 | | | | |",
        ],
    )

    with pytest.raises(ValueError) as excinfo:
        parse_schedule_rules(lines)
    assert str(excinfo.value) == "PROTOCOL.md line 9: duplicate WEEKDAY selector 'WED'"


def test_schedule_rules_reject_invalid_time_format():
    lines = _protocol_lines(
        [
            _HEADER,
            _DIVIDER,
            "| DEFAULT | 8:00 | 18:00 | 13:30 | 14:30 | 18:00 |",
        ],
    )

    with pytest.raises(ValueError, match="must be HH:MM"):
        parse_schedule_rules(lines)


def test_schedule_rules_reject_resolved_invalid_study_window():
    lines = _protocol_lines(
        [
            _HEADER,
            _DIVIDER,
            _default_row(),
            "| DATE:2026-02-20 | 19:00 | | | | |",
        ],
    )
    rules = parse_schedule_rules(lines)

    with pytest.raises(ValueError, match="STUDY_START must be earlier than STUDY_END"):
        rules.resolve_day(datetime.date(2026, 2, 20))


def test_schedule_rules_reject_missing_schedule_header():
    with pytest.raises(ValueError, match="must contain a '## SCHEDULE' section"):
        parse_schedule_rules(["## SOMETHING ELSE"])


def test_schedule_rules_reject_missing_table():
    with pytest.raises(ValueError, match="must contain a markdown table"):
        parse_schedule_rules(["## SCHEDULE", "", "No table here"])


def test_schedule_rules_reject_missing_divider_row():
    lines = _protocol_lines(
        [
            _HEADER,
            "not-a-divider",
            _default_row(),
        ],
    )
    with pytest.raises(ValueError) as excinfo:
        parse_schedule_rules(lines)
    assert str(excinfo.value) == "## SCHEDULE table is missing the divider row"


def test_schedule_rules_reject_empty_rules_table():
    lines = _protocol_lines([_HEADER, _DIVIDER])
    with pytest.raises(ValueError) as excinfo:
        parse_schedule_rules(lines)
    assert str(excinfo.value) == "## SCHEDULE table must contain at least one rule row"


def test_schedule_rules_reject_missing_default_row():
    lines = _protocol_lines(
        [
            _HEADER,
            _DIVIDER,
            "| WEEKDAY:MON | 09:00 | | | | |",
        ],
    )
    with pytest.raises(ValueError) as excinfo:
        parse_schedule_rules(lines)
    assert str(excinfo.value) == "## SCHEDULE table must define one DEFAULT row"


def test_schedule_rules_reject_duplicate_default_rows():
    lines = _protocol_lines(
        [
            _HEADER,
            _DIVIDER,
            _default_row(),
            _default_row(study_start="09:00"),
        ],
    )
    with pytest.raises(ValueError) as excinfo:
        parse_schedule_rules(lines)
    assert str(excinfo.value) == "## SCHEDULE table must define exactly one DEFAULT row"


def test_schedule_rules_reject_default_row_with_missing_fields():
    lines = _protocol_lines(
        [
            _HEADER,
            _DIVIDER,
            "| DEFAULT | 08:00 | 18:00 | 13:30 | | 18:00 |",
        ],
    )
    with pytest.raises(ValueError) as excinfo:
        parse_schedule_rules(lines)
    assert (
        str(excinfo.value)
        == "PROTOCOL.md line 7: DEFAULT row must set all schedule fields"
    )


def test_schedule_rules_reject_default_row_with_invalid_study_window():
    lines = _protocol_lines(
        [
            _HEADER,
            _DIVIDER,
            _default_row(study_start="18:00", study_end="08:00"),
        ],
    )
    with pytest.raises(ValueError) as excinfo:
        parse_schedule_rules(lines)
    assert str(excinfo.value) == "DEFAULT row must satisfy STUDY_START < STUDY_END"


def test_schedule_rules_reject_default_row_with_invalid_lunch_window():
    lines = _protocol_lines(
        [
            _HEADER,
            _DIVIDER,
            _default_row(lunch_start="14:30", lunch_end="13:30"),
        ],
    )
    with pytest.raises(ValueError) as excinfo:
        parse_schedule_rules(lines)
    assert str(excinfo.value) == "DEFAULT row must satisfy LUNCH_START < LUNCH_END"


def test_schedule_rules_reject_override_without_values():
    lines = _protocol_lines(
        [
            _HEADER,
            _DIVIDER,
            _default_row(),
            "| WEEKDAY:MON | | | | | |",
        ],
    )
    with pytest.raises(ValueError) as excinfo:
        parse_schedule_rules(lines)
    assert (
        str(excinfo.value)
        == "PROTOCOL.md line 8: override rows must set at least one field"
    )


def test_schedule_rules_reject_default_off_row():
    lines = _protocol_lines(
        [
            _HEADER,
            _DIVIDER,
            "| DEFAULT | OFF | OFF | 13:30 | 14:30 | 18:00 |",
        ],
    )
    with pytest.raises(ValueError) as excinfo:
        parse_schedule_rules(lines)
    assert str(excinfo.value) == "PROTOCOL.md line 7: DEFAULT row cannot be OFF"


def test_schedule_rules_reject_partial_off_row():
    lines = _protocol_lines(
        [
            _HEADER,
            _DIVIDER,
            _default_row(),
            "| WEEKDAY:SUN | OFF | | | | |",
        ],
    )
    with pytest.raises(ValueError) as excinfo:
        parse_schedule_rules(lines)
    assert (
        str(excinfo.value)
        == "PROTOCOL.md line 8: OFF must be used in both STUDY_START and STUDY_END"
    )


def test_schedule_rules_reject_off_row_with_non_blank_lunch_or_workout():
    lines = _protocol_lines(
        [
            _HEADER,
            _DIVIDER,
            _default_row(),
            "| WEEKDAY:SUN | OFF | OFF | 13:30 | | |",
        ],
    )
    with pytest.raises(ValueError) as excinfo:
        parse_schedule_rules(lines)
    assert (
        str(excinfo.value)
        == "PROTOCOL.md line 8: OFF rows must leave LUNCH_START, LUNCH_END, and WORKOUT_START blank"
    )


def test_schedule_rules_resolve_weekday_off_and_date_reenable_precedence():
    lines = _protocol_lines(
        [
            _HEADER,
            _DIVIDER,
            _default_row(),
            "| WEEKDAY:SAT,SUN | OFF | OFF | | | |",
            "| DATE:2026-02-22 | 10:00 | 12:00 | | | |",
        ],
    )
    rules = parse_schedule_rules(lines)

    saturday = rules.resolve_day(datetime.date(2026, 2, 21))
    sunday = rules.resolve_day(datetime.date(2026, 2, 22))

    assert saturday.is_off_day is True
    assert sunday.is_off_day is False
    assert sunday.study_start == datetime.time(10, 0)
    assert sunday.study_end == datetime.time(12, 0)


def test_schedule_rules_reject_duplicate_date_selector():
    lines = _protocol_lines(
        [
            _HEADER,
            _DIVIDER,
            _default_row(),
            "| DATE:2026-02-20 | 09:00 | | | | |",
            "| DATE:2026-02-20 | 10:00 | | | | |",
        ],
    )
    with pytest.raises(ValueError) as excinfo:
        parse_schedule_rules(lines)
    assert (
        str(excinfo.value) == "PROTOCOL.md line 9: duplicate DATE selector '2026-02-20'"
    )


def test_schedule_rules_reject_invalid_weekday_token():
    lines = _protocol_lines(
        [
            _HEADER,
            _DIVIDER,
            _default_row(),
            "| WEEKDAY:MON,FUNDAY | 09:00 | | | | |",
        ],
    )
    with pytest.raises(ValueError, match="invalid WEEKDAY token"):
        parse_schedule_rules(lines)


def test_schedule_rules_reject_duplicate_weekday_token_in_same_rule():
    lines = _protocol_lines(
        [
            _HEADER,
            _DIVIDER,
            _default_row(),
            "| WEEKDAY:MON,MON | 09:00 | | | | |",
        ],
    )
    with pytest.raises(ValueError, match="duplicate WEEKDAY token"):
        parse_schedule_rules(lines)


def test_schedule_rules_reject_invalid_date_rule_shape():
    lines = _protocol_lines(
        [
            _HEADER,
            _DIVIDER,
            _default_row(),
            "| DATE:2026/02/20 | 09:00 | | | | |",
        ],
    )
    with pytest.raises(ValueError, match="DATE rule must be DATE:YYYY-MM-DD"):
        parse_schedule_rules(lines)


def test_schedule_rules_reject_unsupported_rule():
    lines = _protocol_lines(
        [
            _HEADER,
            _DIVIDER,
            _default_row(),
            "| HOLIDAY | 09:00 | | | | |",
        ],
    )
    with pytest.raises(ValueError, match="unsupported RULE"):
        parse_schedule_rules(lines)


def test_schedule_rules_reject_row_with_wrong_column_count():
    lines = _protocol_lines(
        [
            _HEADER,
            _DIVIDER,
            "| DEFAULT | 08:00 | 18:00 | 13:30 | 14:30 |",
        ],
    )
    with pytest.raises(ValueError) as excinfo:
        parse_schedule_rules(lines)
    assert str(excinfo.value) == "PROTOCOL.md line 7: expected 6 columns, got 5"


def test_schedule_rules_resolve_day_rejects_invalid_lunch_window():
    lines = _protocol_lines(
        [
            _HEADER,
            _DIVIDER,
            _default_row(),
            "| DATE:2026-02-20 | | | 15:00 | | |",
        ],
    )
    rules = parse_schedule_rules(lines)
    with pytest.raises(ValueError, match="LUNCH_START must be earlier than LUNCH_END"):
        rules.resolve_day(datetime.date(2026, 2, 20))


def test_schedule_rules_reject_header_row_that_is_not_a_markdown_row():
    lines = _protocol_lines(
        [
            "| RULE | STUDY_START | STUDY_END | LUNCH_START | LUNCH_END | WORKOUT_START",
            _DIVIDER,
            _default_row(),
        ],
    )
    with pytest.raises(ValueError) as excinfo:
        parse_schedule_rules(lines)
    assert str(excinfo.value) == "PROTOCOL.md line 5: invalid markdown table row"


def test_schedule_rules_reject_invalid_rule_row_with_exact_line_number():
    lines = _protocol_lines(
        [
            _HEADER,
            _DIVIDER,
            _default_row(),
            "| HOLIDAY | 09:00 | | | | |",
        ],
    )
    with pytest.raises(ValueError) as excinfo:
        parse_schedule_rules(lines)
    assert (
        str(excinfo.value)
        == "PROTOCOL.md line 8: unsupported RULE 'HOLIDAY'; expected DEFAULT, WEEKDAY:..., or DATE:YYYY-MM-DD"
    )


def test_schedule_rules_reject_invalid_markdown_body_row_with_exact_line():
    lines = _protocol_lines(
        [
            _HEADER,
            _DIVIDER,
            _default_row(),
            "| WEEKDAY:MON | 09:00 | | | value",
        ],
    )
    with pytest.raises(ValueError) as excinfo:
        parse_schedule_rules(lines)
    assert str(excinfo.value) == "PROTOCOL.md line 8: invalid markdown table row"


def test_schedule_rules_accepts_next_section_without_blank_separator():
    rules = parse_schedule_rules(
        ["## SCHEDULE", _HEADER, _DIVIDER, _default_row(), "## NEXT"]
    )
    resolved = rules.resolve_day(datetime.date(2026, 2, 16))
    assert resolved.study_start == datetime.time(8, 0)


def test_schedule_rules_rejects_missing_divider_when_header_is_last_line():
    with pytest.raises(ValueError) as excinfo:
        parse_schedule_rules(["## SCHEDULE", _HEADER])
    assert str(excinfo.value) == "## SCHEDULE table is missing the divider row"


def test_schedule_rules_reject_default_row_when_study_times_are_equal():
    lines = _protocol_lines(
        [
            _HEADER,
            _DIVIDER,
            _default_row(study_start="08:00", study_end="08:00"),
        ],
    )
    with pytest.raises(ValueError) as excinfo:
        parse_schedule_rules(lines)
    assert str(excinfo.value) == "DEFAULT row must satisfy STUDY_START < STUDY_END"


def test_schedule_rules_reject_default_row_when_lunch_times_are_equal():
    lines = _protocol_lines(
        [
            _HEADER,
            _DIVIDER,
            _default_row(lunch_start="13:30", lunch_end="13:30"),
        ],
    )
    with pytest.raises(ValueError) as excinfo:
        parse_schedule_rules(lines)
    assert str(excinfo.value) == "DEFAULT row must satisfy LUNCH_START < LUNCH_END"
