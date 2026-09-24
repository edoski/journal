"""Supplement early traces with null-preserving public tool calls; no private text."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from run_acceptance import sanitize


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directories", nargs="+", type=Path)
    for directory in parser.parse_args().directories:
        base = Path(
            json.loads((directory / "environment.json").read_text())["temporary_root"]
        )
        total = 0
        for trace in sorted(directory.glob("*.public-trace.jsonl")):
            name = trace.name.removesuffix(".public-trace.jsonl")
            expected = {
                event["toolCallId"]: event["toolName"]
                for line in trace.read_text().splitlines()
                if (event := json.loads(line)).get("type") == "tool_execution_start"
            }
            calls = []
            for session in (base / name).rglob("*.jsonl"):
                for line in session.read_text().splitlines():
                    message = json.loads(line).get("message", {})
                    if message.get("role") != "assistant":
                        continue
                    for part in message.get("content", []):
                        if part.get("type") != "toolCall":
                            continue
                        calls.append(
                            {
                                "toolCallId": part["id"],
                                "toolName": part["name"],
                                "args": sanitize(part["arguments"]),
                            }
                        )
            assert {
                call["toolCallId"]: call["toolName"] for call in calls
            } == expected, name
            assert len(calls) == len(expected), name
            (directory / f"{name}.public-calls.jsonl").write_text(
                "".join(json.dumps(call, ensure_ascii=False) + "\n" for call in calls)
            )
            total += len(calls)
        print(
            f"{directory.name}: restored {total} public calls, verified against trace IDs"
        )


if __name__ == "__main__":
    main()
