"""
Main orchestration logic for daily sync.

Provides the update_markdown function that coordinates all daily note updates,
including goals, metrics sections, and frontmatter.
"""
from __future__ import annotations

import datetime
import os
from collections import OrderedDict

from sync_utils import (
    JOURNAL_DIR,
    WEEKLY_TEMPLATE_PATH,
    DEFAULT_WEEKLY_DIR,
    format_minutes,
    locked_note,
    ensure_note,
    extract_block,
    render_goal_lines,
    goals_section_bounds,
    extract_subsection_tasks,
    build_goals_block,
    find_header_idx,
    replace_metrics_block,
    iso_week_range,
    ensure_section_with_divider,
    section_bounds,
    ensure_goal_ids,
    filter_by_proximity,
    get_review_reminders_for_date,
)

from sync_utils.carried_goals import get_carried_ids, record_carried_ids, cleanup_old_entries

from .constants import TEMPLATE_PATH
from .flow_db import SessionDict
from .study import _extract_existing_data, _build_study_section
from .training import _build_training_section
from .sleep import _build_sleep_section
from .icloud import _load_status_file
from .context import get_vault_files_modified_on_date, files_for_session, format_context_cell


def _weekly_note_path(date_obj: datetime.date, weekly_dir: str | None = None) -> str:
    """Get the path to the weekly note for a given date."""
    weekly_dir = weekly_dir or DEFAULT_WEEKLY_DIR
    year, week_num, _ = date_obj.isocalendar()
    filename = f"{year}-W{week_num:02d}.md"
    return os.path.join(weekly_dir, filename)


def _load_weekly_goals(
    date_obj: datetime.date,
    weekly_dir: str | None = None,
) -> tuple[list[dict], str]:
    """
    Load weekly goals (source of truth) from the weekly note.

    Args:
        date_obj: Date to load goals for
        weekly_dir: Override for weekly notes directory

    Returns:
        Tuple of (tasks_list, path_to_weekly_note)
    """
    path = _weekly_note_path(date_obj, weekly_dir)
    if not os.path.exists(path):
        return [], path
    try:
        with open(path, "r") as f:
            lines = f.read().splitlines()
    except Exception:
        return [], path

    g_start, g_end = goals_section_bounds(lines)
    tasks = extract_subsection_tasks(lines, g_start, g_end, "WEEKLY")
    ensure_goal_ids(tasks, "weekly", date_obj.isoformat())
    return tasks, path


def _write_weekly_goals(
    date_obj: datetime.date,
    weekly_tasks: list[dict],
    weekly_dir: str | None = None,
) -> str:
    """
    Update the WEEKLY subsection in the weekly note.

    Does not touch other sections.

    Args:
        date_obj: Date context for the weekly note
        weekly_tasks: Updated task list to write
        weekly_dir: Override for weekly notes directory

    Returns:
        Path to the updated weekly note
    """
    path = _weekly_note_path(date_obj, weekly_dir)
    with locked_note(path):
        ensure_note(path, WEEKLY_TEMPLATE_PATH)
        try:
            with open(path, "r") as f:
                lines = f.read().splitlines()
        except Exception:
            lines = []

        g_start, g_end = goals_section_bounds(lines)
        if g_start == -1:
            # No Goals section: prepend it.
            new_block = build_goals_block([
                ("MONTHLY", [
                    "",
                    "_No monthly goals have been defined yet._",
                ]),
                ("WEEKLY", render_goal_lines(weekly_tasks)),
            ])
            lines = new_block + ([""] if lines and lines[0].strip() else []) + lines
        else:
            monthly_tasks = extract_subsection_tasks(lines, g_start, g_end, "MONTHLY")
            monthly_lines = render_goal_lines(monthly_tasks) if monthly_tasks else [
                "",
                "_No monthly goals have been defined yet._",
            ]
            new_block = build_goals_block([
                ("MONTHLY", monthly_lines),
                ("WEEKLY", render_goal_lines(weekly_tasks)),
            ])
            lines[g_start:g_end] = new_block
            # Ensure a blank line separation if next line is not blank or header
            insert_pos = g_start + len(new_block)
            if insert_pos < len(lines) and lines[insert_pos].strip() and not lines[insert_pos].startswith("## "):
                lines.insert(insert_pos, "")

        tmp_path = path + ".tmp"
        with open(tmp_path, "w") as f:
            f.write("\n".join(lines).rstrip() + "\n")
        os.replace(tmp_path, path)
    return path


def _parse_daily_goal_subsections(lines: list[str]) -> tuple[list[dict], list[dict]]:
    """
    Parse weekly and daily goal subsections from daily note lines.

    Args:
        lines: Lines from the daily note

    Returns:
        Tuple of (weekly_tasks, daily_tasks)
    """
    g_start, g_end = goals_section_bounds(lines)
    if g_start == -1:
        return [], []
    weekly_tasks = extract_subsection_tasks(lines, g_start, g_end, "WEEKLY")
    daily_tasks = extract_subsection_tasks(lines, g_start, g_end, "DAILY")
    today = datetime.date.today()
    week_start, _ = iso_week_range(today)
    ensure_goal_ids(weekly_tasks, "weekly", week_start.isoformat())
    ensure_goal_ids(daily_tasks, "daily", today.isoformat())
    return weekly_tasks, daily_tasks


def _carry_forward_daily_tasks(
    today_date: datetime.date,
    yesterday_date: datetime.date,
    existing_daily_tasks: list[dict],
) -> tuple[list[dict], int]:
    """
    Carry forward unchecked DAILY goals from yesterday into today's daily tasks list.

    Uses a cache to track which goals have been "offered" for carry forward.
    If a goal was previously offered but is not in the current note, the user
    deleted it intentionally and it won't be re-added.

    Args:
        today_date: Today's date
        yesterday_date: Yesterday's date
        existing_daily_tasks: Current daily tasks list (modified in place)

    Returns:
        Tuple of (updated_tasks_list, count_of_tasks_added)
    """
    today_key = today_date.isoformat()
    
    # Clean up old cache entries - only keep current period
    cleanup_old_entries("daily", [today_key])
    
    yesterday_path = os.path.join(JOURNAL_DIR, f"{yesterday_date:%Y-%m-%d}.md")
    if not os.path.exists(yesterday_path):
        return existing_daily_tasks, 0

    try:
        with open(yesterday_path, "r") as f:
            y_lines = f.read().splitlines()
    except Exception:
        return existing_daily_tasks, 0

    y_start, y_end = goals_section_bounds(y_lines)
    y_daily = extract_subsection_tasks(y_lines, y_start, y_end, "DAILY")

    ensure_goal_ids(y_daily, "daily", yesterday_date.isoformat())
    ensure_goal_ids(existing_daily_tasks, "daily", today_key)

    open_y = [t for t in y_daily if not t.get("done")]
    if not open_y:
        return existing_daily_tasks, 0

    # Get goals that were already offered for carry forward to today
    previously_offered = get_carried_ids("daily", today_key)
    existing_ids = {t["id"] for t in existing_daily_tasks if t.get("id")}
    
    added = 0
    newly_offered: list[str] = []
    
    for task in open_y:
        tid = task.get("id")
        if not tid:
            continue
        
        # Skip if already in current note
        if tid in existing_ids:
            continue
        
        # Skip if previously offered but user deleted it
        if tid in previously_offered:
            continue
        
        # First time offering this goal - add it
        new_task = task.copy()
        new_task["done"] = False
        existing_daily_tasks.append(new_task)
        existing_ids.add(tid)
        newly_offered.append(tid)
        added += 1

    # Record all offered goals (already offered + newly offered)
    all_offered = list(previously_offered) + newly_offered
    record_carried_ids("daily", today_key, all_offered)

    return existing_daily_tasks, added


def _update_frontmatter(
    final_lines: list[str],
    study_str: str,
    workout_done: bool,
    stretch_done: bool,
    sleep_data: dict | None,
) -> list[str]:
    """
    Update YAML frontmatter in final_lines with study time and status flags.

    Args:
        final_lines: Lines of the note (modified in place and returned)
        study_str: Formatted study time string
        workout_done: Whether workout was completed
        stretch_done: Whether stretch was completed
        sleep_data: Sleep data dict or None

    Returns:
        Updated lines list
    """
    first_dash_idx = -1
    second_dash_idx = -1
    for i, line in enumerate(final_lines):
        if line.strip() == "---":
            if first_dash_idx == -1:
                first_dash_idx = i
            elif second_dash_idx == -1:
                second_dash_idx = i
                break

    if first_dash_idx == -1 or second_dash_idx == -1 or second_dash_idx <= first_dash_idx:
        return final_lines

    fm_lines = final_lines[first_dash_idx + 1 : second_dash_idx]

    # Parse frontmatter preserving order
    fm_data: OrderedDict[str, str] = OrderedDict()
    fm_order: list[str] = []
    for line in fm_lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if ":" not in stripped:
            continue
        key, value = stripped.split(":", 1)
        key = key.strip()
        value = value.strip()
        if key not in fm_order:
            fm_order.append(key)
        fm_data[key] = value

    def set_value(key: str, value: str) -> None:
        if key not in fm_order:
            fm_order.append(key)
        fm_data[key] = value

    set_value("study", study_str)

    if workout_done:
        set_value("workout", "true")
    else:
        current = fm_data.get("workout", "")
        set_value("workout", current if current else "false")

    if stretch_done:
        set_value("stretch", "true")
    else:
        current = fm_data.get("stretch", "")
        set_value("stretch", current if current else "false")

    if sleep_data and (sleep_data.get("sleep_min") or sleep_data.get("SleepMinutes")):
        try:
            total_min = float(sleep_data.get("sleep_min") or sleep_data.get("SleepMinutes"))
            hours = int(total_min) // 60
            mins = int(total_min) % 60
            sleep_str = f"{hours}h{mins:02d}m" if mins else f"{hours}h"
            set_value("sleep", sleep_str)
        except Exception:
            pass

    new_fm_lines = [f"{key}: {fm_data.get(key, '')}".rstrip() for key in fm_order]
    return (
        final_lines[: first_dash_idx + 1]
        + new_fm_lines
        + final_lines[second_dash_idx:]
    )


def _ensure_daily_sections(lines: list[str], yaml_end_idx: int) -> None:
    """
    Guarantee Goals, Metrics, Reflections sections exist with required dividers.

    Args:
        lines: Note lines (modified in place)
        yaml_end_idx: Index of the closing YAML delimiter
    """
    # Goals immediately after YAML (or start of file)
    goals_header_idx, _ = ensure_section_with_divider(
        lines,
        "Goals",
        level=2,
        insert_pos=(yaml_end_idx + 1) if yaml_end_idx != -1 else 0,
    )

    # Metrics after Goals
    _, goals_end = section_bounds(lines, goals_header_idx, level=2) if goals_header_idx != -1 else (-1, -1)
    metrics_header_idx, _ = ensure_section_with_divider(
        lines,
        "Metrics",
        level=2,
        insert_pos=goals_end if goals_end != -1 else (yaml_end_idx + 1 if yaml_end_idx != -1 else 0),
    )

    # Reflections after Metrics
    _, metrics_end = section_bounds(lines, metrics_header_idx, level=2) if metrics_header_idx != -1 else (-1, -1)
    ensure_section_with_divider(
        lines,
        "Reflections",
        level=2,
        insert_pos=metrics_end if metrics_end != -1 else len(lines),
    )


def _read_daily_note(file_path: str) -> list[str]:
    """
    Read the daily note, creating from template if it doesn't exist.

    Args:
        file_path: Path to the daily note

    Returns:
        Lines of the note, or empty list on error
    """
    with locked_note(file_path):
        if not os.path.exists(file_path):
            if os.path.exists(TEMPLATE_PATH):
                try:
                    with open(TEMPLATE_PATH, "r") as tf:
                        template_content = tf.read()
                    with open(file_path, "w") as f:
                        f.write(template_content)
                except Exception as e:
                    print(f"Error creating file from template: {e}")
                    return []
            else:
                return []

        with open(file_path, "r") as f:
            return f.read().splitlines()


def _find_yaml_end(lines: list[str]) -> int:
    """
    Find the index of the closing YAML delimiter.

    Args:
        lines: Note lines

    Returns:
        Index of closing '---', or -1 if not found
    """
    yaml_end_idx = -1
    dashes_count = 0
    for i, line in enumerate(lines):
        if line.strip() == "---":
            dashes_count += 1
            if dashes_count == 2:
                yaml_end_idx = i
                break
    return yaml_end_idx


def update_markdown(sessions: list[SessionDict]) -> bool | None:
    """
    Update the daily markdown note with session data, goals, and metrics.

    This is the main orchestration function that:
    1. Reads or creates the daily note
    2. Ensures required sections exist
    3. Updates goals (carrying forward from yesterday, syncing with weekly)
    4. Updates metrics (study, training, sleep)
    5. Updates frontmatter
    6. Writes atomically

    Args:
        sessions: List of enriched session dictionaries from get_todays_sessions()

    Returns:
        True if note was updated, False if no changes, None on error
    """
    today = datetime.datetime.now().date()
    today_str = today.strftime("%Y-%m-%d")
    file_path = os.path.join(JOURNAL_DIR, f"{today_str}.md")

    lines = _read_daily_note(file_path)
    if not lines:
        return None

    # Discover files modified today for context tracking
    vault_files = get_vault_files_modified_on_date(today)

    def context_callback(session_start, session_end) -> str:
        """Get formatted context string for a session."""
        wikilinks = files_for_session(vault_files, session_start, session_end)
        return format_context_cell(wikilinks)

    # Build study table (also computes focus_minutes on sessions)
    existing_notes, existing_context = _extract_existing_data(lines)
    new_table_lines, total_focus_minutes = _build_study_section(
        sessions, existing_notes, context_for_session=context_callback,
        existing_context=existing_context
    )
    study_str = format_minutes(total_focus_minutes, always_show_both=True)

    yaml_end_idx = _find_yaml_end(lines)

    # Preserve divider after top-level sections and enforce presence
    _ensure_daily_sections(lines, yaml_end_idx)

    metrics_idx = find_header_idx(lines, "Metrics")

    # Parse existing goal subsections from today's note.
    existing_weekly_tasks, existing_daily_tasks = _parse_daily_goal_subsections(lines)

    # Carry forward yesterday's incomplete DAILY goals (ID-based, idempotent across runs).
    yesterday = today - datetime.timedelta(days=1)
    existing_daily_tasks, _ = _carry_forward_daily_tasks(today, yesterday, existing_daily_tasks)

    # Inject periodic review reminders (weekly on Sunday, monthly on last day, yearly on Dec 31)
    review_reminders = get_review_reminders_for_date(today)
    existing_ids = {t.get("id") for t in existing_daily_tasks if t.get("id")}
    for reminder in review_reminders:
        if reminder["id"] not in existing_ids:
            existing_daily_tasks.append(reminder)
            existing_ids.add(reminder["id"])

    # Load weekly source goals and propagate status changes from daily mirror.
    weekly_tasks, weekly_path = _load_weekly_goals(today)
    updated_weekly_tasks = []
    daily_weekly_lookup = {t["canonical"]: t for t in existing_weekly_tasks}
    for task in weekly_tasks:
        canon = task["canonical"]
        mirror = daily_weekly_lookup.get(canon)
        done = task.get("done", False)
        if mirror:
            if mirror.get("done") and not done:
                done = True  # done wins
        updated = task.copy()
        updated["done"] = done
        updated_weekly_tasks.append(updated)

    # Write back weekly note if statuses changed.
    if updated_weekly_tasks != weekly_tasks:
        _write_weekly_goals(today, updated_weekly_tasks)

    # Rebuild Goals block with WEEKLY mirror then DAILY goals.
    # Filter weekly tasks to only show those with deadlines within 7 days (or no deadline).
    filtered_weekly = filter_by_proximity(updated_weekly_tasks, 7, today)
    weekly_lines = render_goal_lines(filtered_weekly, today=today) if filtered_weekly else [
        "",
        "_No weekly goals have been defined yet._",
    ]
    goals_block = build_goals_block([
        ("WEEKLY", weekly_lines),
        ("DAILY", render_goal_lines(existing_daily_tasks, today=today)),
    ])

    g_start, g_end = goals_section_bounds(lines)
    if g_start == -1:
        insert_pos = yaml_end_idx + 1 if yaml_end_idx != -1 else 0
        lines[insert_pos:insert_pos] = goals_block
    else:
        lines[g_start:g_end] = goals_block

    # Recompute Metrics separator after Goals rewrite.
    metrics_idx = find_header_idx(lines, "Metrics")
    metrics_divider_idx = metrics_idx + 1 if metrics_idx != -1 else -1

    # Identify current Metrics body (used for fallback blocks) without touching later sections.
    metrics_body_start = metrics_divider_idx + 1 if metrics_divider_idx != -1 else 0
    reflections_idx = find_header_idx(
        lines,
        "Reflections",
        start=metrics_body_start,
    )
    metrics_body = (
        lines[metrics_body_start:reflections_idx]
        if reflections_idx != -1
        else lines[metrics_body_start:]
    )

    # Load activity status files
    workout_done, workout_data = _load_status_file("workout_status.json")
    stretch_done, stretch_data = _load_status_file("stretching_status.json")
    sleep_done, sleep_data = _load_status_file("sleep_status.json")

    # Extract existing blocks for fallback (using shared extract_block)
    existing_training_block = extract_block(metrics_body, "### **training**")
    existing_sleep_block = extract_block(metrics_body, "### **sleep**")

    # Build Metrics body lines
    study_lines = ["### **STUDY**"]
    if new_table_lines:
        study_lines.append("")
        study_lines.extend(new_table_lines)
    else:
        study_lines.append("")
        study_lines.append("_No study sessions completed today._")

    training_lines, _ = _build_training_section(
        workout_data, stretch_data, existing_training_block, today_str
    )

    sleep_lines = _build_sleep_section(sleep_data, existing_sleep_block)

    # Join metrics subsections with single blank between, none before first, none trailing
    sections = [study_lines, training_lines, sleep_lines]
    metrics_lines: list[str] = []
    for sec in sections:
        if not sec:
            continue
        if metrics_lines:
            metrics_lines.append("")
        metrics_lines.extend(sec)

    # Splice Metrics via shared helper (keeps content after Metrics intact)
    updated_lines = replace_metrics_block(lines, metrics_lines)

    # Update YAML frontmatter
    updated_lines = _update_frontmatter(updated_lines, study_str, workout_done, stretch_done, sleep_data)

    new_content = "\n".join(updated_lines)

    with locked_note(file_path):
        try:
            with open(file_path, "r") as f:
                current_content = f.read()
        except FileNotFoundError:
            current_content = ""

        if new_content.strip() == current_content.strip():
            return False

        tmp_path = file_path + ".tmp"
        with open(tmp_path, "w") as f:
            f.write(new_content)
        os.replace(tmp_path, file_path)

    print(f"Successfully updated {file_path} (Study Time: {study_str})")
    return True
