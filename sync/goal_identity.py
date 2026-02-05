"""
Shared goal identity helpers.
"""

from __future__ import annotations

import hashlib
import re
import uuid


def canonical_goal_text(text: str) -> str:
    """
    Normalize goal text for comparison and deduplication.

    - Strips checkbox markers
    - Strips wikilinks (keeps inner text)
    - Strips goal IDs
    - Strips backticks
    - Collapses whitespace
    - Lowercases and removes trailing punctuation
    """
    # Strip checkbox markers
    text = re.sub(r"^[-*]\s*\[[x ]\]\s*", "", text.strip(), flags=re.IGNORECASE)
    # Strip wikilinks but keep inner text
    text = re.sub(r"\[\[([^\]]+)\]\]", r"\1", text)
    # Strip goal IDs
    text = re.sub(r"\^gid-[a-f0-9]+", "", text)
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text)
    # Strip backticks
    text = text.strip(" `")
    # Lowercase and strip trailing punctuation
    return text.rstrip(".,;:!?").lower()


def generate_goal_id() -> str:
    """Return a short random goal id (gid-xxxxxxxxxx)."""
    return f"gid-{uuid.uuid4().hex[:10]}"


def generate_goal_id_for(
    horizon_key: str, period_key: str, canonical: str, index: int = 0
) -> str:
    """Deterministic goal id for a horizon + period + canonical text + occurrence index."""
    base = f"{horizon_key}|{period_key}|{canonical}|{index}"
    digest = hashlib.sha1(base.encode()).hexdigest()[:10]
    return f"gid-{digest}"
