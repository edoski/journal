"""Progress-row chart renderers."""

from __future__ import annotations

from sync.constants import RENDER
from sync.formatting import round_half_up

from ..specs import (
    QuarterlyStudyCoverageRowsSpec,
    TrainingBlockRowsSpec,
    TrainingSectionsRowsSpec,
    YearlyStudyCoverageRowsSpec,
)


def _render_training_rows(
    *,
    labels: list[str],
    counts: list[tuple[int, int]],
    delta_labels: list[str],
    bar_width: int,
    bars_override: list[str] | None,
    fill_char: str,
    empty_char: str,
) -> list[str]:
    """Render rows in label + bar + count + delta layout."""
    if len(labels) != len(counts):
        raise ValueError("labels and counts must have the same length")
    if bars_override is not None and len(bars_override) != len(counts):
        raise ValueError("bars_override and counts must have the same length")
    if not labels:
        return []

    lines: list[str] = []
    max_label_len = max(len(label) for label in labels)
    count_strs = [
        f"({done:02d}/{elapsed:02d})" if elapsed else "(00/00)"
        for done, elapsed in counts
    ]
    max_count_len = max(len(text) for text in count_strs)
    bars: list[str] = []

    for idx, (done, elapsed) in enumerate(counts):
        if bars_override is not None:
            bar = bars_override[idx]
        else:
            elapsed = max(elapsed, 0)
            done = max(0, min(done, elapsed))
            bar_len = round_half_up((done / elapsed) * bar_width) if elapsed > 0 else 0
            bar_len = min(bar_width, max(0, bar_len))
            bar = fill_char * bar_len + empty_char * (bar_width - bar_len)
        bars.append(bar)

    max_bar_len = max(len(bar) for bar in bars)

    for idx, label in enumerate(labels):
        bar = bars[idx]
        count_str = count_strs[idx].rjust(max_count_len)
        delta = delta_labels[idx] if idx < len(delta_labels) else ""
        delta_str = delta.rjust(4) if delta else ""

        line = f"│ {label.ljust(max_label_len)} {bar.ljust(max_bar_len)}"
        if count_str:
            line += f" {count_str}"
        if delta_str:
            line += f"   {delta_str}"
        lines.append(line)

    return lines


def render_training_block_rows(spec: TrainingBlockRowsSpec) -> list[str]:
    """Render rows in compact training-block mode."""
    labels = list(spec.labels)
    counts = list(spec.counts)
    delta_labels = list(spec.delta_labels or [])
    bars_override = list(spec.bars_override) if spec.bars_override is not None else None
    return _render_training_rows(
        labels=labels,
        counts=counts,
        delta_labels=delta_labels,
        bar_width=spec.bar_width,
        bars_override=bars_override,
        fill_char=spec.fill_char,
        empty_char=spec.empty_char,
    )


def render_training_sections_rows(spec: TrainingSectionsRowsSpec) -> list[str]:
    """Render multi-section training rows body."""
    sections = list(spec.sections)
    lines: list[str] = []
    for idx, section in enumerate(sections):
        lines.append(
            f"┌ {section.title} ({section.total_done:02d}/{section.total_elapsed:02d})"
        )
        lines.append("│")
        lines.extend(
            _render_training_rows(
                labels=list(section.labels),
                counts=list(section.counts),
                delta_labels=list(section.delta_labels or []),
                bar_width=section.bar_width,
                bars_override=list(section.bars_override)
                if section.bars_override is not None
                else None,
                fill_char=section.fill_char,
                empty_char=section.empty_char,
            )
        )
        lines.append("└")
        if idx < len(sections) - 1:
            lines.append("")
    return lines


def render_quarterly_study_coverage_rows(
    spec: QuarterlyStudyCoverageRowsSpec,
) -> list[str]:
    """Render quarterly study-coverage rows body."""
    rows = list(spec.rows)

    lines: list[str] = []

    if not rows:
        return ["┌ FULL STUDY DAYS (00/00)", "│", "└", "", RENDER.study_legend]

    max_bar_len = max(len(row.bar) for row in rows)

    header = (
        f"┌ FULL STUDY DAYS ({spec.total_done:02d}/{spec.total_elapsed:02d})"
        if spec.total_elapsed
        else "┌ FULL STUDY DAYS (00/00)"
    )
    lines.append(header)
    lines.append("│")

    for row in rows:
        count_str = f"({row.done:02d}/{row.elapsed:02d})" if row.elapsed else "(00/00)"
        pad_between = (max_bar_len - len(row.bar)) + 1
        delta = row.delta_label
        delta_str = delta.rjust(4) if delta else ""
        line = f"│ {row.label} {row.bar}{' ' * pad_between}{count_str}"
        if delta_str:
            line += f"   {delta_str}"
        lines.append(line)

    lines.append("└")
    lines.append("")
    lines.append(RENDER.study_legend)
    return lines


def render_yearly_study_coverage_rows(spec: YearlyStudyCoverageRowsSpec) -> list[str]:
    """Render yearly study-coverage rows body."""
    rows = list(spec.rows)
    legend_line = spec.legend_line or RENDER.study_legend

    lines: list[str] = []

    if not rows:
        return ["┌ FULL STUDY DAYS (00/00)", "│", "└", "", legend_line]

    max_bar_len = max(len(row.bar) for row in rows)

    header = f"┌ FULL STUDY DAYS ({spec.total_done:02d}/{spec.total_elapsed:02d})"
    lines.append(header)
    lines.append("│")

    for row in rows:
        count_str = f"({row.done:02d}/{row.elapsed:02d})" if row.elapsed else "(00/00)"
        pad_between = (max_bar_len - len(row.bar)) + 1
        delta = row.delta_label
        delta_str = delta.rjust(4) if delta else ""
        line = f"│ {row.label} {row.bar}{' ' * pad_between}{count_str}"
        if delta_str:
            line += f"   {delta_str}"
        lines.append(line)

    lines.append("└")
    lines.append("")
    lines.append(legend_line)
    return lines
