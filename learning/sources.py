"""Local course material: discovery, registration and on-demand byte identity."""

from __future__ import annotations

from collections.abc import Iterator
import hashlib
import os
from pathlib import Path
import re
import stat
import subprocess
from typing import Any
from urllib.parse import urlsplit

from learning import records
from learning.schema import HANDLE

MATERIAL_SUFFIXES = frozenset(
    {
        ".pdf",
        ".md",
        ".txt",
        ".tex",
        ".ipynb",
        ".py",
        ".html",
        ".pptx",
        ".docx",
        ".csv",
        ".org",
        ".rst",
    }
)
SCAN_LIMIT = 200


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


def _location(source: dict[str, Any], vault: Path) -> Path | None:
    """Resolve a registered path; None for remote or malformed locations."""
    try:
        if urlsplit(source["path"]).scheme:
            return None
    except ValueError:
        return None
    path = Path(source["path"]).expanduser()
    return path if path.is_absolute() else vault / path


def _git_listing(vault: Path) -> list[Path] | None:
    """Files git does not ignore under vault; None when git does not manage it."""

    def git(*args: str) -> subprocess.CompletedProcess[bytes]:
        # Repository configuration must not run commands during a listing.
        return subprocess.run(
            ["git", "-c", "core.fsmonitor=false", "-C", str(vault), *args],
            capture_output=True,
            check=False,
            timeout=30,
        )

    try:
        # Exit 1 means inside a work tree and not ignored; 0 ignored; 128 no repo.
        if git("check-ignore", "-q", ".").returncode != 1:
            return None
        listed = git("ls-files", "-z", "--cached", "--others", "--exclude-standard")
    except (OSError, subprocess.TimeoutExpired):
        return None
    if listed.returncode:
        return None
    names = dict.fromkeys(os.fsdecode(name) for name in listed.stdout.split(b"\0"))
    return sorted(vault / name for name in names if name)


def _material(vault: Path) -> Iterator[Path]:
    """Candidate files in listing order, skipping hidden files and directories."""
    listed = _git_listing(vault)
    if listed is not None:
        for path in listed:
            if not any(part.startswith(".") for part in path.relative_to(vault).parts):
                yield path
        return
    for directory, directories, files in os.walk(vault, followlinks=False):
        directories[:] = sorted(
            name for name in directories if not name.startswith(".")
        )
        for name in sorted(files):
            if not name.startswith("."):
                yield Path(directory) / name


def scan(vault: Path, registered: dict[str, Any]) -> dict[str, Any]:
    """List course material under the source directory, naming registered handles.

    Inside a git work tree only files git does not ignore are listed, so
    dependency and build directories never crowd out the material.
    """
    if not vault.is_dir():
        raise ValueError(f"source directory does not exist: {vault}")
    known: dict[Path, str] = {}
    for handle, source in registered.items():
        location = _location(source, vault)
        if location is None:
            continue
        try:
            known[location.resolve()] = handle
        except OSError:
            continue
    found: list[dict[str, Any]] = []
    truncated = False
    for path in _material(vault):
        if path.suffix.lower() not in MATERIAL_SUFFIXES:
            continue
        if len(found) >= SCAN_LIMIT:
            truncated = True
            break
        try:
            resolved = path.resolve()
            size = path.stat().st_size
        except OSError:
            continue
        item: dict[str, Any] = {
            "path": os.path.relpath(path, vault),
            "bytes": size,
            "registered": resolved in known,
        }
        if resolved in known:
            item["handle"] = known[resolved]
        else:
            item["suggested_handle"] = suggest_handle(path, registered)
        found.append(item)
    found.sort(key=lambda item: item["path"])
    return {"directory": str(vault), "files": found, "truncated": truncated}


def suggest_handle(path: Path, registered: dict[str, Any]) -> str:
    stem = re.sub(r"[^a-z0-9]+", "-", path.stem.lower()).strip("-")[:48] or "source"
    if not HANDLE.fullmatch(stem):
        stem = f"s-{stem}"[:64]
    candidate = stem
    counter = 2
    while candidate in registered:
        candidate = f"{stem}-{counter}"
        counter += 1
    return candidate


def register(
    root: Path,
    vault: Path,
    scope: str,
    paths: list[str],
    expected: int,
    *,
    expected_digest: str | None = None,
) -> dict[str, Any]:
    """Register local files as sources under derived handles and return the mapping."""
    if not paths:
        raise ValueError("register at least one source path")
    record = records.read(root, scope)
    assert isinstance(record, dict)
    registered = dict(record.get("sources", {}))
    entries: dict[str, dict[str, Any]] = {}
    for value in paths:
        if not isinstance(value, str) or not value.strip():
            raise ValueError("source paths must be nonempty strings")
        path = Path(value).expanduser()
        absolute = path if path.is_absolute() else vault / path
        if not absolute.is_file():
            raise ValueError(f"source file does not exist: {value}")
        try:
            stored = os.path.relpath(absolute.resolve(), vault.resolve())
            if stored.startswith(".."):
                stored = str(absolute.resolve())
        except ValueError:
            stored = str(absolute.resolve())
        existing = next(
            (
                key
                for key, source in registered.items()
                if _location(source, vault) == absolute
            ),
            None,
        )
        if existing is not None:
            raise ValueError(
                f"{value} is already registered as source handle {existing!r}"
            )
        handle = suggest_handle(absolute, {**registered, **entries})
        entries[handle] = {"path": stored}
        if absolute.suffix.lower() in {".pdf", ".md", ".txt", ".tex", ".html"}:
            entries[handle]["title"] = absolute.stem
    return records.register_sources(
        root, scope, expected, entries, expected_digest=expected_digest
    )


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
    captures: dict[str, dict[str, Any]] = {}
    for key in keys:
        source = record["sources"][key]
        item: dict[str, Any] = {
            "path": source["path"],
            "status": "unverified",
            "stored_fingerprint": source.get("fingerprint"),
            "unverified_references": _unverified_references(record, key),
        }
        inspected[key] = item
        location = _location(source, vault)
        if location is None:
            item["reason"] = "only local file paths are inspected"
            continue
        try:
            fingerprint = _fingerprint(location)
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
            captures[key] = fingerprint
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
        receipt = records.capture_source_fingerprints(
            root,
            scope,
            expected,
            captures,
            expected_digest=record["digest"]
            if expected_digest is None
            else expected_digest,
        )
        result.update(revision=receipt["revision"], digest=receipt["digest"])
        result["captured"] = sorted(captures)
        for key in captures:
            inspected[key]["stored_fingerprint"] = inspected[key]["current_fingerprint"]
            inspected[key]["status"] = "unchanged"
            inspected[key].pop("reason", None)
    return result
