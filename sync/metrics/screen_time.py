"""Screen-time post-aggregation helpers for period metrics."""

from __future__ import annotations


def group_screen_time_by_percent(
    totals: dict[str, float],
    percent_threshold: float = 0.05,
) -> dict[str, float]:
    """
    Re-group aggregated screen time totals by percentage threshold.

    Apps <= percent_threshold get merged into Miscellaneous.
    Used for periodic notes to avoid cluttering charts with small apps.
    """
    if not totals:
        return {}

    total = sum(totals.values())
    if total == 0:
        return totals

    result: dict[str, float] = {}
    misc_total = 0.0
    misc_label = "Miscellaneous"

    for app, minutes in totals.items():
        pct = minutes / total
        if pct > percent_threshold:
            result[app] = minutes
        else:
            misc_total += minutes

    if misc_total > 0:
        result[misc_label] = result.get(misc_label, 0) + misc_total

    return result
