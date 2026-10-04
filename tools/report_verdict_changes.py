"""One-off, read-only report of what the verdict rule changes in live courses.

    python tools/report_verdict_changes.py [WORKSPACE_DIR...]

Without arguments it reads every registered workspace with a course. For each
course it prints one JSON object: topics whose level differs between the old
all-time rule and the verdict rule, and engine-set ``review.due`` dates later
than the replayed expected review, with the ``save`` patch that pins them back.
It never writes, locks or registers anything. Delete it after use.
"""

from __future__ import annotations

from datetime import date
import json
from pathlib import Path
import sys
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from learning import progress, schema, storage  # noqa: E402
from learning.workspace import Workspace, registered, resolve  # noqa: E402


def _old_level(topic: dict[str, Any], attempts: list[dict[str, Any]]) -> str:
    """The level as derived before verdicts: all-time unaided successes."""
    if not attempts:
        return "introduced" if "introduced" in topic else "new"
    correct = [item for item in attempts if item["result"] == "correct"]
    if not correct:
        return "attempted"
    alone = [item for item in correct if schema.unaided(item)]
    if not alone:
        return "assisted"
    if any(item.get("transfer") for item in alone):
        return "transferred"
    days = sorted({item["date"] for item in alone})
    span = (date.fromisoformat(days[-1]) - date.fromisoformat(days[0])).days
    return "retained" if len(days) >= 2 and span >= 2 else "independent"


def _attempts(record: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    result: dict[str, list[dict[str, Any]]] = {key: [] for key in record["topics"]}
    for item in progress.effective(record["observations"]).values():
        if item["kind"] in progress.SCHEDULING_KINDS:
            for topic in item["topics"]:
                result[topic].append(item)
    return result


def report(workspace: Workspace) -> dict[str, Any]:
    """Level changes and inflated engine dates for one course; reads only."""
    stored = storage.load(workspace.record)
    if stored is None:
        return {"workspace": str(workspace.directory), "error": "no course.json"}
    record = schema.validate_record(stored)
    attempts = _attempts(record)
    current = progress.standings(record)
    replayed = progress.replays(record)
    levels = {}
    inflated = []
    for key, topic in record["topics"].items():
        before = _old_level(topic, attempts[key])
        if before != current[key]["level"]:
            levels[key] = {"from": before, "to": current[key]["level"]}
        review = topic.get("review", {})
        expected = replayed[key].expected
        if (
            review.get("by") == "engine"
            and expected is not None
            and review.get("due", "") > expected.isoformat()
        ):
            inflated.append(
                {"topic": key, "due": review["due"], "expected": expected.isoformat()}
            )
    inflated.sort(key=lambda item: (item["expected"], item["topic"]))
    result: dict[str, Any] = {
        "workspace": str(workspace.directory),
        "title": record.get("title"),
        "levels": levels,
        "inflated": inflated,
    }
    if inflated:
        result["pin"] = {
            "topics": {
                item["topic"]: {"review": {"due": item["expected"]}}
                for item in inflated
            }
        }
    return result


def main(argv: list[str]) -> int:
    targets = (
        [resolve(argument) for argument in argv]
        if argv
        else [item for item in registered() if item.record.is_file()]
    )
    failed = False
    for workspace in targets:
        try:
            line = report(workspace)
        except (ValueError, OSError) as error:
            line = {"workspace": str(workspace.directory), "error": str(error)}
            failed = True
        print(json.dumps(line, ensure_ascii=False))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
