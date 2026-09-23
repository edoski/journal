"""Explicit non-destructive import of one scope into an empty study workspace."""

from __future__ import annotations

from copy import deepcopy
import json
import os
from pathlib import Path
import tempfile
from typing import Any
from urllib.parse import urlsplit

from learning import preferences, records, storage
from learning.workspace import Workspace


def _location(value: str, source: Path, target: Path) -> str:
    if urlsplit(value).scheme:
        return value
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = source / path
    path = path.resolve()
    return os.path.relpath(path, target) if path.is_relative_to(target) else str(path)


def _rebase_references(value: Any, source: Path, target: Path) -> Any:
    if isinstance(value, list):
        return [_rebase_references(item, source, target) for item in value]
    if not isinstance(value, dict):
        return value
    result = {
        key: _rebase_references(item, source, target) for key, item in value.items()
    }
    if "source" in result:
        for key in ("path", "source_path"):
            if isinstance(result.get(key), str):
                result[key] = _location(result[key], source, target)
    return result


def import_scope(
    workspace: Workspace,
    source: Path,
    source_directory: Path,
    scope: str,
    *,
    include_defaults: bool = False,
    apply: bool = False,
) -> dict[str, Any]:
    """Validate the complete import before copying; never delete or overwrite data."""
    source = source.expanduser().resolve()
    source_directory = source_directory.expanduser().resolve()
    if source == workspace.root or not source_directory.is_dir():
        raise ValueError(
            "Import needs a separate source root and an existing source directory"
        )
    # read validates the handle and the existing schema without modifying the source.
    original = records.read(source, scope)
    assert isinstance(original, dict)
    if original["revision"] == 0:
        raise ValueError(f"No existing scope to import: {scope}")
    raw = storage.load(source / "state" / f"{scope}.json")
    candidate = _rebase_references(deepcopy(raw), source_directory, workspace.directory)
    for entry in candidate.get("sources", {}).values():
        entry["path"] = _location(entry["path"], source_directory, workspace.directory)
    policy = preferences.read(source)
    rules = [
        rule
        for rule in policy["rules"]
        if rule["when"].get("scope") == scope
        or (include_defaults and "scope" not in rule["when"])
    ]
    # Exercise canonical validation against the rebased record and selected policy.
    with tempfile.TemporaryDirectory(prefix="study-import-check-") as temporary:
        staged = Path(temporary)
        storage.publish_text(
            staged / "state" / f"{scope}.json",
            json.dumps(candidate, ensure_ascii=False, allow_nan=False),
        )
        records.read(staged, scope)
        if rules:
            preferences.save(staged, 0, {"rules": rules})
        contents = {
            f"state/{scope}.json": (staged / "state" / f"{scope}.json").read_text()
            + "\n"
        }
        if rules:
            contents["preferences.json"] = (staged / "preferences.json").read_text()

    result: dict[str, Any] = {
        "status": "preview",
        "workspace": str(workspace.directory),
        "scope": scope,
        "source": str(source),
        "sources": candidate.get("sources", {}),
        "preference_rules": len(rules),
        "files": list(contents),
        "excluded": ["other scopes", "conversations", "lessons", "assets"],
    }
    with storage.lock(workspace.root / ".records.lock"):
        if (
            list((workspace.root / "state").glob("*"))
            or (workspace.root / "preferences.json").exists()
        ):
            raise ValueError(
                "Import requires an empty workspace; existing state and preferences are never overwritten"
            )
        if apply:
            for relative, content in contents.items():
                storage.publish_text(workspace.root / relative, content)
            result["status"] = "imported"
    return result
