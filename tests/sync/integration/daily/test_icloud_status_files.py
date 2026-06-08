import builtins
import datetime
import errno
import json

from sync.adapters.icloud_status import ICloudDailyStatusSource
from sync.adapters.json_daily_cache import JsonDailyScreenTimeCacheStore
import sync.daily.icloud as icloud


def test_read_status_file_reprocesses_existing_pending_without_primary(
    monkeypatch, tmp_path
):
    monkeypatch.setattr(icloud, "ICLOUD_JOURNALSYNC_DIR", str(tmp_path))
    monkeypatch.setattr(icloud, "STATUS_STAGING_DIR", str(tmp_path / "cache"))
    monkeypatch.setattr(icloud, "_READ_RETRY_SECONDS", 0)

    pending_dir = tmp_path / "cache"
    pending_dir.mkdir()
    pending_path = pending_dir / "activity_status.json.1.1.pending"
    pending_path.write_text(
        json.dumps({"date": "2026-05-22", "activity_ipad": "", "activity_iphone": ""}),
        encoding="utf-8",
    )

    success, payload, parsed_path = icloud.read_status_file("activity_status.json")

    assert success is True
    assert payload == {
        "date": "2026-05-22",
        "activity_ipad": "",
        "activity_iphone": "",
    }
    assert parsed_path == str(pending_path)


def test_read_status_file_claims_primary_before_reading(monkeypatch, tmp_path):
    monkeypatch.setattr(icloud, "ICLOUD_JOURNALSYNC_DIR", str(tmp_path))
    monkeypatch.setattr(icloud, "STATUS_STAGING_DIR", str(tmp_path / "cache"))
    monkeypatch.setattr(icloud, "_READ_RETRY_SECONDS", 0)

    path = tmp_path / "activity_status.json"
    path.write_text(
        json.dumps({"date": "2026-05-22", "activity_ipad": "", "activity_iphone": ""}),
        encoding="utf-8",
    )

    original_open = builtins.open

    def locked_open(target, *args, **kwargs):
        if target == str(path):
            raise OSError(errno.EDEADLK, "Resource deadlock avoided")
        return original_open(target, *args, **kwargs)

    monkeypatch.setattr(builtins, "open", locked_open)

    success, payload, parsed_path = icloud.read_status_file("activity_status.json")

    assert success is True
    assert payload == {
        "date": "2026-05-22",
        "activity_ipad": "",
        "activity_iphone": "",
    }
    assert parsed_path is not None
    assert parsed_path.startswith(str(tmp_path / "cache"))
    assert not path.exists()
    assert not (tmp_path / "activity_status.json.invalid").exists()


def test_sleep_status_file_is_claimed_and_loaded(monkeypatch, tmp_path):
    monkeypatch.setattr(icloud, "ICLOUD_JOURNALSYNC_DIR", str(tmp_path))
    monkeypatch.setattr(icloud, "STATUS_STAGING_DIR", str(tmp_path / "cache"))
    monkeypatch.setattr(icloud, "_READ_RETRY_SECONDS", 0)

    day = datetime.date(2026, 6, 7)
    path = tmp_path / "sleep_status.json"
    path.write_text(
        json.dumps(
            {
                "date": day.isoformat(),
                "start": "2026-06-06T23:30:00+0000",
                "end": "2026-06-07T07:05:00+0000",
                "sleep_min": 455,
                "awake_min": 12,
                "awake_count": 2,
            }
        ),
        encoding="utf-8",
    )

    adapter = ICloudDailyStatusSource(
        screen_time_cache_store=JsonDailyScreenTimeCacheStore(
            cache_dir=str(tmp_path / "screen-time"),
            lock_root=str(tmp_path / "locks"),
        )
    )

    assert adapter.target_days(day) == (day,)
    sleep = adapter.load_sleep(day)

    assert sleep is not None
    assert sleep.sleep_min == 455
    assert not path.exists()
    assert not list((tmp_path / "cache").glob("*.pending"))
