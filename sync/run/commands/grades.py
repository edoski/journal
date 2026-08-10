"""Grades command handlers."""

from __future__ import annotations

import argparse
from dataclasses import dataclass, field

from sync.adapters.markdown_notes import MarkdownNoteStore
from sync.constants import BSC_GRADES_PATH, MSC_GRADES_PATH
from sync.contracts.grades import GradesComputation
from sync.grades.engine import compute_grades
from sync.ports.notes import NoteStore
from sync.readers.grades import parse_grades_lines
from sync.writers.grades import render_grades_note


@dataclass(frozen=True)
class GradesCommandConfig:
    """Filesystem configuration for grades commands."""

    bsc_grades_path: str = BSC_GRADES_PATH
    msc_grades_path: str = MSC_GRADES_PATH
    note_store: NoteStore = field(default_factory=MarkdownNoteStore)


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
    computed: GradesComputation | None = None

    def render(lines: list[str] | None) -> list[str]:
        nonlocal computed
        if lines is None:
            raise FileNotFoundError(path)
        document = parse_grades_lines(lines)
        computed = compute_grades(document, status_bonus=0)
        return render_grades_note(document, computed)

    try:
        resolved.note_store.update(path, render)
    except FileNotFoundError:
        print(f"Error: Required grades note not found: {path}")
        return 1
    except ValueError as exc:
        print(f"Error: Invalid grades note at {path}: {exc}")
        return 1
    except TimeoutError as exc:
        print(f"Error: could not lock note for write: {exc}")
        return 1
    except OSError as exc:
        print(f"Error: failed to write grades note: {exc}")
        return 1

    print("Updated grades note:")
    print(f"  Path: {path}")
    assert computed is not None
    if computed.final_grade is not None:
        print(f"  Final: {computed.final_grade}")
    return 0
