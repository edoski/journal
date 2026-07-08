from __future__ import annotations

from sync.writers.charts import (
    TEST_CHART,
    TrainingBlockRowsSpec,
    TrainingCalendarColumn,
    TrainingCalendarColumnsSpec,
    TrainingCalendarMonth,
    TrainingCalendarQuarter,
    VerticalBarSpec,
    WeeklyTrainingGridSpec,
    render_chart,
)


def test_vertical_bar_chart_renders_fenced_chart():
    lines = render_chart(
        VerticalBarSpec(
            labels=("MON", "TUE"),
            values=(60.0, 120.0),
            value_labels=("1h", "2h"),
            profile=TEST_CHART,
        )
    )

    assert lines[0] == "```"
    assert lines[-1] == "```"
    assert any("MON" in line for line in lines)
    assert any("TUE" in line for line in lines)


def test_weekly_training_grid_renders_current_marker():
    lines = render_chart(
        WeeklyTrainingGridSpec(
            workout_symbols=("░░░", "███", "░░░", "░░░", "░░░", "░░░", "░░░"),
            stretch_symbols=("░░░", "░░░", "███", "░░░", "░░░", "░░░", "░░░"),
            workout_count=1,
            stretch_count=1,
            current_index=1,
        )
    )

    assert lines[4] == "│          ─── ─── ─── ─── ─── ─── ───"
    assert lines[5] == "└          MON TUE WED THU FRI SAT SUN"


def test_training_block_rows_renders_counts_without_full_study_day_specs():
    lines = render_chart(
        TrainingBlockRowsSpec(
            labels=("STRETCH", "WORKOUT"),
            counts=((2, 7), (3, 7)),
            bar_width=5,
        )
    )

    text = "\n".join(lines)
    assert "STRETCH" in text
    assert "02/07" in text
    assert "WORKOUT" in text
    assert "03/07" in text


def test_training_calendar_columns_render_month_strips_side_by_side():
    lines = render_chart(
        TrainingCalendarColumnsSpec(
            columns=(
                TrainingCalendarColumn(
                    title="WORKOUT",
                    total_done=115,
                    total_elapsed=189,
                    quarters=(
                        TrainingCalendarQuarter(
                            label="Q1",
                            done=78,
                            elapsed=90,
                            delta_label="+55%",
                            months=(
                                TrainingCalendarMonth(
                                    label="JAN",
                                    symbols="█" * 24 + "·" * 7,
                                    done=24,
                                    elapsed=31,
                                ),
                                TrainingCalendarMonth(
                                    label="FEB",
                                    symbols="█" * 24 + "·" * 4,
                                    done=24,
                                    elapsed=28,
                                ),
                            ),
                        ),
                    ),
                ),
                TrainingCalendarColumn(
                    title="STRETCH",
                    total_done=97,
                    total_elapsed=189,
                    quarters=(
                        TrainingCalendarQuarter(
                            label="Q1",
                            done=80,
                            elapsed=90,
                            delta_label="+76%",
                            months=(
                                TrainingCalendarMonth(
                                    label="JAN",
                                    symbols="█" * 26 + "·" * 5,
                                    done=26,
                                    elapsed=31,
                                ),
                                TrainingCalendarMonth(
                                    label="FEB",
                                    symbols="█" * 25 + "·" * 3,
                                    done=25,
                                    elapsed=28,
                                ),
                            ),
                        ),
                    ),
                ),
            )
        )
    )

    assert lines == [
        "```",
        "WORKOUT (115/189)                                STRETCH (97/189)",
        "─────────────────────────────────────────────    ─────────────────────────────────────────────",
        "┌ Q1 (78/90) +55%                                ┌ Q1 (80/90) +76%",
        "│ JAN ████████████████████████······· (24/31)    │ JAN ██████████████████████████····· (26/31)",
        "│ FEB ████████████████████████····    (24/28)    │ FEB █████████████████████████···    (25/28)",
        "```",
    ]
