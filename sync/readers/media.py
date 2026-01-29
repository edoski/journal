"""
Media (books and podcasts) scanning for the journal sync system.
"""

from __future__ import annotations

import datetime
import json
import os
import re
from collections import OrderedDict

from sync.constants import MEDIA_CACHE_PATH
from sync.logging import get_logger
from sync.models import Book, Podcast

logger = get_logger()


# ---------------------------------------------------------------------------
# Media date cache functions
# ---------------------------------------------------------------------------


def _load_media_cache() -> dict[str, dict[str, str]]:
    """
    Load cached media dates from disk.

    Returns:
        Dict with 'podcasts' and 'books' keys, each mapping title -> date string
    """
    try:
        with open(MEDIA_CACHE_PATH, "r") as f:
            data = json.load(f)
        # Ensure structure
        if not isinstance(data, dict):
            return {"podcasts": {}, "books": {}}
        return {
            "podcasts": data.get("podcasts", {}),
            "books": data.get("books", {}),
        }
    except FileNotFoundError:
        return {"podcasts": {}, "books": {}}
    except (json.JSONDecodeError, PermissionError, OSError) as e:
        logger.warning("Failed to load media cache: %s", e)
        return {"podcasts": {}, "books": {}}


def _save_media_cache(cache: dict[str, dict[str, str]]) -> None:
    """Save media dates cache to disk."""
    try:
        os.makedirs(os.path.dirname(MEDIA_CACHE_PATH), exist_ok=True)
        with open(MEDIA_CACHE_PATH, "w") as f:
            json.dump(cache, f, indent=2)
    except (PermissionError, OSError) as e:
        logger.warning("Failed to save media cache: %s", e)


def _heal_frontmatter_date(
    filepath: str,
    lines: list[str],
    correct_date: datetime.date,
    date_key: str = "date",
) -> None:
    """
    Restore the date in a file's frontmatter to the correct cached value.

    Args:
        filepath: Path to the markdown file
        lines: Current file lines
        correct_date: The correct date to restore
        date_key: The frontmatter key to heal (default: "date", use "completed" for books)
    """
    date_str = correct_date.strftime("%Y-%m-%d")
    new_lines = []
    in_frontmatter = False
    frontmatter_done = False
    date_fixed = False

    for line in lines:
        if line.strip() == "---":
            if not in_frontmatter:
                in_frontmatter = True
            else:
                frontmatter_done = True
                in_frontmatter = False

        # Replace date line within frontmatter
        if in_frontmatter and not frontmatter_done and line.startswith(f"{date_key}:"):
            new_lines.append(f"{date_key}: {date_str}")
            date_fixed = True
        else:
            new_lines.append(line)

    if date_fixed:
        try:
            with open(filepath, "w") as f:
                f.write("\n".join(new_lines))
            logger.info("Healed %s in %s -> %s", date_key, os.path.basename(filepath), date_str)
        except (PermissionError, OSError) as e:
            logger.warning("Failed to heal frontmatter in %s: %s", filepath, e)




def _parse_frontmatter(lines: list[str]) -> OrderedDict[str, str]:
    """Parse YAML frontmatter from markdown lines."""
    data: OrderedDict[str, str] = OrderedDict()
    if not lines or lines[0].strip() != "---":
        return data
    end_idx = None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end_idx = i
            break
    if end_idx is None:
        return data
    for line in lines[1:end_idx]:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if ":" not in stripped:
            continue
        key, value = stripped.split(":", 1)
        data[key.strip()] = value.strip()
    return data


def _parse_date_link(value: str) -> datetime.date | None:
    """
    Parse a date from a wikilink like '[[2025-12-30]]' or plain date string.
    """
    if not value:
        return None

    # Extract date from wikilink format [[YYYY-MM-DD]]
    match = re.search(r"\[\[(\d{4}-\d{2}-\d{2})\]\]", value)
    if match:
        try:
            return datetime.datetime.strptime(match.group(1), "%Y-%m-%d").date()
        except ValueError:
            return None

    # Try plain date format YYYY-MM-DD
    match = re.match(r"(\d{4}-\d{2}-\d{2})", value.strip())
    if match:
        try:
            return datetime.datetime.strptime(match.group(1), "%Y-%m-%d").date()
        except ValueError:
            return None

    return None


def _parse_rating(value: str) -> float | None:
    """Parse a rating value from frontmatter."""
    if not value:
        return None
    try:
        return float(value.strip())
    except ValueError:
        return None


def scan_books(
    start_date: datetime.date,
    end_date: datetime.date,
    books_dir: str,
) -> list[Book]:
    """
    Scan notes/books/ for books completed within the date range.

    Also maintains a cache of book dates and heals corrupted frontmatter
    when dates differ from cached values (caused by Obsidian Sync issues).

    Args:
        start_date: Start of date range (inclusive)
        end_date: End of date range (inclusive)
        books_dir: Path to books directory

    Returns:
        List of Book dataclasses for books completed in range
    """
    books: list[Book] = []

    if not os.path.isdir(books_dir):
        return books

    cache = _load_media_cache()
    cache_modified = False

    for filename in os.listdir(books_dir):
        if not filename.endswith(".md"):
            continue

        filepath = os.path.join(books_dir, filename)
        if not os.path.isfile(filepath):
            continue

        try:
            with open(filepath, "r") as f:
                lines = f.read().splitlines()
        except FileNotFoundError:
            continue
        except (PermissionError, OSError) as e:
            logger.warning("Failed to read book file %s: %s", filepath, e)
            continue

        frontmatter = _parse_frontmatter(lines)

        # Parse completed date
        completed_str = frontmatter.get("completed", "")
        completed_date = _parse_date_link(completed_str)

        if completed_date is None:
            continue

        # Extract title from filename (without .md)
        title = filename[:-3]

        # Cache check and healing for completed date
        cached_date_str = cache["books"].get(title)
        if cached_date_str:
            cached_date = _parse_date_link(cached_date_str)
            if cached_date and cached_date != completed_date:
                # Date was corrupted - heal it
                logger.warning(
                    "Book '%s' date mismatch: frontmatter=%s, cached=%s. Healing.",
                    title,
                    completed_date,
                    cached_date,
                )
                _heal_frontmatter_date(filepath, lines, cached_date, "completed")
                completed_date = cached_date
        else:
            # New entry - add to cache
            cache["books"][title] = completed_date.strftime("%Y-%m-%d")
            cache_modified = True

        # Check if completed within date range
        if not (start_date <= completed_date <= end_date):
            continue

        # Parse other fields
        started_str = frontmatter.get("started", "")
        started_date = _parse_date_link(started_str)
        rating = _parse_rating(frontmatter.get("rating", ""))

        books.append(
            Book(
                title=title,
                author=frontmatter.get("author", ""),
                started=started_date,
                completed=completed_date,
                rating=rating,
            )
        )

    if cache_modified:
        _save_media_cache(cache)

    # Sort by completed date
    books.sort(key=lambda b: b.completed)

    return books



def scan_podcasts(
    start_date: datetime.date,
    end_date: datetime.date,
    podcasts_dir: str,
) -> list[Podcast]:
    """
    Scan notes/podcasts/ for podcasts within the date range.

    Also maintains a cache of podcast dates and heals corrupted frontmatter
    when dates differ from cached values (caused by Obsidian Sync issues).

    Args:
        start_date: Start of date range (inclusive)
        end_date: End of date range (inclusive)
        podcasts_dir: Path to podcasts directory

    Returns:
        List of Podcast dataclasses for podcasts in range
    """
    podcasts: list[Podcast] = []

    if not os.path.isdir(podcasts_dir):
        return podcasts

    cache = _load_media_cache()
    cache_modified = False

    for filename in os.listdir(podcasts_dir):
        if not filename.endswith(".md"):
            continue

        filepath = os.path.join(podcasts_dir, filename)
        if not os.path.isfile(filepath):
            continue

        try:
            with open(filepath, "r") as f:
                lines = f.read().splitlines()
        except FileNotFoundError:
            continue
        except (PermissionError, OSError) as e:
            logger.warning("Failed to read podcast file %s: %s", filepath, e)
            continue

        frontmatter = _parse_frontmatter(lines)

        # Parse date
        date_str = frontmatter.get("date", "")
        podcast_date = _parse_date_link(date_str)

        if podcast_date is None:
            continue

        # Extract title from filename (without .md)
        title = filename[:-3]

        # Cache check and healing
        cached_date_str = cache["podcasts"].get(title)
        if cached_date_str:
            cached_date = _parse_date_link(cached_date_str)
            if cached_date and cached_date != podcast_date:
                # Date was corrupted - heal it
                logger.warning(
                    "Podcast '%s' date mismatch: frontmatter=%s, cached=%s. Healing.",
                    title,
                    podcast_date,
                    cached_date,
                )
                _heal_frontmatter_date(filepath, lines, cached_date)
                podcast_date = cached_date
        else:
            # New entry - add to cache
            cache["podcasts"][title] = podcast_date.strftime("%Y-%m-%d")
            cache_modified = True

        # Check if within date range
        if not (start_date <= podcast_date <= end_date):
            continue

        # Parse other fields
        rating = _parse_rating(frontmatter.get("rating", ""))
        link = frontmatter.get("link", "") or None

        podcasts.append(
            Podcast(
                title=title,
                host=frontmatter.get("host", ""),
                date=podcast_date,
                rating=rating,
                link=link,
            )
        )

    if cache_modified:
        _save_media_cache(cache)

    # Sort by date
    podcasts.sort(key=lambda p: p.date)

    return podcasts
