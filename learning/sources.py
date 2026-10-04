"""Local course material: discovery and registration under course-unique handles."""

from __future__ import annotations

from collections.abc import Collection, Iterator
import difflib
import os
from pathlib import Path
import subprocess
from typing import Any
from urllib.parse import urlsplit

from learning.schema import HANDLE, RESERVED, slug

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
_TITLED = frozenset({".pdf", ".md", ".txt", ".tex", ".html"})
SCAN_LIMIT = 200


def _location(source: Any, material: Path) -> Path | None:
    """Resolve a registered path; None for remote or malformed locations."""
    value = source.get("path") if isinstance(source, dict) else None
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        if urlsplit(value).scheme:
            return None
        path = Path(value).expanduser()
        return (path if path.is_absolute() else material / path).resolve()
    except (OSError, RuntimeError, ValueError):
        return None


def _known(material: Path, registered: dict[str, Any]) -> dict[Path, str]:
    known: dict[Path, str] = {}
    for handle, source in registered.items():
        location = _location(source, material)
        if location is not None:
            known.setdefault(location, handle)
    return known


def _git_listing(material: Path) -> list[Path] | None:
    """Files git does not ignore under material; None when git does not manage it."""

    def git(*args: str) -> subprocess.CompletedProcess[bytes]:
        # Repository configuration must not run commands during a listing.
        return subprocess.run(
            ["git", "-c", "core.fsmonitor=false", "-C", str(material), *args],
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
    return sorted(material / name for name in names if name)


def _material(material: Path) -> Iterator[Path]:
    """Candidate files in listing order, skipping hidden files and directories."""
    listed = _git_listing(material)
    if listed is not None:
        for path in listed:
            if not any(
                part.startswith(".") for part in path.relative_to(material).parts
            ):
                yield path
        return
    for directory, directories, files in os.walk(material, followlinks=False):
        directories[:] = sorted(
            name for name in directories if not name.startswith(".")
        )
        for name in sorted(files):
            if not name.startswith("."):
                yield Path(directory) / name


def suggest_handle(path: Path, taken: Collection[str]) -> str:
    """A free handle derived from the file name, outside the observation ids."""
    stem = slug(path.stem)[:48].rstrip("-_") or "source"
    if not HANDLE.fullmatch(stem) or RESERVED.fullmatch(stem):
        stem = f"s-{stem}"[:48]
    candidate = stem
    counter = 2
    while candidate in taken:
        candidate = f"{stem}-{counter}"
        counter += 1
    return candidate


def scan(
    material: Path, registered: dict[str, Any], *, taken: Collection[str] = ()
) -> dict[str, Any]:
    """List course material, naming registered handles and suggesting free ones.

    ``taken`` holds the course's topic, knowledge and task handles, which share
    one namespace with sources. Inside a git work tree only files git does not
    ignore are listed, so dependency and build directories never crowd out the
    material.
    """
    if not material.is_dir():
        raise ValueError(f"source directory does not exist: {material}")
    known = _known(material, registered)
    used = {*taken, *registered}
    found: list[dict[str, Any]] = []
    truncated = False
    for path in _material(material):
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
        item: dict[str, Any] = {"path": os.path.relpath(path, material), "bytes": size}
        if resolved in known:
            item["handle"] = known[resolved]
        else:
            item["suggested_handle"] = suggest_handle(path, used)
            used.add(item["suggested_handle"])
        found.append(item)
    found.sort(key=lambda item: item["path"])
    return {"directory": str(material), "files": found, "truncated": truncated}


def _missing(value: str, absolute: Path) -> ValueError:
    try:
        names = [entry.name for entry in absolute.parent.iterdir() if entry.is_file()]
    except OSError:
        names = []
    close = difflib.get_close_matches(absolute.name, names, n=3)
    hint = f"; did you mean {', '.join(close)}?" if close else ""
    return ValueError(f"source file does not exist: {value}{hint}")


def _stored(path: Path, material: Path) -> str:
    """Relative to the material directory when inside it, else absolute."""
    base = material.resolve()
    return path.relative_to(base).as_posix() if path.is_relative_to(base) else str(path)


def prepare(
    material: Path,
    paths: list[str],
    registered: dict[str, Any],
    *,
    taken: Collection[str] = (),
) -> tuple[dict[str, dict[str, str]], dict[str, str]]:
    """Plan the registration of local files: (new handle → entry, path → existing handle).

    Paths are relative to the material directory or absolute; ``..`` and links
    are resolved, so one file never receives a second handle. Nothing is written:
    the caller saves the new entries as one ``sources`` patch.
    """
    if not paths:
        raise ValueError("sources --add needs at least one file path")
    known = _known(material, registered)
    used = {*taken, *registered}
    entries: dict[str, dict[str, str]] = {}
    existing: dict[str, str] = {}
    for value in paths:
        if not isinstance(value, str) or not value.strip():
            raise ValueError("source paths must be nonempty strings")
        given = Path(value).expanduser()
        absolute = given if given.is_absolute() else material / given
        if not absolute.is_file():
            raise _missing(value, absolute)
        resolved = absolute.resolve()
        if resolved in known:
            if known[resolved] not in entries:
                existing[value] = known[resolved]
            continue
        handle = suggest_handle(resolved, used)
        used.add(handle)
        known[resolved] = handle
        entries[handle] = {"path": _stored(resolved, material)}
        if resolved.suffix.lower() in _TITLED:
            entries[handle]["title"] = resolved.stem
    return entries, existing
