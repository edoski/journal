"""Internal agent interface for the shared learning system."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys
from uuid import uuid4

from learning import records, retrieval, lessons, preferences


def keys(value: str | None) -> list[str] | None:
    return (
        [key.strip() for key in value.split(",") if key.strip()]
        if value is not None
        else None
    )


def paths() -> tuple[Path, Path]:
    default = (
        Path.home() / "Library/Mobile Documents/iCloud~md~obsidian/Documents/the-vault"
    )
    vault = Path(os.environ.get("VAULT_DIR", default)).expanduser().resolve()
    root = Path(os.environ.get("LEARNING_ROOT", vault / "learn")).expanduser().resolve()
    return vault, root


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command")
    start = commands.add_parser("start")
    start.add_argument("prompt", nargs="?")
    start.add_argument("--continue", dest="resume", action="store_true")
    start.add_argument("--print", dest="headless", action="store_true")
    start.add_argument("--json", action="store_true")
    start.add_argument("--no-open", action="store_true")
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
    context.add_argument("--query", help="Literal search across evidence and memory")
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
    planner = commands.add_parser("plan")
    planner.add_argument("scope", nargs="?")
    planner.add_argument("--days", type=int, default=7)
    planner.add_argument("--horizon", type=int, default=7)
    planner.add_argument("--knowledge-budget", type=int)
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
    args = parser.parse_args()
    vault, root = paths()
    try:
        if args.command in (None, "start"):
            from learning.runtime import start_pi

            start_pi(
                vault,
                root,
                args
                if args.command
                else argparse.Namespace(
                    prompt=None, resume=False, headless=False, json=False, no_open=False
                ),
            )
            return 0
        if args.command == "context":
            selection = (
                args.task is not None
                or args.topics is not None
                or args.observations is not None
                or args.query is not None
                or args.knowledge is not None
                or args.knowledge_budget is not None
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
            result = (
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
                    candidate_offset=args.candidate_offset,
                    offset=args.offset,
                    limit=args.limit,
                    expected=args.expect,
                )
            )
            if args.scope is None:
                assert isinstance(result, list)
                result = {
                    "scopes": [item for item in result if "error" not in item],
                    "errors": [item for item in result if "error" in item],
                }
            assert isinstance(result, dict)
            if args.knowledge is None:
                result.update(
                    vault=str(vault),
                    learning=str(root),
                    assets=str(
                        Path(os.environ.get("LEARNING_ASSETS", vault / "assets/learn"))
                        .expanduser()
                        .resolve()
                    ),
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
            result = records.save(root, args.scope, args.expect, json.load(sys.stdin))
        elif args.command == "migrate":
            from learning.migrate import migrate

            result = migrate(root, apply=args.apply)
        elif args.command == "preferences":
            if args.expect is not None:
                if args.dimension is not None:
                    raise ValueError("--dimension selects a read; omit it when saving")
                result = preferences.save(root, args.expect, json.load(sys.stdin))
            elif args.dimension is not None:
                result = preferences.inspect(root, args.dimension)
            else:
                result = preferences.read(root)
        elif args.command == "plan":
            from learning.planning import plan

            result = plan(
                root,
                vault,
                args.scope,
                args.days,
                horizon=args.horizon,
                knowledge_budget=args.knowledge_budget,
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
                assets=Path(os.environ.get("LEARNING_ASSETS", vault / "assets/learn")),
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
        print(f"learning: {error}", file=sys.stderr)
        return 1
    return 1 if args.command == "migrate" and result.get("errors") else 0


if __name__ == "__main__":
    raise SystemExit(main())
