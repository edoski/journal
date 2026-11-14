"""Agent command table: one small handler and argument builder per verb."""

from __future__ import annotations

import argparse
from collections.abc import Callable
from dataclasses import dataclass
import json
import sys
from typing import Any

from learning import notes, records, retrieval
from learning import workspace as workspaces
from learning.readiness import HOSTS
from learning.workspace import Workspace

Handler = Callable[[argparse.Namespace], dict[str, Any]]


def _workspace(args: argparse.Namespace) -> Workspace:
    return workspaces.resolve(args.workspace)


def _optional_workspace(args: argparse.Namespace) -> Workspace | None:
    """The selected workspace; ``--all`` may run outside one unless one was named."""
    try:
        return _workspace(args)
    except ValueError:
        if args.all and args.workspace is None:
            return None
        raise


def _stdin_json() -> Any:
    try:
        return json.load(sys.stdin)
    except json.JSONDecodeError as error:
        raise ValueError(f"stdin is not valid JSON: {error}") from None


def _directories(workspace: Workspace) -> dict[str, Any]:
    return {
        "workspace": str(workspace.directory),
        "learning": str(workspace.root),
        "sources_directory": str(workspace.sources),
    }


# --- handlers ---------------------------------------------------------------


def resume(args: argparse.Namespace) -> dict[str, Any]:
    return retrieval.resume(_workspace(args), task=args.task, here=args.here)


def show(args: argparse.Namespace) -> dict[str, Any]:
    return retrieval.show(
        _workspace(args), args.handles, limit=args.limit, all=args.all
    )


def course_map(args: argparse.Namespace) -> dict[str, Any]:
    return retrieval.course_map(_workspace(args), here=args.here)


def course_arcs(args: argparse.Namespace) -> dict[str, Any]:
    return retrieval.course_arcs(
        _workspace(args), here=args.here, lessons=args.open, report=args.report
    )


def course_standing(args: argparse.Namespace) -> dict[str, Any]:
    return retrieval.course_standing(_workspace(args))


def search(args: argparse.Namespace) -> dict[str, Any]:
    return retrieval.search(
        _optional_workspace(args),
        " ".join(args.query),
        limit=args.limit,
        everywhere=args.all,
    )


def plan(args: argparse.Namespace) -> dict[str, Any]:
    from learning import planning
    from sync.study.context import journal_vault

    return planning.plan(
        _optional_workspace(args), journal_vault(), everywhere=args.all, days=args.days
    )


def save(args: argparse.Namespace) -> dict[str, Any]:
    workspace = _workspace(args)
    if args.check:
        return records.save(workspace, _stdin_json(), check=True)
    return retrieval.dated(workspace, records.save(workspace, _stdin_json()))


def migrate(args: argparse.Namespace) -> dict[str, Any]:
    """The one way a record changes schema; nothing else imports ``migrate``."""
    from pathlib import Path

    from learning import migrate as migration

    if args.restore is not None:
        if args.all or args.to is not None:
            raise ValueError(
                "migrate --restore puts a backup back; give it no --all or --to"
            )
        return migration.restore(Path(args.restore))
    if args.all == (args.workspace is not None):
        raise ValueError("migrate needs one of --all or --workspace DIR")
    workspace = None if args.all else _workspace(args)
    return migration.migrate(workspace, to=args.to)


def _taken(record: dict[str, Any]) -> set[str]:
    return {*record["topics"], *record["knowledge"], *record["tasks"]}


def sources(args: argparse.Namespace) -> dict[str, Any]:
    from learning import sources as material

    if args.scan == bool(args.add):
        raise ValueError("choose one of sources --scan or sources --add PATH...")
    workspace = _workspace(args)
    record = records.load(workspace)
    if args.scan:
        return material.scan(workspace.sources, record["sources"], taken=_taken(record))
    new, existing = material.prepare(
        workspace.sources, args.add, record["sources"], taken=_taken(record)
    )
    revision = record.get("revision", 0)
    if new:
        revision = records.save(workspace, {"sources": new})["revision"]
    return {"sources": new, "existing": existing, "revision": revision}


def forget(args: argparse.Namespace) -> dict[str, Any]:
    if not args.handles and not args.course:
        raise ValueError("forget needs handles or --course")
    return records.forget(_workspace(args), args.handles, course=args.course)


def _hosts(workspace: Workspace) -> dict[str, str]:
    """Make the course reachable from Codex and say whether Claude Code reaches it."""
    from learning import install

    return {
        "codex": install.configure_course(workspace),
        "claude_code": install.claude_code_reach(workspace),
    }


def init(args: argparse.Namespace) -> dict[str, Any]:
    workspace = workspaces.initialize(args.workspace, args.sources)
    return {**_directories(workspace), "hosts": _hosts(workspace)}


def link(args: argparse.Namespace) -> dict[str, Any]:
    linked = workspaces.link(_workspace(args), args.material)
    return {
        **_directories(linked),
        "registry": str(workspaces.registry_path()),
        "hosts": _hosts(linked),
    }


def unlink(args: argparse.Namespace) -> dict[str, Any]:
    unlinked = workspaces.unlink(_workspace(args))
    return {**_directories(unlinked), "registry": str(workspaces.registry_path())}


def readiness(args: argparse.Namespace) -> dict[str, Any]:
    from learning.readiness import check

    return dict(check(_workspace(args), args.host))


def note(args: argparse.Namespace) -> dict[str, Any]:
    return {"path": str(notes.write(_workspace(args), args.title, sys.stdin.read()))}


# --- command table ----------------------------------------------------------


@dataclass(frozen=True)
class Command:
    name: str
    help: str
    handler: Handler
    build: Callable[[argparse.ArgumentParser], None]


def _positive(value: str) -> int:
    number = int(value)
    if number < 1:
        raise ValueError(f"expected a positive number, not {value}")
    return number


def _add_here(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--here",
        metavar="TOPIC",
        help="The topic of a lesson in progress; default: path.current",
    )


def _build_resume(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--task", help="Task to resume; default: focus, else the only task"
    )
    _add_here(parser)


def _build_arcs(parser: argparse.ArgumentParser) -> None:
    _add_here(parser)
    parser.add_argument(
        "--open",
        nargs="+",
        default=[],
        metavar="TOPIC",
        help="The topics of every open lesson; they count as studied",
    )
    parser.add_argument(
        "--report", action="store_true", help="Add the rubric's computable checks"
    )


def _build_show(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "handles",
        nargs="*",
        help="Topic, observation, knowledge, task or source handles",
    )
    parser.add_argument(
        "--limit",
        type=_positive,
        default=retrieval.SHOW_LIMIT,
        help="Newest observations per topic",
    )
    parser.add_argument(
        "--all", action="store_true", help="The whole record with standings"
    )


def _build_search(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("query", nargs="+", help="Words or a phrase, any language")
    parser.add_argument("--limit", type=_positive, default=retrieval.SEARCH_LIMIT)
    parser.add_argument(
        "--all", action="store_true", help="Search every registered course"
    )


def _build_plan(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--days", type=int, default=7, help="Upcoming and Journal window"
    )
    parser.add_argument("--all", action="store_true", help="Every registered course")


def _build_save(parser: argparse.ArgumentParser) -> None:
    parser.description = "Apply one JSON patch read from stdin; prints the receipt."
    parser.add_argument(
        "--check",
        action="store_true",
        help="Run every step of the save and write nothing",
    )


def _build_migrate(parser: argparse.ArgumentParser) -> None:
    parser.description = (
        "Move course records to this engine's schema, or back with --to, after "
        "a backup of each; or put a backup back with --restore."
    )
    parser.add_argument("--all", action="store_true", help="Every registered course")
    parser.add_argument(
        "--workspace", default=argparse.SUPPRESS, help="One course's directory"
    )
    parser.add_argument("--to", type=int, help="The schema to move to")
    parser.add_argument(
        "--restore", metavar="BACKUP", help="A backup folder to put back"
    )


def _build_sources(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--scan", action="store_true", help="List local material")
    parser.add_argument("--add", nargs="+", metavar="PATH", help="Register files")


def _build_forget(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "handles",
        nargs="*",
        help="Exact observations, knowledge, tasks, topics or sources",
    )
    parser.add_argument(
        "--course", action="store_true", help="Delete course.json; study notes stay"
    )


def _build_init(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--sources", help="Material directory elsewhere that this workspace studies"
    )


def _build_link(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "material", help="Material directory that this workspace studies"
    )


def _build_nothing(parser: argparse.ArgumentParser) -> None:
    return None


def _build_readiness(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--host", choices=("all", *HOSTS), default="all")


def _build_note(parser: argparse.ArgumentParser) -> None:
    parser.description = "Markdown body on stdin; writes study-notes/<title>.md."
    parser.add_argument("--title", required=True)


COMMANDS: tuple[Command, ...] = (
    Command(
        "resume",
        "Session opener: due reviews, path, task, evidence, knowledge",
        resume,
        _build_resume,
    ),
    Command(
        "show",
        "Whole items by handle, or the whole record with --all",
        show,
        _build_show,
    ),
    Command(
        "map",
        "Every topic with its edges, level, review and weak verdict",
        course_map,
        _add_here,
    ),
    Command(
        "arcs",
        "Every arc with its topics and standing, and where the learner stands",
        course_arcs,
        _build_arcs,
    ),
    Command(
        "standing",
        "Exam readiness by part and each topic's open mistakes",
        course_standing,
        _build_nothing,
    ),
    Command(
        "search",
        "Lexical discovery in this course or every course",
        search,
        _build_search,
    ),
    Command(
        "plan",
        "Due and upcoming reviews, open work, exams, Journal effort",
        plan,
        _build_plan,
    ),
    Command(
        "save",
        "Apply a JSON patch from stdin and print the receipt",
        save,
        _build_save,
    ),
    Command(
        "migrate",
        "Move course records between schemas, with a backup",
        migrate,
        _build_migrate,
    ),
    Command(
        "sources",
        "List local material or register files",
        sources,
        _build_sources,
    ),
    Command(
        "forget",
        "Remove exact items or the whole course record",
        forget,
        _build_forget,
    ),
    Command("init", "Initialize .study here and register it", init, _build_init),
    Command("link", "Study a material directory elsewhere", link, _build_link),
    Command("unlink", "Stop studying linked material", unlink, _build_nothing),
    Command(
        "readiness", "Check the MCP and skill installation", readiness, _build_readiness
    ),
    Command(
        "note",
        "Write a Markdown note from stdin into study-notes/",
        note,
        _build_note,
    ),
)
