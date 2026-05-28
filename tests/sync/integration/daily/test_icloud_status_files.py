import builtins
import errno
import json

import sync.daily.icloud as icloud


def test_read_status_file_reprocesses_existing_invalid_without_primary(
    monkeypatch, tmp_path
):
    monkeypatch.setattr(icloud, "ICLOUD_JOURNALSYNC_DIR", str(tmp_path))
    monkeypatch.setattr(icloud, "_READ_RETRY_SECONDS", 0)

    invalid_path = tmp_path / "activity_status.json.invalid"
    invalid_path.write_text(
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
    assert parsed_path == str(invalid_path)


def test_read_status_file_keeps_primary_on_transient_icloud_open_error(
    monkeypatch, tmp_path
):
    monkeypatch.setattr(icloud, "ICLOUD_JOURNALSYNC_DIR", str(tmp_path))
    monkeypatch.setattr(icloud, "_READ_ATTEMPTS", 3)
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

    assert (success, payload, parsed_path) == (False, None, None)
    assert path.exists()
    assert not (tmp_path / "activity_status.json.invalid").exists()
