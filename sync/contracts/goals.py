"""Typed contracts for goal section operations."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class GoalSection:
    """Rendered markdown lines for a goals subsection."""

    section: str
    lines: list[str]
