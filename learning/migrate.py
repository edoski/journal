"""Explicit, backup-backed migration of learning evidence to schema five."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
from typing import Any
from uuid import uuid4

from learning import records, storage


def convert(record: dict[str, Any]) -> dict[str, Any]:
    """Preserve schema-four records while marking past review coverage unknown."""
    if type(record.get("schema_version")) is not int or record["schema_version"] != 4:
        raise ValueError("migration requires a schema_version 4 record")
    result = deepcopy(record)
    result["schema_version"] = 5
    for topic in result.get("topics", {}).values():
        for field in ("assessment", "review"):
            if topic.get(field) is not None:
                topic[field].pop("reviewed_through", None)
                topic[field]["considered_observations"] = None
    records.normalize_record(deepcopy(result))
    return result


def migrate(root: Path, *, apply: bool = False) -> dict[str, Any]:
    """Preview migration, or revalidate and apply it with exact original backups."""
    plans: list[tuple[Path, bytes, int, dict[str, Any]]] = []
    scopes = []
    errors = []
    for path in sorted((root / "state").glob("*.json")):
        try:
            raw = path.read_bytes()
            record = json.loads(raw, parse_constant=storage.reject_constant)
            if (
                not isinstance(record, dict)
                or type(record.get("revision")) is not int
                or record["revision"] < 1
            ):
                raise ValueError("invalid stored revision")
            if record.get("schema_version") == 5:
                records.normalize_record(record)
                scopes.append(
                    {
                        "scope": path.stem,
                        "status": "current",
                        "revision": record["revision"],
                    }
                )
                continue
            converted = convert(record)
            plans.append((path, raw, record["revision"], converted))
            scopes.append(
                {
                    "scope": path.stem,
                    "status": "ready",
                    "revision": record["revision"],
                    "observations": len(converted["observations"]),
                    "assessments_pending": sum(
                        "assessment" in topic for topic in converted["topics"].values()
                    ),
                    "reviews_pending": sum(
                        "review" in topic for topic in converted["topics"].values()
                    ),
                }
            )
        except (ValueError, OSError, TypeError, KeyError, AttributeError) as error:
            errors.append({"scope": path.stem, "error": str(error)})
    result: dict[str, Any] = {
        "apply": apply,
        "applied": False,
        "scopes": scopes,
        "errors": errors,
    }
    if not apply or errors or not plans:
        return result
    batch = (
        datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid4().hex[:8]
    )
    backup = root / "backups" / f"schema4-to5-{batch}"
    with storage.lock(root / ".records.lock"):
        # Validate the whole planned batch before any scope is changed.
        for path, raw, revision, _ in plans:
            if path.read_bytes() != raw:
                raise ValueError(
                    f"revision conflict for {path.stem}: migration input changed; preview again"
                )
            if storage.load(path)["revision"] != revision:
                raise ValueError(
                    f"revision conflict for {path.stem}: preview migration again"
                )
        for path, raw, _, _ in plans:
            storage.publish_text(backup / "state" / path.name, raw.decode("utf-8"))
        checksums = {
            f"state/{path.name}": sha256(raw).hexdigest() for path, raw, _, _ in plans
        }
        policy_path = root / "preferences.json"
        if policy_path.exists():
            policy = policy_path.read_bytes()
            storage.publish_text(backup / "preferences.json", policy.decode("utf-8"))
            checksums["preferences.json"] = sha256(policy).hexdigest()
        storage.publish_text(
            backup / "manifest.json",
            json.dumps({"migration": "schema4-to5", "sha256": checksums}, indent=2)
            + "\n",
        )
        for path, _, revision, converted in plans:

            def transform(current: dict[str, Any]) -> dict[str, Any]:
                return converted

            try:
                committed = storage.update(path, revision, transform)
            except (ValueError, OSError) as error:
                errors.append({"scope": path.stem, "error": str(error)})
                result.update(
                    applied=any(item["status"] == "migrated" for item in scopes),
                    backup=str(backup),
                )
                return result
            for item in scopes:
                if item["scope"] == path.stem:
                    item.update(status="migrated", revision=committed["revision"])
    result.update(applied=True, backup=str(backup))
    return result
