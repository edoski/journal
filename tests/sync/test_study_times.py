import datetime
import json
import sync.daily.icloud as icloud


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


def test_study_times_late_start_falls_back(monkeypatch, tmp_path):
    path = tmp_path / "study_times.json"
    monkeypatch.setattr(icloud, "STUDY_TIMES_ICLOUD_PATH", str(path))

    sessions = [_session("17:00", "18:00")]
    icloud.write_study_times_to_icloud(sessions, "2025-01-01")

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
    icloud.write_study_times_to_icloud(sessions, "2025-01-01")

    data = json.loads(path.read_text())
    assert data == {
        "date": "2025-01-01",
        "morning_start": "09:00",
        "lunch_start": "13:30",
        "afternoon_start": "14:30",
        "afternoon_end": "15:00",
    }
