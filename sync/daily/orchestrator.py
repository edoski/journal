"""
Main orchestration logic for daily sync.

Provides the update_markdown function that coordinates all daily note updates,
including goals, metrics sections, and frontmatter.
"""

from __future__ import annotations

import datetime
import json
import os
from collections import OrderedDict
from dataclasses import replace

from sync.constants import (
    JOURNAL_DIR,
    WEEKLY_TEMPLATE_PATH,
)
from sync.logging import get_logger
from sync.notes import (
    locked_note,
    ensure_note,
    extract_block,
    goals_section_bounds,
    extract_subsection_tasks,
    find_header_idx,
    replace_metrics_block,
    ensure_section_with_divider,
    section_bounds,
)
from sync.dates import iso_week_range
from sync.formatting import format_minutes
from sync.reminders import get_review_reminders_for_date, get_periodic_reminders_for_date
from sync.writers.goals import render_goal_lines, build_goals_block
from sync.readers.goals import filter_by_proximity
from sync.models.goals import Goal
from sync.base import propagate_goal_status, process_pierced_goals

from .constants import TEMPLATE_PATH
from .flow_db import SessionDict
from .goals import (
    weekly_note_path,
    load_weekly_goals,
    write_weekly_goals,
    parse_daily_goal_subsections,
    carry_forward_daily_tasks,
)
from .study import _extract_existing_data, _build_study_section
from .training import _build_training_section
from .sleep import _build_sleep_section
from .screen_time import _load_screen_time_data, _build_procrastination_section
from .icloud import _load_status_file
from .context import (
    get_vault_files_modified_on_date,
    files_for_session,
    format_context_cell,
)

logger = get_logger()

# iCloud path for study times JSON (read by iPad shortcut)
STUDY_TIMES_ICLOUD_PATH = os.path.expanduser(
    "~/Library/Mobile Documents/iCloud~is~workflow~my~workflows/Documents/JournalSync/study_times.json"
)


def _write_study_times_to_icloud(sessions: list[SessionDict], today_str: str) -> None:
    """
    Write study session times to iCloud for iPad shortcut to read.

    Args:
        sessions: List of study session dicts
        today_str: Today's date string (YYYY-MM-DD)
    """
    if not sessions:
        return

    # All calculations anchor to the note date to keep fallbacks deterministic
    note_date = datetime.date.fromisoformat(today_str)

    # Default schedule used when actual times would create invalid ranges
    default_morning = datetime.datetime.combine(note_date, datetime.time(8, 0))
    default_lunch = datetime.datetime.combine(note_date, datetime.time(13, 30))
    default_afternoon = datetime.datetime.combine(note_date, datetime.time(14, 30))
    default_afternoon_end = datetime.datetime.combine(note_date, datetime.time(18, 0))

    first_start = sessions[0]["start"]
    last_end = sessions[-1]["end"]

    # Find last session ending between 12:00-15:00 (pre-lunch)
    lunch_start = None
    for session in sessions:
        end_hour = session["end"].hour
        if 12 <= end_hour < 15:
            lunch_start = session["end"]

    # Compute afternoon start (1 hour after lunch)
    afternoon_start = None
    if lunch_start:
        afternoon_start = lunch_start + datetime.timedelta(hours=1)

    # Compute afternoon start time for comparison (use actual or default 14:30)
    afternoon_start_time = (
        afternoon_start
        if afternoon_start
        else first_start.replace(hour=14, minute=30, second=0, microsecond=0)
    )

    afternoon_end = (
        last_end if last_end >= afternoon_start_time else default_afternoon_end
    )

    def _normalize_study_times(
        morning: datetime.datetime,
        lunch: datetime.datetime | None,
        afternoon: datetime.datetime | None,
        end: datetime.datetime | None,
    ) -> tuple[
        datetime.datetime, datetime.datetime, datetime.datetime, datetime.datetime
    ]:
        """Clamp times to a safe, monotonic schedule for the Shortcut.

        Ensures: morning <= lunch <= afternoon <= end, with minimal defaults when
        real data would violate ordering. Equal times are nudged forward by 1 minute
        to keep the Shortcut's "between" action happy with positive windows.
        """

        minute = datetime.timedelta(minutes=1)

        m_start = morning or default_morning
        l_start = lunch or default_lunch
        a_start = afternoon or default_afternoon
        a_end = end or default_afternoon_end

        # If the first session starts after (or exactly at) lunch, fall back to the
        # canonical schedule to avoid an inverted window.
        if m_start >= l_start:
            m_start = default_morning
            l_start = default_lunch

        # Keep lunch before/at afternoon
        if l_start > a_start:
            a_start = max(l_start, default_afternoon)

        # Keep afternoon before/at end
        if a_start > a_end:
            a_end = max(a_start, default_afternoon_end)

        # Nudge equalities to keep strictly increasing ranges
        if m_start == l_start:
            l_start = l_start + minute
        if l_start == a_start:
            a_start = a_start + minute
        if a_start == a_end:
            a_end = a_end + minute

        return m_start, l_start, a_start, a_end

    m_start, l_start, a_start, a_end = _normalize_study_times(
        first_start, lunch_start, afternoon_start, afternoon_end
    )

    data = {
        "date": today_str,
        "morning_start": m_start.strftime("%H:%M"),
        "lunch_start": l_start.strftime("%H:%M"),
        "afternoon_start": a_start.strftime("%H:%M"),
        "afternoon_end": a_end.strftime("%H:%M"),
    }

    try:
        # Skip write if content unchanged (avoids triggering file watcher)
        if os.path.exists(STUDY_TIMES_ICLOUD_PATH):
            with open(STUDY_TIMES_ICLOUD_PATH, "r") as f:
                existing = json.load(f)
            if existing == data:
                return  # No change, skip write

        os.makedirs(os.path.dirname(STUDY_TIMES_ICLOUD_PATH), exist_ok=True)
        with open(STUDY_TIMES_ICLOUD_PATH, "w") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        logger.warning("Failed to write study_times.json: %s", e)


def _update_frontmatter(
    final_lines: list[str],
    study_str: str,
    workout_done: bool,
    stretch_done: bool,
    sleep_data: dict | None,
) -> tuple[list[str], dict[str, str]]:
    """
    Update YAML frontmatter in final_lines with study time and status flags.

    Args:
        final_lines: Lines of the note (modified in place and returned)
        study_str: Formatted study time string
        workout_done: Whether workout was completed
        stretch_done: Whether stretch was completed
        sleep_data: Sleep data dict or None

    Returns:
        Tuple of (updated lines, dict of changed metrics {key: new_value})
    """
    changes: dict[str, str] = {}

    first_dash_idx = -1
    second_dash_idx = -1
    for i, line in enumerate(final_lines):
        if line.strip() == "---":
            if first_dash_idx == -1:
                first_dash_idx = i
            elif second_dash_idx == -1:
                second_dash_idx = i
                break

    if (
        first_dash_idx == -1
        or second_dash_idx == -1
        or second_dash_idx <= first_dash_idx
    ):
        return final_lines, changes

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
        old_value = fm_data.get(key, "")
        if old_value != value:
            changes[key] = value
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
            sleep_value = sleep_data.get("sleep_min") or sleep_data.get("SleepMinutes")
            if sleep_value is not None:
                total_min = float(sleep_value)
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
        + final_lines[second_dash_idx:],
        changes,
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
    _, goals_end = (
        section_bounds(lines, goals_header_idx, level=2)
        if goals_header_idx != -1
        else (-1, -1)
    )
    metrics_header_idx, _ = ensure_section_with_divider(
        lines,
        "Metrics",
        level=2,
        insert_pos=goals_end
        if goals_end != -1
        else (yaml_end_idx + 1 if yaml_end_idx != -1 else 0),
    )

    # Reflections after Metrics
    _, metrics_end = (
        section_bounds(lines, metrics_header_idx, level=2)
        if metrics_header_idx != -1
        else (-1, -1)
    )
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
                    logger.error("Error creating file from template: %s", e)
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
        sessions,
        existing_notes,
        context_for_session=context_callback,
        existing_context=existing_context,
    )
    study_str = format_minutes(total_focus_minutes, always_show_both=True)

    yaml_end_idx = _find_yaml_end(lines)

    # Preserve divider after top-level sections and enforce presence
    _ensure_daily_sections(lines, yaml_end_idx)

    metrics_idx = find_header_idx(lines, "Metrics")

    # Parse existing goal subsections from today's note.
    existing_weekly_tasks, existing_daily_tasks = parse_daily_goal_subsections(lines)

    # Carry forward yesterday's incomplete DAILY goals (ID-based, idempotent across runs).
    yesterday = today - datetime.timedelta(days=1)
    existing_daily_tasks, _ = carry_forward_daily_tasks(
        today, yesterday, existing_daily_tasks
    )

    # Inject periodic review reminders (weekly on Sunday, monthly on last day, yearly on Dec 31)
    review_reminders = get_review_reminders_for_date(today)
    existing_ids = {t.id for t in existing_daily_tasks if t.id}
    for reminder in review_reminders:
        if reminder.id not in existing_ids:
            existing_daily_tasks.append(reminder)
            existing_ids.add(reminder.id)

    # Inject periodic maintenance reminders (e.g., bi-weekly MacBook restart)
    periodic_reminders = get_periodic_reminders_for_date(today)
    for reminder in periodic_reminders:
        if reminder.id not in existing_ids:
            existing_daily_tasks.append(reminder)
            existing_ids.add(reminder.id)

    # Load weekly goals (and monthly/quarterly/yearly for piercing) and propagate status changes.
    weekly_tasks, monthly_tasks, quarterly_tasks, yearly_tasks, weekly_path = (
        load_weekly_goals(today)
    )
    updated_weekly_tasks: list[Goal] = []
    daily_weekly_lookup = {t.canonical: t for t in existing_weekly_tasks}
    for task in weekly_tasks:
        canon = task.canonical
        mirror = daily_weekly_lookup.get(canon)
        done = task.done
        if mirror:
            if mirror.done and not done:
                done = True  # done wins
        updated = replace(task, done=done)
        updated_weekly_tasks.append(updated)

    # Propagate status changes from pierced goals in DAILY back to their sources
    # (handled by propagate_goal_status in weekly.py on next sync)
    monthly_changed = propagate_goal_status(monthly_tasks, existing_daily_tasks)
    quarterly_changed = propagate_goal_status(quarterly_tasks, existing_daily_tasks)
    yearly_changed = propagate_goal_status(yearly_tasks, existing_daily_tasks)

    # Write back weekly note if statuses changed.
    weekly_changed = updated_weekly_tasks != weekly_tasks
    if weekly_changed or monthly_changed or quarterly_changed or yearly_changed:
        write_weekly_goals(
            today, updated_weekly_tasks, monthly_tasks, quarterly_tasks, yearly_tasks
        )

    # Rebuild Goals block with WEEKLY mirror then DAILY goals.
    # Filter weekly tasks to only show those with deadlines within 7 days (or no deadline).
    filtered_weekly = filter_by_proximity(updated_weekly_tasks, 7, today)
    weekly_lines = (
        render_goal_lines(filtered_weekly, today=today)
        if filtered_weekly
        else [
            "",
            "_No weekly goals have been defined yet._",
        ]
    )

    # DAILY source: daily goals + pierced monthly/quarterly/yearly goals (≤7d deadline)
    original_daily, final_pierced, [updated_monthly, updated_quarterly, updated_yearly] = process_pierced_goals(
        existing_tasks=existing_daily_tasks,
        source_goal_lists=[monthly_tasks, quarterly_tasks, yearly_tasks],
        proximity_days=7,
        today=today,
    )

    # Render: original daily goals + final pierced goals (with countdown)
    daily_source_lines = render_goal_lines(original_daily, today=today)
    if final_pierced:
        pierced_lines = render_goal_lines(final_pierced, today=today)
        daily_source_lines = daily_source_lines + pierced_lines

    goals_block = build_goals_block(
        [
            ("WEEKLY", weekly_lines),
            ("DAILY", daily_source_lines),
        ]
    )

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

    # Load screen time data and build procrastination section
    screen_time_data = _load_screen_time_data(today_str)

    # Build deviation data from study sessions and workout
    from sync.constants import IDEAL
    from sync.models.deviation import DailyDeviationData

    deviation_data = DailyDeviationData()

    if sessions:
        # Late study start: first session vs ideal start hour
        first_start = sessions[0]["start"]
        ideal_study_start = first_start.replace(
            hour=IDEAL.study_start_hour, minute=0, second=0, microsecond=0
        )
        if first_start > ideal_study_start:
            deviation_data.late_study_start_minutes = (
                first_start - ideal_study_start
            ).total_seconds() / 60

        # Sum interrupts (stored in seconds) and overruns (stored in minutes)
        deviation_data.interrupt_minutes = sum(
            (s.get("interruptions_duration", 0) or 0) / 60 for s in sessions
        )
        deviation_data.overrun_minutes = sum(
            s.get("break_overrun", 0) or 0 for s in sessions
        )

    # Late workout start: first workout start vs 6:00 PM ideal
    if workout_data:
        workout_entries = (
            workout_data if isinstance(workout_data, list) else [workout_data]
        )
        # Find earliest workout start time
        earliest_workout_start = None
        for entry in workout_entries:
            start_str = (entry.get("start") or "").strip()
            if start_str and (entry.get("type") or "").lower() != "stretching":
                try:
                    h, m = map(int, start_str.split(":"))
                    start_minutes = h * 60 + m
                    if (
                        earliest_workout_start is None
                        or start_minutes < earliest_workout_start
                    ):
                        earliest_workout_start = start_minutes
                except Exception:
                    pass
        if earliest_workout_start is not None:
            ideal_workout_minutes = IDEAL.workout_start_hour * 60  # 6:00 PM = 18:00
            if earliest_workout_start > ideal_workout_minutes:
                deviation_data.late_workout_start_minutes = (
                    earliest_workout_start - ideal_workout_minutes
                )

    # Write study times to iCloud for iPad shortcut
    _write_study_times_to_icloud(sessions, today_str)

    procrastination_lines = _build_procrastination_section(
        screen_time_data, deviation_data
    )

    # Join metrics subsections with single blank between, none before first, none trailing
    sections = [study_lines, training_lines, procrastination_lines, sleep_lines]
    metrics_lines: list[str] = []
    for sec in sections:
        if not sec:
            continue
        if metrics_lines:
            metrics_lines.append("")
        metrics_lines.extend(sec)

    # Splice Metrics via shared helper (keeps content after Metrics intact)
    updated_lines = replace_metrics_block(lines, metrics_lines)

    # Update YAML frontmatter and capture what changed
    updated_lines, fm_changes = _update_frontmatter(
        updated_lines, study_str, workout_done, stretch_done, sleep_data
    )

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

    # Log only the metrics that changed
    if fm_changes:
        parts = []
        for key in ("study", "workout", "stretch", "sleep"):
            if key in fm_changes:
                val = fm_changes[key]
                # Use checkmark for boolean flags
                if val == "true":
                    parts.append(f"{key}=✓")
                elif val == "false":
                    continue  # Don't log false transitions
                else:
                    parts.append(f"{key}={val}")
        if parts:
            logger.info("Updated %s — %s", today_str + ".md", ", ".join(parts))
        else:
            logger.info("Updated %s", today_str + ".md")
    else:
        logger.info("Updated %s", today_str + ".md")

    return True
