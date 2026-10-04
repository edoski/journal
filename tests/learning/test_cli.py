import io
import json
import os
from pathlib import Path
import subprocess
import sys
from typing import Any

import pytest

from learning import study
from learning.__main__ import main
from learning.workspace import initialize

TODAY = "2026-10-10"


@pytest.fixture(autouse=True)
def workspace(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setenv("LEARNING_TODAY", TODAY)
    initialize(tmp_path)
    return tmp_path


def run(
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
    root: Path,
    *args: str,
    stdin: Any = None,
) -> tuple[int, Any]:
    text = stdin if isinstance(stdin, str) else json.dumps(stdin or {})
    monkeypatch.setattr(sys, "stdin", io.StringIO(text))
    code = main(["--workspace", str(root), *args])
    captured = capsys.readouterr()
    if code == 0:
        assert captured.err == ""
        assert captured.out.count("\n") == 1
        return code, json.loads(captured.out)
    assert captured.out == ""
    return code, json.loads(captured.err)["error"]


PATCH = {
    "title": "Algebra",
    "topics": {"rank": {"title": "Rank", "aliases": ["rango"]}},
    "path": {"current": "rank"},
    "observations": [
        {
            "topics": ["rank"],
            "text": "Found the rank",
            "help": "none",
            "result": "correct",
        }
    ],
}


def test_save_then_read_through_every_read_verb(
    capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch, workspace: Path
) -> None:
    code, receipt = run(capsys, monkeypatch, workspace, "save", stdin=PATCH)
    assert code == 0
    assert receipt["observations"] == ["o1"]
    _, resumed = run(capsys, monkeypatch, workspace, "resume")
    assert resumed["revision"] == 1 and resumed["task"] is None
    _, shown = run(capsys, monkeypatch, workspace, "show", "rank", "--limit", "1")
    assert shown["items"]["rank"]["standing"]["level"] == "independent"
    _, everything = run(capsys, monkeypatch, workspace, "show", "--all")
    assert everything["standings"]["rank"]["attempts"] == 1
    _, found = run(capsys, monkeypatch, workspace, "search", "Rango")
    assert found["hits"][0]["handle"] == "rank"
    _, words = run(capsys, monkeypatch, workspace, "search", "found", "rank")
    assert words["hits"][0]["handle"] == "o1"
    monkeypatch.setenv("VAULT_DIR", str(workspace / "vault"))
    _, planned = run(capsys, monkeypatch, workspace, "plan", "--days", "3")
    assert planned["courses"][0]["title"] == "Algebra"
    assert planned["journal"]["available_day_count"] == 0


def test_failures_print_one_error_object_and_exit_1(
    capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch, workspace: Path
) -> None:
    code, error = run(capsys, monkeypatch, workspace, "save", stdin={"titel": "x"})
    assert code == 1
    assert error["kind"] == "validation"
    assert 'did you mean "title"' in error["message"]
    _, error = run(capsys, monkeypatch, workspace, "save", stdin="{not json")
    assert error["kind"] == "validation" and "not valid JSON" in error["message"]
    _, error = run(capsys, monkeypatch, workspace, "show", "nothing")
    assert error["kind"] == "validation"
    _, error = run(capsys, monkeypatch, workspace, "show", "--limit", "0", "x")
    assert error["kind"] == "validation" and "--limit" in error["message"]
    _, error = run(capsys, monkeypatch, workspace, "migrate")
    assert error["kind"] == "validation" and "invalid choice" in error["message"]
    (workspace / ".study" / "course.json").mkdir()
    _, error = run(capsys, monkeypatch, workspace, "resume")
    assert error["kind"] == "io"


def test_sources_scan_and_add_register_material(
    capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch, workspace: Path
) -> None:
    (workspace / "Week 3 Slides.pdf").write_bytes(b"%PDF")
    _, scanned = run(capsys, monkeypatch, workspace, "sources", "--scan")
    [item] = scanned["files"]
    assert item["path"] == "Week 3 Slides.pdf" and "suggested_handle" in item
    _, added = run(
        capsys, monkeypatch, workspace, "sources", "--add", "Week 3 Slides.pdf"
    )
    [handle] = added["sources"]
    assert added["revision"] == 1
    _, again = run(
        capsys, monkeypatch, workspace, "sources", "--add", "Week 3 Slides.pdf"
    )
    assert again == {
        "sources": {},
        "existing": {"Week 3 Slides.pdf": handle},
        "revision": 1,
    }
    _, error = run(capsys, monkeypatch, workspace, "sources")
    assert "--scan" in error["message"]


def test_forget_items_and_the_course(
    capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch, workspace: Path
) -> None:
    run(capsys, monkeypatch, workspace, "save", stdin=PATCH)
    _, result = run(capsys, monkeypatch, workspace, "forget", "o1")
    assert result == {"removed": ["o1"], "revision": 2}
    _, result = run(capsys, monkeypatch, workspace, "forget", "--course")
    assert result == {"removed": ["course"], "revision": 0}
    _, error = run(capsys, monkeypatch, workspace, "forget")
    assert "handles or --course" in error["message"]
    for removed in ("lesson", "publish-lesson", "visual", "start"):
        _, error = run(capsys, monkeypatch, workspace, removed)
        assert "invalid choice" in error["message"]


def test_note_writes_an_obsidian_note_beside_the_material(
    capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch, workspace: Path
) -> None:
    body = "Rank is \\(r\\).\n"
    _, result = run(
        capsys, monkeypatch, workspace, "note", "--title", "Rank  & nullity", stdin=body
    )
    path = workspace / "study-notes" / "rank-nullity.md"
    assert result == {"path": str(path)}
    assert path.read_text() == "# Rank & nullity\n\nRank is $r$.\n"
    assert run(
        capsys, monkeypatch, workspace, "note", "--title", "Rank & nullity", stdin=body
    ) == (0, result)
    code, error = run(
        capsys, monkeypatch, workspace, "note", "--title", "Rank & nullity", stdin="x"
    )
    assert code == 1 and "already exists with different content" in error["message"]
    _, error = run(capsys, monkeypatch, workspace, "note", stdin=body)
    assert "--title" in error["message"]


def test_every_course_reads_work_outside_a_workspace(
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
    workspace: Path,
    tmp_path_factory: pytest.TempPathFactory,
) -> None:
    run(capsys, monkeypatch, workspace, "save", stdin=PATCH)
    outside = tmp_path_factory.mktemp("outside")
    monkeypatch.chdir(outside)
    monkeypatch.setenv("VAULT_DIR", str(outside / "vault"))
    monkeypatch.setattr(sys, "stdin", io.StringIO(""))
    assert main(["search", "rank", "--all"]) == 0
    hits = json.loads(capsys.readouterr().out)["hits"]
    assert hits[0]["workspace"] == str(workspace)
    assert main(["plan", "--all"]) == 0
    assert json.loads(capsys.readouterr().out)["courses"][0]["title"] == "Algebra"
    assert main(["resume"]) == 1
    assert json.loads(capsys.readouterr().err)["error"]["kind"] == "validation"


def test_the_module_entrypoint_prints_compact_json(workspace: Path) -> None:
    completed = subprocess.run(
        [sys.executable, "-m", "learning", "--workspace", str(workspace), "save"],
        input=json.dumps(PATCH),
        text=True,
        capture_output=True,
        env={**os.environ},
        check=False,
    )
    assert completed.returncode == 0, completed.stderr
    assert json.loads(completed.stdout)["revision"] == 1
    failed = subprocess.run(
        [
            sys.executable,
            "-m",
            "learning",
            "--workspace",
            str(workspace),
            "show",
            "nope",
        ],
        text=True,
        capture_output=True,
        check=False,
    )
    assert failed.returncode == 1
    assert json.loads(failed.stderr)["error"]["kind"] == "validation"


@pytest.mark.parametrize(
    "argv",
    [
        ["init"],
        ["link", "/material"],
        ["unlink"],
        ["--workspace", "/w", "init", "--sources", "/m"],
        ["--workspace=/w", "unlink"],
    ],
)
def test_study_runs_only_lifecycle_commands(
    monkeypatch: pytest.MonkeyPatch, argv: list[str]
) -> None:
    received: list[list[str]] = []
    monkeypatch.setattr(study, "main", lambda args: received.append(args) or 0)
    assert study.study(argv) == 0
    assert received == [argv]


@pytest.mark.parametrize(
    "argv", [[], ["resume"], ["explain rank"], ["--workspace", "init", "resume"]]
)
def test_study_prints_usage_for_anything_else(
    capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch, argv: list[str]
) -> None:
    monkeypatch.setattr(study, "main", lambda args: pytest.fail("dispatched"))
    assert study.study(argv) == 2
    assert "MCP server" in capsys.readouterr().err


@pytest.mark.parametrize(
    "broken",
    [
        ("course", "{"),
        ("course", '{"schema": 5}'),
        ("course", '{"schema": 6, "focus": "missing"}'),
        ("global", "{not json"),
        ("global", '{"schema": 1, "preferences": {"Bad": "x"}}'),
    ],
)
def test_unreadable_stored_files_are_io_errors(
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
    workspace: Path,
    broken: tuple[str, str],
) -> None:
    from learning import preferences

    which, content = broken
    target = (
        workspace / ".study" / "course.json"
        if which == "course"
        else preferences.global_path()
    )
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    code, error = run(capsys, monkeypatch, workspace, "resume")
    assert (code, error["kind"]) == (1, "io")
    patch = {"title": "x", "global_preferences": {"pace": "Slow"}}
    _, error = run(capsys, monkeypatch, workspace, "save", stdin=patch)
    assert error["kind"] == "io"
    assert not (workspace / ".study" / "course.json").is_file() or which == "course"


def test_all_with_a_named_invalid_workspace_fails(
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
    tmp_path_factory: pytest.TempPathFactory,
) -> None:
    missing = tmp_path_factory.mktemp("not-a-workspace")
    monkeypatch.setenv("VAULT_DIR", str(missing / "vault"))
    for verb in (["search", "x", "--all"], ["plan", "--all"]):
        code, error = run(capsys, monkeypatch, missing, *verb)
        assert code == 1, verb
        assert error["kind"] == "validation"
