"""Internal agent interface for the shared learning system."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys
from typing import Any
from uuid import uuid4

from learning import records, retrieval, lessons, preferences, storage


class NoSaveError(ValueError):
    """The current study session does not permit durable publication."""


def keys(value: str | None) -> list[str] | None:
    if value is not None and value.lstrip().startswith("["):
        parsed = json.loads(value)
        if not isinstance(parsed, list) or any(
            not isinstance(item, str) or not item.strip() for item in parsed
        ):
            raise ValueError("selectors must be an array of nonempty strings")
        return parsed
    return (
        [key.strip() for key in value.split(",") if key.strip()]
        if value is not None
        else None
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", help="Exact initialized study directory")
    commands = parser.add_subparsers(dest="command")
    commands.add_parser("init", help="Initialize .study in this directory")
    importing = commands.add_parser("import", help="Preview or copy one existing scope")
    importing.add_argument("scope")
    importing.add_argument("--from", dest="source", type=Path, required=True)
    importing.add_argument("--source-directory", type=Path, required=True)
    importing.add_argument("--include-defaults", action="store_true")
    importing.add_argument("--apply", action="store_true")
    start = commands.add_parser("start")
    start.add_argument("prompt", nargs="?")
    start.add_argument("--continue", dest="resume", action="store_true")
    start.add_argument("--print", dest="headless", action="store_true")
    start.add_argument("--json", action="store_true")
    start.add_argument("--no-open", action="store_true")
    start.add_argument(
        "--private",
        action="store_true",
        help="Study in disposable local state without a saved Pi session",
    )
    context = commands.add_parser("context")
    context.add_argument("scope", nargs="?")
    context.add_argument(
        "--task",
        help="Exact task_index key (e.g. exercise-7), not title; omit if unknown",
    )
    context.add_argument(
        "--topics",
        help="Comma-separated exact topic handles; empty string requests index",
    )
    context.add_argument(
        "--observations", help="Comma-separated saved observation handles (e.g. o1)"
    )
    context.add_argument("--query", help="Search evidence, aliases and course memory")
    context.add_argument(
        "--evidence-budget",
        type=int,
        help="Evidence allowance in UTF-8 bytes, minimum 2; ignored for knowledge-only reads; invalid for catalog or --all",
    )
    context.add_argument(
        "--knowledge", help="Exact entry handles; empty string requests index"
    )
    context.add_argument(
        "--knowledge-budget",
        type=int,
        help="Knowledge allowance in serialized UTF-8 bytes",
    )
    context.add_argument("--candidate-offset", type=int, default=0)
    context.add_argument("--offset", type=int, default=0)
    context.add_argument("--limit", type=int)
    context.add_argument(
        "--expect", type=int, help="Scope revision for consistent paging"
    )
    context.add_argument("--concepts", help="Established concept labels")
    context.add_argument("--domains", help="Established domain labels")
    context.add_argument("--activity", help="Current learning activity")
    context.add_argument(
        "--all", action="store_true", help="Full record for exceptional inspection"
    )
    writer = commands.add_parser("save")
    writer.add_argument("scope")
    writer.add_argument("--expect", type=int, required=True)
    writer.add_argument("--expect-digest")
    writer.add_argument(
        "--confirm-qualification-changes",
        help="Reviewed knowledge entry handles; requires the current digest",
    )
    migration = commands.add_parser("migrate", help="Inspect the schema conversion")
    migration.add_argument(
        "--apply", action="store_true", help="Back up and convert old records"
    )
    policy = commands.add_parser(
        "preferences", help="Inspect or update current preferences"
    )
    policy.add_argument("--dimension", help="Inspect this dimension across all scopes")
    policy.add_argument(
        "--expect", type=int, help="Apply a JSON patch from stdin at this revision"
    )
    policy.add_argument("--expect-digest")
    discovery = commands.add_parser(
        "discover", help="Find course/topic/memory handles across scopes"
    )
    discovery.add_argument("query")
    discovery.add_argument("--limit", type=int, default=8)
    inspection = commands.add_parser(
        "inspect", help="Inspect portable memory and its retention boundaries"
    )
    inspection.add_argument("scope", nargs="?")
    forgetting = commands.add_parser(
        "forget", help="Preview or apply explicitly selected memory removal"
    )
    forgetting.add_argument("scope", nargs="?")
    forgetting.add_argument("--expect", type=int)
    forgetting.add_argument("--expect-digest")
    forgetting.add_argument("--apply", action="store_true")
    source_check = commands.add_parser(
        "sources", help="Inspect or capture selected local source fingerprints"
    )
    source_check.add_argument("scope")
    source_check.add_argument("--sources", required=True)
    source_check.add_argument("--expect", type=int)
    source_check.add_argument("--expect-digest")
    readiness = commands.add_parser(
        "readiness", help="Check this host without changing its configuration"
    )
    readiness.add_argument(
        "--host", choices=("all", "codex", "claude", "pi"), default="all"
    )
    planner = commands.add_parser("plan")
    planner.add_argument("scope", nargs="?")
    planner.add_argument("--days", type=int, default=7)
    planner.add_argument("--horizon", type=int, default=7)
    planner.add_argument("--knowledge-budget", type=int)
    planner.add_argument(
        "--evidence-budget", type=int, default=retrieval.AUTOMATIC_EVIDENCE_BYTES
    )
    journal = commands.add_parser("journal")
    journal.add_argument("--days", type=int, default=7)
    journal.add_argument("--horizon", type=int, default=7)
    lesson = commands.add_parser("lesson")
    lesson.add_argument("session_id")
    lesson.add_argument("--title", required=True)
    lesson.add_argument("--scope")
    publication = commands.add_parser(
        "publish-lesson", help="Publish an owned lesson from Markdown on stdin"
    )
    publication.add_argument("session_id")
    visual = commands.add_parser("visual")
    visual.add_argument("--title", required=True)
    note = commands.add_parser("note")
    note.add_argument("--title", default="Study notes")
    args = parser.parse_args(argv)
    try:
        from learning.workspace import initialize, resolve

        if args.command == "init":
            if os.environ.get("LEARNING_NO_SAVE") == "1":
                raise NoSaveError(
                    "This session cannot initialize persistent study state"
                )
            workspace = initialize(args.workspace)
            print(
                json.dumps(
                    {
                        "workspace": str(workspace.directory),
                        "learning": str(workspace.root),
                    }
                )
            )
            return 0
        workspace = resolve(args.workspace)
        vault, root, assets = workspace.sources, workspace.root, workspace.assets
        mutating = (
            args.command in {"save", "lesson", "publish-lesson", "visual", "note"}
            or (args.command in {"preferences", "sources"} and args.expect is not None)
            or (args.command in {"forget", "migrate", "import"} and args.apply)
        )
        if mutating and os.environ.get("LEARNING_NO_SAVE") == "1":
            raise NoSaveError(
                "This session is not saving study memory or artifacts. Continue teaching without a write."
            )
        if args.command in (None, "start"):
            from learning.runtime import start_pi

            start_pi(
                workspace,
                args
                if args.command
                else argparse.Namespace(
                    prompt=None,
                    resume=False,
                    headless=False,
                    json=False,
                    no_open=False,
                    private=False,
                ),
            )
            return 0
        if args.command == "import":
            from learning.workspace_import import import_scope

            result: dict[str, Any] = import_scope(
                workspace,
                args.source,
                args.source_directory,
                args.scope,
                include_defaults=args.include_defaults,
                apply=args.apply,
            )
        elif args.command == "context":
            selection = (
                args.task is not None
                or args.topics is not None
                or args.observations is not None
                or args.query is not None
                or args.knowledge is not None
                or args.knowledge_budget is not None
                or args.evidence_budget is not None
                or args.candidate_offset
                or args.all
                or args.offset
                or args.limit is not None
                or args.expect is not None
            )
            if selection and not args.scope:
                raise ValueError("evidence selection requires a scope")
            if args.all and (
                args.task is not None
                or args.topics is not None
                or args.observations is not None
                or args.query is not None
                or args.knowledge is not None
                or args.knowledge_budget is not None
                or args.evidence_budget is not None
                or args.candidate_offset
                or args.offset
                or args.limit is not None
                or args.expect is not None
            ):
                raise ValueError(
                    "--all cannot be combined with evidence selection or paging"
                )
            if args.knowledge is not None and any(
                value is not None
                for value in (args.concepts, args.domains, args.activity)
            ):
                raise ValueError("knowledge reads cannot include policy selectors")
            topics = keys(args.topics)
            context_value = (
                records.read(root, args.scope)
                if args.all
                else retrieval.context(
                    root,
                    args.scope,
                    topics,
                    task=args.task,
                    observations=keys(args.observations),
                    query=args.query,
                    knowledge=keys(args.knowledge),
                    knowledge_budget=args.knowledge_budget,
                    evidence_budget=args.evidence_budget,
                    candidate_offset=args.candidate_offset,
                    offset=args.offset,
                    limit=args.limit,
                    expected=args.expect,
                )
            )
            if args.scope is None:
                assert isinstance(context_value, list)
                result = {
                    "scopes": [item for item in context_value if "error" not in item],
                    "errors": [item for item in context_value if "error" in item],
                }
            else:
                assert isinstance(context_value, dict)
                result = context_value
            if args.knowledge is None:
                result.update(
                    workspace=str(workspace.directory),
                    vault=str(vault),
                    learning=str(root),
                    assets=str(assets),
                )
                policy_topics = result.pop("policy_topics", {})
                result["preferences"] = preferences.context(
                    root,
                    scope=args.scope,
                    topics=list(policy_topics),
                    concepts=keys(args.concepts),
                    domains=keys(args.domains),
                    activity=args.activity,
                    state={"revision": result["revision"], "topics": policy_topics}
                    if args.scope
                    else None,
                )
        elif args.command == "save":
            result = records.save(
                root,
                args.scope,
                args.expect,
                json.load(sys.stdin),
                expected_digest=args.expect_digest,
                confirm_qualification_changes=keys(args.confirm_qualification_changes),
            )
        elif args.command == "migrate":
            from learning.migrate import migrate

            result = migrate(root, apply=args.apply)
        elif args.command == "preferences":
            if args.expect is not None:
                if args.dimension is not None:
                    raise ValueError("--dimension selects a read; omit it when saving")
                result = preferences.save(
                    root,
                    args.expect,
                    json.load(sys.stdin),
                    expected_digest=args.expect_digest,
                )
            elif args.expect_digest is not None:
                raise ValueError("--expect-digest requires --expect")
            elif args.dimension is not None:
                result = preferences.inspect(root, args.dimension)
            else:
                result = preferences.read(root)
        elif args.command == "discover":
            result = retrieval.discover(root, args.query, limit=args.limit)
        elif args.command == "inspect":
            from learning.memory import inspect

            result = inspect(root, args.scope, assets=assets)
        elif args.command == "forget":
            from learning.memory import forget

            result = forget(
                root,
                args.scope,
                json.load(sys.stdin),
                expected=args.expect,
                expected_digest=args.expect_digest,
                apply=args.apply,
                assets=assets,
            )
        elif args.command == "sources":
            from learning.sources import inspect_sources

            result = inspect_sources(
                root,
                vault,
                args.scope,
                keys(args.sources) or [],
                expected=args.expect,
                expected_digest=args.expect_digest,
            )
        elif args.command == "readiness":
            from learning.readiness import check

            result = check(root, vault, host=args.host)
        elif args.command == "plan":
            from learning.planning import plan

            result = plan(
                root,
                vault,
                args.scope,
                args.days,
                horizon=args.horizon,
                knowledge_budget=args.knowledge_budget,
                evidence_budget=args.evidence_budget,
            )
        elif args.command == "journal":
            from sync.study.context import journal_summary

            result = journal_summary(vault, args.days, horizon=args.horizon)
        elif args.command == "lesson":
            from learning.lessons import label

            result = {
                "path": str(
                    label(root, args.session_id, title=args.title, scope=args.scope)
                )
            }
        elif args.command == "publish-lesson":
            result = {
                "path": str(lessons.publish(root, args.session_id, sys.stdin.read()))
            }
        elif args.command == "visual":
            from learning.visuals import publish_svg

            result = publish_svg(
                vault,
                args.title,
                sys.stdin.read(),
                assets=assets,
            )
        else:
            title = " ".join(args.title.splitlines())
            text = f"# {title}\n\n{sys.stdin.read()}"
            result = {"path": str(lessons.publish(root, str(uuid4()), text))}
        print(
            json.dumps(
                result, ensure_ascii=False, separators=(",", ":"), allow_nan=False
            )
        )
    except (ValueError, OSError) as error:
        kind = (
            "no_save"
            if isinstance(error, NoSaveError)
            else "conflict"
            if isinstance(error, storage.RevisionConflict)
            else "io"
            if isinstance(error, OSError)
            else "validation"
        )
        print(
            json.dumps(
                {"error": {"kind": kind, "message": str(error)}}, ensure_ascii=False
            ),
            file=sys.stderr,
        )
        return 1
    return 1 if args.command == "migrate" and result.get("errors") else 0


if __name__ == "__main__":
    raise SystemExit(main())
