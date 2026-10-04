import json
from pathlib import Path
from typing import Any

import pytest

from learning import storage


def test_update_publishes_compact_records_with_revisions(tmp_path: Path) -> None:
    path = tmp_path / "course.json"
    seen: list[dict[str, Any]] = []

    def transform(current: dict[str, Any]) -> dict[str, Any]:
        seen.append(current)
        return {**current, "title": "Algebra", "revision": 99}

    record, changed = storage.update(path, transform)
    assert changed is True
    assert seen == [{}]
    assert record["revision"] == 1
    assert record["title"] == "Algebra"
    assert path.read_text(encoding="utf-8") == storage.encode(record)
    record, changed = storage.update(path, lambda current: {**current, "goal": "Pass"})
    assert (changed, record["revision"]) == (True, 2)
    assert seen[0] == {}


def test_unchanged_content_publishes_nothing(tmp_path: Path) -> None:
    path = tmp_path / "course.json"
    storage.update(path, lambda current: {"title": "Algebra"})
    before = path.read_bytes()
    record, changed = storage.update(path, lambda current: current)
    assert changed is False
    assert record["revision"] == 1
    assert path.read_bytes() == before
    missing = tmp_path / "missing.json"
    assert storage.update(missing, lambda current: current) == ({}, False)
    assert not missing.exists()


def test_load_distinguishes_missing_from_invalid(tmp_path: Path) -> None:
    path = tmp_path / "record.json"
    assert storage.load(path) is None
    path.write_text("[]", encoding="utf-8")
    with pytest.raises(ValueError, match="must contain a JSON object"):
        storage.load(path)
    path.write_text('{"x": NaN}', encoding="utf-8")
    with pytest.raises(ValueError, match="invalid JSON constant"):
        storage.load(path)
    path.write_text("{", encoding="utf-8")
    with pytest.raises(ValueError, match="invalid JSON"):
        storage.load(path)


def test_a_failing_transform_leaves_the_file_untouched(tmp_path: Path) -> None:
    path = tmp_path / "course.json"
    storage.update(path, lambda current: {"title": "Algebra"})
    before = path.read_bytes()

    def broken(current: dict[str, Any]) -> dict[str, Any]:
        raise ValueError("invalid patch")

    with pytest.raises(ValueError, match="invalid patch"):
        storage.update(path, broken)
    assert path.read_bytes() == before
    assert storage.lock_path(path) == tmp_path / ".course.lock"
    assert json.loads(before)["revision"] == 1
