"""Previewed memory redaction with explicit ownership and retention boundaries."""

from __future__ import annotations

from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path
import re
from typing import Any
from uuid import UUID

from learning import preferences, records, storage, visuals
from learning.observations import correction_links, expand_corrections

_RETAINED = {
    "semantic_copies": "Prose copies in other entries, courses and source files are not searched or erased.",
    "artifacts": "Generated lessons and diagrams remain unless their exact artifact paths are selected separately.",
    "backups": "Migration backups remain unless their exact verified paths are selected separately.",
    "history": "Provider histories, native transcripts, cloud history, snapshots and filesystem recovery copies are outside this operation. Resuming a native transcript can recreate a deleted lesson.",
    "publication": "Local locks and snapshot checks do not coordinate simultaneous writes on different machines.",
}


def _scope_path(root: Path, scope: str) -> Path:
    if not isinstance(scope, str) or not re.fullmatch(
        r"[a-z0-9][a-z0-9_-]{0,63}", scope
    ):
        raise ValueError("invalid memory scope")
    return root / "state" / f"{scope}.json"


def _safe_file(base: Path, relative: str) -> Path:
    part = Path(relative)
    if part.is_absolute() or ".." in part.parts or not part.parts:
        raise ValueError("memory paths must be exact relative file paths")
    path = base
    for component in part.parts:
        path = path / component
        if path.is_symlink():
            raise ValueError(f"refusing linked memory path: {relative}")
    if base.is_symlink():
        raise ValueError("refusing a linked memory directory")
    if not path.is_file():
        raise ValueError(f"memory file does not exist: {relative}")
    return path


def _preference_entries(policy: dict[str, Any]) -> dict[str, Any]:
    entries: dict[str, Any] = {}
    for rule in policy["rules"]:
        for dimension, value in rule["values"].items():
            entries[f"p{len(entries) + 1}"] = {
                "when": rule["when"],
                "dimension": dimension,
                "value": value,
            }
    return entries


def _lesson(root: Path, relative: str) -> tuple[Path, dict[str, Any]]:
    path = _safe_file(root, relative)
    parts = Path(relative).parts
    if len(parts) != 2 or parts[0] != "sessions" or path.suffix != ".md":
        raise ValueError("only exact owned session notes are removable artifacts")
    if str(UUID(path.stem)) != path.stem:
        raise ValueError("invalid lesson session identifier")
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    if not lines or lines[0] != f"<!-- learning-session:{path.stem} -->":
        raise ValueError(f"unowned lesson: {relative}")
    metadata: dict[str, Any] = {}
    prefix = "<!-- learning-lesson:"
    if len(lines) > 1 and lines[1].startswith(prefix) and lines[1].endswith(" -->"):
        value = json.loads(lines[1][len(prefix) : -4])
        if isinstance(value, dict):
            metadata = value
    return path, metadata


def _artifact(
    root: Path, assets: Path | None, relative: str
) -> tuple[Path, dict[str, Any]]:
    if relative.startswith("sessions/"):
        return _lesson(root, relative)
    if assets is None or not relative.startswith("assets/"):
        raise ValueError(
            "artifact must name an owned session or a configured generated asset"
        )
    name = relative.removeprefix("assets/")
    if "/" in name or not re.fullmatch(r".+-[a-f0-9]{16}\.svg", name):
        raise ValueError("invalid generated asset name")
    path = _safe_file(assets, name)
    raw = path.read_bytes()
    if sha256(raw).hexdigest()[:16] != path.stem.rsplit("-", 1)[1]:
        raise ValueError("asset content does not match its generated filename")
    visuals.validate_svg(raw.decode("utf-8"))
    return path, {"kind": "diagram"}


def _backup(root: Path, relative: str) -> tuple[Path, dict[str, Any]]:
    path = _safe_file(root, relative)
    parts = Path(relative).parts
    if (
        len(parts) not in (3, 4)
        or parts[0] != "backups"
        or not parts[1].startswith("schema4-to5-")
    ):
        raise ValueError("only manifest-owned migration backup files are removable")
    manifest_path = _safe_file(root, f"backups/{parts[1]}/manifest.json")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if (
        not isinstance(manifest, dict)
        or manifest.get("migration") != "schema4-to5"
        or not isinstance(manifest.get("sha256"), dict)
    ):
        raise ValueError("invalid migration backup manifest")
    member = "/".join(parts[2:])
    checksums = manifest["sha256"]
    for name, checksum in checksums.items():
        if (
            not isinstance(name, str)
            or not (
                name == "preferences.json"
                or re.fullmatch(r"state/[a-z0-9][a-z0-9_-]{0,63}\.json", name)
            )
            or not isinstance(checksum, str)
            or not re.fullmatch(r"[a-f0-9]{64}", checksum)
        ):
            raise ValueError("invalid migration backup manifest entry")
    if member == "manifest.json":
        return path, {"members": sorted(checksums)}
    if member not in checksums or not (
        member == "preferences.json"
        or re.fullmatch(r"state/[a-z0-9][a-z0-9_-]{0,63}\.json", member)
    ):
        raise ValueError("backup file is not owned by its migration manifest")
    current = sha256(path.read_bytes()).hexdigest()
    if current != checksums[member]:
        raise ValueError(
            "backup checksum differs from its manifest; inspect it manually"
        )
    return path, {"verified": True, "manifest": str(manifest_path)}


def _inventory(root: Path, assets: Path | None) -> dict[str, Any]:
    result: dict[str, Any] = {"artifacts": [], "backups": [], "unmanaged": []}
    candidates = [
        ("artifacts", f"sessions/{path.name}")
        for path in sorted((root / "sessions").glob("*.md"))
    ]
    if assets is not None:
        candidates.extend(
            ("artifacts", f"assets/{path.name}")
            for path in sorted(assets.glob("*.svg"))
        )
    candidates.extend(
        ("backups", str(path.relative_to(root)))
        for path in sorted((root / "backups").glob("schema4-to5-*/**/*.json"))
    )
    for kind, relative in candidates:
        try:
            path, metadata = (
                _backup(root, relative)
                if kind == "backups"
                else _artifact(root, assets, relative)
            )
            result[kind].append(
                {
                    "path": relative,
                    "absolute_path": str(path),
                    "sha256": sha256(path.read_bytes()).hexdigest(),
                    **metadata,
                }
            )
        except (ValueError, OSError, UnicodeError) as error:
            result["unmanaged"].append({"path": relative, "reason": str(error)})
    return result


def inspect(
    root: Path, scope: str | None = None, *, assets: Path | None = None
) -> dict[str, Any]:
    """Inspect portable state and exact owned files, without loading native history."""
    scopes = (
        [_scope_path(root, scope)]
        if scope is not None
        else sorted((root / "state").glob("*.json"))
    )
    entries = []
    for path in scopes:
        if path.exists() or path.is_symlink():
            _safe_file(root, str(path.relative_to(root)))
        current = records.read(root, path.stem)
        assert isinstance(current, dict)
        entries.append(
            {
                "scope": path.stem,
                "path": str(path),
                "revision": current["revision"],
                "digest": current["digest"],
                "counts": {
                    name: len(current.get(name, {}))
                    for name in (
                        "topics",
                        "observations",
                        "knowledge",
                        "tasks",
                        "sources",
                    )
                },
                **({"record": current} if scope is not None else {}),
            }
        )
    policy_path = root / "preferences.json"
    if policy_path.exists() or policy_path.is_symlink():
        _safe_file(root, "preferences.json")
    policy = preferences.read(root)
    result = {
        "records": entries,
        "preferences": {
            "path": str(root / "preferences.json"),
            "revision": policy["revision"],
            "digest": policy["digest"],
            "entries": _preference_entries(policy),
            "handles": "Preference handles identify entries only within this snapshot.",
        },
        **_inventory(root, assets),
        "retained": dict(_RETAINED),
        "assets_directory": str(assets) if assets is not None else None,
    }
    return result


def _selection(value: Any, scope: str | None) -> tuple[str, dict[str, Any]]:
    if not isinstance(value, dict) or not value:
        raise ValueError("forget selection must be a nonempty object")
    groups = {"observations", "knowledge", "tasks", "course"}
    if set(value).issubset(groups):
        if scope is None:
            raise ValueError("record forgetting requires a scope")
        if "course" in value:
            if value != {"course": True} or type(value["course"]) is not bool:
                raise ValueError("course forgetting requires exactly {course: true}")
            return "record", {"course": True}
        kind = "record"
    elif len(value) == 1 and next(iter(value)) in {
        "preferences",
        "artifacts",
        "backups",
    }:
        if scope is not None:
            raise ValueError(
                "preferences, artifacts and backups are separate unscoped operations"
            )
        kind = next(iter(value))
    else:
        raise ValueError(
            "forget selections cannot mix record, preference, artifact or backup ownership"
        )
    result = {}
    for name, handles in value.items():
        if (
            not isinstance(handles, list)
            or not handles
            or any(not isinstance(key, str) or not key for key in handles)
            or len(set(handles)) != len(handles)
        ):
            raise ValueError(
                f"{name} must be a nonempty list of distinct exact handles"
            )
        result[name] = sorted(handles)
    return kind, result


def _strip_links(value: Any, removed: set[str]) -> Any:
    if isinstance(value, list):
        return [_strip_links(item, removed) for item in value]
    if not isinstance(value, dict):
        return value
    return {
        key: [
            _strip_links(item, removed)
            for item in part
            if not isinstance(item, str) or item not in removed
        ]
        if key in {"observations", "corrects", "considered_observations"}
        and isinstance(part, list)
        else _strip_links(part, removed)
        for key, part in value.items()
    }


def _redact(
    current: dict[str, Any], selection: dict[str, Any]
) -> tuple[dict[str, Any], dict[str, Any]]:
    record = deepcopy(current)
    highwater = max(
        record.get("observation_sequence", 0),
        max((int(key[1:]) for key in record.get("observations", {})), default=0),
    )
    if selection.get("course"):
        return records.normalize_record({"observation_sequence": highwater}), {
            "course_reset": True,
            "retained_stub": "An empty record and revision remain for conflict detection and handle identity.",
        }
    for field, handles in selection.items():
        missing = set(handles) - set(record.get(field, {}))
        if missing:
            raise ValueError(f"unknown {field}: {', '.join(sorted(missing))}")
    removed = set(selection.get("observations", []))
    affected = expand_corrections(
        correction_links(record.get("observations", {})), removed
    )
    invalidated = []
    for topic, value in record.get("topics", {}).items():
        for field in ("assessment", "review"):
            interpretation = value.get(field)
            if interpretation is None:
                continue
            cited = set(interpretation.get("observations", [])) | set(
                interpretation.get("considered_observations") or []
            )
            unknown_coverage = interpretation.get(
                "considered_observations"
            ) is None and any(
                topic in record["observations"][key]["topics"] for key in removed
            )
            if cited.intersection(affected) or unknown_coverage:
                value.pop(field)
                invalidated.append(f"topics.{topic}.{field}")
    for field, handles in selection.items():
        for handle in handles:
            del record[field][handle]
    if record.get("current_task") in selection.get("tasks", []):
        record.pop("current_task")
    record = _strip_links(record, removed)
    if removed:
        record["observation_sequence"] = highwater
    return records.normalize_record(record), {
        "invalidated": invalidated,
        "removed": selection,
    }


def _token(
    root: Path,
    kind: str,
    targets: list[Path],
    snapshot: Any,
    selection: dict[str, Any],
) -> str:
    return sha256(
        json.dumps(
            {
                "root": str(root.resolve()),
                "kind": kind,
                "targets": sorted(str(path.resolve()) for path in targets),
                "snapshot": snapshot,
                "selection": selection,
            },
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()


def _check(
    revision: int,
    token: str,
    expected: int | None,
    expected_digest: str | None,
    apply: bool,
) -> None:
    if apply and (type(expected) is not int or expected_digest is None):
        raise ValueError(
            "apply requires expected revision and expected_digest from this exact forget preview"
        )
    if expected is not None and (type(expected) is not int or expected != revision):
        raise storage.RevisionConflict("forget revision changed; preview again")
    if expected_digest is not None and expected_digest != token:
        raise storage.RevisionConflict(
            "forget target, selection or snapshot changed; preview again"
        )


def forget(
    root: Path,
    scope: str | None,
    selection: Any,
    *,
    expected: int | None = None,
    expected_digest: str | None = None,
    apply: bool = False,
    assets: Path | None = None,
) -> dict[str, Any]:
    """Preview exact redaction; apply only against that selection and snapshot."""
    kind, selected = _selection(selection, scope)
    lock = ".lessons.lock" if kind == "artifacts" else ".records.lock"
    if not apply:
        return _forget(
            root, scope, kind, selected, expected, expected_digest, False, assets
        )
    with storage.lock(root / lock):
        return _forget(
            root, scope, kind, selected, expected, expected_digest, True, assets
        )


def _forget(
    root: Path,
    scope: str | None,
    kind: str,
    selected: dict[str, Any],
    expected: int | None,
    expected_digest: str | None,
    apply: bool,
    assets: Path | None,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "applied": False,
        "kind": kind,
        "scope": scope,
        "selection": selected,
        "retained": dict(_RETAINED),
    }
    if kind in {"artifacts", "backups"}:
        files = {}
        for relative in selected[kind]:
            path, metadata = (
                _backup(root, relative)
                if kind == "backups"
                else _artifact(root, assets, relative)
            )
            if kind == "backups" and "members" in metadata:
                prefix = str(Path(relative).parent)
                missing = [
                    f"{prefix}/{member}"
                    for member in metadata["members"]
                    if (root / prefix / member).exists()
                    and f"{prefix}/{member}" not in selected[kind]
                ]
                if missing:
                    raise ValueError(
                        "select all remaining backup members before deleting their manifest"
                    )
            files[relative] = {
                "path": str(path),
                "sha256": sha256(path.read_bytes()).hexdigest(),
            }
        token = _token(
            root,
            kind,
            [Path(item["path"]) for item in files.values()],
            {relative: item["sha256"] for relative, item in files.items()},
            selected,
        )
        _check(0, token, expected, expected_digest, apply)
        result.update(
            revision=0,
            digest=token,
            files=files,
            effects={
                "deletes_entire_files": True,
                "consequence": (
                    "Selected notes include any learner annotations; retained native histories can recreate generated lessons."
                    if kind == "artifacts"
                    else "Selected backup files will no longer be available for restoration."
                ),
            },
        )
        if apply:
            deleted = []
            failures: list[dict[str, str]] = []
            # A manifest survives any failed member deletion.
            for relative in sorted(
                files, key=lambda value: (value.endswith("/manifest.json"), value)
            ):
                if relative.endswith("/manifest.json") and failures:
                    failures.append(
                        {
                            "path": relative,
                            "error": "retained after a member deletion failed",
                        }
                    )
                    continue
                try:
                    path = Path(files[relative]["path"])
                    if (
                        path.is_symlink()
                        or sha256(path.read_bytes()).hexdigest()
                        != files[relative]["sha256"]
                    ):
                        raise ValueError(
                            "file changed during forgetting; preview again"
                        )
                    path.unlink()
                    deleted.append(relative)
                except (ValueError, OSError) as error:
                    failures.append({"path": relative, "error": str(error)})
            result.update(
                applied=bool(deleted),
                deleted=deleted,
                failures=failures,
                complete=not failures,
                atomic=False,
            )
        return result
    path = (
        _scope_path(root, scope)
        if kind == "record" and scope is not None
        else root / "preferences.json"
    )
    if path.exists() or path.is_symlink():
        _safe_file(root, str(path.relative_to(root)))
    current = preferences.read(root) if kind == "preferences" else storage.load(path)
    if current["revision"] == 0:
        raise ValueError("memory record does not exist")
    snapshot_digest = (
        current["digest"] if kind == "preferences" else storage.digest(current)
    )
    token = _token(root, kind, [path], snapshot_digest, selected)
    _check(current["revision"], token, expected, expected_digest, apply)
    if kind == "record":
        if selected.get("course"):
            scoped = [
                key
                for key, entry in _preference_entries(preferences.read(root)).items()
                if entry["when"].get("scope") == scope
            ]
            if scoped:
                raise ValueError(
                    f"remove scoped preferences in a separate preview first: {', '.join(scoped)}"
                )
        revised, effects = _redact(current, selected)
    else:
        policy = current
        entries = _preference_entries(policy)
        if set(selected["preferences"]) - set(entries):
            raise ValueError("unknown preference handles; inspect current memory")
        erased = [entries[key] for key in selected["preferences"]]
        rules = []
        for rule in policy["rules"]:
            dimensions = {
                item["dimension"] for item in erased if item["when"] == rule["when"]
            }
            values = {
                key: value
                for key, value in rule["values"].items()
                if key not in dimensions
            }
            if values:
                rules.append({"when": rule["when"], "values": values})
        revised = {"schema_version": 1, "rules": rules}
        effects = {"removed": erased}
    result.update(revision=current["revision"], digest=token, effects=effects)
    if apply:
        committed = storage.update(
            path,
            current["revision"],
            lambda _: revised,
            expected_digest=snapshot_digest,
        )
        result.update(
            applied=True,
            revision=committed["revision"],
            record_digest=storage.digest(committed),
        )
    return result
