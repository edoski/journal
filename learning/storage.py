"""Atomic local JSON publication under exclusive locks, with no-op detection."""

from __future__ import annotations

from collections.abc import Callable, Iterator
from contextlib import contextmanager
from copy import deepcopy
import fcntl
import json
import os
from pathlib import Path
import tempfile
from typing import Any

from learning import clock

METADATA = frozenset({"revision", "updated_at"})


class Unreadable(OSError, ValueError):
    """A stored file exists but cannot be read as what it should hold.

    An I/O failure for callers that report error kinds, so an agent does not
    retry its request; still a ``ValueError`` for code that only validates.
    """


def reject_constant(value: str) -> None:
    raise ValueError(f"invalid JSON constant: {value}")


@contextmanager
def lock(path: Path) -> Iterator[None]:
    """Hold an exclusive local lock on the supplied lock-file path."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as stream:
        fcntl.flock(stream, fcntl.LOCK_EX)
        yield


def load(path: Path) -> dict[str, Any] | None:
    """Read a JSON object; a missing file is ``None``."""
    try:
        value = json.loads(
            path.read_text(encoding="utf-8"), parse_constant=reject_constant
        )
    except FileNotFoundError:
        return None
    except (UnicodeDecodeError, ValueError) as error:
        raise Unreadable(f"invalid JSON in {path}: {error}") from error
    if not isinstance(value, dict):
        raise Unreadable(f"{path} must contain a JSON object")
    return value


def encode(value: Any) -> str:
    """The one compact serialization used for stored records."""
    return (
        json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
        + "\n"
    )


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


def lock_path(path: Path) -> Path:
    """The lock that serializes every read/modify/write of ``path``."""
    return path.with_name(f".{path.stem}.lock")


def update(
    path: Path, transform: Callable[[dict[str, Any]], dict[str, Any]]
) -> tuple[dict[str, Any], bool]:
    """Apply ``transform`` to the latest content under the file's lock.

    The transform receives a copy without ``revision``/``updated_at`` (an empty
    object when the file is missing) and returns the complete new content. An
    unchanged result publishes nothing, so a missing file stays missing when the
    transform returns an empty object. Returns the stored record, including
    its metadata, and whether it changed.
    """
    with lock(lock_path(path)):
        stored = load(path) or {}
        current = {key: value for key, value in stored.items() if key not in METADATA}
        result = transform(deepcopy(current))
        if not isinstance(result, dict):
            raise ValueError("record must be a JSON object")
        content = {key: value for key, value in result.items() if key not in METADATA}
        if content == current:
            return stored, False
        revision = stored.get("revision", 0)
        if type(revision) is not int or revision < 0:
            raise ValueError(f"invalid stored revision in {path}")
        record = {
            **content,
            "revision": revision + 1,
            "updated_at": clock.now().isoformat(timespec="seconds"),
        }
        publish_text(path, encode(record))
        return record, True
