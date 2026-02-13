"""Command palette command definitions and filtering."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Command:
    """Single command palette entry."""

    command_id: str
    title: str
    action: str
    description: str


def default_commands() -> tuple[Command, ...]:
    """Return static command palette entries for the shell."""
    return (
        Command("goto-dashboard", "Go: Dashboard", "goto_dashboard", "Open dashboard"),
        Command("goto-explorer", "Go: Explorer", "goto_explorer", "Open explorer"),
        Command("goto-metric", "Go: Metric Lab", "goto_metric_lab", "Open metric lab"),
        Command(
            "goto-daily-editor",
            "Go: Daily Editor",
            "goto_daily_editor",
            "Open daily source editor",
        ),
        Command(
            "goto-reminders",
            "Go: Reminders",
            "goto_reminders",
            "Open reminders editor",
        ),
        Command("goto-help", "Go: Help", "goto_help", "Open keyboard help"),
        Command(
            "anchor-prev",
            "Anchor: Previous",
            "anchor_prev",
            "Shift anchor backward by current period",
        ),
        Command(
            "anchor-next",
            "Anchor: Next",
            "anchor_next",
            "Shift anchor forward by current period",
        ),
        Command("period-prev", "Period: Previous", "period_prev", "Cycle period left"),
        Command("period-next", "Period: Next", "period_next", "Cycle period right"),
        Command("jump-today", "Jump: Today", "jump_today", "Set anchor date to today"),
        Command("refresh", "Refresh", "refresh", "Invalidate caches and redraw"),
    )


def filter_commands(commands: tuple[Command, ...], query: str) -> list[Command]:
    """Filter commands by case-insensitive substring search."""
    token = query.strip().casefold()
    if not token:
        return list(commands)
    return [
        cmd
        for cmd in commands
        if token in cmd.title.casefold() or token in cmd.description.casefold()
    ]
