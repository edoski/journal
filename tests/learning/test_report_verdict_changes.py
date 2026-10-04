"""The one-off verdict report reads live courses and never writes (delete with the tool)."""

import json
import os
from pathlib import Path
import subprocess
import sys

from learning import records
from learning.workspace import initialize

TOOL = Path(__file__).resolve().parents[2] / "tools" / "report_verdict_changes.py"


def test_report_lists_level_changes_and_inflated_engine_dates(tmp_path: Path) -> None:
    os.environ["LEARNING_TODAY"] = "2026-10-01"
    try:
        workspace = initialize(tmp_path)
        records.save(
            workspace,
            {
                "title": "Algebra",
                "topics": {"rank": {}, "span": {}},
                "observations": [
                    {
                        "topics": ["rank"],
                        "text": "a",
                        "help": "none",
                        "result": "correct",
                        "date": "2026-09-01",
                    },
                    {
                        "topics": ["rank"],
                        "text": "b",
                        "help": "none",
                        "result": "correct",
                        "date": "2026-09-03",
                    },
                    {
                        "topics": ["span"],
                        "text": "c",
                        "help": "none",
                        "result": "correct",
                    },
                ],
            },
        )
    finally:
        del os.environ["LEARNING_TODAY"]
    stored = json.loads(workspace.record.read_text(encoding="utf-8"))
    stored["topics"]["rank"]["review"] = {"due": "2026-09-30", "by": "engine"}
    workspace.record.write_text(json.dumps(stored), encoding="utf-8")
    before = workspace.record.read_bytes()
    completed = subprocess.run(
        [sys.executable, str(TOOL), str(tmp_path)],
        capture_output=True,
        text=True,
        check=False,
        env={**os.environ},
    )
    assert completed.returncode == 0, completed.stderr
    line = json.loads(completed.stdout)
    assert line["title"] == "Algebra"
    assert line["levels"] == {"rank": {"from": "retained", "to": "independent"}}
    assert line["inflated"] == [
        {"topic": "rank", "due": "2026-09-30", "expected": "2026-09-04"}
    ]
    assert line["pin"] == {"topics": {"rank": {"review": {"due": "2026-09-04"}}}}
    assert workspace.record.read_bytes() == before
