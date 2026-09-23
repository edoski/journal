import json
from pathlib import Path

import pytest

from learning import storage


def test_snapshot_conflict_rejects_same_revision_divergence_before_transform(
    tmp_path: Path,
) -> None:
    path = tmp_path / "record.json"
    original = storage.update(path, 0, lambda _: {"value": "original"})
    digest = storage.digest(original)
    modified = {**original, "value": "other device"}
    path.write_text(json.dumps(modified))

    def should_not_run(record: dict[str, object]) -> dict[str, object]:
        pytest.fail("stale snapshot reached transform")

    with pytest.raises(storage.RevisionConflict, match="snapshot conflict"):
        storage.update(path, 1, should_not_run, expected_digest=digest)
    assert storage.load(path) == modified
    with pytest.raises(storage.RevisionConflict, match="revision conflict"):
        storage.update(path, 0, should_not_run)


def test_digest_ignores_publication_metadata_and_stays_out_of_stored_record(
    tmp_path: Path,
) -> None:
    path = tmp_path / "record.json"
    first = storage.update(path, 0, lambda _: {"value": {"b": 1, "a": 2}})
    digest = storage.digest(first)
    assert (
        storage.digest(
            {
                "value": {"a": 2, "b": 1},
                "revision": 100,
                "updated_at": "other",
                "digest": "ignored",
            }
        )
        == digest
    )
    no_op = storage.update(
        path, 1, lambda current: {**current, "digest": digest}, expected_digest=digest
    )
    assert no_op == first
    assert "digest" not in storage.load(path)
    with pytest.raises(ValueError, match="lowercase SHA-256"):
        storage.update(path, 1, lambda current: current, expected_digest="invalid")
