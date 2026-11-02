"""Private files: a 700 folder, 600 files replaced atomically, one fetch at a time."""

from __future__ import annotations

import fcntl
import json
import os
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

FOLDER_MODE = 0o700
FILE_MODE = 0o600


def ensure_private_dir(path: Path) -> None:
    """Create the folder if needed and keep it readable by its owner only."""
    path.mkdir(mode=FOLDER_MODE, parents=True, exist_ok=True)
    os.chmod(path, FOLDER_MODE)


def write_private(path: Path, data: bytes) -> None:
    """Replace a file atomically; the new file is mode 600."""
    ensure_private_dir(path.parent)
    handle, draft = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.")
    try:
        os.fchmod(handle, FILE_MODE)
        with os.fdopen(handle, "wb") as out:
            out.write(data)
            out.flush()
            os.fsync(out.fileno())
        os.replace(draft, path)
    except BaseException:
        if os.path.exists(draft):
            os.unlink(draft)
        raise


def write_json(path: Path, payload: Any) -> None:
    text = json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    write_private(path, text.encode("utf-8"))


class Busy(Exception):
    """Another fetch holds the lock."""


@contextmanager
def exclusive(path: Path) -> Iterator[None]:
    """Hold the fetch lock without waiting; raise Busy if it is taken."""
    ensure_private_dir(path.parent)
    descriptor = os.open(path, os.O_RDWR | os.O_CREAT, FILE_MODE)
    try:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Busy("another finance fetch is running") from None
        yield
    finally:
        os.close(descriptor)
