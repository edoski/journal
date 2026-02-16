"""Schedule-table parsing and per-day resolution helpers."""

from __future__ import annotations

import datetime
import re
from dataclasses import dataclass
from typing import Literal, cast

from sync.contracts.schedule import DayScheduleProfile, Weekday
from sync.io import safe_read_file

_TABLE_HEADERS = (
    "RULE",
    "STUDY_START",
    "STUDY_END",
    "LUNCH_START",
    "LUNCH_END",
    "WORKOUT_START",
)
_TIME_RE = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")
_WEEKDAYS: tuple[Weekday, ...] = ("MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN")
_WEEKDAY_BY_INDEX: dict[int, Weekday] = {idx: day for idx, day in enumerate(_WEEKDAYS)}


@dataclass(frozen=True)
class _ScheduleOverride:
    study_start: datetime.time | None = None
    study_end: datetime.time | None = None
    lunch_start: datetime.time | None = None
    lunch_end: datetime.time | None = None
    workout_start: datetime.time | None = None

    def apply(self, profile: DayScheduleProfile) -> DayScheduleProfile:
        return DayScheduleProfile(
            study_start=self.study_start or profile.study_start,
            study_end=self.study_end or profile.study_end,
            lunch_start=self.lunch_start or profile.lunch_start,
            lunch_end=self.lunch_end or profile.lunch_end,
            workout_start=self.workout_start or profile.workout_start,
        )


@dataclass(frozen=True)
class ScheduleRules:
    """Parsed schedule rules with deterministic day resolution semantics."""

    default_profile: DayScheduleProfile
    weekday_overrides: dict[Weekday, _ScheduleOverride]
    date_overrides: dict[datetime.date, _ScheduleOverride]

    def resolve_day(self, day: datetime.date) -> DayScheduleProfile:
        profile = self.default_profile

        weekday_token = _WEEKDAY_BY_INDEX[day.weekday()]
        weekday_override = self.weekday_overrides.get(weekday_token)
        if weekday_override:
            profile = weekday_override.apply(profile)

        date_override = self.date_overrides.get(day)
        if date_override:
            profile = date_override.apply(profile)

        if profile.study_start >= profile.study_end:
            raise ValueError(
                f"Resolved schedule invalid for {day.isoformat()}: "
                "STUDY_START must be earlier than STUDY_END"
            )
        if profile.lunch_start >= profile.lunch_end:
            raise ValueError(
                f"Resolved schedule invalid for {day.isoformat()}: "
                "LUNCH_START must be earlier than LUNCH_END"
            )

        return profile


def _split_markdown_row(line: str, *, line_no: int) -> list[str]:
    stripped = line.strip()
    if not stripped.startswith("|") or not stripped.endswith("|"):
        raise ValueError(f"PROTOCOL.md line {line_no}: invalid markdown table row")
    return [cell.strip() for cell in stripped[1:-1].split("|")]


def _find_schedule_header(lines: list[str]) -> int:
    for idx, line in enumerate(lines):
        if line.strip() == "## SCHEDULE":
            return idx
    raise ValueError("PROTOCOL.md must contain a '## SCHEDULE' section")


def _find_table_start(lines: list[str], schedule_header_idx: int) -> int:
    for idx in range(schedule_header_idx + 1, len(lines)):
        if lines[idx].strip().startswith("## "):
            break
        if lines[idx].strip().startswith("|"):
            return idx
    raise ValueError(
        "## SCHEDULE must contain a markdown table with the canonical headers"
    )


def _parse_time(
    value: str,
    *,
    line_no: int,
    column: str,
) -> datetime.time:
    if not _TIME_RE.fullmatch(value):
        raise ValueError(
            f"PROTOCOL.md line {line_no}: {column} must be HH:MM (24-hour), got {value!r}"
        )
    hour, minute = map(int, value.split(":"))
    return datetime.time(hour=hour, minute=minute)


def _parse_optional_time(
    value: str,
    *,
    line_no: int,
    column: str,
) -> datetime.time | None:
    if not value:
        return None
    return _parse_time(value, line_no=line_no, column=column)


def _parse_rule(
    value: str,
    *,
    line_no: int,
) -> tuple[Literal["default", "weekday", "date"], tuple[Weekday, ...] | datetime.date]:
    if value == "DEFAULT":
        return "default", ()

    if value.startswith("WEEKDAY:"):
        raw_tokens = value.removeprefix("WEEKDAY:")
        if not raw_tokens:
            raise ValueError(
                f"PROTOCOL.md line {line_no}: WEEKDAY rule must include weekday tokens"
            )
        tokens = [token.strip() for token in raw_tokens.split(",")]
        weekdays: list[Weekday] = []
        seen: set[str] = set()
        for token in tokens:
            if token not in _WEEKDAYS:
                raise ValueError(
                    f"PROTOCOL.md line {line_no}: invalid WEEKDAY token {token!r}"
                )
            if token in seen:
                raise ValueError(
                    f"PROTOCOL.md line {line_no}: duplicate WEEKDAY token {token!r}"
                )
            weekdays.append(cast(Weekday, token))
            seen.add(token)
        return "weekday", tuple(weekdays)

    if value.startswith("DATE:"):
        raw_date = value.removeprefix("DATE:")
        try:
            parsed = datetime.date.fromisoformat(raw_date)
        except ValueError as exc:
            raise ValueError(
                f"PROTOCOL.md line {line_no}: DATE rule must be DATE:YYYY-MM-DD"
            ) from exc
        return "date", parsed

    raise ValueError(
        f"PROTOCOL.md line {line_no}: unsupported RULE {value!r}; "
        "expected DEFAULT, WEEKDAY:..., or DATE:YYYY-MM-DD"
    )


def load_schedule_rules(path: str) -> ScheduleRules:
    """Parse strict schedule rules from PROTOCOL.md."""
    lines = safe_read_file(path)
    if lines is None:
        raise FileNotFoundError(f"Required schedule config not found: {path}")

    schedule_header_idx = _find_schedule_header(lines)
    table_start = _find_table_start(lines, schedule_header_idx)

    header = _split_markdown_row(lines[table_start], line_no=table_start + 1)
    if tuple(header) != _TABLE_HEADERS:
        raise ValueError(
            "## SCHEDULE table header must be exactly: "
            "| RULE | STUDY_START | STUDY_END | LUNCH_START | LUNCH_END | WORKOUT_START |"
        )

    divider_idx = table_start + 1
    if divider_idx >= len(lines) or not lines[divider_idx].strip().startswith("|"):
        raise ValueError("## SCHEDULE table is missing the divider row")

    default_profile: DayScheduleProfile | None = None
    weekday_overrides: dict[Weekday, _ScheduleOverride] = {}
    date_overrides: dict[datetime.date, _ScheduleOverride] = {}

    row_count = 0
    for idx in range(divider_idx + 1, len(lines)):
        raw_line = lines[idx].strip()
        if not raw_line:
            break
        if raw_line.startswith("## "):
            break
        if not raw_line.startswith("|"):
            break

        row_count += 1
        cells = _split_markdown_row(lines[idx], line_no=idx + 1)
        if len(cells) != len(_TABLE_HEADERS):
            raise ValueError(
                f"PROTOCOL.md line {idx + 1}: expected {len(_TABLE_HEADERS)} columns, "
                f"got {len(cells)}"
            )

        rule_raw = cells[0]
        study_start = _parse_optional_time(
            cells[1], line_no=idx + 1, column="STUDY_START"
        )
        study_end = _parse_optional_time(cells[2], line_no=idx + 1, column="STUDY_END")
        lunch_start = _parse_optional_time(
            cells[3], line_no=idx + 1, column="LUNCH_START"
        )
        lunch_end = _parse_optional_time(cells[4], line_no=idx + 1, column="LUNCH_END")
        workout_start = _parse_optional_time(
            cells[5], line_no=idx + 1, column="WORKOUT_START"
        )
        override = _ScheduleOverride(
            study_start=study_start,
            study_end=study_end,
            lunch_start=lunch_start,
            lunch_end=lunch_end,
            workout_start=workout_start,
        )

        kind, selector = _parse_rule(rule_raw, line_no=idx + 1)
        if kind == "default":
            if default_profile is not None:
                raise ValueError(
                    "## SCHEDULE table must define exactly one DEFAULT row"
                )
            if any(
                value is None
                for value in (
                    study_start,
                    study_end,
                    lunch_start,
                    lunch_end,
                    workout_start,
                )
            ):
                raise ValueError(
                    f"PROTOCOL.md line {idx + 1}: DEFAULT row must set all schedule fields"
                )
            assert study_start is not None
            assert study_end is not None
            assert lunch_start is not None
            assert lunch_end is not None
            assert workout_start is not None
            default_profile = DayScheduleProfile(
                study_start=study_start,
                study_end=study_end,
                lunch_start=lunch_start,
                lunch_end=lunch_end,
                workout_start=workout_start,
            )
            continue

        if all(
            value is None
            for value in (
                override.study_start,
                override.study_end,
                override.lunch_start,
                override.lunch_end,
                override.workout_start,
            )
        ):
            raise ValueError(
                f"PROTOCOL.md line {idx + 1}: override rows must set at least one field"
            )

        if kind == "weekday":
            weekdays = cast(tuple[Weekday, ...], selector)
            for weekday in weekdays:
                if weekday in weekday_overrides:
                    raise ValueError(
                        f"PROTOCOL.md line {idx + 1}: duplicate WEEKDAY selector {weekday!r}"
                    )
                weekday_overrides[weekday] = override
            continue

        date_value = cast(datetime.date, selector)
        if date_value in date_overrides:
            raise ValueError(
                f"PROTOCOL.md line {idx + 1}: duplicate DATE selector {date_value.isoformat()!r}"
            )
        date_overrides[date_value] = override

    if row_count == 0:
        raise ValueError("## SCHEDULE table must contain at least one rule row")
    if default_profile is None:
        raise ValueError("## SCHEDULE table must define one DEFAULT row")
    if default_profile.study_start >= default_profile.study_end:
        raise ValueError("DEFAULT row must satisfy STUDY_START < STUDY_END")
    if default_profile.lunch_start >= default_profile.lunch_end:
        raise ValueError("DEFAULT row must satisfy LUNCH_START < LUNCH_END")

    return ScheduleRules(
        default_profile=default_profile,
        weekday_overrides=weekday_overrides,
        date_overrides=date_overrides,
    )
