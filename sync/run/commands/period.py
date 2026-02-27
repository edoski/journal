"""Period command handlers."""

from __future__ import annotations

import argparse

from sync.run import wiring


def cmd_period_all(_args: argparse.Namespace) -> int:
    wiring.run_daily_sync()
    wiring.run_weekly_sync(date_arg=None, no_cleanup=False)
    wiring.run_monthly_sync(month_arg=None, no_cleanup=False)
    wiring.run_quarterly_sync(quarter_arg=None)
    wiring.run_yearly_sync(year_arg=None)
    return 0


def cmd_period_daily(_args: argparse.Namespace) -> int:
    wiring.run_daily_sync()
    return 0


def cmd_period_weekly(args: argparse.Namespace) -> int:
    wiring.run_weekly_sync(date_arg=args.date, no_cleanup=args.no_cleanup)
    return 0


def cmd_period_monthly(args: argparse.Namespace) -> int:
    wiring.run_monthly_sync(month_arg=args.month, no_cleanup=args.no_cleanup)
    return 0


def cmd_period_quarterly(args: argparse.Namespace) -> int:
    wiring.run_quarterly_sync(quarter_arg=args.quarter)
    return 0


def cmd_period_yearly(args: argparse.Namespace) -> int:
    wiring.run_yearly_sync(year_arg=args.year)
    return 0
