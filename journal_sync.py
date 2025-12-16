import sqlite3
import datetime
import os
import re
import sys
import json
import time
import glob
import math
from collections import OrderedDict

# Configuration
DB_PATH = "/Users/edo/Library/Containers/design.yugen.Flow/Data/Library/Application Support/Flow/CoreData.sqlite"
JOURNAL_DIR = "/Users/edo/Documents/Obsidian/the-vault/journal"
CORE_DATA_EPOCH_OFFSET = 978307200  # Seconds between 1970-01-01 and 2001-01-01
BREAK_GAP_CAP_SECONDS = 60  # 1 minute; breaks auto-start, so keep this tight
# Maximum allowed gap (seconds) between a flow end and the next break start
# to consider them linked. Defaults to 5 minutes but can be overridden via
# LOG_SYNC_BREAK_GAP_CAP if you want to tighten/loosen this behavior.
BREAK_LINK_MAX_GAP_SECONDS = int(os.environ.get("LOG_SYNC_BREAK_GAP_CAP", "300"))
# Cache for training entries so workout/stretch files can arrive in separate
# runs without losing earlier entries for the same day.
TRAINING_CACHE_PATH = os.path.expanduser("~/.cache/journal_sync/training_entries.json")
# Carry-forward guard to avoid re-importing yesterday's goals multiple times a day
CARRY_FORWARD_GUARD_PATH = os.path.expanduser(
    "~/.cache/journal_sync/carry_forward_goals.last_run"
)
# Regular study day cutoff: sessions past this time incur no overrun.
REGULAR_DAY_END = datetime.time(18, 0)
# Default daily lunch window used to forgive that off-time in overrun calculations.
LUNCH_WINDOW_DEFAULT = ("13:30", "14:30")  # HH:MM - HH:MM
def _read_break_defaults():
    """
    Read Flow's configured break lengths.
    Returns a dict with keys 'shortBreak' and 'longBreak' (ints or None).
    """
    result = {"shortBreak": None, "longBreak": None}
    for key in ("longBreak", "shortBreak"):
        try:
            import subprocess
            out = subprocess.check_output(
                ["defaults", "read", "design.yugen.Flow", f"{key}.durationInMinutes"],
                text=True,
            )
            val = int(out.strip())
            if val > 0:
                result[key] = val
        except Exception:
            continue
    return result

BREAK_DEFAULTS = _read_break_defaults()


def _canonical_goal(text: str) -> str:
    """Normalize a goal line for idempotent matching."""
    cleaned = re.sub(r"^\s*[-*]\s*\[[ xX]?\]\s*", "", text)
    cleaned = re.sub(r"\[\[(.*?)\]\]", r"\1", cleaned)
    cleaned = cleaned.strip(" `")
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = cleaned.rstrip(".,;:-—– ")
    return cleaned.lower()


def _parse_goal_tasks_from_lines(lines):
    pattern = re.compile(r"^\s*[-*]\s*\[(?P<state>[ xX]?)\]\s*(?P<body>.+)$")
    tasks = []
    for line in lines:
        match = pattern.match(line)
        if not match:
            continue
        state = (match.group("state") or "").lower()
        body = match.group("body").strip()
        tasks.append({
            "line": line,
            "body": body,
            "done": state == "x",
            "canonical": _canonical_goal(line),
        })
    return tasks


def _find_section_bounds(lines, title):
    header_re = re.compile(rf"^\s*##\s+{re.escape(title)}\s*$", re.IGNORECASE)
    start_idx = -1
    for idx, line in enumerate(lines):
        if header_re.match(line):
            start_idx = idx
            break
    if start_idx == -1:
        return -1, -1
    end_idx = len(lines)
    for idx in range(start_idx + 1, len(lines)):
        if re.match(r"^\s*##\s+[^#]", lines[idx]):
            end_idx = idx
            break
    return start_idx, end_idx


def _goals_body_bounds(lines, goals_idx):
    if goals_idx == -1:
        return -1, -1
    end_idx = len(lines)
    for idx in range(goals_idx + 1, len(lines)):
        if re.match(r"^\s*##\s+[^#]", lines[idx]):
            end_idx = idx
            break
    body_start = goals_idx + 1
    if body_start < end_idx and lines[body_start].strip() == "---":
        body_start += 1
    if body_start < end_idx and lines[body_start].strip() == "":
        body_start += 1
    return body_start, end_idx


def _load_goals_for_date(date_obj, include_checked=False):
    path = os.path.join(JOURNAL_DIR, f"{date_obj:%Y-%m-%d}.md")
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r") as f:
            lines = f.read().splitlines()
    except Exception:
        return []
    start, end = _find_section_bounds(lines, "Goals")
    if start == -1:
        return []
    body_start, body_end = _goals_body_bounds(lines, start)
    tasks = _parse_goal_tasks_from_lines(lines[body_start:body_end])
    if include_checked:
        return tasks
    return [t for t in tasks if not t.get("done")]


def _carry_forward_already_ran(date_obj):
    try:
        with open(CARRY_FORWARD_GUARD_PATH, "r") as f:
            last = f.read().strip()
        return last == date_obj.isoformat()
    except FileNotFoundError:
        return False
    except Exception:
        return False


def _mark_carry_forward(date_obj):
    try:
        os.makedirs(os.path.dirname(CARRY_FORWARD_GUARD_PATH), exist_ok=True)
        with open(CARRY_FORWARD_GUARD_PATH, "w") as f:
            f.write(date_obj.isoformat())
    except Exception:
        pass


def _normalize_goals_section(lines, goals_idx):
    """
    Keep only checkbox task lines inside the Goals section and strip stray
    blank lines so metrics tables cannot leak into the Goals block.
    """
    if goals_idx == -1:
        return

    body_start, body_end = _goals_body_bounds(lines, goals_idx)
    if body_start == -1:
        return

    tasks = _parse_goal_tasks_from_lines(lines[body_start:body_end])
    task_lines = [t["line"].strip() for t in tasks]

    # Rebuild the Goals block: header, divider, tasks, optional spacer.
    new_block = [lines[goals_idx].rstrip(), "---"]
    new_block.extend(task_lines)

    # Avoid trailing blank lines in the Goals body.
    while new_block and new_block[-1].strip() == "":
        new_block.pop()

    # If the next line is a section header and not already separated, add one spacer.
    remainder = lines[body_end:]
    if remainder and remainder[0].strip() != "":
        new_block.append("")

    lines[goals_idx:body_end] = new_block


def _carry_forward_goals(lines, goals_idx, today_date, yesterday_date):
    if goals_idx == -1:
        return 0

    already_ran = _carry_forward_already_ran(today_date)

    yesterday_path = os.path.join(JOURNAL_DIR, f"{yesterday_date:%Y-%m-%d}.md")
    if not os.path.exists(yesterday_path):
        return 0

    yesterday_tasks = _load_goals_for_date(yesterday_date, include_checked=False)
    if not yesterday_tasks:
        _mark_carry_forward(today_date)
        return 0

    body_start, body_end = _goals_body_bounds(lines, goals_idx)
    if body_start == -1:
        return 0

    today_tasks = _parse_goal_tasks_from_lines(lines[body_start:body_end])
    today_canon = {t["canonical"] for t in today_tasks if t.get("canonical")}

    new_body = list(lines[body_start:body_end])
    carried = 0
    for task in yesterday_tasks:
        canon = task.get("canonical")
        if canon in today_canon:
            continue
        new_body.append(f"- [ ] {task['body']}")
        today_canon.add(canon)
        carried += 1

    # Ensure a single blank line separates Goals from the next section.
    if new_body and new_body[-1].strip() != "":
        new_body.append("")

    if carried:
        lines[body_start:body_end] = new_body

    # Always refresh the guard stamp to reflect the latest attempted sync.
    if not already_ran or carried:
        _mark_carry_forward(today_date)
    return carried

def get_expected_break_minutes(break_session=None):
    """
    Choose expected break length:
    - Prefer Flow defaults per break type.
    - If Flow only labels everything as shortBreak, upgrade to longBreak default when the actual duration matches or exceeds it (with 2m tolerance).
    - Fallback to the session's stored duration, then 30.
    """
    default_short = BREAK_DEFAULTS.get("shortBreak")
    default_long = BREAK_DEFAULTS.get("longBreak")
    tol_minutes = 2

    if break_session:
        phase = break_session.get("phase")
        dur = break_session.get("duration")
        dur_val = int(dur) if isinstance(dur, (int, float)) and dur > 0 else None

        # Direct phase mapping first
        if phase == "longBreak" and default_long:
            return default_long
        if phase == "shortBreak" and default_short:
            chosen = default_short
        else:
            chosen = None

        # If Flow labels everything as shortBreak but duration aligns with longBreak, upgrade expectation.
        if dur_val and default_long and default_short and default_long > default_short:
            if dur_val >= default_long - tol_minutes:
                return default_long
            if dur_val >= default_short - tol_minutes and chosen is None:
                return default_short

        if chosen:
            return chosen
        if dur_val:
            return dur_val

    # No session or no usable value; pick best available default
    for phase_key in ("longBreak", "shortBreak"):
        val = BREAK_DEFAULTS.get(phase_key)
        if val:
            return val
    return 30

def format_minutes(total_minutes: int) -> str:
    hours = total_minutes // 60
    minutes = total_minutes % 60
    if hours > 0:
        return f"{hours}h{minutes:02d}m" if minutes else f"{hours}h"
    return f"{minutes}m"

def format_minutes_seconds(total_minutes_float: float) -> str:
    """
    Convert minute value (can be float) to XmYYs string.
    """
    if total_minutes_float is None:
        return ""
    mins = int(total_minutes_float)
    secs = round((total_minutes_float - mins) * 60)
    if secs == 60:
        mins += 1
        secs = 0
    if mins >= 60:
        hours = mins // 60
        rem_mins = mins % 60
        return f"{hours}h{rem_mins:02d}m" if secs == 0 else f"{hours}h{rem_mins:02d}m{secs:02d}s"
    if secs == 0:
        return f"{mins}m"
    return f"{mins}m{secs:02d}s"

def ceil_minutes(val: float) -> int:
    """
    Round minutes upward with a tiny tolerance to avoid float undercounts
    (e.g., 89.0000001 -> 90).
    """
    if val is None:
        return 0
    return int(math.ceil(val - 1e-6))

def round_half_up(val: float) -> int:
    """
    Round to nearest minute, half-up, with tiny tolerance to prevent float drift.
    """
    if val is None:
        return 0
    return int(math.floor(val + 0.5000001))

def _parse_time_str(time_str: str):
    hours, minutes = map(int, time_str.split(":"))
    return datetime.time(hours, minutes)

def _read_lunch_window():
    """
    Allow overriding the lunch window with LOG_SYNC_LUNCH_WINDOW env var ("HH:MM-HH:MM").
    Set to "none"/"off"/"false" to disable forgiving a lunch window.
    """
    env_val = os.environ.get("LOG_SYNC_LUNCH_WINDOW", "").strip()
    if env_val:
        lowered = env_val.lower()
        if lowered in ("none", "off", "false", "0"):
            return None
        match = re.match(r"^([0-2]\\d:[0-5]\\d)\\s*-\\s*([0-2]\\d:[0-5]\\d)$", env_val)
        if match:
            try:
                return (_parse_time_str(match.group(1)), _parse_time_str(match.group(2)))
            except ValueError:
                pass
    try:
        start_str, end_str = LUNCH_WINDOW_DEFAULT
        return (_parse_time_str(start_str), _parse_time_str(end_str))
    except Exception:
        return None

LUNCH_WINDOW = _read_lunch_window()

def _compute_dynamic_lunch_window(flow_sessions, base_window, reference_date=None):
    """
    Shift the lunch window later only when a flow session straddles the nominal
    lunch start. A session qualifies if it begins before the base start and ends
    after it; purely post-lunch sessions are ignored.
    """
    if not base_window or not flow_sessions:
        return base_window

    base_start_t, base_end_t = base_window
    ref_date = reference_date or datetime.date.today()
    base_start_dt = datetime.datetime.combine(ref_date, base_start_t)
    base_end_dt = datetime.datetime.combine(ref_date, base_end_t)
    if base_end_dt <= base_start_dt:
        base_end_dt += datetime.timedelta(days=1)
    window_duration = base_end_dt - base_start_dt

    eligible = sorted((s for s in flow_sessions if s.get("end")), key=lambda s: s["end"])
    shifted_start_dt = None
    for session in eligible:
        start_dt = session.get("start")
        end_dt = session["end"]
        if not start_dt:
            continue
        if start_dt <= base_start_dt < end_dt:
            shifted_start_dt = end_dt
            break

    if not shifted_start_dt:
        return base_window

    shifted_end_dt = shifted_start_dt + window_duration
    return (shifted_start_dt.time(), shifted_end_dt.time())

def overlap_minutes_with_window(start_dt, end_dt, window):
    """
    Return minutes of [start_dt, end_dt) that overlap a given (start_time, end_time) window.
    Window times are interpreted on start_dt.date(). Handles windows that cross midnight.
    """
    if not window or not end_dt or end_dt <= start_dt:
        return 0
    window_start_t, window_end_t = window
    window_start_dt = datetime.datetime.combine(start_dt.date(), window_start_t)
    window_end_dt = datetime.datetime.combine(start_dt.date(), window_end_t)
    if window_end_dt <= window_start_dt:
        window_end_dt += datetime.timedelta(days=1)
    latest_start = max(start_dt, window_start_dt)
    earliest_end = min(end_dt, window_end_dt)
    if earliest_end <= latest_start:
        return 0
    return (earliest_end - latest_start).total_seconds() / 60

def clamp_next_flow_within_day(session_end_dt, next_flow_start_dt, cutoff_time):
    """
    Limit overrun calculations to the regular study day. If the clamped next
    start is at or before the session end, treat as no overrun.
    """
    cutoff_dt = datetime.datetime.combine(session_end_dt.date(), cutoff_time)
    effective_next = min(next_flow_start_dt, cutoff_dt)
    if effective_next <= session_end_dt:
        return None
    return effective_next

def get_db_connection():
    if not os.path.exists(DB_PATH):
        print(f"Error: Database not found at {DB_PATH}")
        sys.exit(1)
    # Open in read-only mode to avoid locking
    return sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)

def core_data_to_datetime(timestamp):
    if timestamp is None:
        return None
    return datetime.datetime.fromtimestamp(timestamp + CORE_DATA_EPOCH_OFFSET)

def get_todays_sessions():
    conn = get_db_connection()
    cursor = conn.cursor()

    # Calculate start and end of today (local time) for filtering
    now = datetime.datetime.now()
    start_of_day = datetime.datetime(now.year, now.month, now.day, 0, 0, 0)
    end_of_day = datetime.datetime(now.year, now.month, now.day, 23, 59, 59)
    
    # Convert to CoreData timestamps
    cd_start = start_of_day.timestamp() - CORE_DATA_EPOCH_OFFSET
    cd_end = end_of_day.timestamp() - CORE_DATA_EPOCH_OFFSET

    # Fetch SESSIONS
    query = """
    SELECT Z_PK, ZSTARTEDAT, ZDURATION, ZPHASE, ZTITLE, ZCOMPLETEDAT
    FROM ZSESSION
    WHERE ZSTARTEDAT >= ? AND ZSTARTEDAT <= ?
    ORDER BY ZSTARTEDAT ASC
    """
    cursor.execute(query, (cd_start, cd_end))
    rows = cursor.fetchall()
    
    all_sessions = []
    for row in rows:
        pk, started_at, duration_planned, phase, title, completed_at = row
        start_dt = core_data_to_datetime(started_at)

        completed_dt = core_data_to_datetime(completed_at) if completed_at else None
        if completed_dt:
            end_dt = completed_dt
        else:
            # In-progress session: treat "now" as the end so timestamps stay current.
            end_dt = now
            if end_dt < start_dt:
                end_dt = start_dt

        actual_duration_min = max(0, (end_dt - start_dt).total_seconds() / 60)

        all_sessions.append({
            "pk": pk,
            "pks": [pk],  # keep originals so we can merge duplicates safely
            "start": start_dt,
            "end": end_dt,
            "duration": duration_planned,        # planned focus duration (the intended 25/50/90 etc.)
            "planned_duration": duration_planned,
            "actual_elapsed": actual_duration_min,
            "completed_at": completed_dt,
            "phase": phase,
            "title": title,
            "interruptions_count": 0,
            "interruptions_duration": 0,
            "break_duration": 0
        })

    # Process Sessions:
    # 1. Filter for FLOW sessions only.
    # 2. Enrich with Interruptions and Breaks.
    
    flow_sessions = [s for s in all_sessions if s['phase'] == 'flow']
    break_sessions = [s for s in all_sessions if s['phase'] in ['shortBreak', 'longBreak']]

    def dedupe_sessions(sessions, start_tolerance_seconds=60):
        """
        Flow can emit twin rows for the same block (paused/resumed or stuck timers).
        Group by phase/title within the tolerance and clamp the merged end to
        completed rows if any exist so open twins cannot stretch to "now".
        """

        def same_group(a, b):
            if a['phase'] != b['phase']:
                return False
            if (a['title'] or "").strip() != (b['title'] or "").strip():
                return False
            return abs((a['start'] - b['start']).total_seconds()) <= start_tolerance_seconds

        groups = []
        for s in sorted(sessions, key=lambda x: x['start']):
            placed = False
            for grp in groups:
                if same_group(grp[0], s):
                    grp.append(s)
                    placed = True
                    break
            if not placed:
                groups.append([s])

        merged = []
        for grp in groups:
            def score(entry):
                completed = 1 if entry.get('completed_at') else 0
                actual = entry.get('actual_elapsed', 0) or 0
                end_ts = entry['end'].timestamp() if entry.get('end') else 0
                planned = entry.get('planned_duration', 0) or 0
                return (completed, actual, end_ts, planned)

            canonical = max(grp, key=score)

            starts = [g['start'] for g in grp if g.get('start')]
            completed_entries = [g for g in grp if g.get('completed_at')]
            if completed_entries:
                end_candidates = [g['end'] for g in completed_entries if g.get('end')]
            else:
                end_candidates = [g['end'] for g in grp if g.get('end')]

            # If a completed twin exists, anchor the start to the earliest
            # completed row so cancelled/aborted open twins don't pull the
            # block earlier than the session the user actually finished.
            if completed_entries:
                completed_starts = [g['start'] for g in completed_entries if g.get('start')]
                merged_start = min(completed_starts) if completed_starts else canonical.get('start')
            else:
                merged_start = min(starts) if starts else canonical.get('start')

            merged_end = max(end_candidates) if end_candidates else canonical.get('end')

            merged_entry = canonical.copy()
            merged_entry['start'] = merged_start
            merged_entry['end'] = merged_end
            merged_entry['pks'] = sorted(set(sum([g.get('pks', [g.get('pk')]) for g in grp], [])))
            # Interruptions should come from the anchored (completed) twin when present
            if completed_entries:
                merged_entry['interrupt_pks'] = sorted(
                    set(sum([g.get('pks', [g.get('pk')]) for g in completed_entries], []))
                )
            else:
                merged_entry['interrupt_pks'] = merged_entry['pks']

            merged_entry['pk'] = merged_entry['pks'][0] if merged_entry['pks'] else canonical.get('pk')
            merged_entry['planned_duration'] = max(g.get('planned_duration', 0) or 0 for g in grp)
            merged_entry['duration'] = merged_entry['planned_duration']
            merged_entry['is_open'] = not bool(completed_entries)
            if merged_entry.get('end') and merged_entry.get('start'):
                merged_entry['actual_elapsed'] = max(0, (merged_entry['end'] - merged_entry['start']).total_seconds() / 60)
            merged.append(merged_entry)

        return merged

    flow_sessions = dedupe_sessions(flow_sessions)
    flow_sessions.sort(key=lambda x: x['start'])

    def enrich_break(b):
        completed_dt = b['completed_at'] if b.get('completed_at') else None
        if completed_dt:
            end_dt = completed_dt
        else:
            end_dt = now
            if end_dt < b['start']:
                end_dt = b['start']
        b['actual_duration'] = max(0, (end_dt - b['start']).total_seconds() / 60)
        b['planned_duration'] = b.get("planned_duration") or b.get("duration")
        return b

    break_sessions = [enrich_break(b) for b in dedupe_sessions(break_sessions)]
    break_sessions.sort(key=lambda x: x['start'])
    
    end_of_day_dt = datetime.datetime(now.year, now.month, now.day, 23, 59, 59)
    lunch_window = _compute_dynamic_lunch_window(flow_sessions, LUNCH_WINDOW, reference_date=now.date())
    lunch_duration_minutes = 0
    if lunch_window:
        try:
            lunch_start_t, lunch_end_t = lunch_window
            lunch_start_dt = datetime.datetime.combine(now.date(), lunch_start_t)
            lunch_end_dt = datetime.datetime.combine(now.date(), lunch_end_t)
            if lunch_end_dt <= lunch_start_dt:
                lunch_end_dt += datetime.timedelta(days=1)
            lunch_duration_minutes = int(round((lunch_end_dt - lunch_start_dt).total_seconds() / 60.0))
        except Exception:
            lunch_duration_minutes = 0

    for idx, session in enumerate(flow_sessions):
        # Fetch Interruptions for this session (merge duplicates by keeping the max duration)
        # Use interruption PKs anchored to the completed twin when available to
        # avoid subtracting pauses from aborted/abandoned twins.
        pk_list = session.get("interrupt_pks") or session.get("pks") or [session["pk"]]
        total_count = 0
        total_duration = 0
        for pk in pk_list:
            cursor.execute(
                "SELECT count(*), sum(ZFINISHEDAT - ZSTARTEDAT) FROM ZINTERRUPTION WHERE ZSESSION = ?",
                (pk,),
            )
            int_row = cursor.fetchone()
            if not int_row:
                continue
            count_val = int_row[0] if int_row[0] else 0
            dur_val = int_row[1] if int_row[1] else 0
            total_duration += dur_val
            total_count += count_val

        session['interruptions_count'] = total_count
        session['interruptions_duration'] = total_duration
    
        # Find nearest subsequent break (first one after session end within gap cap)
        best_break = None
        for b in break_sessions:
            gap_seconds = (b['start'] - session['end']).total_seconds()
            if gap_seconds < 0:
                continue
            if gap_seconds <= BREAK_LINK_MAX_GAP_SECONDS:
                best_break = b
            break

        def anchor_lunch_window(end_dt, base_window, lead_minutes=15):
            """
            If end_dt falls within a reasonable lunch window window, anchor the lunch
            start at end_dt and keep the same duration as base_window.

            Returns (start_time, end_time) tuple or None.
            """
            if not base_window or not end_dt:
                return None

            base_start_t, base_end_t = base_window
            base_start_dt = datetime.datetime.combine(end_dt.date(), base_start_t)
            base_end_dt = datetime.datetime.combine(end_dt.date(), base_end_t)
            if base_end_dt <= base_start_dt:
                base_end_dt += datetime.timedelta(days=1)
            window_duration = base_end_dt - base_start_dt

            anchor_start_dt = base_start_dt - datetime.timedelta(minutes=lead_minutes)
            anchor_end_dt = base_end_dt
            if not (anchor_start_dt <= end_dt <= anchor_end_dt):
                return None

            anchored_start_dt = end_dt
            anchored_end_dt = end_dt + window_duration
            return (anchored_start_dt.time(), anchored_end_dt.time())

        anchored = anchor_lunch_window(session['end'], lunch_window)
        if anchored:
            # Lunch takes precedence for display/expectation even if Flow logged a shortBreak.
            session['anchored_lunch_window'] = anchored
            session['break_expected'] = lunch_duration_minutes or 60
            session['break_duration'] = session['break_expected']
            session['break_missing'] = False
            session['break_reason'] = "lunch"
            if best_break:
                session['linked_break_start'] = best_break['start']
        elif best_break:
            session['break_expected'] = get_expected_break_minutes(best_break)
            session['break_duration'] = session['break_expected']
            session['linked_break_start'] = best_break['start']
            session['break_missing'] = False
            session['break_reason'] = None
            session['anchored_lunch_window'] = None
        else:
            session['anchored_lunch_window'] = None
            session['break_expected'] = get_expected_break_minutes(None)
            session['break_duration'] = session['break_expected']
            session['break_missing'] = True
            session['break_reason'] = None

        # Overrun calculation: gap until next flow (or end of day), less lunch, less expected break
        if idx == len(flow_sessions) - 1:
            # No future flow: do not accrue overrun past the final block
            session['break_overrun'] = 0
        else:
            next_flow_start = flow_sessions[idx + 1]['start']
            effective_next_start = clamp_next_flow_within_day(session['end'], next_flow_start, REGULAR_DAY_END)
            if not effective_next_start or effective_next_start <= session['end']:
                session['break_overrun'] = 0
            else:
                gap_minutes = (effective_next_start - session['end']).total_seconds() / 60
                effective_lunch_window = session.get('anchored_lunch_window') or lunch_window
                lunch_overlap = overlap_minutes_with_window(session['end'], effective_next_start, effective_lunch_window)
                expected_break = session.get('break_expected', get_expected_break_minutes(best_break))
                # If lunch covers the gap, only count overrun beyond lunch plus any remaining expected break.
                expected_excl_lunch = max(0.0, expected_break - lunch_overlap)
                overrun_minutes = max(0.0, gap_minutes - lunch_overlap - expected_excl_lunch)
                # Half-up to nearest minute to reflect intuitive lateness (e.g., 1m55s -> 2m)
                overrun = int(overrun_minutes + 0.5)
                session['break_overrun'] = overrun
    
    conn.close()
    return flow_sessions

def _parse_frontmatter(lines):
    """
    Parse simple YAML-style key: value lines into an ordered dict.
    Ignores blank lines and comment lines starting with '#'.
    """
    data = OrderedDict()
    order = []
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if ":" not in stripped:
            continue
        key, value = stripped.split(":", 1)
        key = key.strip()
        value = value.strip()
        if key not in order:
            order.append(key)
        data[key] = value
    return order, data

def update_markdown(sessions):
    today = datetime.datetime.now().date()
    today_str = today.strftime("%Y-%m-%d")
    file_path = os.path.join(JOURNAL_DIR, f"{today_str}.md")
        
    # TEMPLATE PATH
    TEMPLATE_PATH = "/Users/edo/Documents/Obsidian/the-vault/notes/templates/daily.md"
        
    if not os.path.exists(file_path):
        if os.path.exists(TEMPLATE_PATH):
            try:
                with open(TEMPLATE_PATH, 'r') as tf:
                    template_content = tf.read()
                with open(file_path, 'w') as f:
                    f.write(template_content)
            except Exception as e:
                print(f"Error creating file from template: {e}")
                return
        else:
            return
    
    with open(file_path, 'r') as f:
        content = f.read()
    
    lines = content.splitlines()
    
    # Preserve existing notes keyed by session start time (HH:MM)
    existing_notes = {}
    table_header_re = re.compile(r"^\|\s*TIME\s*\|\s*ACTIVITY\s*\|\s*(FOCUS|DURATION)\s*\|\s*(PAUSE|INTERRUPT)\s*\|\s*BREAK\s*\|\s*NOTES\s*\|", re.IGNORECASE)
    header_idx = -1
    for i, line in enumerate(lines):
        if table_header_re.match(line.strip()):
            header_idx = i
            break
    if header_idx != -1:
        row_start = header_idx + 2  # skip header and separator
        for i in range(row_start, len(lines)):
            if not lines[i].lstrip().startswith("|"):
                break
            parts = [p.strip() for p in lines[i].split("|")]
            if len(parts) < 7:
                continue
            time_cell = parts[1].replace("`", "")
            time_match = re.search(r"([0-2][0-9]:[0-5][0-9])", time_cell)
            if not time_match:
                continue
            start_key = time_match.group(1)
            note_content = parts[6]
            if note_content and note_content != "❌":
                existing_notes[start_key] = note_content
    
    # Construct New Table
    new_table_lines = []
    if sessions:
        header = "| {:<13} | {:<20} | {:<10} | {:<12} | {:<10} | {:<30} |".format(
            "TIME", "ACTIVITY", "DURATION", "INTERRUPT", "BREAK", "NOTES"
        )
        separator = "| {:<13} | {:<20} | {:<10} | {:<12} | {:<10} | {:<30} |".format(
            "-------------", "--------------------", "----------", "------------", "----------", "------------------------------"
        )
        
        new_table_lines = [header, separator]
    
        # Generate rows from sessions
        for i, session in enumerate(sessions):
            start_s = session['start'].strftime("%H:%M")
            end_s = session['end'].strftime("%H:%M")
            time_str = f"`{start_s} - {end_s}`"

            title = session['title']
            if title and title.lower() != "flow":
                activity_str = title
            elif title:
                activity_str = "Flow"
            else:
                activity_str = "Flow" # Default if title is None

            actual_minutes = session.get('actual_elapsed', 0) or 0
            interrupt_minutes = (session.get('interruptions_duration', 0) or 0) / 60.0

            # Hybrid rounding: keep pauses tidy to whole minutes for display, but
            # subtract the raw pause minutes and round the final focus once.
            interrupt_rounded = round_half_up(interrupt_minutes)
            focus_rounded = max(0, round_half_up(actual_minutes - interrupt_minutes))

            session['focus_minutes'] = focus_rounded
            session['focus_minutes_rounded'] = focus_rounded

            duration_str = f"`{format_minutes(focus_rounded)}`"

            int_dur_min = interrupt_rounded

            if int_dur_min > 0:
                interrupt_str = f"`+{int_dur_min:02d}m`"
            else:
                interrupt_str = "`+00m`"

            break_str = ""
            break_expected_val = session.get('break_expected', session.get('break_duration', 0)) or 0
            break_min = ceil_minutes(break_expected_val)
            overrun = int(session.get('break_overrun', 0))
            break_reason = session.get('break_reason')
            if break_min > 0:
                break_display = f"{break_min}m" if break_reason == "lunch" else format_minutes(break_min)
                parts = []
                # Suppress explicit "lunch" label; keep other reasons if ever added
                if break_reason and break_reason != "lunch":
                    parts.append(break_reason)
                if session.get('break_missing', False):
                    parts.append("missing")
                if overrun > 0:
                    parts.append(f"+{format_minutes(overrun)}")

                if parts:
                    break_str = f"`{break_display} ({', '.join(parts)})`"
                else:
                    break_str = f"`{break_display}`"

            # Restore Note
            notes_str = existing_notes.get(start_s, "")
            
            row = "| {:<13} | {:<20} | {:<10} | {:<12} | {:<10} | {:<30} |".format(
                time_str, activity_str, duration_str, interrupt_str, break_str, notes_str
            )
            new_table_lines.append(row)
        
    # Find YAML end
    yaml_end_idx = -1
    dashes_count = 0
    for i, line in enumerate(lines):
        if line.strip() == "---":
            dashes_count += 1
            if dashes_count == 2:
                yaml_end_idx = i
                break

    # Normalize spacing: do not allow blank lines immediately after YAML.
    if yaml_end_idx != -1:
        while yaml_end_idx + 1 < len(lines) and lines[yaml_end_idx + 1].strip() == "":
            del lines[yaml_end_idx + 1]

    def find_top_header_idx(title, start=0):
        pattern = re.compile(rf"^\s*##\s+{re.escape(title)}\s*$", re.IGNORECASE)
        for idx in range(start, len(lines)):
            if pattern.match(lines[idx]):
                return idx
        return -1

    def find_top_section_end(start_idx):
        if start_idx == -1:
            return -1
        for idx in range(start_idx + 1, len(lines)):
            if re.match(r"^\s*##\s+[^#]", lines[idx]):
                return idx
        return len(lines)

    def ensure_divider_after_header(header_idx):
        if header_idx == -1:
            return -1

        for idx in range(header_idx + 1, len(lines)):
            stripped = lines[idx].strip()
            if stripped == "":
                continue
            if stripped == "---":
                return idx
            lines.insert(header_idx + 1, "---")
            return header_idx + 1

        lines.append("---")
        return len(lines) - 1

    # Ensure Goals section exists (immediately below YAML, before Metrics).
    goals_idx = find_top_header_idx("Goals")
    metrics_idx = find_top_header_idx("Metrics")
    if goals_idx == -1:
        insert_pos = yaml_end_idx + 1 if yaml_end_idx != -1 else 0
        lines[insert_pos:insert_pos] = ["## Goals", "---"]

    goals_idx = find_top_header_idx("Goals")
    ensure_divider_after_header(goals_idx)

    # Ensure Metrics section exists (after Goals).
    metrics_idx = find_top_header_idx("Metrics")
    if metrics_idx == -1:
        if goals_idx != -1:
            insert_pos = find_top_section_end(goals_idx)
        else:
            insert_pos = yaml_end_idx + 1 if yaml_end_idx != -1 else 0
        lines[insert_pos:insert_pos] = ["## Metrics", "---"]

    # Clean up Goals before we touch Metrics so stray tables cannot remain there.
    goals_idx = find_top_header_idx("Goals")
    _normalize_goals_section(lines, goals_idx)

    metrics_idx = find_top_header_idx("Metrics")
    goals_idx = find_top_header_idx("Goals")
    metrics_idx = find_top_header_idx("Metrics")
    metrics_sep_idx = ensure_divider_after_header(metrics_idx)

    # Carry forward yesterday's incomplete Goals exactly once per day.
    yesterday = today - datetime.timedelta(days=1)
    _carry_forward_goals(lines, goals_idx, today, yesterday)

    # Identify where Reflections starts to preserve everything after it.
    reflections_idx = find_top_header_idx("Reflections", start=(metrics_sep_idx + 1 if metrics_sep_idx != -1 else 0))

    rest_lines = lines[reflections_idx:] if reflections_idx != -1 else []
    metrics_body = (
        lines[metrics_sep_idx + 1 : reflections_idx]
        if reflections_idx != -1
        else lines[metrics_sep_idx + 1 :]
    )
    # Calculate Total Study Time
    total_focus_minutes = sum(s.get('focus_minutes_rounded', 0) for s in sessions)
    hours = total_focus_minutes // 60
    minutes = total_focus_minutes % 60
    study_str = f"{hours}h{minutes}m"

    # ICLOUD PATHS
    ICLOUD_SHORTCUTS_DIR = "/Users/edo/Library/Mobile Documents/iCloud~is~workflow~my~workflows/Documents"
    ICLOUD_JOURNALSYNC_DIR = os.path.join(ICLOUD_SHORTCUTS_DIR, "JournalSync")

    # Load activity status files (Workout and Stretching); presence alone signals completion.
    def load_status(filename):
        """
        Read and JSON-parse a status file dropped in iCloud by Shortcuts.

        Observed issue: the LaunchAgent triggers as soon as iCloud creates the
        placeholder file, which can be empty or partially synced. We used to
        delete the file regardless of parse success, losing the data. To make
        this resilient we now:
        - Wait for the file size to stabilize (to avoid half-synced reads).
        - Retry for up to ~60 seconds before giving up.
        - Only delete the file after a successful parse.
        - If parsing never succeeds, we keep a `.invalid` copy for inspection
          and return (False, None) without touching frontmatter.
        """
        path = os.path.join(ICLOUD_JOURNALSYNC_DIR, filename)

        def try_parse(target_path, delete_after):
            """
            Wait for the file to finish syncing by checking for stable size,
            then attempt to parse JSON. Returns (success: bool, data, last_err).
            """
            last_size = None
            stable_count = 0
            max_attempts = 60           # up to ~60s total
            stable_needed = 2           # need two consecutive stable reads
            last_err = None

            for attempt in range(max_attempts):
                try:
                    size = os.path.getsize(target_path)
                except FileNotFoundError:
                    # File disappeared; treat as not ready
                    last_err = FileNotFoundError("file disappeared while waiting")
                    time.sleep(1.0)
                    continue

                if size == 0:
                    last_err = ValueError("empty file (likely still syncing)")
                    stable_count = 0
                    time.sleep(1.0)
                    continue

                if last_size is not None and size == last_size:
                    stable_count += 1
                else:
                    stable_count = 0
                    last_size = size

                if stable_count < stable_needed:
                    time.sleep(1.0)
                    continue

                try:
                    with open(target_path, "r") as f:
                        raw = f.read()
                    data = json.loads(raw)
                    if delete_after:
                        try:
                            os.remove(target_path)
                        except Exception:
                            pass
                    return True, data, None
                except Exception as e:
                    last_err = e
                    time.sleep(1.0)

            return False, None, last_err

        def cleanup_invalids(primary_path):
            """Remove all .invalid variants for the given primary path."""
            invalids = glob.glob(primary_path + ".invalid") + glob.glob(primary_path + ".*.invalid")
            for inv in invalids:
                try:
                    os.remove(inv)
                except Exception:
                    pass

        def parse_with_fallback(primary_path):
            # First try the primary path
            if os.path.exists(primary_path):
                success, data, last_err = try_parse(primary_path, delete_after=True)
                if success:
                    cleanup_invalids(primary_path)
                    return True, data
                # Promote the failed file to an .invalid copy for inspection/retry.
                backup_path = primary_path + ".invalid"
                try:
                    if os.path.exists(backup_path):
                        ts = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
                        backup_path = f"{primary_path}.{ts}.invalid"
                    os.replace(primary_path, backup_path)
                except Exception:
                    pass
            else:
                # Missing is expected most of the time; treat as no new data without logging.
                return False, None

            # Fallback: reprocess any existing .invalid copies (most recent first)
            candidates = glob.glob(primary_path + ".invalid") + glob.glob(primary_path + ".*.invalid")
            candidates = sorted(set(candidates), key=lambda p: os.path.getmtime(p), reverse=True)
            for cand in candidates:
                success, data, _ = try_parse(cand, delete_after=False)
                if success:
                    # Successful parse from an .invalid copy; clean up all invalids.
                    cleanup_invalids(primary_path)
                    return True, data

            print(f"Failed to parse {os.path.basename(primary_path)}: {last_err}")
            return False, None

        return parse_with_fallback(path)

    workout_done, workout_data = load_status("workout_status.json")
    stretch_done, stretch_data = load_status("stretching_status.json")
    sleep_done, sleep_data = load_status("sleep_status.json")

    # Extract existing blocks (for fallback when no new status files)
    def extract_block(body_lines, header_lower):
        """
        Return the block that starts at header_lower and stops before the next
        section header (### or ##). This prevents runaway duplication when the
        same block has already been injected multiple times.
        """
        start_idx = -1
        for idx, line in enumerate(body_lines):
            if line.strip().lower() == header_lower:
                start_idx = idx
                break
        if start_idx == -1:
            return []

        end_idx = len(body_lines)
        for idx in range(start_idx + 1, len(body_lines)):
            stripped = body_lines[idx].strip()
            if stripped.startswith("### ") or stripped.startswith("## "):
                end_idx = idx
                break

        # Trim trailing blank lines within the block
        while end_idx > start_idx and body_lines[end_idx - 1].strip() == "":
            end_idx -= 1

        return body_lines[start_idx:end_idx]

    existing_training_block = extract_block(metrics_body, "### training")
    existing_sleep_block = extract_block(metrics_body, "### sleep")

    def parse_training_table(block_lines):
        """
        Convert an existing TRAINING table into structured entries so we can
        merge new workouts/stretching events without dropping prior ones.
        """
        entries = []
        header_re = re.compile(r"^\|\s*TIME\s*\|\s*ACTIVITY\s*\|", re.IGNORECASE)
        header_idx = -1
        for idx, line in enumerate(block_lines):
            if header_re.search(line):
                header_idx = idx
                break
        if header_idx == -1:
            return entries

        row_start = header_idx + 2  # skip header and separator
        for line in block_lines[row_start:]:
            if not line.lstrip().startswith("|"):
                break
            parts = [p.strip() for p in line.split("|")]
            if len(parts) < 5:
                continue
            raw_time = parts[1].strip("` ").replace("`", "")
            activity = parts[2]
            duration = parts[3].strip("` ").replace("`", "")
            calories = parts[4].strip("` ").replace("`", "")

            start_val = None
            end_val = None
            time_match = re.match(r"^([0-2]\d:[0-5]\d)(?:\s*-\s*([0-2]\d:[0-5]\d))?$", raw_time)
            if time_match:
                start_val = time_match.group(1)
                end_val = time_match.group(2)

            entries.append({
                "start": start_val,
                "end": end_val,
                "time_raw": raw_time,
                "activity": activity,
                "duration": duration,
                "calories": calories,
            })
        return entries

    existing_training_entries = parse_training_table(existing_training_block)

    # Rebuild Metrics section from scratch (idempotent)
    final_lines = lines[:metrics_sep_idx + 1]
    final_lines.append("### STUDY")
    if new_table_lines:
        final_lines.append("")  # blank before study table
        final_lines.extend(new_table_lines)
        final_lines.append("")  # blank after study table
    else:
        final_lines.append("")  # blank before the no-study message
        final_lines.append("_No study sessions completed today._")
        final_lines.append("")

    # Build/merge Training table
    def load_training_cache(date_str):
        try:
            with open(TRAINING_CACHE_PATH, "r") as f:
                obj = json.load(f)
            if obj.get("date") == date_str and isinstance(obj.get("entries"), list):
                return obj.get("entries") or []
        except Exception:
            pass
        return []

    def save_training_cache(date_str, entries):
        try:
            os.makedirs(os.path.dirname(TRAINING_CACHE_PATH), exist_ok=True)
            with open(TRAINING_CACHE_PATH, "w") as f:
                json.dump({"date": date_str, "entries": entries}, f)
        except Exception:
            pass

    def activity_entries_from_data(data, default_activity_label):
        """
        Normalize workout/stretch JSON payloads into training table entries.
        """
        entries_out = []
        if not data:
            return entries_out
        try:
            source_entries = data if isinstance(data, list) else [data]
            for entry in source_entries:
                start_raw = (entry.get("start") or "").strip()
                end_raw = (entry.get("end") or "").strip()
                dur_val = entry.get("duration")
                kcal_val = entry.get("kcal")
                activity_val = entry.get("type") or default_activity_label

                duration_fmt = ""
                if dur_val is not None:
                    duration_fmt = format_minutes_seconds(float(dur_val))

                calories_fmt = ""
                if kcal_val is not None:
                    calories_fmt = f"{int(round(float(kcal_val)))} kcal"

                if start_raw and end_raw:
                    time_raw = f"{start_raw} - {end_raw}"
                else:
                    time_raw = start_raw or ""

                entries_out.append({
                    "start": start_raw or None,
                    "end": end_raw or None,
                    "time_raw": time_raw,
                    "activity": activity_val,
                    "duration": duration_fmt,
                    "calories": calories_fmt,
                })
        except Exception:
            entries_out = []
        return entries_out

    def merge_training_entries(existing, new):
        """
        Deduplicate training rows while letting new entries override prior ones
        when they share the same identifying key.
        """
        merged = OrderedDict()

        def key(entry):
            return (
                entry.get("start") or "",
                entry.get("end") or "",
                (entry.get("activity") or "").strip().lower(),
                entry.get("duration") or "",
                entry.get("calories") or "",
            )

        for e in existing:
            merged[key(e)] = e
        for e in new:
            merged[key(e)] = e
        return list(merged.values())

    def render_training_entries(entries):
        if not entries:
            return []

        def to_minutes(val):
            try:
                h, m = map(int, val.split(":"))
                return h * 60 + m
            except Exception:
                return None

        def sort_key(e):
            mins = to_minutes(e.get("start") or "")
            return (mins if mins is not None else 24 * 60 + 1, e.get("activity") or "")

        ordered = sorted(entries, key=sort_key)
        header = "| {:<13} | {:<15} | {:<12} | {:<12} |".format("TIME", "ACTIVITY", "DURATION", "CALORIES")
        separator = "| {:<13} | {:<15} | {:<12} | {:<12} |".format("-------------", "---------------", "------------", "------------")
        lines_out = [header, separator]
        for entry in ordered:
            if entry.get("start") and entry.get("end"):
                time_cell = f"`{entry['start']} - {entry['end']}`"
            elif entry.get("start"):
                time_cell = f"`{entry['start']}`"
            elif entry.get("time_raw"):
                time_cell = f"`{entry['time_raw']}`"
            else:
                time_cell = ""

            duration_cell = f"`{entry['duration']}`" if entry.get("duration") else ""
            calories_cell = f"`{entry['calories']}`" if entry.get("calories") else ""

            row = "| {:<13} | {:<15} | {:<12} | {:<12} |".format(
                time_cell, entry.get("activity", ""), duration_cell, calories_cell
            )
            lines_out.append(row)
        return lines_out

    workout_entries = activity_entries_from_data(workout_data, "Workout")
    stretch_entries = activity_entries_from_data(stretch_data, "Stretching")
    new_training_entries = workout_entries + stretch_entries

    # Persist today's training entries so workout/stretch files can arrive in
    # separate runs without losing earlier ones. Cache is per-day and ignores
    # whatever might be in the template.
    training_cache_entries = load_training_cache(today_str)

    merged_training_entries = []
    if new_training_entries:
        merged_training_entries = merge_training_entries(training_cache_entries, new_training_entries)
        save_training_cache(today_str, merged_training_entries)
    elif training_cache_entries:
        merged_training_entries = training_cache_entries
    elif existing_training_block:
        # As a last resort (e.g., cache deleted), fall back to the note's block.
        merged_training_entries = existing_training_entries

    if merged_training_entries:
        if not final_lines or final_lines[-1].strip() != "":
            final_lines.append("")
        final_lines.append("### TRAINING")
        final_lines.append("")
        final_lines.extend(render_training_entries(merged_training_entries))
        final_lines.append("")
    else:
        # Insert explicit placeholder when no training data
        if not final_lines or final_lines[-1].strip() != "":
            final_lines.append("")
        final_lines.append("### TRAINING")
        final_lines.append("")
        final_lines.append("_No training sessions completed today._")
        final_lines.append("")

    # Build Sleep table if data is available
    def build_sleep_table(data):
        lines_out = []
        if not data:
            return lines_out
        try:
            header = "| {:<13} | {:<12} | {:<10} | {:<14} |".format("TIME", "DURATION", "AWAKE", "AWAKENINGS")
            separator = "| {:<13} | {:<12} | {:<10} | {:<14} |".format("-------------", "------------", "----------", "--------------")
            lines_out = [header, separator]

            def parse_time(raw):
                if not raw:
                    return ""
                for fmt in ("%d %b %Y at %H:%M", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%d %H:%M:%S"):
                    try:
                        dt = datetime.datetime.strptime(raw, fmt)
                        return dt.strftime("%H:%M")
                    except Exception:
                        continue
                # If parsing fails, return raw truncated
                return raw

            start_raw = data.get("start") or data.get("SleepBegin") or data.get("SleepStart")
            end_raw = data.get("end") or data.get("SleepEnd")
            sleep_min = data.get("sleep_min") or data.get("SleepMinutes")
            awake_min = data.get("awake_min") or data.get("AwakeMinutes")
            awake_count = data.get("awake_count") or data.get("AwakeCount")

            time_cell = ""
            start_fmt = parse_time(start_raw)
            end_fmt = parse_time(end_raw)
            if start_fmt and end_fmt:
                time_cell = f"`{start_fmt} - {end_fmt}`"
            elif start_fmt:
                time_cell = f"`{start_fmt}`"

            duration_cell = ""
            if sleep_min is not None:
                duration_cell = f"`{format_minutes_seconds(float(sleep_min))}`"

            awake_cell = ""
            if awake_min is not None:
                awake_cell = f"`{int(round(float(awake_min)))}m`"

            wakes_cell = ""
            if awake_count is not None:
                wakes_cell = f"`{int(awake_count)} times`"

            row = "| {:<13} | {:<12} | {:<10} | {:<14} |".format(time_cell, duration_cell, awake_cell, wakes_cell)
            lines_out.append(row)
        except Exception:
            lines_out = []
        return lines_out

    sleep_table_lines = build_sleep_table(sleep_data)

    if sleep_table_lines:
        if not final_lines or final_lines[-1].strip() != "":
            final_lines.append("")
        final_lines.append("### SLEEP")
        final_lines.append("")
        final_lines.extend(sleep_table_lines)
        final_lines.append("")
    elif existing_sleep_block:
        if not final_lines or final_lines[-1].strip() != "":
            final_lines.append("")
        final_lines.extend(existing_sleep_block)
        if final_lines and final_lines[-1].strip() != "":
            final_lines.append("")

    final_lines.extend(rest_lines)

    # Sleep is now entered manually; no automated sleep import
    sleep_str = ""

    # Update YAML Frontmatter only
    first_dash_idx = -1
    second_dash_idx = -1
    for i, line in enumerate(final_lines):
        if line.strip() == "---":
            if first_dash_idx == -1:
                first_dash_idx = i
            elif second_dash_idx == -1:
                second_dash_idx = i
                break

    if first_dash_idx != -1 and second_dash_idx != -1 and second_dash_idx > first_dash_idx:
        fm_lines = final_lines[first_dash_idx + 1 : second_dash_idx]
        fm_order, fm_data = _parse_frontmatter(fm_lines)

        def set_value(key, value):
            if key not in fm_order:
                fm_order.append(key)
            fm_data[key] = value

        # Mandatory overwrite
        set_value("study", study_str)

        # Workout: flip to true only when status file says so; otherwise preserve or default to false
        if workout_done:
            set_value("workout", "true")
        else:
            current_workout = fm_data.get("workout", "")
            set_value("workout", current_workout if current_workout else "false")

        # Stretch: flip to true only when status file says so; otherwise preserve or default to false
        if stretch_done:
            set_value("stretch", "true")
        else:
            current_stretch = fm_data.get("stretch", "")
            set_value("stretch", current_stretch if current_stretch else "false")

        # Sleep: update if provided; else preserve manual entry
        if sleep_data and (sleep_data.get("sleep_min") or sleep_data.get("SleepMinutes")):
            try:
                total_min = float(sleep_data.get("sleep_min") or sleep_data.get("SleepMinutes"))
                hours = int(total_min) // 60
                mins = int(total_min) % 60
                sleep_str = f"{hours}h{mins:02d}m" if mins else f"{hours}h"
                set_value("sleep", sleep_str)
            except Exception:
                pass

        # Stretch/mood/sleep and other keys: preserve as-is

        new_fm_lines = [f"{key}: {fm_data.get(key, '')}".rstrip() for key in fm_order]
        final_lines = (
            final_lines[: first_dash_idx + 1]
            + new_fm_lines
            + final_lines[second_dash_idx:]
        )

    new_content = "\n".join(final_lines)
    
    try:
        with open(file_path, 'r') as f:
            current_content = f.read()
    except FileNotFoundError:
        current_content = ""
        
    if new_content.strip() == current_content.strip():
        return False

    with open(file_path, 'w') as f:
        f.write(new_content)
    print(f"Successfully updated {file_path} (Study Time: {study_str})")
    return True

if __name__ == "__main__":
    sessions = get_todays_sessions()
    changed = update_markdown(sessions)
    if changed is False:
        # Suppress noisy success logs on no-op runs.
        pass
