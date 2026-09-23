"""On-demand byte identity checks for explicitly selected local course sources."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
import stat
from typing import Any
from urllib.parse import urlsplit

from learning import records


def _identity(value: os.stat_result) -> tuple[int, int, int, int, int]:
    return (
        value.st_dev,
        value.st_ino,
        value.st_size,
        value.st_mtime_ns,
        value.st_ctime_ns,
    )


def _fingerprint(path: Path) -> dict[str, Any]:
    descriptor = os.open(path, os.O_RDONLY | os.O_NONBLOCK)
    before = os.fstat(descriptor)
    if not stat.S_ISREG(before.st_mode):
        os.close(descriptor)
        raise ValueError("source is not a regular local file")
    with os.fdopen(descriptor, "rb") as stream:
        digest = hashlib.sha256()
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
        after = os.fstat(stream.fileno())
        current = path.stat()
        if _identity(before) != _identity(after) or _identity(after) != _identity(
            current
        ):
            raise ValueError("source changed while being inspected; inspect again")
    return {"sha256": digest.hexdigest(), "size": after.st_size}


def _unverified_references(value: Any, source: str) -> int:
    if isinstance(value, dict):
        own = int(value.get("source") == source and "source_fingerprint" not in value)
        return own + sum(
            _unverified_references(item, source) for item in value.values()
        )
    if isinstance(value, list):
        return sum(_unverified_references(item, source) for item in value)
    return 0


def inspect_sources(
    root: Path,
    vault: Path,
    scope: str,
    source_keys: list[str],
    *,
    expected: int | None = None,
    expected_digest: str | None = None,
) -> dict[str, Any]:
    """Inspect selected files; an expected revision explicitly requests capture.

    Captures never replace an established fingerprint or update old citations.
    Byte identity establishes neither source authority nor content correctness.
    """
    record = records.read(root, scope)
    assert isinstance(record, dict)
    keys = records.validate_references(
        source_keys, record.get("sources", {}), "sources"
    )
    if not keys:
        raise ValueError("select at least one source to inspect")
    if expected is None and expected_digest is not None:
        raise ValueError(
            "expected_digest requires expected revision for source capture"
        )
    inspected: dict[str, Any] = {}
    changes: dict[str, Any] = {}
    for key in keys:
        source = record["sources"][key]
        item: dict[str, Any] = {
            "path": source["path"],
            "status": "unverified",
            "stored_fingerprint": source.get("fingerprint"),
            "unverified_references": _unverified_references(record, key),
        }
        inspected[key] = item
        try:
            remote = bool(urlsplit(source["path"]).scheme)
        except ValueError:
            item["reason"] = "invalid source location"
            continue
        if remote:
            item["reason"] = "only local file paths are inspected"
            continue
        path = Path(source["path"]).expanduser()
        if not path.is_absolute():
            path = vault / path
        try:
            fingerprint = _fingerprint(path)
        except FileNotFoundError:
            item["status"] = "missing"
            continue
        except (OSError, ValueError) as error:
            item["reason"] = str(error)
            continue
        item["current_fingerprint"] = fingerprint
        if source.get("fingerprint") is not None:
            item["status"] = (
                "unchanged" if source["fingerprint"] == fingerprint else "changed"
            )
        else:
            item["reason"] = "no captured fingerprint"
            changes[key] = {"fingerprint": fingerprint}
    result: dict[str, Any] = {
        "scope": scope,
        "revision": record["revision"],
        "digest": record["digest"],
        "sources": inspected,
        "captured": [],
    }
    if expected is not None:
        unavailable = [
            key
            for key, item in inspected.items()
            if item["status"] == "changed" or "current_fingerprint" not in item
        ]
        if unavailable:
            raise ValueError(
                "cannot capture changed or unavailable sources: "
                + ", ".join(unavailable)
                + "; inspect the source and use a new handle for changed content"
            )
        receipt = records.save(
            root,
            scope,
            expected,
            {"sources": changes},
            expected_digest=record["digest"]
            if expected_digest is None
            else expected_digest,
        )
        result.update(revision=receipt["revision"], digest=receipt["digest"])
        result["captured"] = sorted(changes)
        for key in changes:
            inspected[key]["stored_fingerprint"] = inspected[key]["current_fingerprint"]
            inspected[key]["status"] = "unchanged"
            inspected[key].pop("reason", None)
    return result
