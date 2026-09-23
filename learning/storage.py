"""Atomic local JSON publication with revision-checked, no-op-aware updates."""

from __future__ import annotations

from collections.abc import Callable, Iterator
from contextlib import contextmanager
from copy import deepcopy
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import tempfile
from typing import Any


class RevisionConflict(ValueError):
    """The record changed after the caller read its expected snapshot."""


def digest(record: dict[str, Any]) -> str:
    """Hash raw stored content, excluding publication metadata and the digest itself."""
    content = {
        key: value
        for key, value in record.items()
        if key not in {"revision", "updated_at", "digest"}
    }
    encoded = json.dumps(
        content,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def reject_constant(value: str) -> None:
    raise ValueError(f"invalid JSON constant: {value}")


@contextmanager
def lock(path: Path) -> Iterator[None]:
    """Hold an exclusive local lock on the supplied lock-file path."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as stream:
        fcntl.flock(stream, fcntl.LOCK_EX)
        yield


def load(path: Path) -> dict[str, Any]:
    """Read a JSON record; a missing file has revision zero."""
    try:
        record = json.loads(
            path.read_text(encoding="utf-8"), parse_constant=reject_constant
        )
    except FileNotFoundError:
        return {"revision": 0}
    if (
        not isinstance(record, dict)
        or type(record.get("revision")) is not int
        or record["revision"] < 1
    ):
        raise ValueError(f"invalid stored revision in {path}")
    return record


def publish_text(path: Path, content: str) -> None:
    """Atomically replace text; callers own any read/modify/write lock."""
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(
        prefix=f".{path.stem}.", suffix=".tmp", dir=path.parent
    )
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        Path(temporary).unlink(missing_ok=True)


def update(
    path: Path,
    expected: int,
    transform: Callable[[dict[str, Any]], dict[str, Any]],
    *,
    expected_digest: str | None = None,
) -> dict[str, Any]:
    """Validate and publish under one lock, returning the full committed record."""
    if type(expected) is not int or expected < 0:
        raise ValueError("expected revision must be a nonnegative integer")
    if expected_digest is not None and (
        not isinstance(expected_digest, str)
        or len(expected_digest) != 64
        or any(character not in "0123456789abcdef" for character in expected_digest)
    ):
        raise ValueError("expected_digest must be a lowercase SHA-256 digest")
    with lock(path.with_name(f".{path.stem}.lock")):
        current = load(path)
        revision = current["revision"]
        if revision != expected:
            raise RevisionConflict(
                f"revision conflict for {path.stem}: expected {expected}, found {revision}; read current state before retrying"
            )
        if expected_digest is not None and digest(current) != expected_digest:
            raise RevisionConflict(
                f"snapshot conflict for {path.stem}: content changed at revision {revision}; read current state before retrying"
            )
        result = transform(deepcopy(current))
        if not isinstance(result, dict):
            raise ValueError("record must be a JSON object")
        values = {
            key: value
            for key, value in result.items()
            if key not in {"revision", "updated_at", "digest"}
        }
        previous = {
            key: value
            for key, value in current.items()
            if key not in {"revision", "updated_at", "digest"}
        }
        if values == previous:
            return current
        values.update(
            revision=revision + 1,
            updated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        )
        content = (
            json.dumps(
                values, ensure_ascii=False, separators=(",", ":"), allow_nan=False
            )
            + "\n"
        )
        publish_text(path, content)
        return values
