"""Agent command table: one small handler per verb, mutation policy declared once."""

from __future__ import annotations

import argparse
from collections.abc import Callable
from dataclasses import dataclass
import json
from pathlib import Path
import sys
from typing import Any
from uuid import uuid4

from learning import lessons, preferences, records, retrieval
from learning.workspace import Workspace

Handler = Callable[[Workspace, argparse.Namespace], dict[str, Any]]


def keys(value: str | None) -> list[str] | None:
    """Parse a JSON array or comma-separated handles; None passes through."""
    if value is None:
        return None
    if value.lstrip().startswith("["):
        parsed = json.loads(value)
        if not isinstance(parsed, list) or any(
            not isinstance(item, str) or not item.strip() for item in parsed
        ):
            raise ValueError("selectors must be an array of nonempty strings")
        return parsed
    return [key.strip() for key in value.split(",") if key.strip()]


def _stdin_json() -> Any:
    return json.load(sys.stdin)


def _scope(workspace: Workspace, value: str | None) -> str | None:
    return None if value is None else records.resolve_scope(workspace.root, value)


def _with_policy(
    workspace: Workspace,
    result: dict[str, Any],
    args: argparse.Namespace,
    scope: str | None,
) -> dict[str, Any]:
    """Attach applicable preferences to an evidence response and drop routing metadata."""
    policy_topics = result.pop("policy_topics", {})
    result["preferences"] = preferences.context(
        workspace.root,
        scope=scope,
        topics=list(policy_topics),
        concepts=keys(getattr(args, "concepts", None)),
        domains=keys(getattr(args, "domains", None)),
        activity=getattr(args, "activity", None),
        state={"revision": result["revision"], "topics": policy_topics}
        if scope
        else None,
    )
    return result


# --- handlers ---------------------------------------------------------------


def catalog(workspace: Workspace, args: argparse.Namespace) -> dict[str, Any]:
    scope = _scope(workspace, args.scope)
    result = retrieval.catalog(workspace.root, scope)
    if scope is None:
        result.update(
            workspace=str(workspace.directory),
            sources_directory=str(workspace.sources),
            learning=str(workspace.root),
            preferences=preferences.context(workspace.root),
        )
    return result


def _recency(workspace: Workspace, item: dict[str, Any]) -> tuple[str, int]:
    """Order scopes by publication time, then by file modification for same-second ties."""
    path = workspace.root / "state" / f"{item['scope']}.json"
    try:
        modified = path.stat().st_mtime_ns
    except OSError:
        modified = 0
    return (item.get("updated_at") or "", modified)


def resume(workspace: Workspace, args: argparse.Namespace) -> dict[str, Any]:
    scope = _scope(workspace, args.scope)
    listing = None
    if scope is None:
        if args.task is not None:
            raise ValueError("resuming a task requires its scope")
        listing = retrieval.catalog(workspace.root)
        scopes = listing["scopes"]
        if not scopes:
            return _with_policy(
                workspace, {**catalog(workspace, args), "scope": None}, args, None
            )
        scope = max(scopes, key=lambda item: _recency(workspace, item))["scope"]
    result = retrieval.resume(
        workspace.root,
        scope,
        task=args.task,
        knowledge_budget=args.knowledge_budget,
        evidence_budget=args.evidence_budget,
    )
    if listing is not None:
        result["scopes"] = listing["scopes"]
        if listing["errors"]:
            result["errors"] = listing["errors"]
    return _with_policy(workspace, result, args, scope)


def search(workspace: Workspace, args: argparse.Namespace) -> dict[str, Any]:
    scope = _scope(workspace, args.scope)
    assert scope is not None
    result = retrieval.search(
        workspace.root,
        scope,
        args.query,
        topics=keys(args.topics),
        offset=args.offset,
        limit=args.limit,
        candidate_offset=args.candidate_offset,
        expected=args.expect,
        evidence_budget=args.evidence_budget,
    )
    return _with_policy(workspace, result, args, scope)


def knowledge(workspace: Workspace, args: argparse.Namespace) -> dict[str, Any]:
    scope = _scope(workspace, args.scope)
    assert scope is not None
    return retrieval.knowledge(
        workspace.root,
        scope,
        list(args.keys),
        offset=args.offset,
        limit=args.limit,
        budget=args.budget,
        expected=args.expect,
    )


def evidence(workspace: Workspace, args: argparse.Namespace) -> dict[str, Any]:
    scope = _scope(workspace, args.scope)
    assert scope is not None
    result = retrieval.evidence(
        workspace.root,
        scope,
        topics=keys(args.topics),
        observations=keys(args.observations),
        offset=args.offset,
        limit=args.limit,
        expected=args.expect,
        evidence_budget=args.evidence_budget,
    )
    return _with_policy(workspace, result, args, scope)


def save(workspace: Workspace, args: argparse.Namespace) -> dict[str, Any]:
    scope = _scope(workspace, args.scope)
    assert scope is not None
    return records.save(
        workspace.root,
        scope,
        args.expect,
        _stdin_json(),
        expected_digest=args.expect_digest,
        confirm_qualification_changes=keys(args.confirm_qualification_changes),
    )


def preferences_command(
    workspace: Workspace, args: argparse.Namespace
) -> dict[str, Any]:
    if args.expect is not None:
        if args.dimension is not None:
            raise ValueError("--dimension selects a read; omit it when saving")
        return preferences.save(
            workspace.root,
            args.expect,
            _stdin_json(),
            expected_digest=args.expect_digest,
        )
    if args.expect_digest is not None:
        raise ValueError("--expect-digest requires --expect")
    if args.dimension is not None:
        return preferences.inspect(workspace.root, args.dimension)
    return preferences.read(workspace.root)


def discover(workspace: Workspace, args: argparse.Namespace) -> dict[str, Any]:
    return retrieval.discover(workspace.root, args.query, limit=args.limit)


def inspect(workspace: Workspace, args: argparse.Namespace) -> dict[str, Any]:
    from learning.memory import inspect as inspect_memory

    return inspect_memory(
        workspace.root, _scope(workspace, args.scope), assets=workspace.assets
    )


def forget(workspace: Workspace, args: argparse.Namespace) -> dict[str, Any]:
    from learning.memory import forget as forget_memory

    return forget_memory(
        workspace.root,
        _scope(workspace, args.scope),
        _stdin_json(),
        expected=args.expect,
        expected_digest=args.expect_digest,
        apply=args.apply,
        assets=workspace.assets,
    )


def sources(workspace: Workspace, args: argparse.Namespace) -> dict[str, Any]:
    from learning import sources as material

    scope = _scope(workspace, args.scope)
    assert scope is not None
    chosen = [name for name in ("check", "add", "scan") if getattr(args, name)]
    if len(chosen) != 1:
        raise ValueError("choose exactly one of --check HANDLES, --add PATHS or --scan")
    if args.scan:
        record = records.read(workspace.root, scope)
        assert isinstance(record, dict)
        return {
            "scope": scope,
            **material.scan(workspace.sources, record.get("sources", {})),
        }
    if args.add:
        if args.expect is None:
            raise ValueError("--add requires --expect with the current scope revision")
        return material.register(
            workspace.root,
            workspace.sources,
            scope,
            keys(args.add) or [],
            args.expect,
            expected_digest=args.expect_digest,
        )
    return material.inspect_sources(
        workspace.root,
        workspace.sources,
        scope,
        keys(args.check) or [],
        expected=args.expect,
        expected_digest=args.expect_digest,
    )


def readiness(workspace: Workspace, args: argparse.Namespace) -> dict[str, Any]:
    from learning.readiness import check

    return check(workspace.root, workspace.sources, host=args.host)


def plan(workspace: Workspace, args: argparse.Namespace) -> dict[str, Any]:
    from learning.planning import plan as build_plan
    from sync.study.context import journal_vault

    return build_plan(
        workspace.root,
        journal_vault(),
        _scope(workspace, args.scope),
        args.days,
        horizon=args.horizon,
        knowledge_budget=args.knowledge_budget,
        evidence_budget=args.evidence_budget,
    )


def journal(workspace: Workspace, args: argparse.Namespace) -> dict[str, Any]:
    from sync.study.context import journal_summary, journal_vault

    return journal_summary(journal_vault(), args.days, horizon=args.horizon)


def lesson(workspace: Workspace, args: argparse.Namespace) -> dict[str, Any]:
    from learning.lessons import label

    scope = _scope(workspace, args.scope)
    return {
        "path": str(
            label(workspace.root, args.session_id, title=args.title, scope=scope)
        )
    }


def publish_lesson(workspace: Workspace, args: argparse.Namespace) -> dict[str, Any]:
    return {
        "path": str(lessons.publish(workspace.root, args.session_id, sys.stdin.read()))
    }


def visual(workspace: Workspace, args: argparse.Namespace) -> dict[str, Any]:
    from learning.visuals import publish_svg

    return publish_svg(
        workspace.sources, args.title, sys.stdin.read(), assets=workspace.assets
    )


def note(workspace: Workspace, args: argparse.Namespace) -> dict[str, Any]:
    title = " ".join(args.title.splitlines())
    text = f"# {title}\n\n{sys.stdin.read()}"
    return {"path": str(lessons.publish(workspace.root, str(uuid4()), text))}


def import_scope(workspace: Workspace, args: argparse.Namespace) -> dict[str, Any]:
    from learning.workspace_import import import_scope as run_import

    return run_import(
        workspace,
        args.source,
        args.source_directory,
        args.scope,
        include_defaults=args.include_defaults,
        apply=args.apply,
    )


def link(workspace: Workspace, args: argparse.Namespace) -> dict[str, Any]:
    from learning.workspace import link as link_material, links_path

    linked = link_material(workspace, args.material)
    return {
        "workspace": str(linked.directory),
        "sources_directory": str(linked.sources),
        "links": str(links_path()),
    }


def unlink(workspace: Workspace, args: argparse.Namespace) -> dict[str, Any]:
    from learning.workspace import links_path, unlink as unlink_material

    unlinked = unlink_material(workspace)
    return {
        "workspace": str(unlinked.directory),
        "sources_directory": str(unlinked.sources),
        "links": str(links_path()),
    }


# --- command table ----------------------------------------------------------


@dataclass(frozen=True)
class Command:
    name: str
    help: str
    handler: Handler
    build: Callable[[argparse.ArgumentParser], None]
    mutating: Callable[[argparse.Namespace], bool] = lambda args: False


def _paged(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--limit", type=int)
    parser.add_argument(
        "--expect", type=int, help="Scope revision that a continued page must match"
    )


def _policy(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--concepts", help="Established concept labels (JSON array or comma-separated)"
    )
    parser.add_argument("--domains", help="Established domain labels")
    parser.add_argument("--activity", help="Current learning activity, e.g. proof")


def _evidence_budget(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--evidence-budget",
        type=int,
        help="Evidence allowance in UTF-8 bytes (minimum 2)",
    )


def _snapshot(parser: argparse.ArgumentParser, *, required: bool) -> None:
    parser.add_argument(
        "--expect", type=int, required=required, help="Current scope revision"
    )
    parser.add_argument("--expect-digest", help="Current scope digest")


def _build_catalog(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "scope",
        nargs="?",
        help="Omit for the scope list; give a scope for its handle index",
    )


def _build_resume(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "scope",
        nargs="?",
        help="Scope handle or course title; omit for the latest scope",
    )
    parser.add_argument(
        "--task", help="Exact task_index key to resume; default is current_task"
    )
    parser.add_argument(
        "--knowledge-budget", type=int, help="Knowledge allowance in UTF-8 bytes"
    )
    _evidence_budget(parser)
    _policy(parser)


def _build_search(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("scope")
    parser.add_argument("query", help="A few distinctive terms or a stored alias")
    parser.add_argument("--topics", help="Restrict evidence to these topic handles")
    parser.add_argument("--candidate-offset", type=int, default=0)
    _paged(parser)
    _evidence_budget(parser)
    _policy(parser)


def _build_knowledge(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("scope")
    parser.add_argument(
        "keys",
        nargs="*",
        help="Entry handles for whole reads; none for the paged index",
    )
    parser.add_argument(
        "--budget", type=int, help="Byte allowance for an exact read (default 8192)"
    )
    _paged(parser)


def _build_evidence(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("scope")
    parser.add_argument("--topics", help="Topic handles whose histories to read")
    parser.add_argument("--observations", help="Exact observation handles, e.g. o1,o2")
    _paged(parser)
    _evidence_budget(parser)
    _policy(parser)


def _build_save(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("scope")
    _snapshot(parser, required=True)
    parser.add_argument(
        "--confirm-qualification-changes",
        help="Reviewed knowledge entry handles; requires --expect-digest",
    )


def _build_preferences(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--dimension", help="Inspect this dimension across all selectors"
    )
    _snapshot(parser, required=False)


def _build_discover(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("query")
    parser.add_argument("--limit", type=int, default=8)


def _build_inspect(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("scope", nargs="?")


def _build_forget(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("scope", nargs="?")
    _snapshot(parser, required=False)
    parser.add_argument("--apply", action="store_true")


def _build_sources(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("scope")
    parser.add_argument("--check", help="Registered source handles to fingerprint")
    parser.add_argument("--add", help="Local file paths to register as sources")
    parser.add_argument(
        "--scan",
        action="store_true",
        help="List unregistered material in the workspace's source directory",
    )
    _snapshot(parser, required=False)


def _build_readiness(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--host", choices=("all", "codex", "claude", "pi"), default="all"
    )


def _build_plan(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("scope", nargs="?")
    parser.add_argument("--days", type=int, default=7)
    parser.add_argument("--horizon", type=int, default=7)
    parser.add_argument("--knowledge-budget", type=int)
    parser.add_argument(
        "--evidence-budget", type=int, default=retrieval.AUTOMATIC_EVIDENCE_BYTES
    )


def _build_journal(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--days", type=int, default=7)
    parser.add_argument("--horizon", type=int, default=7)


def _build_lesson(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("session_id")
    parser.add_argument("--title", required=True)
    parser.add_argument("--scope")


def _build_publish_lesson(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("session_id")


def _build_visual(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--title", required=True)


def _build_note(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--title", default="Study notes")


def _build_link(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "material", help="Directory outside any workspace that this workspace studies"
    )


def _build_unlink(parser: argparse.ArgumentParser) -> None:
    pass


def _build_import(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("scope")
    parser.add_argument("--from", dest="source", type=Path, required=True)
    parser.add_argument("--source-directory", type=Path, required=True)
    parser.add_argument("--include-defaults", action="store_true")
    parser.add_argument("--apply", action="store_true")


COMMANDS: tuple[Command, ...] = (
    Command("catalog", "List scopes, or one scope's handles", catalog, _build_catalog),
    Command(
        "resume",
        "Continue a scope: task, briefing, evidence, knowledge, preferences",
        resume,
        _build_resume,
    ),
    Command(
        "search",
        "Find evidence and discovery candidates in one scope",
        search,
        _build_search,
    ),
    Command(
        "knowledge",
        "Read whole knowledge entries or their paged index",
        knowledge,
        _build_knowledge,
    ),
    Command(
        "evidence",
        "Read topic histories or exact observations with corrections",
        evidence,
        _build_evidence,
    ),
    Command(
        "save",
        "Publish a field patch at the expected snapshot",
        save,
        _build_save,
        lambda args: True,
    ),
    Command(
        "preferences",
        "Inspect or update current preferences",
        preferences_command,
        _build_preferences,
        lambda args: args.expect is not None,
    ),
    Command(
        "discover",
        "Find course/topic/memory handles across scopes",
        discover,
        _build_discover,
    ),
    Command(
        "inspect",
        "Inspect portable memory and its retention boundaries",
        inspect,
        _build_inspect,
    ),
    Command(
        "forget",
        "Preview or apply explicitly selected removal",
        forget,
        _build_forget,
        lambda args: args.apply,
    ),
    Command(
        "sources",
        "Scan, register or fingerprint local course material",
        sources,
        _build_sources,
        lambda args: bool(args.add) or (bool(args.check) and args.expect is not None),
    ),
    Command(
        "readiness",
        "Check this host without changing its configuration",
        readiness,
        _build_readiness,
    ),
    Command(
        "plan", "Combine reviews, unfinished work and Journal effort", plan, _build_plan
    ),
    Command(
        "journal", "Recorded study time and scheduled windows", journal, _build_journal
    ),
    Command("lesson", "Name an owned lesson", lesson, _build_lesson, lambda args: True),
    Command(
        "publish-lesson",
        "Publish an owned lesson from Markdown on stdin",
        publish_lesson,
        _build_publish_lesson,
        lambda args: True,
    ),
    Command(
        "visual",
        "Publish a static SVG for the lesson",
        visual,
        _build_visual,
        lambda args: True,
    ),
    Command(
        "note",
        "Publish a standalone Markdown note from stdin",
        note,
        _build_note,
        lambda args: True,
    ),
    Command(
        "import",
        "Preview or copy one existing scope into this workspace",
        import_scope,
        _build_import,
        lambda args: args.apply,
    ),
    Command(
        "link",
        "Study a material directory elsewhere and be found from it",
        link,
        _build_link,
        lambda args: True,
    ),
    Command(
        "unlink",
        "Stop studying linked material; sources resolve from the workspace",
        unlink,
        _build_unlink,
        lambda args: True,
    ),
)
