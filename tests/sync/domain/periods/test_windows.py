"""Period window anchor policy."""

from datetime import date

from sync.periods.windows import resolve_month_window, resolve_week_window


def test_current_periods_use_execution_date_as_target_and_marker() -> None:
    execution_date = date(2026, 6, 19)

    week = resolve_week_window(execution_date, execution_date=execution_date)
    month = resolve_month_window(2026, 6, execution_date=execution_date)

    assert (week.target_date, week.current_date) == (
        execution_date,
        execution_date,
    )
    assert (month.target_date, month.current_date) == (
        execution_date,
        execution_date,
    )


def test_historical_periods_use_period_end_without_current_marker() -> None:
    execution_date = date(2026, 7, 8)

    week = resolve_week_window(date(2026, 6, 29), execution_date=execution_date)
    month = resolve_month_window(2026, 6, execution_date=execution_date)

    assert (week.target_date, week.current_date) == (date(2026, 7, 5), None)
    assert (month.target_date, month.current_date) == (date(2026, 6, 30), None)
