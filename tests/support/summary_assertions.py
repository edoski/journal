"""Policy-derived assertions for rendered SUMMARY tables."""

from __future__ import annotations

from collections.abc import Mapping

from sync.constants import RENDER
from sync.contracts.metrics import PeriodAggregate
from sync.contracts.targets import PeriodType
from sync.formatting import format_progress_bar
from sync.target_policy import summary_targets

from tests.support.markdown_parse import split_markdown_row

_SUMMARY_METRICS = ("STUDY", "SLEEP", "MEDITATION", "WORKOUT", "STRETCH", "MOOD")


def _find_summary_table_start(lines: list[str]) -> int:
    summary_seen = False
    for idx, line in enumerate(lines):
        if line == "### **SUMMARY**":
            summary_seen = True
            continue
        if summary_seen and line.startswith("| METRIC |"):
            return idx
    raise AssertionError("SUMMARY table header not found")


def _summary_rows_by_metric(lines: list[str]) -> dict[str, list[str]]:
    header_idx = _find_summary_table_start(lines)
    header_cells = split_markdown_row(lines[header_idx])
    expected_cells = len(header_cells)

    rows: dict[str, list[str]] = {}
    for idx in range(header_idx + 2, len(lines)):
        row = lines[idx]
        if not row.startswith("| "):
            break
        cells = split_markdown_row(row)
        if len(cells) != expected_cells:
            continue
        metric_cell = cells[0].strip()
        if not metric_cell.startswith("**"):
            continue
        metric = metric_cell.replace("*", "").strip().upper()
        rows[metric] = cells
    return rows


def _expected_target_labels(period_type: PeriodType, total_days: int) -> dict[str, str]:
    targets = summary_targets(period_type, total_days)
    return {
        "STUDY": targets.study_label,
        "SLEEP": targets.sleep_label,
        "MEDITATION": targets.training.meditation_label,
        "WORKOUT": targets.training.workout_label,
        "STRETCH": targets.training.stretch_label,
        "MOOD": targets.mood_label,
    }


def _expected_progress_cells(
    current_metrics: Mapping[str, int | float | None],
    period_type: PeriodType,
    total_days: int,
) -> dict[str, str]:
    _ = period_type
    targets = summary_targets(period_type, total_days)
    current_values = {
        "STUDY": float(current_metrics.get("study_total_minutes") or 0.0),
        "SLEEP": float(current_metrics.get("sleep_avg_minutes") or 0.0),
        "MEDITATION": float(current_metrics.get("meditation_count") or 0.0),
        "WORKOUT": float(current_metrics.get("workout_count") or 0.0),
        "STRETCH": float(current_metrics.get("stretch_count") or 0.0),
        "MOOD": float(current_metrics.get("mood_avg") or 0.0),
    }
    target_values = {
        "STUDY": float(targets.study_minutes),
        "SLEEP": float(targets.sleep_minutes),
        "MEDITATION": float(targets.training.meditation),
        "WORKOUT": float(targets.training.workout),
        "STRETCH": float(targets.training.stretch),
        "MOOD": float(targets.mood),
    }

    progress_cells: dict[str, str] = {}
    for metric in _SUMMARY_METRICS:
        bar, progress_pct = format_progress_bar(
            current_values[metric],
            target_values[metric],
            RENDER.progress_bar_width,
            RENDER.progress_filled,
            RENDER.progress_empty,
        )
        progress_cells[metric] = f"`{bar} {progress_pct}%`"
    return progress_cells


def assert_summary_targets_and_progress(
    lines: list[str],
    *,
    period_type: PeriodType,
    total_days: int,
    current_metrics: PeriodAggregate,
) -> None:
    """Assert SUMMARY target/progress columns against production target policy."""
    rows = _summary_rows_by_metric(lines)
    for metric in _SUMMARY_METRICS:
        if metric not in rows:
            raise AssertionError(f"Missing SUMMARY row for {metric}")

    target_labels = _expected_target_labels(period_type, total_days)
    progress_cells = _expected_progress_cells(
        current_metrics,
        period_type,
        total_days,
    )
    for metric in _SUMMARY_METRICS:
        cells = rows[metric]
        target_cell = cells[-2]
        progress_cell = cells[-1]
        assert target_cell == f"`{target_labels[metric]}`"
        assert progress_cell == progress_cells[metric]
