"""Locate, initialize, register and link the directory that owns a study course."""

from __future__ import annotations

from dataclasses import dataclass
import errno
import json
import os
from pathlib import Path
import tempfile
from typing import Any

from learning import storage

_VERSION = 1
_REGISTRY_SCHEMA = 2
# Local study outputs: a symlink here would publish learner data somewhere else.
_LOCAL = ("course.json",)

Registry = dict[str, dict[str, str]]


@dataclass(frozen=True)
class Workspace:
    directory: Path
    source_directory: Path | None = None

    @property
    def root(self) -> Path:
        return self.directory / ".study"

    @property
    def record(self) -> Path:
        """The course record: one course per workspace."""
        return self.root / "course.json"

    @property
    def notes(self) -> Path:
        """Standalone study notes, beside the material so Obsidian shows them."""
        return self.directory / "study-notes"

    @property
    def sources(self) -> Path:
        return self.source_directory or self.directory


def support_directory() -> Path:
    """Per-user learning data shared by every workspace."""
    return Path.home() / "Library/Application Support/Learning"


def registry_path() -> Path:
    """Per-user registry of study workspaces and the material they are linked to."""
    return support_directory() / "workspaces.json"


# --- manifests ---------------------------------------------------------------


def _manifest(sources: Path | None) -> str:
    value: dict[str, object] = {"version": _VERSION}
    if sources is not None:
        value["sources"] = str(sources)
    return json.dumps(value) + "\n"


def _marked(directory: Path) -> bool:
    marker = directory / ".study"
    return marker.exists() or marker.is_symlink()


def _load(directory: Path) -> Workspace:
    root = directory / ".study"
    marker = root / "workspace.json"
    if root.is_symlink() or marker.is_symlink():
        raise ValueError("The study workspace and its manifest must not be symlinks")
    try:
        value = json.loads(marker.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise ValueError(f"Invalid study workspace at {directory}: {error}") from error
    if (
        not isinstance(value, dict)
        or type(value.get("version")) is not int
        or value["version"] != _VERSION
        or not set(value) <= {"version", "sources"}
    ):
        raise ValueError(f"Unsupported study workspace format at {directory}")
    sources = value.get("sources")
    if sources is not None and (
        not isinstance(sources, str) or not Path(sources).is_absolute()
    ):
        raise ValueError(
            f"Invalid linked material directory in the study workspace at {directory}"
        )
    workspace = Workspace(directory, None if sources is None else Path(sources))
    for name in _LOCAL:
        if (workspace.root / name).is_symlink():
            raise ValueError(
                f"Study output must stay local; linked path: {workspace.root / name}"
            )
    return workspace


def _claims(directory: Path, material: Path) -> bool:
    """Whether the workspace at directory still names material as its sources."""
    try:
        return _load(directory).source_directory == material
    except ValueError:
        return False


# --- registry ----------------------------------------------------------------


def _absolute(value: Any) -> bool:
    return isinstance(value, str) and Path(value).is_absolute()


def _entries(path: Path, value: Any) -> Registry:
    workspaces = value.get("workspaces") if isinstance(value, dict) else None
    if (
        not isinstance(value, dict)
        or value.get("schema") != _REGISTRY_SCHEMA
        or set(value) != {"schema", "workspaces"}
        or not isinstance(workspaces, dict)
    ):
        raise ValueError(
            f"Unsupported study workspace registry at {path}; expected "
            '{"schema": 2, "workspaces": {"/abs/workspace": {"sources"?: "/abs/material"}}}'
        )
    for directory, entry in workspaces.items():
        if (
            not _absolute(directory)
            or not isinstance(entry, dict)
            or not set(entry) <= {"sources"}
            or ("sources" in entry and not _absolute(entry["sources"]))
        ):
            raise ValueError(f"Invalid study workspace registry entry: {directory}")
    return {directory: dict(entry) for directory, entry in workspaces.items()}


def _read_registry() -> Registry:
    """Every stored entry, including entries whose workspace no longer exists."""
    path = registry_path()
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    except (OSError, ValueError) as error:
        raise ValueError(
            f"Invalid study workspace registry at {path}: {error}"
        ) from error
    return _entries(path, value)


def _exists(directory: str) -> bool:
    return (Path(directory) / ".study/workspace.json").exists()


def _write_registry(entries: Registry) -> None:
    """Publish schema 2, pruning workspaces whose manifest is gone; caller holds the lock."""
    path = registry_path()
    kept = {
        directory: entries[directory]
        for directory in sorted(entries)
        if _exists(directory)
    }
    content = (
        json.dumps({"schema": _REGISTRY_SCHEMA, "workspaces": kept}, indent=2) + "\n"
    )
    try:
        current = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        current = None
    if content != current:
        storage.publish_text(path, content)


def _register(directory: Path) -> None:
    """Record the workspace with its manifest's material; caller holds the lock."""
    sources = _load(directory).source_directory
    entries = _read_registry()
    entries[str(directory)] = {} if sources is None else {"sources": str(sources)}
    _write_registry(entries)


def register(workspace: Workspace) -> None:
    """Make the workspace visible to every-course reads such as `plan --all`."""
    with storage.lock(storage.lock_path(registry_path())):
        _register(workspace.directory)


def registered() -> list[Workspace]:
    """Valid registered workspaces, sorted by directory; stale entries are ignored."""
    result = []
    for directory in sorted(_read_registry()):
        if not _exists(directory):
            continue
        try:
            result.append(_load(Path(directory)))
        except ValueError:
            continue
    return result


# --- discovery ---------------------------------------------------------------


def _linked(start: Path) -> Workspace | None:
    """The workspace linked to start's nearest linked ancestor, verified both ways."""
    links = [
        (Path(entry["sources"]), Path(directory))
        for directory, entry in _read_registry().items()
        if "sources" in entry and _exists(directory)
    ]
    candidates = [link for link in links if start.is_relative_to(link[0])]
    if not candidates:
        return None
    material = max((link[0] for link in candidates), key=lambda path: len(path.parts))
    directories = sorted(
        directory for source, directory in candidates if source == material
    )
    workspaces = [_load(directory) for directory in directories]
    verified = [item for item in workspaces if item.source_directory == material]
    if len(verified) == 1:
        return verified[0]
    if verified:
        raise ValueError(
            f"{material} is linked to several study workspaces: "
            + ", ".join(str(item.directory) for item in verified)
            + "; select one with --workspace and unlink the others"
        )
    directory = directories[0]
    raise ValueError(
        f"Stale study workspace link: {directory} no longer studies {material}. "
        f"Run `study link {material} --workspace {directory}` to restore it."
    )


def resolve(directory: str | Path | None = None) -> Workspace:
    """Explicit selection is exact; discovery selects the nearest marker, then a link."""
    explicit = directory
    start = (
        Path(explicit).expanduser().resolve()
        if explicit is not None
        else Path.cwd().resolve()
    )
    if not start.is_dir():
        raise ValueError(f"Study directory does not exist: {start}")
    candidates = [start] if explicit is not None else [start, *start.parents]
    marked = next((candidate for candidate in candidates if _marked(candidate)), None)
    if marked is not None:
        workspace: Workspace | None = _load(marked)
    else:
        workspace = None if explicit is not None else _linked(start)
    if workspace is None:
        raise ValueError(
            f"No study workspace at {start}. Run `study init` in the intended directory, "
            f"`study init --workspace STUDY_DIRECTORY --sources {start}` to keep study "
            "files elsewhere, or select `--workspace DIRECTORY`."
        )
    return workspace


# --- links -------------------------------------------------------------------


def _check_link(directory: Path, material: Path) -> None:
    if not material.is_dir():
        raise ValueError(f"Material directory does not exist: {material}")
    if material.is_relative_to(directory):
        raise ValueError(
            f"{material} is inside the study workspace {directory} and needs no link"
        )
    owner = next(
        (
            candidate
            for candidate in [material, *material.parents]
            if _marked(candidate)
        ),
        None,
    )
    if owner is not None:
        raise ValueError(
            f"{material} is inside the study workspace {owner}; "
            "discovery would select that workspace before any link"
        )
    for other, entry in sorted(_read_registry().items()):
        if (
            entry.get("sources") == str(material)
            and Path(other) != directory
            and _claims(Path(other), material)
        ):
            raise ValueError(
                f"{material} is already linked to the study workspace {other}; "
                f"run `study unlink --workspace {other}` first"
            )


def link(workspace: Workspace, material: str | Path) -> Workspace:
    """Make discovery from material and its descendants select this workspace.

    One workspace studies one material directory: relinking replaces the previous
    link, and material still claimed by another workspace is refused. A link whose
    workspace no longer names the material is stale and is cleared.
    """
    target = Path(material).expanduser().resolve()
    directory = workspace.directory
    with storage.lock(storage.lock_path(registry_path())):
        _check_link(directory, target)
        # The manifest is published first: an interrupted link leaves no registry
        # link rather than one that points at a workspace without a back-reference.
        if not _claims(directory, target):
            storage.publish_text(workspace.root / "workspace.json", _manifest(target))
        entries = {
            other: {} if entry.get("sources") == str(target) else entry
            for other, entry in _read_registry().items()
        }
        entries[str(directory)] = {"sources": str(target)}
        _write_registry(entries)
    return Workspace(directory, target)


def unlink(workspace: Workspace) -> Workspace:
    """Remove this workspace's material link; relative sources resolve locally again."""
    directory = workspace.directory
    with storage.lock(storage.lock_path(registry_path())):
        entries = _read_registry()
        entries[str(directory)] = {}
        _write_registry(entries)
        if _load(directory).source_directory is not None:
            storage.publish_text(workspace.root / "workspace.json", _manifest(None))
    return Workspace(directory)


# --- initialization ----------------------------------------------------------


def _create(target: Path) -> Workspace:
    workspace = Workspace(target)
    root = workspace.root
    if root.is_symlink() or (root.exists() and not root.is_dir()):
        raise ValueError(
            f"Cannot initialize study workspace: {root} is not a local directory"
        )
    if (root / "workspace.json").exists():
        return _load(target)
    if root.exists() and any(root.iterdir()):
        raise ValueError(f"Refusing to initialize nonempty unowned directory: {root}")
    with tempfile.TemporaryDirectory(prefix=".study-init-", dir=target) as directory:
        staged = Path(directory)
        storage.publish_text(staged / "workspace.json", _manifest(None))
        storage.publish_text(staged / ".gitignore", "*\n")
        try:
            os.rename(staged, root)
        except OSError as error:
            if error.errno not in {errno.EEXIST, errno.ENOTEMPTY}:
                raise
            # A concurrent initializer may already have published the same workspace.
            return _load(target)
    return workspace


def initialize(
    directory: str | Path | None = None, sources: str | Path | None = None
) -> Workspace:
    """Create or reopen a workspace without replacing existing files, and register it.

    With sources, the workspace studies that material directory: relative source
    paths resolve there, and discovery from it selects this workspace.
    """
    target = (
        Path(directory).expanduser().resolve()
        if directory is not None
        else Path.cwd().resolve()
    )
    if not target.is_dir():
        raise ValueError(f"Study directory does not exist: {target}")
    if sources is None:
        with storage.lock(storage.lock_path(registry_path())):
            _read_registry()  # Refuse an unreadable registry before creating anything.
            workspace = _create(target)
            _register(target)
        return workspace
    material = Path(sources).expanduser().resolve()
    # Refuse an invalid link before creating anything; link() re-checks under its lock.
    _check_link(target, material)
    return link(_create(target), material)
