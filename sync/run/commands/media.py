"""Media command handlers."""

from __future__ import annotations

import argparse
import datetime
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request

from sync.adapters.json_media_cache import JsonMediaDateCacheStore
from sync.config import PATHS
from sync.io import atomic_write_note, safe_read_file
from sync.log import get_logger
from sync.notes.locking import locked_note
from sync.notes.markdown import normalize_header
from sync.notes.markdown_tables import escape_markdown_cell
from sync.readers.kindle_annotations import parse_kindle_notebook_html
from sync.writers.tables import SimpleGridTableSpec, render_table

YOUTUBE_OEMBED_ENDPOINT = "https://www.youtube.com/oembed"
PODCAST_TEMPLATE_FILENAME = "podcast.md"
HIGHLIGHTS_SECTION_TITLE = "Highlights"
REFLECTIONS_SECTION_TITLE = "Reflections"

logger = get_logger(__name__)


def _parse_iso_day(value: str) -> datetime.date:
    try:
        return datetime.datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError as exc:
        raise ValueError("Date must be in format YYYY-MM-DD") from exc


def _fetch_youtube_oembed_metadata(url: str) -> tuple[str | None, str | None]:
    query = urllib.parse.urlencode({"url": url, "format": "json"})
    endpoint = f"{YOUTUBE_OEMBED_ENDPOINT}?{query}"
    request = urllib.request.Request(endpoint)
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            payload = json.load(response)
    except (
        urllib.error.URLError,
        TimeoutError,
        OSError,
        ValueError,
        json.JSONDecodeError,
    ) as exc:
        logger.warning("Failed to fetch YouTube metadata: %s", exc)
        return None, None

    if not isinstance(payload, dict):
        logger.warning("Failed to fetch YouTube metadata: invalid payload type")
        return None, None

    title_value = payload.get("title")
    host_value = payload.get("author_name")
    title = title_value.strip() if isinstance(title_value, str) else None
    host = host_value.strip() if isinstance(host_value, str) else None
    return title or None, host or None


def _sanitize_podcast_title(raw_title: str) -> str:
    value = raw_title.strip()
    value = value.replace(":", " - ")
    value = value.replace("/", "-")
    value = value.replace("\\", "-")
    value = re.sub(r'[<>"|?*\x00-\x1f]', "", value)
    value = re.sub(r"\s+", " ", value)
    value = value.strip().rstrip(".").strip()
    if not value:
        raise ValueError("Could not derive a valid filename from title")
    return value


def _podcast_template_path() -> str:
    return os.path.join(
        PATHS.vault_dir, "notes", "templates", PODCAST_TEMPLATE_FILENAME
    )


def _apply_frontmatter_value(lines: list[str], key: str, value: str) -> list[str]:
    if not lines or lines[0].strip() != "---":
        frontmatter = ["---", f"{key}: {value}", "---"]
        if lines and lines[0].strip():
            frontmatter.append("")
        return frontmatter + lines

    closing_idx = -1
    for idx in range(1, len(lines)):
        if lines[idx].strip() == "---":
            closing_idx = idx
            break

    if closing_idx == -1:
        frontmatter = ["---", f"{key}: {value}", "---"]
        if lines and lines[0].strip():
            frontmatter.append("")
        return frontmatter + lines

    target_prefix = f"{key}:"
    frontmatter_lines = list(lines[1:closing_idx])
    for idx, line in enumerate(frontmatter_lines):
        if line.strip().startswith(target_prefix):
            frontmatter_lines[idx] = f"{key}: {value}"
            return lines[:1] + frontmatter_lines + lines[closing_idx:]

    frontmatter_lines.append(f"{key}: {value}")
    return lines[:1] + frontmatter_lines + lines[closing_idx:]


def _render_podcast_note_lines(
    template_lines: list[str],
    *,
    host: str,
    note_date: datetime.date,
    link: str,
) -> list[str]:
    rendered = list(template_lines)
    rendered = _apply_frontmatter_value(rendered, "host", host)
    rendered = _apply_frontmatter_value(rendered, "date", note_date.isoformat())
    rendered = _apply_frontmatter_value(rendered, "link", link)
    return rendered


def _update_media_cache_for_podcast(title: str, note_date: datetime.date) -> None:
    try:
        cache_store = JsonMediaDateCacheStore()
        cache = cache_store.load()
        books = dict(cache.get("books", {}))
        podcasts = dict(cache.get("podcasts", {}))
        podcasts[title] = note_date.isoformat()
        cache_store.save({"books": books, "podcasts": podcasts})
    except Exception as exc:
        logger.warning("Failed to update media cache for %s: %s", title, exc)


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


def _insert_h2_section(lines: list[str], title: str, insert_at: int) -> None:
    section_lines: list[str] = []
    if insert_at > 0 and lines[insert_at - 1].strip() != "":
        section_lines.append("")
    section_lines.extend([f"## {title}", "---"])
    if insert_at < len(lines) and lines[insert_at].strip() != "":
        section_lines.append("")
    lines[insert_at:insert_at] = section_lines


def _ensure_highlights_reflections_sections(lines: list[str]) -> list[str]:
    updated = list(lines)
    highlights_start, highlights_end = _find_h2_section_bounds(
        updated, HIGHLIGHTS_SECTION_TITLE
    )
    reflections_start, _ = _find_h2_section_bounds(updated, REFLECTIONS_SECTION_TITLE)

    if highlights_start == -1 and reflections_start == -1:
        _insert_h2_section(updated, HIGHLIGHTS_SECTION_TITLE, len(updated))
        _insert_h2_section(updated, REFLECTIONS_SECTION_TITLE, len(updated))
        return updated

    if highlights_start == -1:
        _insert_h2_section(updated, HIGHLIGHTS_SECTION_TITLE, reflections_start)
        return updated

    if reflections_start == -1:
        _insert_h2_section(updated, REFLECTIONS_SECTION_TITLE, highlights_end)
        return updated

    return updated


def _render_book_annotation_tables(
    html_path: str,
) -> tuple[list[str], int, int, str]:
    with open(html_path, "r", encoding="utf-8") as handle:
        html = handle.read()

    export = parse_kindle_notebook_html(html)
    page_rows: list[list[str]] = []
    loc_rows: list[list[str]] = []

    for annotation in export.annotations:
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

    return rendered, len(page_rows), len(loc_rows), export.book_title


def _replace_highlights_content(lines: list[str], new_content: list[str]) -> list[str]:
    updated = _ensure_highlights_reflections_sections(lines)
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


def cmd_media_book_annotations_import(args: argparse.Namespace) -> int:
    html_path = args.html_path
    note_path = args.note

    if not os.path.isabs(html_path):
        print(f"Error: HTML path must be absolute: {html_path}")
        return 1
    if not os.path.isabs(note_path):
        print(f"Error: note path must be absolute: {note_path}")
        return 1
    if not os.path.isfile(html_path):
        print(f"Error: HTML file not found: {html_path}")
        return 1
    if not os.path.isfile(note_path):
        print(f"Error: target note file not found: {note_path}")
        return 1

    try:
        table_lines, page_count, loc_count, book_title = _render_book_annotation_tables(
            html_path
        )
    except ValueError as exc:
        print(f"Error: {exc}")
        return 1
    except OSError as exc:
        print(f"Error: failed to read HTML file: {exc}")
        return 1

    try:
        with locked_note(note_path):
            existing_lines = safe_read_file(note_path)
            if existing_lines is None:
                print(f"Error: failed to read target note: {note_path}")
                return 1
            updated_lines = _replace_highlights_content(existing_lines, table_lines)
            atomic_write_note(note_path, updated_lines)
    except TimeoutError as exc:
        print(f"Error: could not lock note for write: {exc}")
        return 1
    except OSError as exc:
        print(f"Error: failed to write target note: {exc}")
        return 1

    print("Imported Kindle annotations:")
    print(f"  Path: {note_path}")
    if book_title:
        print(f"  Book: {book_title}")
    print(f"  Rows: {page_count + loc_count} (PAGE: {page_count}, LOC.: {loc_count})")
    return 0


def cmd_media_podcast_add(args: argparse.Namespace) -> int:
    note_date = datetime.date.today()
    if args.date:
        try:
            note_date = _parse_iso_day(args.date)
        except ValueError as exc:
            print(f"Error: {exc}")
            return 1

    fetched_title, fetched_host = _fetch_youtube_oembed_metadata(args.url)
    raw_title = (args.title or fetched_title or "").strip()
    raw_host = (args.host or fetched_host or "").strip()

    if not raw_title:
        print("Error: could not resolve title from URL. Provide --title.")
        return 1
    if not raw_host:
        print("Error: could not resolve host from URL. Provide --host.")
        return 1

    try:
        title = _sanitize_podcast_title(raw_title)
    except ValueError as exc:
        print(f"Error: {exc}")
        return 1

    template_path = _podcast_template_path()
    template_lines = safe_read_file(template_path)
    if template_lines is None:
        print(f"Error: required podcast template not found: {template_path}")
        return 1

    note_lines = _render_podcast_note_lines(
        template_lines,
        host=raw_host,
        note_date=note_date,
        link=args.url,
    )

    os.makedirs(PATHS.podcasts_dir, exist_ok=True)
    note_path = os.path.join(PATHS.podcasts_dir, f"{title}.md")

    try:
        with locked_note(note_path):
            if os.path.exists(note_path):
                print(f"Error: podcast note already exists: {note_path}")
                return 1
            atomic_write_note(note_path, note_lines)
    except TimeoutError as exc:
        print(f"Error: could not lock note for write: {exc}")
        return 1
    except OSError as exc:
        print(f"Error: failed to write podcast note: {exc}")
        return 1

    _update_media_cache_for_podcast(title, note_date)
    print("Created podcast note:")
    print(f"  Path: {note_path}")
    print(f"  Title: {title}")
    print(f"  Host: {raw_host}")
    print(f"  Date: {note_date.isoformat()}")
    return 0
