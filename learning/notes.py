"""Standalone study notes written beside the course material for Obsidian."""

from __future__ import annotations

from pathlib import Path

from learning import storage
from learning.markdown import obsidian_math
from learning.schema import slug
from learning.workspace import Workspace


def _title(value: str) -> str:
    title = " ".join(value.split())
    if not title:
        raise ValueError("a note needs a nonempty --title")
    return title


def render(title: str, markdown: str) -> str:
    """The note file: a title heading, then the body with Obsidian math."""
    body = obsidian_math(markdown).strip()
    return f"# {title}\n\n{body}\n" if body else f"# {title}\n"


def write(workspace: Workspace, title: str, markdown: str) -> Path:
    """Publish ``study-notes/<slug>.md``; an identical existing note is kept as is.

    A different file at that path is never replaced: choose another title.
    """
    title = _title(title)
    directory = workspace.notes
    path = directory / f"{slug(title) or 'study-note'}.md"
    content = render(title, markdown)
    with storage.lock(workspace.root / ".notes.lock"):
        if directory.is_symlink() or path.is_symlink():
            raise ValueError(f"refusing to write through a symlink: {path}")
        if path.exists():
            if path.read_text(encoding="utf-8") != content:
                raise ValueError(
                    f"{path} already exists with different content; it was not "
                    "replaced. Choose another title, or edit that note directly"
                )
            return path
        storage.publish_text(path, content)
    return path
