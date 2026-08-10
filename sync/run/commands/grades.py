"""Grades command handlers."""

from __future__ import annotations

import argparse
from dataclasses import dataclass

from sync.constants import BSC_GRADES_PATH, MSC_GRADES_PATH
from sync.grades.engine import compute_grades
from sync.io import atomic_write_note, safe_read_file
from sync.notes.locking import locked_note
from sync.readers.grades import parse_grades_lines
from sync.writers.grades import render_grades_note


@dataclass(frozen=True)
class GradesCommandConfig:
    """Filesystem configuration for grades commands."""

    bsc_grades_path: str = BSC_GRADES_PATH
    msc_grades_path: str = MSC_GRADES_PATH


def cmd_grades_sync(
    args: argparse.Namespace,
    *,
    config: GradesCommandConfig | None = None,
) -> int:
    resolved = config or GradesCommandConfig()
    path = {
        "bsc": resolved.bsc_grades_path,
        "msc": resolved.msc_grades_path,
    }[args.degree]
    lines = safe_read_file(path)
    if lines is None:
        print(f"Error: Required grades note not found: {path}")
        return 1
    try:
        document = parse_grades_lines(lines)
    except ValueError as exc:
        print(f"Error: Invalid grades note at {path}: {exc}")
        return 1

    computed = compute_grades(document, status_bonus=0)
    rendered = render_grades_note(document, computed)

    try:
        with locked_note(path):
            atomic_write_note(path, rendered)
    except TimeoutError as exc:
        print(f"Error: could not lock note for write: {exc}")
        return 1
    except OSError as exc:
        print(f"Error: failed to write grades note: {exc}")
        return 1

    print("Updated grades note:")
    print(f"  Path: {path}")
    if computed.final_grade is not None:
        print(f"  Final: {computed.final_grade}")
    return 0
