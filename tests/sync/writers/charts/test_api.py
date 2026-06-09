from __future__ import annotations

from sync.writers.charts import (
    TEST_CHART,
    TrainingBlockRowsSpec,
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
            meditation_symbols=("■", "·", "·"),
            workout_symbols=("·", "■", "·"),
            stretch_symbols=("·", "·", "■"),
            meditation_count=1,
            workout_count=1,
            stretch_count=1,
            current_index=1,
        )
    )

    text = "\n".join(lines)
    assert "MEDITATION" in text
    assert "WORKOUT" in text
    assert "STRETCH" in text


def test_training_block_rows_renders_counts_without_full_study_day_specs():
    lines = render_chart(
        TrainingBlockRowsSpec(
            labels=("MEDITATION", "WORKOUT"),
            counts=((2, 7), (3, 7)),
            bar_width=5,
        )
    )

    text = "\n".join(lines)
    assert "MEDITATION" in text
    assert "02/07" in text
    assert "WORKOUT" in text
    assert "03/07" in text
