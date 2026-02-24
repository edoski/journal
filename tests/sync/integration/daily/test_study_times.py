import datetime
import json
import sync.daily.icloud as icloud

from sync.contracts.schedule import DayScheduleProfile


def _session(start_hm: str, end_hm: str) -> dict:
    """Create a minimal study-session payload for tests."""
    today = datetime.date(2025, 1, 1)  # fixed date to keep datetimes comparable
    start_h, start_m = map(int, start_hm.split(":"))
    end_h, end_m = map(int, end_hm.split(":"))
    return {
        "start": datetime.datetime.combine(today, datetime.time(start_h, start_m)),
        "end": datetime.datetime.combine(today, datetime.time(end_h, end_m)),
        "title": "Study",
    }


def _default_schedule() -> DayScheduleProfile:
    return DayScheduleProfile(
        study_start=datetime.time(8, 0),
        study_end=datetime.time(18, 0),
        lunch_start=datetime.time(13, 30),
        lunch_end=datetime.time(14, 30),
        workout_start=datetime.time(18, 0),
        is_off_day=False,
    )


def test_study_times_late_start_falls_back(monkeypatch, tmp_path):
    path = tmp_path / "study_times.json"
    monkeypatch.setattr(icloud, "STUDY_TIMES_ICLOUD_PATH", str(path))

    sessions = [_session("17:00", "18:00")]
    icloud.write_study_times_to_icloud(sessions, "2025-01-01", _default_schedule())

    data = json.loads(path.read_text())
    assert data == {
        "date": "2025-01-01",
        "morning_start": "08:00",
        "lunch_start": "13:30",
        "afternoon_start": "14:30",
        "afternoon_end": "18:00",
    }


def test_study_times_normal_day(monkeypatch, tmp_path):
    path = tmp_path / "study_times.json"
    monkeypatch.setattr(icloud, "STUDY_TIMES_ICLOUD_PATH", str(path))

    sessions = [
        _session("09:00", "11:00"),
        _session("14:00", "15:00"),
    ]
    icloud.write_study_times_to_icloud(sessions, "2025-01-01", _default_schedule())

    data = json.loads(path.read_text())
    assert data == {
        "date": "2025-01-01",
        "morning_start": "09:00",
        "lunch_start": "13:30",
        "afternoon_start": "14:30",
        "afternoon_end": "15:00",
    }


def test_study_times_uses_schedule_defaults(monkeypatch, tmp_path):
    path = tmp_path / "study_times.json"
    monkeypatch.setattr(icloud, "STUDY_TIMES_ICLOUD_PATH", str(path))
    custom_schedule = DayScheduleProfile(
        study_start=datetime.time(14, 30),
        study_end=datetime.time(19, 0),
        lunch_start=datetime.time(13, 30),
        lunch_end=datetime.time(14, 30),
        workout_start=datetime.time(19, 0),
        is_off_day=False,
    )

    sessions = [_session("17:00", "18:00")]
    icloud.write_study_times_to_icloud(sessions, "2025-01-01", custom_schedule)

    data = json.loads(path.read_text())
    assert data["morning_start"] == "14:30"
    assert data["lunch_start"] == "13:30"
