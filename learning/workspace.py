"""Locate and initialize the directory that owns a study session."""

from __future__ import annotations

from dataclasses import dataclass
import errno
import json
import os
from pathlib import Path
import tempfile

from learning import storage

_VERSION = 1


@dataclass(frozen=True)
class Workspace:
    directory: Path
    source_directory: Path | None = None

    @property
    def root(self) -> Path:
        return self.directory / ".study"

    @property
    def assets(self) -> Path:
        return self.root / "assets"

    @property
    def conversations(self) -> Path:
        return self.root / "conversations"

    @property
    def sources(self) -> Path:
        return self.source_directory or self.directory


def links_path() -> Path:
    """Per-user index from linked material directories to their study workspaces."""
    return Path.home() / "Library/Application Support/Learning/workspaces.json"


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
    for name in ("state", "preferences.json", "lessons", "assets", "conversations"):
        if (workspace.root / name).is_symlink():
            raise ValueError(
                f"Study output must stay local; linked path: {workspace.root / name}"
            )
    return workspace


def _read_links(path: Path) -> dict[str, str]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    except (OSError, ValueError) as error:
        raise ValueError(f"Invalid study workspace links at {path}: {error}") from error
    if not isinstance(value, dict) or any(
        not isinstance(item, str) or not Path(item).is_absolute()
        for pair in value.items()
        for item in pair
    ):
        raise ValueError(f"Invalid study workspace links at {path}")
    return value


def _linked(start: Path) -> Workspace | None:
    """The workspace linked to start's nearest linked ancestor, verified both ways."""
    links = _read_links(links_path())
    material = max(
        (Path(path) for path in links if start.is_relative_to(path)),
        key=lambda path: len(path.parts),
        default=None,
    )
    if material is None:
        return None
    directory = Path(links[str(material)])
    if not _marked(directory):
        raise ValueError(
            f"The study workspace linked to {material} is missing: {directory}"
        )
    workspace = _load(directory)
    if workspace.source_directory != material:
        raise ValueError(
            f"Stale study workspace link: {directory} no longer studies {material}. "
            f"Run `study link {material} --workspace {directory}` to restore it."
        )
    return workspace


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
    if os.environ.get("LEARNING_PRIVATE") == "1" and os.environ.get(
        "LEARNING_SOURCE_ROOT"
    ):
        return Workspace(
            workspace.directory,
            Path(os.environ["LEARNING_SOURCE_ROOT"]).resolve(),
        )
    return workspace


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
    claimed = _read_links(links_path()).get(str(material))
    if (
        claimed is not None
        and Path(claimed) != directory
        and _claims(Path(claimed), material)
    ):
        raise ValueError(
            f"{material} is already linked to the study workspace {claimed}; "
            f"run `study unlink --workspace {claimed}` first"
        )


def _claims(directory: Path, material: Path) -> bool:
    """Whether the workspace at directory still names material as its sources."""
    try:
        return _load(directory).source_directory == material
    except ValueError:
        return False


def link(workspace: Workspace, material: str | Path) -> Workspace:
    """Make discovery from material and its descendants select this workspace.

    One workspace studies one material directory: relinking replaces the previous
    link, and material still claimed by another workspace is refused. A link whose
    workspace no longer names the material is stale and may be replaced.
    """
    target = Path(material).expanduser().resolve()
    path = links_path()
    with storage.lock(path.with_suffix(".lock")):
        _check_link(workspace.directory, target)
        links = _read_links(path)
        updated = {
            source: owner
            for source, owner in links.items()
            if Path(owner) != workspace.directory and source != str(target)
        }
        updated[str(target)] = str(workspace.directory)
        # The manifest is published first: an interrupted link leaves no index
        # entry rather than one that points at a workspace without a back-reference.
        if not _claims(workspace.directory, target):
            storage.publish_text(workspace.root / "workspace.json", _manifest(target))
        if updated != links:
            storage.publish_text(path, json.dumps(updated, indent=2) + "\n")
    return Workspace(workspace.directory, target)


def unlink(workspace: Workspace) -> Workspace:
    """Remove this workspace's material link; relative sources resolve locally again."""
    path = links_path()
    with storage.lock(path.with_suffix(".lock")):
        links = _read_links(path)
        updated = {
            source: owner
            for source, owner in links.items()
            if Path(owner) != workspace.directory
        }
        if updated != links:
            storage.publish_text(path, json.dumps(updated, indent=2) + "\n")
        if _load(workspace.directory).source_directory is not None:
            storage.publish_text(workspace.root / "workspace.json", _manifest(None))
    return Workspace(workspace.directory)


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
    """Create an empty workspace without replacing existing files or adopting data.

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
        return _create(target)
    material = Path(sources).expanduser().resolve()
    # Refuse an invalid link before creating anything; link() re-checks under its lock.
    _check_link(target, material)
    return link(_create(target), material)
