"""Local MCP server: the learning CLI as tools and prompts over stdio.

One stdlib-only server for Claude Desktop, Claude Code and Codex. JSON-RPC 2.0,
one message per line. Every record verb runs as a subprocess of the agent CLI
(``python -m learning --workspace DIR VERB``), so the CLI stays the contract;
only course selection reads the registry and records in-process, read-only.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import date
import json
from pathlib import Path
import subprocess
import sys
from typing import Any
import unicodedata

from learning import clock, progress, records
from learning.workspace import Workspace, registered, resolve

PROTOCOL_VERSIONS = ("2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05")
SERVER_INFO = {"name": "learning", "title": "Learning", "version": "6"}
PACKAGE = Path(__file__).resolve().parent
SKILL = PACKAGE / "skills" / "learn"
GUIDES = ("records", "practice", "course", "lifecycle", "research")
TIMEOUT = 60

INSTRUCTIONS = (
    "Study memory for the learner's courses. For any request to learn, explain, "
    "practise, review, continue or plan study, follow the learn skill (or the "
    "`study` prompt): start with `resume`, teach, then `save` once per turn, "
    'recording every attempt as an observation with `help` ("none" if unaided) and '
    "`result`. Keep bookkeeping silent: never narrate tool calls or saves. `guide` "
    "returns the detailed rules; `courses` lists the learner's courses."
)

SAVE_RULES = "\n".join(
    (
        "Record what happened, once per turn after your teaching. changes is one "
        "patch of only what changed:",
        "- title, goal, journal, focus (a task key): replace; null clears.",
        "- exam {date, format, coverage, criteria, constraints, unknowns, refs} and "
        "path {current, order, basis}: merge by field; null clears a field or the "
        "whole object.",
        "- topics, knowledge, tasks, sources: maps by handle (a-z0-9_-, one "
        "namespace); an entry merges by field, a null field clears it, a null entry "
        "removes it. Create a topic in the patch that first uses it.",
        "  topic {title, needs, refs, aliases, introduced: true, gap, note, review: "
        "{in_days|due, prompt} or null}; knowledge {text, topics, refs, aliases, "
        "uncertain, pinned}; task {title, topics, goal, step, help, note, refs}; "
        "source {path, title}",
        "- Lists replace whole; refs are [{source, locator}].",
        "- observations: new entries, appended: {topics, text, kind, help, result, "
        "response, transfer, date, task, refs, corrects, uncertain}. kind attempt "
        '(default) needs help ("none" if unaided) and result correct|partial|'
        "incorrect; exam needs result; self_report (the learner's own statement) "
        'takes neither. transfer: true only when correct. corrects: ["oN"] '
        "supersedes earlier ones.",
        "- preferences (this course), global_preferences (every course): "
        "{dimension: instruction}; null deletes.",
        "Attempts schedule reviews. Helper fields (revision, recorded, judged, "
        "updated, created, by, standing, level) are rejected. A repeated save is "
        "safe. The receipt needs no reread.",
    )
)

Json = dict[str, Any]
Command = tuple[list[str], str]  # CLI arguments after the verb's workspace, stdin


class ToolError(ValueError):
    """A tool request the engine never saw: bad arguments or no course."""


class ProtocolError(Exception):
    def __init__(self, code: int, message: str) -> None:
        super().__init__(message)
        self.code = code


# --- course selection ----------------------------------------------------------


def _fold(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text.casefold())
    return " ".join(
        "".join(c for c in decomposed if not unicodedata.combining(c)).split()
    )


def _title(workspace: Workspace) -> str | None:
    try:
        title = records.load(workspace).get("title")
    except (OSError, ValueError):
        return None
    return title if isinstance(title, str) else None


def _listing(workspaces: list[Workspace]) -> str:
    return "; ".join(
        f"{_title(item) or item.directory.name} ({item.directory})"
        for item in workspaces
    )


def course(value: str | None) -> Workspace:
    """A workspace directory or registered title/name; else cwd, else the only course."""
    if value:
        path = Path(value).expanduser()
        if path.is_absolute() and path.is_dir():
            return resolve(path)
        known = registered()
        wanted = _fold(value)
        matches = [
            item
            for item in known
            if wanted in {_fold(item.directory.name), _fold(_title(item) or "")}
        ]
        if len(matches) == 1:
            return matches[0]
        problem = "matches several courses" if matches else "names no registered course"
        raise ToolError(
            f"course {value!r} {problem}; use a directory or one of: "
            f"{_listing(matches or known) or 'none registered'}"
        )
    try:
        return resolve()
    except ValueError:
        pass
    known = registered()
    if len(known) == 1:
        return known[0]
    if not known:
        raise ToolError(
            "No study course is registered. Run `study init` in the course folder."
        )
    raise ToolError(
        f"Several courses are registered; pass course as one of: {_listing(known)}"
    )


def _days_left(record: Json, today: date) -> int | None:
    when = record.get("exam", {}).get("date")
    return (date.fromisoformat(when) - today).days if isinstance(when, str) else None


def courses() -> list[Json]:
    today = clock.today()
    result = []
    for workspace in registered():
        entry: Json = {"directory": str(workspace.directory)}
        try:
            record = records.load(workspace)
        except (OSError, ValueError) as error:
            result.append({**entry, "error": str(error)})
            continue
        for key, value in (
            ("title", record.get("title")),
            ("exam_days_left", _days_left(record, today)),
            ("due", len(progress.due(record, today))),
            ("current", record.get("path", {}).get("current")),
        ):
            if value is not None:
                entry[key] = value
        result.append(entry)
    return result


# --- tools ---------------------------------------------------------------------

COURSE = {
    "type": "string",
    "description": "Workspace directory or course title; omit for the current course",
}
STRINGS = {"type": "array", "items": {"type": "string"}}
LIMIT = {"type": "integer", "minimum": 1}


def _schema(
    required: tuple[str, ...] = (), *, local: bool = True, **fields: Json
) -> Json:
    """An argument object; course-scoped tools also take ``course``."""
    properties = {**fields, "course": COURSE} if local else fields
    return {
        "type": "object",
        "properties": properties,
        "required": list(required),
        "additionalProperties": False,
    }


def _flags(args: Json, *names: str) -> list[str]:
    flags = []
    for name in names:
        value = args.get(name)
        if value is True:
            flags.append(f"--{name}")
        elif value is not None and value is not False:
            flags.append(f"--{name}={value}")
    return flags


def _show(args: Json) -> Command:
    handles = args.get("handles") or []
    if bool(handles) == bool(args.get("all")):
        raise ToolError("show needs handles, or all: true for the whole record")
    return ["show", *_flags(args, "all", "limit"), "--", *handles], ""


def _forget(args: Json) -> Command:
    handles = args.get("handles") or []
    if not handles and not args.get("course_record"):
        raise ToolError("forget needs handles, or course_record: true")
    flags = ["--course"] if args.get("course_record") else []
    return ["forget", *flags, "--", *handles], ""


def _paths(args: Json) -> list[str]:
    # A leading ./ keeps a file named like an option a path.
    return [f"./{path}" if path.startswith("-") else path for path in args["paths"]]


Builder = Callable[[Json], Command]
READ = {"readOnlyHint": True, "destructiveHint": False, "idempotentHint": True}
WRITE = {"readOnlyHint": False, "destructiveHint": False, "idempotentHint": True}

TOOLS: dict[str, tuple[str, Json, Json, Builder | None]] = {
    "courses": (
        "The learner's registered courses: directory, title, exam days left, due "
        "reviews and current topic.",
        _schema(local=False),
        READ,
        None,
    ),
    "resume": (
        "Open or continue a session: due reviews, study path, weak topics, the open "
        "task, active topics, recent evidence, knowledge and preferences.",
        _schema(task={"type": "string", "description": "Another open task's key"}),
        READ,
        lambda a: (["resume", *_flags(a, "task")], ""),
    ),
    "show": (
        "Items whole by handle (a topic with its history, oN, knowledge, task, "
        "source); all: the whole record with standings.",
        _schema(handles=STRINGS, all={"type": "boolean"}, limit=LIMIT),
        READ,
        _show,
    ),
    "search": (
        "Find handles by words in any language; all: every course.",
        _schema(
            ("query",), query={"type": "string"}, all={"type": "boolean"}, limit=LIMIT
        ),
        READ,
        lambda a: (["search", *_flags(a, "all", "limit"), "--", a["query"]], ""),
    ),
    "plan": (
        "Due and upcoming reviews, open work, exam countdown and study time; "
        "all: every course.",
        _schema(all={"type": "boolean"}, days={"type": "integer", "minimum": 1}),
        READ,
        lambda a: (["plan", *_flags(a, "all", "days")], ""),
    ),
    "list_sources": (
        "Course material files with suggested handles and whether each is registered.",
        _schema(),
        READ,
        lambda a: (["sources", "--scan"], ""),
    ),
    "guide": (
        "Detailed rules: records (patch shapes), practice (exercises, reviews, "
        "exams), course (course facts), lifecycle (forgetting, planning), research.",
        _schema(
            ("topic",), local=False, topic={"type": "string", "enum": list(GUIDES)}
        ),
        READ,
        None,
    ),
    "save": (
        SAVE_RULES,
        _schema(("changes",), changes={"type": "object"}),
        WRITE,
        lambda a: (["save"], json.dumps(a["changes"], ensure_ascii=False)),
    ),
    "add_sources": (
        "Register material files (paths relative to the course folder); returns "
        "their handles. Already registered files return their handle.",
        _schema(("paths",), paths=STRINGS),
        WRITE,
        lambda a: (["sources", "--add", *_paths(a)], ""),
    ),
    "write_note": (
        "Write a Markdown study note into the course folder's study-notes/, "
        "visible in Obsidian; only when the learner wants notes kept.",
        _schema(
            ("title", "markdown"), title={"type": "string"}, markdown={"type": "string"}
        ),
        {**WRITE, "idempotentHint": False},
        lambda a: (["note", f"--title={a['title']}"], a["markdown"]),
    ),
    "forget": (
        "Remove exactly what the learner asked to forget: handles, or course_record "
        "for the whole record. No preview; never on your own initiative.",
        _schema(handles=STRINGS, course_record={"type": "boolean"}),
        {**WRITE, "destructiveHint": True, "idempotentHint": False},
        _forget,
    ),
}

TYPES: dict[str, tuple[str, Callable[[Any], bool]]] = {
    "string": ("a string", lambda v: isinstance(v, str)),
    "boolean": ("a boolean", lambda v: isinstance(v, bool)),
    "integer": ("an integer", lambda v: isinstance(v, int) and not isinstance(v, bool)),
    "object": ("an object", lambda v: isinstance(v, dict)),
    "array": (
        "a list of strings",
        lambda v: isinstance(v, list) and all(isinstance(i, str) for i in v),
    ),
}


def _check(schema: Json, args: Any) -> Json:
    """Arguments the model can correct get a readable tool error, not a protocol error."""
    if not isinstance(args, dict):
        raise ToolError("arguments must be an object")
    properties = schema["properties"]
    problems = [
        f"unknown argument: {name}" for name in sorted(set(args) - set(properties))
    ]
    problems += [
        f"missing argument: {name}"
        for name in schema["required"]
        if args.get(name) is None
    ]
    if problems:
        raise ToolError("; ".join(problems))
    for name, value in args.items():
        spec = properties[name]
        phrase, valid = TYPES[spec["type"]]
        if value is not None and not valid(value):
            raise ToolError(f"{name} must be {phrase}")
        if "enum" in spec and value not in spec["enum"]:
            raise ToolError(f"{name} must be one of: {', '.join(spec['enum'])}")
        if "minimum" in spec and value is not None and value < spec["minimum"]:
            raise ToolError(f"{name} must be at least {spec['minimum']}")
    return args


def run(
    workspace: Workspace | None, arguments: list[str], stdin: str = ""
) -> tuple[str, bool]:
    """One CLI verb: its stdout, or its error JSON with the error flag."""
    selected = ["--workspace", str(workspace.directory)] if workspace else []
    try:
        done = subprocess.run(
            [sys.executable, "-m", "learning", *selected, *arguments],
            input=stdin,
            capture_output=True,
            text=True,
            cwd=PACKAGE.parent,
            timeout=TIMEOUT,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return _error(
            "io",
            f"{arguments[0]} did not finish within {TIMEOUT}s; a write may have "
            "completed, and repeating the same save is safe",
        ), True
    if done.returncode == 0:
        return done.stdout.strip(), False
    return (done.stderr.strip() or done.stdout.strip() or _error("io", "failed")), True


def _error(kind: str, message: str) -> str:
    return json.dumps({"error": {"kind": kind, "message": message}}, ensure_ascii=False)


def _guide(topic: str) -> str:
    return (SKILL / "references" / f"{topic}.md").read_text(encoding="utf-8")


def call_tool(name: str, arguments: Any) -> Json:
    if name not in TOOLS:
        raise ProtocolError(-32602, f"Unknown tool: {name}")
    _description, schema, _annotations, build = TOOLS[name]
    try:
        args = _check(schema, arguments if arguments is not None else {})
        if name == "courses":
            text, failed = json.dumps({"courses": courses()}, ensure_ascii=False), False
        elif name == "guide":
            text, failed = _guide(args["topic"]), False
        else:
            assert build is not None
            arguments_, stdin = build(args)
            everywhere = args.get("all") is True and name in {"search", "plan"}
            try:
                workspace: Workspace | None = course(args.get("course"))
            except (ToolError, ValueError):
                if not everywhere or args.get("course"):
                    raise
                workspace = None  # Every-course reads need no current course.
            text, failed = run(workspace, arguments_, stdin)
    except (ToolError, ValueError, OSError) as error:
        text, failed = _error("validation", str(error)), True
    return {"content": [{"type": "text", "text": text}], "isError": failed}


def tool_list() -> list[Json]:
    return [
        {
            "name": name,
            "title": name.replace("_", " ").capitalize(),
            "description": description,
            "inputSchema": schema,
            "annotations": {**annotations, "openWorldHint": False},
        }
        for name, (description, schema, annotations, _build) in TOOLS.items()
    ]


# --- prompts -------------------------------------------------------------------

COURSE_ARGUMENT = {"name": "course", "description": COURSE["description"]}
PROMPTS: dict[str, tuple[str, list[Json]]] = {
    "study": (
        "Study with the tutor: the learn skill plus a fresh resume of the course",
        [COURSE_ARGUMENT, {"name": "request", "description": "What to study"}],
    ),
    "review": (
        "Review what is due, interleaved, as unaided retrieval",
        [COURSE_ARGUMENT],
    ),
    "mock_exam": (
        "A timed mock exam in the course's exam format",
        [COURSE_ARGUMENT, {"name": "minutes", "description": "Length in minutes"}],
    ),
    "plan_week": ("Plan this week's study across every course", []),
}


def skill_body() -> str:
    text = (SKILL / "SKILL.md").read_text(encoding="utf-8")
    if text.startswith("---"):
        end = text.find("\n---", 3)
        text = text[end + 4 :] if end >= 0 else text
    return text.strip()


def _resume(value: str | None) -> str:
    try:
        text, _failed = run(course(value), ["resume"])
    except (ToolError, ValueError) as error:
        text = _error("validation", str(error))
    return f"Current course (`resume`):\n{text}"


def get_prompt(name: str, arguments: Any) -> Json:
    if name not in PROMPTS:
        raise ProtocolError(-32602, f"Unknown prompt: {name}")
    args = arguments if isinstance(arguments, dict) else {}
    chosen = args.get("course") or None
    if name == "study":
        request = args.get("request") or "Continue where we left off."
        parts = [skill_body(), _resume(chosen), f"The learner asks: {request}"]
    elif name == "review":
        parts = [
            "Run a review session from the due list below: one unaided retrieval at a "
            "time using each item's prompt, interleaving items that could be confused; "
            "give feedback after each attempt and save it with help and result.",
            _resume(chosen),
        ]
    elif name == "mock_exam":
        minutes = str(args.get("minutes") or "60")
        if not minutes.isdigit() or int(minutes) < 1:
            raise ProtocolError(-32602, "minutes must be a positive whole number")
        parts = [
            f"Give a {minutes}-minute mock exam in the course's recorded exam format, "
            "covering the study path; read guide('practice') first. Collect all "
            "answers before marking, then save each answer as kind exam with its result.",
            _resume(chosen),
        ]
    else:
        text, _failed = run(None, ["plan", "--all", "--days=7"])
        parts = [
            "Propose a realistic study plan for the next 7 days across these courses, "
            "putting due reviews and near exams first. The learner decides.",
            f"Plan (`plan --all`):\n{text}",
        ]
    return {
        "description": PROMPTS[name][0],
        "messages": [
            {"role": "user", "content": {"type": "text", "text": "\n\n".join(parts)}}
        ],
    }


# --- protocol ------------------------------------------------------------------


def handle(method: str, params: Json) -> Json:
    if method == "initialize":
        requested = params.get("protocolVersion")
        version = requested if requested in PROTOCOL_VERSIONS else PROTOCOL_VERSIONS[0]
        return {
            "protocolVersion": version,
            "capabilities": {
                "tools": {"listChanged": False},
                "prompts": {"listChanged": False},
            },
            "serverInfo": SERVER_INFO,
            "instructions": INSTRUCTIONS,
        }
    if method == "ping":
        return {}
    if method == "tools/list":
        return {"tools": tool_list()}
    if method == "tools/call":
        return call_tool(str(params.get("name")), params.get("arguments"))
    if method == "prompts/list":
        return {
            "prompts": [
                {"name": name, "description": description, "arguments": arguments}
                for name, (description, arguments) in PROMPTS.items()
            ]
        }
    if method == "prompts/get":
        return get_prompt(str(params.get("name")), params.get("arguments"))
    raise ProtocolError(-32601, f"Method not found: {method}")


def _failure(identifier: Any, code: int, message: str) -> Json:
    return {
        "jsonrpc": "2.0",
        "id": identifier,
        "error": {"code": code, "message": message},
    }


def respond(line: str) -> Json | None:
    """The response to one JSON-RPC line; notifications get none."""
    try:
        message = json.loads(line)
    except json.JSONDecodeError as error:
        return _failure(None, -32700, f"Parse error: {error}")
    if not isinstance(message, dict) or not isinstance(message.get("method"), str):
        if isinstance(message, dict) and "method" not in message:
            return None  # A response to us; this server sends no requests.
        return _failure(None, -32600, "Invalid Request")
    if "id" not in message:
        return None  # notifications/initialized, notifications/cancelled, ...
    params = message.get("params")
    try:
        if params is not None and not isinstance(params, dict):
            raise ProtocolError(-32602, "params must be an object")
        result = handle(message["method"], params or {})
    except ProtocolError as error:
        return _failure(message["id"], error.code, str(error))
    except Exception as error:  # A server fault must not end the session.
        return _failure(message["id"], -32603, f"Internal error: {error}")
    return {"jsonrpc": "2.0", "id": message["id"], "result": result}


def main() -> int:
    for raw in sys.stdin.buffer:
        line = raw.decode("utf-8", errors="replace").strip()
        if not line:
            continue
        response = respond(line)
        if response is not None:
            sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
            sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
