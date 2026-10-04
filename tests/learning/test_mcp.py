"""The MCP server driven as a subprocess over stdio against temporary courses."""

from __future__ import annotations

from collections.abc import Iterator
import json
import os
from pathlib import Path
import subprocess
import sys
from typing import Any

import pytest

from learning import mcp

REPOSITORY = Path(__file__).resolve().parents[2]
TODAY = "2026-10-05"
Json = dict[str, Any]


def environment(home: Path) -> dict[str, str]:
    return {
        **os.environ,
        "HOME": str(home),
        "PYTHONPATH": str(REPOSITORY),
        "LEARNING_TODAY": TODAY,
    }


class Server:
    """One server process; requests are answered in order, one line each."""

    def __init__(self, cwd: Path, home: Path) -> None:
        self.process = subprocess.Popen(
            [sys.executable, "-m", "learning.mcp"],
            cwd=cwd,
            env=environment(home),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
            encoding="utf-8",
        )
        self.next_id = 0

    def send(self, message: Json | str) -> None:
        assert self.process.stdin
        line = message if isinstance(message, str) else json.dumps(message)
        self.process.stdin.write(line + "\n")
        self.process.stdin.flush()

    def receive(self) -> Json:
        assert self.process.stdout
        response: Json = json.loads(self.process.stdout.readline())
        return response

    def request(self, method: str, params: Json | None = None) -> Json:
        self.next_id += 1
        message: Json = {"jsonrpc": "2.0", "id": self.next_id, "method": method}
        if params is not None:
            message["params"] = params
        self.send(message)
        response = self.receive()
        assert response["id"] == self.next_id
        return response

    def result(self, method: str, params: Json | None = None) -> Json:
        response = self.request(method, params)
        assert "error" not in response, response
        result: Json = response["result"]
        return result

    def call(self, name: str, **arguments: Any) -> tuple[Any, bool]:
        result = self.result("tools/call", {"name": name, "arguments": arguments})
        [content] = result["content"]
        assert content["type"] == "text"
        try:
            value = json.loads(content["text"])
        except json.JSONDecodeError:
            value = content["text"]
        return value, result["isError"]

    def tool(self, name: str, **arguments: Any) -> Any:
        value, failed = self.call(name, **arguments)
        assert not failed, value
        return value

    def close(self) -> None:
        assert self.process.stdin
        self.process.stdin.close()
        assert self.process.wait(timeout=10) == 0


@pytest.fixture
def home(tmp_path: Path) -> Path:
    path = tmp_path / "home"
    path.mkdir()
    return path


@pytest.fixture
def start(home: Path) -> Iterator[Any]:
    servers: list[Server] = []

    def launch(cwd: Path) -> Server:
        server = Server(cwd, home)
        servers.append(server)
        server.result(
            "initialize", {"protocolVersion": "2025-06-18", "capabilities": {}}
        )
        server.send({"jsonrpc": "2.0", "method": "notifications/initialized"})
        return server

    yield launch
    for server in servers:
        server.close()


def course_folder(root: Path, name: str, home: Path) -> Path:
    directory = root / name
    directory.mkdir()
    cli(home, directory, "init")
    return directory


def cli(home: Path, workspace: Path, *arguments: str, stdin: str = "") -> Any:
    done = subprocess.run(
        [sys.executable, "-m", "learning", "--workspace", str(workspace), *arguments],
        input=stdin,
        capture_output=True,
        text=True,
        cwd=REPOSITORY,
        env=environment(home),
        check=True,
    )
    return json.loads(done.stdout)


def test_handshake_negotiates_versions_and_answers_ping(
    home: Path, tmp_path: Path
) -> None:
    server = Server(tmp_path, home)
    for requested, answered in (
        ("2025-06-18", "2025-06-18"),
        ("2025-11-25", "2025-11-25"),
        ("1999-01-01", mcp.PROTOCOL_VERSIONS[0]),
    ):
        result = server.result(
            "initialize", {"protocolVersion": requested, "capabilities": {}}
        )
        assert result["protocolVersion"] == answered
    assert result["capabilities"] == {
        "tools": {"listChanged": False},
        "prompts": {"listChanged": False},
    }
    assert result["serverInfo"]["name"] == "learning"
    assert "resume" in result["instructions"] and "silent" in result["instructions"]
    # Notifications get no response: the next line answers the ping.
    server.send({"jsonrpc": "2.0", "method": "notifications/initialized"})
    server.send({"jsonrpc": "2.0", "method": "notifications/cancelled", "params": {}})
    assert server.result("ping") == {}
    server.send("{not json")
    assert server.receive()["error"]["code"] == -32700
    server.send("[]")
    assert server.receive()["error"]["code"] == -32600
    assert server.request("resources/list")["error"]["code"] == -32601
    unknown = server.request("tools/call", {"name": "teach", "arguments": {}})
    assert unknown["error"]["code"] == -32602
    assert server.request("prompts/get", {"name": "missing"})["error"]["code"] == -32602
    server.close()


def test_tool_list_carries_schemas_and_annotations(start: Any, tmp_path: Path) -> None:
    tools = {
        tool["name"]: tool for tool in start(tmp_path).result("tools/list")["tools"]
    }
    assert set(tools) == {
        "courses",
        "resume",
        "show",
        "search",
        "plan",
        "list_sources",
        "guide",
        "save",
        "add_sources",
        "write_note",
        "forget",
    }
    for name, tool in tools.items():
        schema, hints = tool["inputSchema"], tool["annotations"]
        assert schema["type"] == "object" and schema["additionalProperties"] is False
        assert set(hints) == {
            "readOnlyHint",
            "destructiveHint",
            "idempotentHint",
            "openWorldHint",
        }
        assert hints["openWorldHint"] is False
        assert len(tool["description"]) < 400 or name == "save"
        if name not in {"courses", "guide"}:
            assert "course" in schema["properties"]
    readers = {
        name for name, tool in tools.items() if tool["annotations"]["readOnlyHint"]
    }
    assert readers == {
        "courses",
        "resume",
        "show",
        "search",
        "plan",
        "list_sources",
        "guide",
    }
    assert [
        name for name, tool in tools.items() if tool["annotations"]["destructiveHint"]
    ] == ["forget"]
    assert tools["save"]["inputSchema"]["required"] == ["changes"]
    for key in ("observations", "topics", "global_preferences", "in_days", "null"):
        assert key in tools["save"]["description"]


def test_tools_map_onto_the_cli_in_the_course_of_the_working_directory(
    start: Any, home: Path, tmp_path: Path
) -> None:
    folder = course_folder(tmp_path, "algebra", home)
    (folder / "chapter").mkdir()
    (folder / "sheet.md").write_text("Notation.\n")
    server = start(folder / "chapter")
    assert server.tool("resume")["new_course"] is True
    receipt = server.tool(
        "save",
        changes={
            "title": "Linear Algebra",
            "topics": {"rank": {"title": "Rank", "aliases": ["rango"]}},
            "observations": [
                {
                    "topics": ["rank"],
                    "text": "Counted vectors",
                    "help": "none",
                    "result": "incorrect",
                }
            ],
            "path": {"current": "rank"},
        },
    )
    assert receipt["observations"] == ["o1"] and receipt["path_current"] == "rank"
    assert server.tool("resume") == cli(home, folder, "resume")
    assert server.tool("resume", task=None) == cli(home, folder, "resume")
    assert server.tool("show", handles=["rank", "o1"], limit=1) == cli(
        home, folder, "show", "rank", "o1", "--limit", "1"
    )
    assert server.tool("show", all=True) == cli(home, folder, "show", "--all")
    found = server.tool("search", query="rango")
    assert found == cli(home, folder, "search", "rango")
    assert any(hit["handle"] == "rank" for hit in found["hits"])
    assert server.tool("search", query="-dash", all=True) == cli(
        home, folder, "search", "--all", "--", "-dash"
    )
    assert server.tool("plan", days=3) == cli(home, folder, "plan", "--days", "3")
    scanned = server.tool("list_sources")
    assert scanned == cli(home, folder, "sources", "--scan")
    assert [item["path"] for item in scanned["files"]] == ["sheet.md"]
    added = server.tool("add_sources", paths=["sheet.md"])
    assert list(added["sources"].values())[0]["path"] == "sheet.md"
    assert server.tool("add_sources", paths=["sheet.md"])["existing"] == {
        "sheet.md": list(added["sources"])[0]
    }
    note = server.tool(
        "write_note", title="Rank summary", markdown="Rank counts pivots."
    )
    assert "Rank counts pivots." in Path(note["path"]).read_text()
    assert server.tool("forget", handles=["o1"])["removed"] == ["o1"]
    assert "o1" not in cli(home, folder, "show", "--all")["observations"]
    assert (
        server.tool("guide", topic="records")
        == (REPOSITORY / "learning/skills/tutor/references/records.md").read_text()
    )
    [listed] = server.tool("courses")["courses"]
    assert listed == {
        "directory": str(folder.resolve()),
        "title": "Linear Algebra",
        "due": 0,
        "current": "rank",
    }
    server.tool("forget", course_record=True)
    assert not (folder / ".study/course.json").exists()


def test_errors_are_tool_results_the_model_can_correct(
    start: Any, home: Path, tmp_path: Path
) -> None:
    folder = course_folder(tmp_path, "algebra", home)
    server = start(folder)
    for name, arguments, message in (
        ("save", {"changes": {"revision": 3}}, "helper-owned"),
        ("save", {"changes": {"titel": "Typo"}}, "title"),
        ("save", {}, "missing argument: changes"),
        ("show", {}, "show needs handles"),
        ("search", {"query": 3}, "query must be a string"),
        ("plan", {"days": 0}, "days must be at least 1"),
        ("resume", {"topic": "rank"}, "unknown argument: topic"),
        ("forget", {}, "forget needs handles"),
        ("guide", {"topic": "secrets"}, "topic must be one of"),
        ("resume", {"course": "geometry"}, "names no registered course"),
    ):
        value, failed = server.call(name, **arguments)
        assert failed, (name, value)
        assert message in value["error"]["message"], (name, value)
        assert value["error"]["kind"] in {"validation", "io"}
    assert not (folder / ".study/course.json").exists()


def test_course_selection_outside_a_course(
    start: Any, home: Path, tmp_path: Path
) -> None:
    elsewhere = tmp_path / "elsewhere"
    elsewhere.mkdir()
    algebra = course_folder(tmp_path, "algebra", home)
    cli(home, algebra, "save", stdin=json.dumps({"title": "Linear Algébra"}))
    server = start(elsewhere)
    # The only registered course is the default.
    assert server.tool("resume")["course"]["title"] == "Linear Algébra"
    analysis = course_folder(tmp_path, "analysis", home)
    cli(home, analysis, "save", stdin=json.dumps({"title": "Analysis"}))
    value, failed = server.call("resume")
    assert failed
    assert "Several courses" in value["error"]["message"]
    assert "Linear Algébra" in value["error"]["message"]
    assert str(analysis.resolve()) in value["error"]["message"]
    # Title (accent- and case-insensitive), folder name or directory selects one.
    assert (
        server.tool("resume", course="linear algebra")["course"]["title"]
        == "Linear Algébra"
    )
    assert server.tool("resume", course="ANALYSIS")["course"]["title"] == "Analysis"
    assert (
        server.tool("resume", course=str(algebra))["course"]["title"]
        == "Linear Algébra"
    )
    saved = server.tool("save", course="analysis", changes={"goal": "Pass"})
    assert saved["changed"] is True
    assert cli(home, analysis, "resume")["course"]["goal"] == "Pass"
    # Every-course reads need no current course.
    assert server.tool("plan", all=True) == cli(home, analysis, "plan", "--all")
    titles = {course["title"] for course in server.tool("courses")["courses"]}
    assert titles == {"Linear Algébra", "Analysis"}


def test_no_registered_course_says_how_to_start(start: Any, tmp_path: Path) -> None:
    value, failed = start(tmp_path).call("resume")
    assert failed and "study init" in value["error"]["message"]


def test_prompts_embed_the_skill_and_a_fresh_resume(
    start: Any, home: Path, tmp_path: Path
) -> None:
    folder = course_folder(tmp_path, "algebra", home)
    cli(home, folder, "save", stdin=json.dumps({"title": "Linear Algebra"}))
    server = start(folder)
    listed = {
        prompt["name"]: prompt for prompt in server.result("prompts/list")["prompts"]
    }
    assert set(listed) == {"study", "review", "mock_exam", "plan_week"}
    assert [argument["name"] for argument in listed["study"]["arguments"]] == [
        "course",
        "request",
    ]

    def text(name: str, **arguments: str) -> str:
        result = server.result("prompts/get", {"name": name, "arguments": arguments})
        [message] = result["messages"]
        assert message["role"] == "user" and message["content"]["type"] == "text"
        body: str = message["content"]["text"]
        return body

    study = text("study", request="Explain rank")
    skill = (REPOSITORY / "learning/skills/tutor/SKILL.md").read_text()
    body = skill.split("\n---", 1)[1].strip() if skill.startswith("---") else skill
    assert study.startswith(body)
    assert "name: tutor" not in study
    resume = json.dumps(
        cli(home, folder, "resume"), ensure_ascii=False, separators=(",", ":")
    )
    assert resume in study
    assert study.endswith("The learner asks: Explain rank")
    assert "Linear Algebra" in text("review", course="algebra")
    assert "45-minute" in text("mock_exam", minutes="45")
    mock = text("mock_exam", minutes="45")
    assert "kind exam" not in mock and "kind: exam" not in mock
    assert "ordinary attempt" in mock
    review = text("review", course="algebra")
    assert mcp.skill_section("Today's review") in review
    assert "Mark against `points`" in review
    assert "Only the first try on a due day counts" in review
    assert '"courses"' in text("plan_week")
    bad = server.request(
        "prompts/get", {"name": "mock_exam", "arguments": {"minutes": "soon"}}
    )
    assert bad["error"]["code"] == -32602


def test_save_rules_state_the_30_minute_duplicate_window() -> None:
    assert "within 30 minutes is skipped" in mcp.SAVE_RULES
    assert "within a day" not in mcp.SAVE_RULES
    for field in ("points", "contrasts", "chose"):
        assert field in mcp.SAVE_RULES
