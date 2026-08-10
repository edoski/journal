"""Book note and Kindle annotation command handlers."""

from __future__ import annotations

import argparse
import datetime
import os
import re
from collections import OrderedDict
from pathlib import Path

from sync.contracts.media import BookAnnotation
from sync.notes.markdown import normalize_header
from sync.notes.markdown_tables import escape_markdown_cell
from sync.readers.frontmatter import parse_frontmatter
from sync.readers.kindle_annotations import parse_kindle_notebook_html
from sync.writers.tables import SimpleGridTableSpec, render_table

from .media_common import (
    BOOK_FRONTMATTER_KEYS,
    BOOK_TEMPLATE_FILENAME,
    HIGHLIGHTS_SECTION_TITLE,
    REFLECTIONS_PLACEHOLDER,
    REFLECTIONS_SECTION_TITLE,
    MediaCommandDeps,
    default_media_command_deps,
)

_TITLE_KEY_RE = re.compile(r"[^0-9a-z]+")
_TEMPLATER_EXPR_RE = re.compile(r"<%.*%>")


def _book_template_path(*, deps: MediaCommandDeps | None = None) -> str:
    resolved = deps or default_media_command_deps()
    return os.path.join(
        resolved.paths.vault_dir,
        "notes",
        "templates",
        BOOK_TEMPLATE_FILENAME,
    )


def _frontmatter_end_index(lines: list[str]) -> int:
    if not lines or lines[0].strip() != "---":
        return -1
    for idx in range(1, len(lines)):
        if lines[idx].strip() == "---":
            return idx
    return -1


def _normalize_title_key(value: str) -> str:
    return " ".join(_TITLE_KEY_RE.sub(" ", value.casefold()).split())


def _render_frontmatter_block(
    lines: list[str],
    values: OrderedDict[str, str],
) -> list[str]:
    frontmatter_end = _frontmatter_end_index(lines)
    body = lines[frontmatter_end + 1 :] if frontmatter_end != -1 else list(lines)
    while body and body[0].strip() == "":
        body = body[1:]

    rendered = [
        "---",
        *[(f"{key}: {value}" if value else f"{key}:") for key, value in values.items()],
        "---",
    ]
    if body:
        rendered.append("")
        rendered.extend(body)
    return rendered


def _normalize_book_frontmatter(
    lines: list[str],
    *,
    author: str | None,
    completed_day: datetime.date,
) -> list[str]:
    existing = parse_frontmatter(lines)
    values: OrderedDict[str, str] = OrderedDict(
        (key, existing.get(key, "")) for key in BOOK_FRONTMATTER_KEYS
    )
    for key, value in existing.items():
        if key not in values:
            values[key] = value

    if not values["author"] and author:
        values["author"] = author
    if not values["completed"] or _TEMPLATER_EXPR_RE.search(values["completed"]):
        values["completed"] = completed_day.isoformat()

    return _render_frontmatter_block(lines, values)


def _select_target_annotations(
    target_title: str,
    export_book_title: str,
    annotations: list[BookAnnotation],
) -> list[BookAnnotation]:
    target_key = _normalize_title_key(target_title)
    if not target_key or _normalize_title_key(export_book_title) == target_key:
        return annotations

    matches = [
        annotation
        for annotation in annotations
        if annotation.work_title is not None
        and _normalize_title_key(annotation.work_title) == target_key
    ]
    if matches:
        return matches

    available_titles = sorted(
        {
            annotation.work_title
            for annotation in annotations
            if annotation.work_title is not None and annotation.work_title.strip()
        },
        key=_normalize_title_key,
    )
    if not available_titles:
        return annotations

    available = ", ".join(available_titles) if available_titles else "(none)"
    raise ValueError(
        f'No annotations matched "{target_title}" in "{export_book_title}". '
        f"Available work titles: {available}"
    )


def _target_work_title(note_path: str, explicit_work_title: str | None) -> str:
    if explicit_work_title is not None and explicit_work_title.strip():
        return explicit_work_title.strip()
    return Path(note_path).stem


def _find_h2_section_bounds(lines: list[str], title: str) -> tuple[int, int]:
    needle = normalize_header(f"## {title}")
    start = -1
    for idx, line in enumerate(lines):
        if normalize_header(line) == needle:
            start = idx
            break
    if start == -1:
        return -1, -1

    end = len(lines)
    for idx in range(start + 1, len(lines)):
        stripped = lines[idx].strip()
        if stripped.startswith("## ") and normalize_header(stripped) != needle:
            end = idx
            break
    return start, end


def _insert_h2_section(
    lines: list[str],
    title: str,
    insert_at: int,
    *,
    body_lines: list[str] | None = None,
) -> None:
    section_lines: list[str] = []
    if insert_at > 0 and lines[insert_at - 1].strip() != "":
        section_lines.append("")
    section_lines.extend([f"## {title}", "---"])
    if body_lines:
        section_lines.append("")
        section_lines.extend(body_lines)
    if insert_at < len(lines) and lines[insert_at].strip() != "":
        section_lines.append("")
    lines[insert_at:insert_at] = section_lines


def _ensure_reflections_highlights_sections(lines: list[str]) -> list[str]:
    updated = list(lines)
    reflections_start, reflections_end = _find_h2_section_bounds(
        updated, REFLECTIONS_SECTION_TITLE
    )
    highlights_start, _ = _find_h2_section_bounds(updated, HIGHLIGHTS_SECTION_TITLE)

    if highlights_start == -1 and reflections_start == -1:
        _insert_h2_section(
            updated,
            REFLECTIONS_SECTION_TITLE,
            len(updated),
            body_lines=[REFLECTIONS_PLACEHOLDER],
        )
        _insert_h2_section(updated, HIGHLIGHTS_SECTION_TITLE, len(updated))
        return updated

    if highlights_start == -1:
        _insert_h2_section(updated, HIGHLIGHTS_SECTION_TITLE, reflections_end)
        return updated

    if reflections_start == -1:
        _insert_h2_section(
            updated,
            REFLECTIONS_SECTION_TITLE,
            highlights_start,
            body_lines=[REFLECTIONS_PLACEHOLDER],
        )
        return updated

    return updated


def _render_book_annotation_tables(
    html_path: str,
    *,
    target_title: str,
) -> tuple[list[str], int, int, str, str]:
    with open(html_path, "r", encoding="utf-8") as handle:
        html = handle.read()

    export = parse_kindle_notebook_html(html)
    annotations = _select_target_annotations(
        target_title,
        export.book_title,
        export.annotations,
    )
    page_rows: list[list[str]] = []
    loc_rows: list[list[str]] = []

    for annotation in annotations:
        row = [f"**{annotation.locator}**", escape_markdown_cell(annotation.quote)]
        if annotation.locator_kind == "page":
            page_rows.append(row)
        else:
            loc_rows.append(row)

    if not page_rows and not loc_rows:
        raise ValueError("No page/location annotation rows were found in HTML export")

    rendered: list[str] = []
    if page_rows:
        rendered.extend(
            render_table(SimpleGridTableSpec(headers=["PAGE", "QUOTE"], rows=page_rows))
        )
    if page_rows and loc_rows:
        rendered.append("")
    if loc_rows:
        rendered.extend(
            render_table(SimpleGridTableSpec(headers=["LOC.", "QUOTE"], rows=loc_rows))
        )

    return rendered, len(page_rows), len(loc_rows), export.book_title, export.author


def _replace_highlights_content(lines: list[str], new_content: list[str]) -> list[str]:
    updated = _ensure_reflections_highlights_sections(lines)
    highlights_start, highlights_end = _find_h2_section_bounds(
        updated, HIGHLIGHTS_SECTION_TITLE
    )
    if highlights_start == -1:
        raise ValueError("Could not resolve ## Highlights section in target note")

    divider_idx = highlights_start + 1
    if divider_idx >= len(updated) or updated[divider_idx].strip() != "---":
        updated.insert(divider_idx, "---")
        highlights_end += 1

    body_start = divider_idx + 1
    replacement = ["", *new_content]
    updated[body_start:highlights_end] = replacement
    return updated


def cmd_media_book_annotations_import(
    args: argparse.Namespace,
    *,
    deps: MediaCommandDeps | None = None,
) -> int:
    resolved = deps or default_media_command_deps()
    html_path = args.html_path
    note_path = args.note
    target_title = _target_work_title(note_path, getattr(args, "work", None))
    template_path = _book_template_path(deps=resolved)

    if not os.path.isabs(html_path):
        print(f"Error: HTML path must be absolute: {html_path}")
        return 1
    if not os.path.isabs(note_path):
        print(f"Error: note path must be absolute: {note_path}")
        return 1
    if not os.path.isfile(html_path):
        print(f"Error: HTML file not found: {html_path}")
        return 1
    if not os.path.isfile(note_path) and not os.path.isfile(template_path):
        print(f"Error: required book template not found: {template_path}")
        return 1

    try:
        (
            table_lines,
            page_count,
            loc_count,
            book_title,
            author,
        ) = _render_book_annotation_tables(
            html_path,
            target_title=target_title,
        )
    except ValueError as exc:
        print(f"Error: {exc}")
        return 1
    except OSError as exc:
        print(f"Error: failed to read HTML file: {exc}")
        return 1

    try:

        def update_note(existing_lines: list[str] | None) -> list[str]:
            if existing_lines is None:
                raise OSError(f"failed to read target note: {note_path}")
            normalized_lines = _normalize_book_frontmatter(
                existing_lines,
                author=author or None,
                completed_day=resolved.today(),
            )
            return _replace_highlights_content(normalized_lines, table_lines)

        resolved.note_store.update(
            note_path,
            update_note,
            template_path=template_path,
        )
    except TimeoutError as exc:
        print(f"Error: could not lock note for write: {exc}")
        return 1
    except OSError as exc:
        print(f"Error: failed to write target note: {exc}")
        return 1

    try:
        os.remove(html_path)
    except OSError as exc:
        print(f"Error: imported note but failed to delete source HTML: {exc}")
        return 1

    print("Imported Kindle annotations:")
    print(f"  Path: {note_path}")
    print(f"  Book: {target_title}")
    if book_title and _normalize_title_key(book_title) != _normalize_title_key(
        target_title
    ):
        print(f"  Source: {book_title}")
    print(f"  Rows: {page_count + loc_count} (PAGE: {page_count}, LOC.: {loc_count})")
    return 0
