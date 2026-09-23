"""Locate and initialize the directory that owns a study session."""

from __future__ import annotations

from dataclasses import dataclass
import errno
import json
import os
from pathlib import Path
import tempfile

from learning import storage

_MANIFEST = {"version": 1}


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


def _load(directory: Path) -> Workspace:
    workspace = Workspace(directory)
    marker = workspace.root / "workspace.json"
    if workspace.root.is_symlink() or marker.is_symlink():
        raise ValueError("The study workspace and its manifest must not be symlinks")
    try:
        value = json.loads(marker.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise ValueError(f"Invalid study workspace at {directory}: {error}") from error
    if value != _MANIFEST or type(value.get("version")) is not int:
        raise ValueError(f"Unsupported study workspace format at {directory}")
    for name in ("state", "preferences.json", "lessons", "assets", "conversations"):
        if (workspace.root / name).is_symlink():
            raise ValueError(
                f"Study output must stay local; linked path: {workspace.root / name}"
            )
    return workspace


def resolve(directory: str | Path | None = None) -> Workspace:
    """Explicit selection is exact; automatic discovery selects the nearest marker."""
    explicit = directory
    start = (
        Path(explicit).expanduser().resolve()
        if explicit is not None
        else Path.cwd().resolve()
    )
    if not start.is_dir():
        raise ValueError(f"Study directory does not exist: {start}")
    for candidate in [start] if explicit is not None else [start, *start.parents]:
        marker = candidate / ".study"
        if marker.exists() or marker.is_symlink():
            workspace = _load(candidate)
            if os.environ.get("LEARNING_PRIVATE") == "1" and os.environ.get(
                "LEARNING_SOURCE_ROOT"
            ):
                return Workspace(
                    workspace.directory,
                    Path(os.environ["LEARNING_SOURCE_ROOT"]).resolve(),
                )
            return workspace
    raise ValueError(
        f"No study workspace at {start}. Run `study init` in the intended directory or select `--workspace DIRECTORY`."
    )


def initialize(directory: str | Path | None = None) -> Workspace:
    """Create an empty workspace without replacing existing files or adopting data."""
    target = (
        Path(directory).expanduser().resolve()
        if directory is not None
        else Path.cwd().resolve()
    )
    if not target.is_dir():
        raise ValueError(f"Study directory does not exist: {target}")
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
        storage.publish_text(staged / "workspace.json", json.dumps(_MANIFEST) + "\n")
        storage.publish_text(staged / ".gitignore", "*\n")
        try:
            os.rename(staged, root)
        except OSError as error:
            if error.errno not in {errno.EEXIST, errno.ENOTEMPTY}:
                raise
            # A concurrent initializer may already have published the same workspace.
            return _load(target)
    return workspace
