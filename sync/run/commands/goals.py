"""Goals command handlers."""

from __future__ import annotations

import argparse
import datetime
from dataclasses import dataclass

from sync.adapters.markdown_goals import MarkdownGoalStore
from sync.adapters.markdown_notes import MarkdownNoteStore
from sync.application.goal_note_gateway import GoalNoteGateway
from sync.contracts.goals import GoalWriteTarget
from sync.goals.targets import GoalPathConfig, GoalPeriod, resolve_goal_write_target


@dataclass(frozen=True)
class GoalCommandConfig(GoalPathConfig):
    """Static filesystem/template configuration for goals commands."""


def _today() -> datetime.date:
    return datetime.date.today()


def _resolve_target(
    period: GoalPeriod,
    *,
    use_next: bool,
    today: datetime.date,
    config: GoalCommandConfig | None = None,
) -> GoalWriteTarget:
    resolved = config or GoalCommandConfig()
    return resolve_goal_write_target(
        period,
        use_next=use_next,
        today=today,
        config=resolved,
    )


def cmd_goals_add(
    args: argparse.Namespace,
    *,
    config: GoalCommandConfig | None = None,
) -> int:
    resolved = config or GoalCommandConfig()
    text = args.text.strip()
    if not text:
        print("Error: goal text cannot be empty.")
        return 1

    use_next = bool(args.next)
    target = _resolve_target(
        args.period,
        use_next=use_next,
        today=_today(),
        config=resolved,
    )
    gateway = GoalNoteGateway(
        note_store=MarkdownNoteStore(),
        goal_store=MarkdownGoalStore(),
    )

    try:
        result = gateway.add_goal(target, text)
        if result.duplicate:
            print(f"No-op: goal already exists in {target.section}.")
            print(f"  Path: {target.note_path}")
            return 0
        goal_id = result.goal_id
    except FileNotFoundError:
        print(f"Error: required template not found: {target.template_path}")
        return 1
    except TimeoutError as exc:
        print(f"Error: could not lock note for write: {exc}")
        return 1
    except OSError as exc:
        print(f"Error: failed to write goal note: {exc}")
        return 1

    if goal_id is None:
        print("Error: failed to assign goal id.")
        return 1

    print("Added goal:")
    print(f"  Path: {target.note_path}")
    print(f"  Section: {target.section}")
    print(f"  Goal ID: {goal_id}")
    return 0
