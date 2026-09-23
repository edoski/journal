"""Summarize public fidelity traces; semantic verdicts require separate review."""

from collections import Counter, defaultdict
import json
from pathlib import Path
from statistics import median

HERE = Path(__file__).resolve().parent


def read(path):
    return json.loads(path.read_text())


def summarize_case(path, arm):
    metrics = read(path)
    name = metrics["name"]
    events = [
        json.loads(line)
        for line in (path.parent / f"{name}.public-trace.jsonl")
        .read_text()
        .splitlines()
    ]
    starts = [event for event in events if event["type"] == "tool_execution_start"]
    ends = [event for event in events if event["type"] == "tool_execution_end"]
    output_bytes = Counter()
    previews = []
    for event in ends:
        parts = event.get("result", {}).get("content", [])
        texts = [part["text"] for part in parts if part.get("type") == "text"]
        output_bytes[event["toolName"]] += sum(
            len(text.encode("utf-8")) for text in texts
        )
        if event["toolName"] == "learning_save":
            for text in texts:
                try:
                    result = json.loads(text)
                except json.JSONDecodeError:
                    continue
                if (
                    isinstance(result, dict)
                    and result.get("status") == "needs_confirmation"
                ):
                    previews.append(result)
    initial = read(path.parent / "initial.state.json")
    final = read(path.parent / f"{name}.state.json")
    changes = {}
    for record in initial.keys() | final.keys():
        before, after = initial.get(record, {}), final.get(record, {})
        if before != after:
            changes[record] = {
                key: {"before": before.get(key), "after": after.get(key)}
                for key in sorted(before.keys() | after.keys())
                if before.get(key) != after.get(key)
            }
    budget_calls = [
        event
        for event in starts
        if event["toolName"] == "learning_context"
        and event.get("args", {}).get("knowledge") is not None
        and event.get("args", {}).get("evidence_budget") is not None
    ]
    return {
        "arm": arm,
        "case": path.parent.name,
        "profile": name,
        "models": sorted({item["model"] for item in metrics["usage"]}),
        "seconds": metrics["seconds_full_turn"],
        "first_public_text_seconds": metrics["seconds_first_public_text_delta"],
        "calls": metrics["calls"],
        "tool_calls": metrics["tool_calls"],
        "errors": metrics["errors"],
        "tool_errors": metrics["tool_errors"],
        "review_previews": len(previews),
        "acknowledged_calls": sum(
            bool(event.get("args", {}).get("confirm_qualification_changes"))
            for event in starts
            if event["toolName"] == "learning_save"
        ),
        "knowledge_with_evidence_budget_calls": len(budget_calls),
        "tool_text_bytes": dict(output_bytes),
        "total_tool_text_bytes": sum(output_bytes.values()),
        "usage": metrics["usage_totals"],
        "state_changes": changes,
        "returncode": metrics["returncode"],
        "timed_out": metrics["timed_out"],
        "production_changed": metrics["source_changed_during_run"],
    }


def main():
    cases = []
    for arm in ("baseline", "candidate", "controls"):
        for path in sorted((HERE / f"fidelity-sol-{arm}").glob("*/*.metrics.json")):
            cases.append(summarize_case(path, arm))
    grouped = defaultdict(list)
    for case in cases:
        grouped[(case["arm"], case["profile"])].append(case)
    groups = []
    for (arm, profile), members in sorted(grouped.items()):
        group = {"arm": arm, "profile": profile, "samples": len(members)}
        for field in ("seconds", "calls", "total_tool_text_bytes"):
            values = [member[field] for member in members]
            group[field] = {
                "median": median(values),
                "min": min(values),
                "max": max(values),
            }
        for field in (
            "errors",
            "review_previews",
            "acknowledged_calls",
            "knowledge_with_evidence_budget_calls",
        ):
            group[field] = sum(member[field] for member in members)
        group["usage"] = {
            key: sum(member["usage"][key] for member in members)
            for key in members[0]["usage"]
        }
        groups.append(group)
    result = {
        "note": "Counts and diffs only, not semantic verdicts. Excludes aborted GPT-5.5 batch. Token sums are not context-window sizes.",
        "groups": groups,
        "cases": cases,
    }
    (HERE / "fidelity-summary.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False) + "\n"
    )
    print(json.dumps(groups, indent=2))


if __name__ == "__main__":
    main()
