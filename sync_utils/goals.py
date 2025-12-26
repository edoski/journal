"""
Goal management utilities for the journal sync system.

Provides functions for parsing, normalizing, rendering, and managing
goal checkbox tasks with unique IDs.
"""
from __future__ import annotations

import hashlib
import re
import uuid


def _normalize_header(line: str) -> str:
    """
    Normalize markdown headers for matching, ignoring emphasis markers.
    This allows matching "### STUDY" with "### **STUDY**", etc.
    """
    stripped = line.strip()
    cleaned = re.sub(r"\*+", "", stripped)
    cleaned = re.sub(r"_+", "", cleaned)
    return cleaned.lower()


def canonical_goal(text: str) -> str:
    """Normalize a goal line for idempotent matching.

    - Strips leading checkbox/bullet markers.
    - Strips wiki links ([[foo]] -> foo) to avoid false mismatches.
    - Collapses whitespace and trims trailing punctuation.
    - Strips trailing goal block IDs like ^gid-abcdef1234.
    """
    cleaned = re.sub(r"^\s*[-*]\s*\[[^\]]?\]\s*", "", text)
    cleaned = re.sub(r"(\s+\^gid-[0-9a-fA-F]{1,32})+\s*$", "", cleaned)
    cleaned = re.sub(r"\[\[(.*?)\]\]", r"\1", cleaned)
    cleaned = cleaned.strip(" `")
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = cleaned.rstrip(".,;:-—– ")
    return cleaned.lower()


def generate_goal_id() -> str:
    """Return a short goal id (gid-xxxxxxxxxx)."""
    return f"gid-{uuid.uuid4().hex[:10]}"


def generate_goal_id_for(horizon_key: str, period_key: str, canonical: str, index: int = 0) -> str:
    """
    Deterministic goal id for a horizon + period + canonical text + occurrence index.
    Prevents collision when the same canonical text appears multiple times.
    """
    base = f"{horizon_key}|{period_key}|{canonical}|{index}"
    digest = hashlib.sha1(base.encode()).hexdigest()[:10]
    return f"gid-{digest}"


def extract_goal_id(line: str) -> str | None:
    """Extract a gid-... block ID from a line, if present."""
    if not line:
        return None
    m = re.search(r"\^gid-([0-9a-fA-F]{6,32})\s*$", line)
    if m:
        return f"gid-{m.group(1).lower()}"
    return None


def parse_goal_tasks(lines: list[str]) -> list[dict]:
    """Extract checkbox task lines into a list of dicts.

    Each dict contains: line (original), body (after checkbox), done (bool),
    canonical (normalized for comparisons), id (goal id).
    """
    pattern = re.compile(r"^\s*[-*]\s*\[(?P<state>[^\]]?)\]\s*(?P<body>.+)$")
    tasks = []
    for line in lines:
        match = pattern.match(line)
        if not match:
            continue
        state = (match.group("state") or "").strip()
        body = match.group("body").strip()
        done_state = state.lower() == "x" or state in {"✓", "✔", "-"}
        goal_id = extract_goal_id(line)
        # Strip trailing gid marker from body if present
        body = re.sub(r"(\s+\^gid-[0-9a-fA-F]{6,32})+\s*$", "", body).rstrip()
        tasks.append({
            "line": line,
            "body": body,
            "done": done_state,
            "canonical": canonical_goal(line),
            "id": goal_id,
        })
    return tasks


def render_goal_lines(tasks: list[dict]) -> list[str]:
    """Render task dicts back to markdown checkbox lines."""
    rendered = []
    for task in tasks:
        mark = "x" if task.get("done") else " "
        body = task.get("body", "").strip()
        gid = task.get("id") or generate_goal_id()
        rendered.append(f"- [{mark}] {body} ^{gid}")
    return rendered


def ensure_goal_ids(tasks: list[dict], horizon_key: str, period_key: str) -> list[dict]:
    """
    Ensure every task dict has an 'id'.
    Uses deterministic IDs for missing ones to avoid duplicates across runs.
    """
    counts = {}
    for t in tasks:
        canon = t.get("canonical") or ""
        if not t.get("id"):
            idx = counts.get(canon, 0)
            t["id"] = generate_goal_id_for(horizon_key, period_key, canon, idx)
        counts[canon] = counts.get(canon, 0) + 1
    return tasks


def build_goals_block(subsections: list[tuple[str, list[str]]]) -> list[str]:
    """Render a complete Goals block given ordered subsections.

    subsections: list of (title, tasks_lines) where tasks_lines are already
    rendered checkbox lines (not parsed tasks).
    """
    lines = ["## Goals", "---"]
    for idx, (title, task_lines) in enumerate(subsections):
        lines.append(f"### **{title}**")
        if task_lines:
            lines.extend(task_lines)
        if idx != len(subsections) - 1:
            lines.append("")
    # Ensure a blank line after the Goals block so following sections are separated.
    if lines and lines[-1].strip() != "":
        lines.append("")
    return lines


def find_subheader_idx(lines: list[str], title: str, start: int = 0, end: int | None = None, level: int = 3) -> int:
    """Find index of a subheader between start and end (defaults to full list)."""
    end = end if end is not None else len(lines)
    needle = _normalize_header(f"{'#'*level} {title}")
    for idx in range(start, end):
        if _normalize_header(lines[idx]) == needle:
            return idx
    return -1
