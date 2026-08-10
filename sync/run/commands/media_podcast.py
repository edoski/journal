"""Podcast note command handlers."""

from __future__ import annotations

import argparse
import datetime
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from typing import cast

from sync.io import safe_read_file
from sync.log import get_logger

from .media_common import (
    PODCAST_TEMPLATE_FILENAME,
    YOUTUBE_OEMBED_ENDPOINT,
    MediaCommandDeps,
    default_media_command_deps,
)

logger = get_logger(__name__)

_OBSIDIAN_UNSAFE_TITLE_CHARS_RE = re.compile(r'[<>"|?*#\^\[\]\x00-\x1f]')


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

    payload_dict = cast(dict[str, object], payload)
    title_value = payload_dict.get("title")
    host_value = payload_dict.get("author_name")
    title = title_value.strip() if isinstance(title_value, str) else None
    host = host_value.strip() if isinstance(host_value, str) else None
    return title or None, host or None


def _sanitize_podcast_title(raw_title: str) -> str:
    value = raw_title.strip()
    value = value.replace(":", " - ")
    value = value.replace("/", "-")
    value = value.replace("\\", "-")
    value = _OBSIDIAN_UNSAFE_TITLE_CHARS_RE.sub("", value)
    value = re.sub(r"\s+", " ", value)
    value = value.strip().rstrip(".").strip()
    if not value:
        raise ValueError("Could not derive a valid filename from title")
    return value


def _podcast_template_path(*, deps: MediaCommandDeps | None = None) -> str:
    resolved = deps or default_media_command_deps()
    return os.path.join(
        resolved.paths.vault_dir,
        "notes",
        "templates",
        PODCAST_TEMPLATE_FILENAME,
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


def _update_media_cache_for_podcast(
    title: str,
    note_date: datetime.date,
    *,
    deps: MediaCommandDeps | None = None,
) -> None:
    resolved = deps or default_media_command_deps()
    try:
        cache_store = resolved.media_cache_store_factory()
        cache = cache_store.load()
        books = dict(cache.get("books", {}))
        podcasts = dict(cache.get("podcasts", {}))
        podcasts[title] = note_date.isoformat()
        cache_store.save({"books": books, "podcasts": podcasts})
    except Exception as exc:
        logger.warning("Failed to update media cache for %s: %s", title, exc)


def cmd_media_podcast_add(
    args: argparse.Namespace,
    *,
    deps: MediaCommandDeps | None = None,
) -> int:
    resolved = deps or default_media_command_deps()
    note_date = resolved.today()
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

    template_path = _podcast_template_path(deps=resolved)
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

    note_path = os.path.join(resolved.paths.podcasts_dir, f"{title}.md")

    try:
        publication = resolved.note_store.publish(
            note_path,
            note_lines,
            expected=None,
        )
        if publication.status == "conflict":
            print(f"Error: podcast note already exists: {note_path}")
            return 1
    except TimeoutError as exc:
        print(f"Error: could not lock note for write: {exc}")
        return 1
    except OSError as exc:
        print(f"Error: failed to write podcast note: {exc}")
        return 1

    _update_media_cache_for_podcast(title, note_date, deps=resolved)
    print("Created podcast note:")
    print(f"  Path: {note_path}")
    print(f"  Title: {title}")
    print(f"  Host: {raw_host}")
    print(f"  Date: {note_date.isoformat()}")
    return 0
