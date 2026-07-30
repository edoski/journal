import datetime
import errno
import json

import sync.adapters.icloud_status as icloud
from sync.adapters.icloud_status import ICloudDailyStatusSource


def test_adapter_reprocesses_existing_pending_without_primary(monkeypatch, tmp_path):
    monkeypatch.setattr(icloud, "ICLOUD_JOURNALSYNC_DIR", str(tmp_path))
    monkeypatch.setattr(icloud, "STATUS_STAGING_DIR", str(tmp_path / "cache"))
    monkeypatch.setattr(icloud, "_READ_RETRY_SECONDS", 0)

    pending_dir = tmp_path / "cache"
    pending_dir.mkdir()
    pending_path = pending_dir / "workout_status.json.1.1.pending"
    pending_path.write_text(
        json.dumps({"date": "2026-05-22", "duration": 30}),
        encoding="utf-8",
    )

    day = datetime.date(2026, 5, 22)
    adapter = ICloudDailyStatusSource()

    assert adapter.target_days(day) == (day,)
    assert adapter.load_training(day).workout_entries[0].duration == 30
    assert not pending_path.exists()


def test_adapter_claims_primary_after_hydrating(monkeypatch, tmp_path):
    monkeypatch.setattr(icloud, "ICLOUD_JOURNALSYNC_DIR", str(tmp_path))
    monkeypatch.setattr(icloud, "STATUS_STAGING_DIR", str(tmp_path / "cache"))
    monkeypatch.setattr(icloud, "_READ_RETRY_SECONDS", 0)

    path = tmp_path / "workout_status.json"
    path.write_text(
        json.dumps({"date": "2026-05-22", "duration": 30}),
        encoding="utf-8",
    )

    replaced: list[tuple[str, str]] = []
    original_replace = icloud.os.replace

    def tracking_replace(source, target):
        if source == str(path):
            replaced.append((source, target))
        return original_replace(source, target)

    monkeypatch.setattr(icloud.os, "replace", tracking_replace)

    day = datetime.date(2026, 5, 22)
    adapter = ICloudDailyStatusSource()

    assert adapter.target_days(day) == (day,)
    assert adapter.load_training(day).workout_done
    assert len(replaced) == 1
    assert replaced[0][0] == str(path)
    assert replaced[0][1].startswith(str(tmp_path / "cache"))
    assert not path.exists()
    assert not (tmp_path / "workout_status.json.invalid").exists()


def test_adapter_copies_when_icloud_replace_deadlocks(monkeypatch, tmp_path):
    monkeypatch.setattr(icloud, "ICLOUD_JOURNALSYNC_DIR", str(tmp_path))
    monkeypatch.setattr(icloud, "STATUS_STAGING_DIR", str(tmp_path / "cache"))
    monkeypatch.setattr(icloud, "_READ_RETRY_SECONDS", 0)

    path = tmp_path / "workout_status.json"
    path.write_text(
        json.dumps({"date": "2026-05-22", "duration": 30}),
        encoding="utf-8",
    )

    original_replace = icloud.os.replace

    def deadlocked_primary_replace(source, target):
        if source == str(path):
            raise OSError(errno.EDEADLK, "Resource deadlock avoided")
        return original_replace(source, target)

    monkeypatch.setattr(icloud.os, "replace", deadlocked_primary_replace)

    day = datetime.date(2026, 5, 22)
    adapter = ICloudDailyStatusSource()

    assert adapter.target_days(day) == (day,)
    assert adapter.load_training(day).workout_done
    assert not path.exists()
    assert not list((tmp_path / "cache").glob("*.pending"))


def test_adapter_defers_stale_icloud_handle(monkeypatch, tmp_path):
    monkeypatch.setattr(icloud, "ICLOUD_JOURNALSYNC_DIR", str(tmp_path))
    monkeypatch.setattr(icloud, "STATUS_STAGING_DIR", str(tmp_path / "cache"))
    monkeypatch.setattr(icloud, "_READ_RETRY_SECONDS", 0)

    path = tmp_path / "sleep_status.json"
    path.write_text(json.dumps({"date": "2026-06-07"}), encoding="utf-8")

    def stale_replace(source, target):
        if source == str(path):
            raise OSError(errno.ESTALE, "Stale NFS file handle")
        return None

    original_remove = icloud.os.remove

    def stale_remove(target):
        if target == str(path):
            raise OSError(errno.ESTALE, "Stale NFS file handle")
        original_remove(target)

    monkeypatch.setattr(icloud.os, "replace", stale_replace)
    monkeypatch.setattr(icloud.os, "remove", stale_remove)

    warnings: list[tuple[str, tuple[object, ...]]] = []
    errors: list[tuple[str, tuple[object, ...]]] = []

    def capture_warning(message: str, *args: object) -> None:
        warnings.append((message, args))

    def capture_error(message: str, *args: object) -> None:
        errors.append((message, args))

    monkeypatch.setattr(icloud.logger, "warning", capture_warning)
    monkeypatch.setattr(icloud.logger, "error", capture_error)

    day = datetime.date(2026, 6, 7)
    adapter = ICloudDailyStatusSource()

    assert adapter.target_days(day) == (day,)
    assert adapter.load_sleep(day) is None
    assert warnings
    warning_message, warning_args = warnings[0]
    assert warning_message == "Deferred claiming %s: %s"
    assert warning_args[0] == "sleep_status.json"
    assert not errors
    assert not list((tmp_path / "cache").glob("*.pending"))


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
            }
        ),
        encoding="utf-8",
    )

    adapter = ICloudDailyStatusSource()

    assert adapter.target_days(day) == (day,)
    sleep = adapter.load_sleep(day)

    assert sleep is not None
    assert sleep.sleep_min == 455
    assert not path.exists()
    assert not list((tmp_path / "cache").glob("*.pending"))
