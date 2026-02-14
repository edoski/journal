"""
Shared goal identity helpers.
"""

from __future__ import annotations

import hashlib
import re
import uuid
from typing import Literal

GoalIdKind = Literal["manual", "reminder"]
_GOAL_ID_RE = re.compile(r"^gid-([mr])[0-9a-f]{9}$", flags=re.IGNORECASE)


def _kind_prefix(kind: GoalIdKind) -> str:
    return "r" if kind == "reminder" else "m"


def goal_id_kind(gid: str) -> GoalIdKind | None:
    """Return encoded goal-id kind, or None when ID is not canonical typed format."""
    if not gid:
        return None
    match = _GOAL_ID_RE.match(gid)
    if not match:
        return None
    return "reminder" if match.group(1).lower() == "r" else "manual"


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
    text = re.sub(
        r"^[-*]\s*\[[x \-✓✔]\]\s*",
        "",
        text.strip(),
        flags=re.IGNORECASE,
    )
    # Strip wikilinks but keep inner text
    text = re.sub(r"\[\[([^\]]+)\]\]", r"\1", text)
    # Strip goal IDs
    text = re.sub(r"(\s+\^gid-[mr][a-f0-9]{9})+\s*$", "", text, flags=re.IGNORECASE)
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text)
    # Strip backticks
    text = text.strip(" `")
    # Lowercase and strip trailing punctuation
    return text.rstrip(".,;:!?").lower()


def generate_goal_id(kind: GoalIdKind = "manual") -> str:
    """Return a short random typed goal id (gid-[mr]xxxxxxxxx)."""
    return f"gid-{_kind_prefix(kind)}{uuid.uuid4().hex[:9]}"


def generate_goal_id_for(
    kind: GoalIdKind,
    horizon_key: str,
    period_key: str,
    canonical: str,
    index: int = 0,
) -> str:
    """Deterministic typed goal id for horizon + period + canonical text + index."""
    base = f"{kind}|{horizon_key}|{period_key}|{canonical}|{index}"
    digest = hashlib.sha1(base.encode()).hexdigest()[:9]
    return f"gid-{_kind_prefix(kind)}{digest}"
