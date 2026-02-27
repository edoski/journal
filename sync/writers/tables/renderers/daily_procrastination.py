"""Renderer for daily procrastination section table."""

from __future__ import annotations

from sync.formatting import format_minutes, round_half_up

from ..layout import render_simple_grid_table
from ..specs import DailyProcrastinationTableSpec


def _allocate_weighted_minutes(
    weighted_rows: list[tuple[str, float]],
    target_minutes: int,
) -> list[tuple[str, int]]:
    """Allocate integer minutes across rows proportionally and deterministically."""
    if not weighted_rows:
        return []
    if target_minutes <= 0:
        return [(name, 0) for name, _ in weighted_rows]

    clamped_rows = [(name, max(0.0, float(minutes))) for name, minutes in weighted_rows]
    total_weight = sum(minutes for _, minutes in clamped_rows)
    if total_weight <= 0:
        return [(name, 0) for name, _ in clamped_rows]

    bases: list[int] = []
    remainders: list[float] = []
    for _, minutes in clamped_rows:
        raw = (minutes / total_weight) * target_minutes
        base = int(raw)
        bases.append(base)
        remainders.append(raw - base)

    remainder_budget = target_minutes - sum(bases)
    if remainder_budget > 0:
        ranked = sorted(
            range(len(clamped_rows)),
            key=lambda idx: (
                -remainders[idx],
                -clamped_rows[idx][1],
                clamped_rows[idx][0],
            ),
        )
        for idx in ranked[:remainder_budget]:
            bases[idx] += 1

    return [(clamped_rows[idx][0], bases[idx]) for idx in range(len(clamped_rows))]


def render_daily_procrastination(spec: DailyProcrastinationTableSpec) -> list[str]:
    """Render daily procrastination section lines."""
    lines: list[str] = []
    if spec.include_section_title:
        lines.append("### **PROCRASTINATION**")

    screen_time_data = spec.screen_time_data
    deviation_data = spec.deviation_data

    if not screen_time_data:
        lines.append("")
        lines.append("_No screen time data available._")
        return lines

    raw_screen_rows = [
        (entry.app, max(0.0, float(entry.minutes)))
        for entry in screen_time_data.entries
    ]
    total_deviation = max(0.0, deviation_data.total_minutes if deviation_data else 0.0)
    screen_total = sum(minutes for _, minutes in raw_screen_rows)
    non_phone_deviation = max(0.0, total_deviation - screen_total)
    raw_total = screen_total + non_phone_deviation

    cap = (
        max(0.0, float(spec.max_total_minutes))
        if spec.max_total_minutes is not None
        else None
    )
    capped_total = min(raw_total, cap) if cap is not None else raw_total

    # Screen time keeps precedence over non-phone deviations under a cap.
    capped_screen_total = min(screen_total, capped_total)

    display_total = max(0, round_half_up(capped_total))
    display_screen_total = min(
        display_total, max(0, round_half_up(capped_screen_total))
    )
    display_non_phone = max(0, display_total - display_screen_total)

    if not screen_time_data.entries and display_non_phone == 0:
        lines.append("")
        lines.extend(
            render_simple_grid_table(
                headers=["SOURCE      ", "DURATION    "],
                rows=[["**TOTAL**", "**`+0m`**"]],
                divider_cells=["-----------", "-----------"],
            )
        )
        return lines

    rows: list[list[str]] = []
    sortable_rows = _allocate_weighted_minutes(raw_screen_rows, display_screen_total)

    if display_non_phone > 0:
        sortable_rows.append(("DEVIATIONS", display_non_phone))

    sortable_rows.sort(key=lambda item: item[1], reverse=True)

    for name, minutes in sortable_rows:
        rows.append([name, f"`+{format_minutes(minutes)}`"])

    rows.append(["**TOTAL**", f"**`{format_minutes(display_total)}`**"])

    lines.append("")
    lines.extend(
        render_simple_grid_table(
            headers=["SOURCE      ", "DURATION    "],
            rows=rows,
            divider_cells=["-----------", "-----------"],
        )
    )
    return lines
