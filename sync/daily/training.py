"""
Training section building for daily sync.

Consumes canonical training entries and renders/caches the TRAINING table.
"""

from __future__ import annotations

from collections import OrderedDict

from sync.contracts.cache import DailyTrainingCacheRow
from sync.formatting import format_minutes_seconds
from sync.contracts.status import TrainingEntryPayload, TrainingStatus
from sync.ports.cache import DailyTrainingCacheStore
from sync.writers.tables import SimpleGridTableSpec, render_table

# Internal table row shape persisted in cache and used for rendering.
TrainingTableRow = DailyTrainingCacheRow


def _parse_time_to_minutes(time_str: str) -> int | None:
    """Parse HH:MM time string to minutes since midnight."""
    try:
        h, m = map(int, time_str.split(":"))
        return h * 60 + m
    except (ValueError, AttributeError):
        return None


def _load_training_cache(
    date_str: str,
    cache_store: DailyTrainingCacheStore,
) -> list[TrainingTableRow]:
    entries = cache_store.load_for_date(date_str)
    return entries if isinstance(entries, list) else []


def _save_training_cache(
    date_str: str,
    entries: list[TrainingTableRow],
    cache_store: DailyTrainingCacheStore,
) -> None:
    cache_store.save_for_date(date_str, entries)


def _rows_from_canonical_entries(
    entries: tuple[TrainingEntryPayload, ...],
) -> list[TrainingTableRow]:
    rows: list[TrainingTableRow] = []
    for entry in entries:
        start_raw = (entry.start or "").strip()
        end_raw = (entry.end or "").strip()
        duration_minutes = float(entry.duration or 0.0)
        duration_fmt = (
            format_minutes_seconds(duration_minutes) if duration_minutes > 0 else ""
        )

        interrupt_minutes = 0.0
        if start_raw and end_raw and duration_minutes > 0:
            start_minutes = _parse_time_to_minutes(start_raw)
            end_minutes = _parse_time_to_minutes(end_raw)
            if start_minutes is not None and end_minutes is not None:
                if end_minutes < start_minutes:
                    end_minutes += 24 * 60
                elapsed_minutes = end_minutes - start_minutes
                interrupt_minutes = max(0.0, elapsed_minutes - duration_minutes)

        if start_raw and end_raw:
            time_raw = f"{start_raw} - {end_raw}"
        else:
            time_raw = start_raw or ""

        rows.append(
            {
                "start": start_raw or None,
                "end": end_raw or None,
                "time_raw": time_raw,
                "activity": entry.type,
                "duration": duration_fmt,
                "interrupt": interrupt_minutes,
            }
        )
    return rows


def _merge_training_rows(
    existing: list[TrainingTableRow],
    new: list[TrainingTableRow],
) -> list[TrainingTableRow]:
    merged: OrderedDict[tuple[str, str, str, str], TrainingTableRow] = OrderedDict()

    def key(entry: TrainingTableRow) -> tuple[str, str, str, str]:
        return (
            entry.get("start") or "",
            entry.get("end") or "",
            (entry.get("activity") or "").strip().lower(),
            entry.get("duration") or "",
        )

    for entry in existing:
        merged[key(entry)] = entry
    for entry in new:
        merged[key(entry)] = entry
    return list(merged.values())


def _render_training_rows(entries: list[TrainingTableRow]) -> list[str]:
    if not entries:
        return []

    def sort_key(entry: TrainingTableRow) -> tuple[int, str]:
        mins = _parse_time_to_minutes(entry.get("start") or "")
        return (
            mins if mins is not None else (24 * 60 + 1),
            entry.get("activity") or "",
        )

    def format_interrupt(minutes: float) -> str:
        mins = int(round(minutes))
        if mins >= 60:
            hours = mins // 60
            remainder = mins % 60
            return f"`+{hours}h{remainder:02d}m`"
        return f"`+{mins:02d}m`"

    ordered = sorted(entries, key=sort_key)
    rows: list[list[str]] = []
    for entry in ordered:
        if entry.get("start") and entry.get("end"):
            time_cell = f"`{entry['start']} - {entry['end']}`"
        elif entry.get("start"):
            time_cell = f"`{entry['start']}`"
        elif entry.get("time_raw"):
            time_cell = f"`{entry['time_raw']}`"
        else:
            time_cell = ""

        duration_cell = f"`{entry['duration']}`" if entry.get("duration") else ""
        interrupt_val = entry.get("interrupt")
        if isinstance(interrupt_val, (int, float)) and interrupt_val > 0:
            interrupt_cell = format_interrupt(float(interrupt_val))
        elif isinstance(interrupt_val, str) and interrupt_val:
            interrupt_cell = (
                f"`{interrupt_val}`"
                if not interrupt_val.startswith("`")
                else interrupt_val
            )
        else:
            interrupt_cell = "`+00m`"

        rows.append(
            [time_cell, str(entry.get("activity", "")), duration_cell, interrupt_cell]
        )

    return render_table(
        SimpleGridTableSpec(
            headers=["TIME", "ACTIVITY", "DURATION", "INTERRUPT"],
            divider_cells=["----", "--------", "--------", "---------"],
            rows=rows,
        )
    )


def build_training_section(
    training_status: TrainingStatus,
    _existing_block: list[str] | None,
    today_str: str,
    *,
    training_cache_store: DailyTrainingCacheStore,
) -> tuple[list[str], list[TrainingTableRow]]:
    """
    Build TRAINING section lines from canonical training status data.
    """
    new_rows = (
        _rows_from_canonical_entries(training_status.workout_entries)
        + _rows_from_canonical_entries(training_status.stretch_entries)
        + _rows_from_canonical_entries(training_status.meditation_entries)
    )

    cache_rows = _load_training_cache(today_str, training_cache_store)
    merged_rows: list[TrainingTableRow] = []
    if new_rows:
        merged_rows = _merge_training_rows(cache_rows, new_rows)
        _save_training_cache(today_str, merged_rows, training_cache_store)
    elif cache_rows:
        merged_rows = cache_rows

    lines_out = ["### **TRAINING**", ""]
    if merged_rows:
        lines_out.extend(_render_training_rows(merged_rows))
    else:
        lines_out.append("_No training sessions available._")

    return lines_out, merged_rows
