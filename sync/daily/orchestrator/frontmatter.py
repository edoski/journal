"""Frontmatter update helpers for daily note orchestration."""

from __future__ import annotations

from collections import OrderedDict

from sync.contracts.status import SleepPayload


def _sleep_minutes_from_payload(sleep_data: SleepPayload) -> float:
    return float(sleep_data.sleep_min)


def update_frontmatter(
    final_lines: list[str],
    study_str: str,
    workout_done: bool,
    stretch_done: bool,
    sleep_data: SleepPayload | None,
) -> tuple[list[str], dict[str, str]]:
    """
    Update YAML frontmatter in final_lines with study time and status flags.

    Args:
        final_lines: Lines of the note (modified in place and returned)
        study_str: Formatted study time string
        workout_done: Whether workout was completed
        stretch_done: Whether stretch was completed
        sleep_data: Sleep data dict or None

    Returns:
        Tuple of (updated lines, dict of changed metrics {key: new_value})
    """
    changes: dict[str, str] = {}

    first_dash_idx = -1
    second_dash_idx = -1
    for i, line in enumerate(final_lines):
        if line.strip() == "---":
            if first_dash_idx == -1:
                first_dash_idx = i
            elif second_dash_idx == -1:
                second_dash_idx = i
                break

    if (
        first_dash_idx == -1
        or second_dash_idx == -1
        or second_dash_idx <= first_dash_idx
    ):
        return final_lines, changes

    fm_lines = final_lines[first_dash_idx + 1 : second_dash_idx]

    # Parse frontmatter preserving order
    fm_data: OrderedDict[str, str] = OrderedDict()
    fm_order: list[str] = []
    for line in fm_lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if ":" not in stripped:
            continue
        key, value = stripped.split(":", 1)
        key = key.strip()
        value = value.strip()
        if key not in fm_order:
            fm_order.append(key)
        fm_data[key] = value

    def set_value(key: str, value: str) -> None:
        old_value = fm_data.get(key, "")
        if old_value != value:
            changes[key] = value
        if key not in fm_order:
            fm_order.append(key)
        fm_data[key] = value

    set_value("study", study_str)

    if workout_done:
        set_value("workout", "true")
    else:
        current = fm_data.get("workout", "")
        set_value("workout", current if current else "false")

    if stretch_done:
        set_value("stretch", "true")
    else:
        current = fm_data.get("stretch", "")
        set_value("stretch", current if current else "false")

    if sleep_data is not None:
        total_min = _sleep_minutes_from_payload(sleep_data)
        hours = int(total_min) // 60
        mins = int(total_min) % 60
        sleep_str = f"{hours}h{mins:02d}m" if mins else f"{hours}h"
        set_value("sleep", sleep_str)

    # Enforce canonical order: study, sleep, workout, stretch, then rest
    canonical_order = ["study", "sleep", "workout", "stretch"]
    ordered_keys = [k for k in canonical_order if k in fm_order]
    ordered_keys += [k for k in fm_order if k not in canonical_order]
    new_fm_lines = [f"{key}: {fm_data.get(key, '')}".rstrip() for key in ordered_keys]
    return (
        final_lines[: first_dash_idx + 1]
        + new_fm_lines
        + final_lines[second_dash_idx:],
        changes,
    )
