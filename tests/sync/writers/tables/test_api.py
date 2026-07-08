from __future__ import annotations

from sync.writers.tables import (
    SimpleGridTableSpec,
    SummaryMetricsTableSpec,
    render_table,
)


def test_simple_grid_table_renders_headers_and_rows():
    assert render_table(
        SimpleGridTableSpec(
            headers=("A", "B"),
            rows=(("one", "two"),),
        )
    ) == [
        "| A | B |",
        "| ---- | ---- |",
        "| one | two |",
    ]


def test_summary_table_omits_change_column():
    lines = render_table(
        SummaryMetricsTableSpec(
            current_metrics={
                "study_total_minutes": 420.0,
                "sleep_avg_minutes": 480.0,
                "workout_count": 1,
                "stretch_count": 3,
                "days_up_to_today": 7,
                "total_days": 7,
            },
            previous_metrics={
                "study_total_minutes": 210.0,
                "sleep_avg_minutes": 420.0,
                "workout_count": 1,
                "stretch_count": 2,
                "days_up_to_today": 7,
                "total_days": 7,
            },
            current_label="CURRENT",
            previous_label="PREVIOUS",
        )
    )

    assert lines[2] == "| METRIC | CURRENT | PREVIOUS |"
    assert any(line.startswith("| **STUDY** |") for line in lines)
    assert "| **SLEEP** | `8h00m` | `7h00m` |" in lines


def test_summary_table_ma_column_only_adds_moving_average():
    lines = render_table(
        SummaryMetricsTableSpec(
            current_metrics={
                "study_total_minutes": 420.0,
                "sleep_avg_minutes": 480.0,
                "workout_count": 1,
                "stretch_count": 3,
                "days_up_to_today": 7,
                "total_days": 7,
            },
            previous_metrics={
                "study_total_minutes": 210.0,
                "sleep_avg_minutes": 420.0,
                "workout_count": 1,
                "stretch_count": 2,
                "days_up_to_today": 7,
                "total_days": 7,
            },
            current_label="CURRENT",
            previous_label="PREVIOUS",
            ma_label="4-WEEK",
            ma_metrics={
                "study_avg_minutes": 60.0,
                "sleep_avg_minutes": 450.0,
                "workout_avg": 1.0,
                "stretch_avg": 2.0,
            },
        )
    )

    assert lines[2] == "| METRIC | CURRENT | PREVIOUS | 4-WEEK |"
    assert "| **SLEEP** | `8h00m` | `7h00m` | `7h30m` |" in lines
