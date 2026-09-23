"""Structural artifact checks, deliberately separate from the semantic rubric."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from fixtures import HELD_OUT, SCENARIOS


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    directory = parser.parse_args().directory

    def read(name):
        return json.loads((directory / name).read_text())

    names = ["initial", *(case["name"] for case in SCENARIOS)]
    held_out = HELD_OUT["name"]
    if (directory / f"{held_out}.state.json").exists():
        names.append(held_out)
    states = {name: read(name + ".state.json") for name in names}
    checks = []

    def check(label, passed):
        checks.append({"check": label, "passed": bool(passed)})

    def scope(name, key):
        return states[name][f"state/{key}.json"]

    signals = "signals-studio"
    numerical = "numerical-methods"
    first, second, third, fourth, fifth, sixth = names[1:7]
    initial_signals = scope("initial", signals)
    initial_numerical = scope("initial", numerical)
    for name in names[1:]:
        current = scope(name, signals)
        check(
            name + " preserves unrelated bench entry",
            current.get("knowledge", {}).get("bench-wiring")
            == initial_signals["knowledge"]["bench-wiring"],
        )
        check(
            name + " preserves notation entry and qualifications",
            current.get("knowledge", {}).get("notation")
            == initial_signals["knowledge"]["notation"],
        )
        check(
            name + " adds no Signals observation during resource discussion",
            current["observations"] == initial_signals["observations"],
        )
        numerical_state = scope(name, numerical)
        for handle, event in initial_numerical["observations"].items():
            check(
                name + f" preserves original assisted event {handle}",
                numerical_state["observations"].get(handle) == event,
            )
        metrics = read(name + ".metrics.json")
        check(
            name + " native process completed",
            metrics["returncode"] == 0 and not metrics["timed_out"],
        )
        check(
            name + " production bytes stable during case",
            not metrics["source_changed_during_run"],
        )
        check(
            name + " production bytes match prepared version",
            read(name + ".source-digests.json") == read("prepared-source-digests.json"),
        )
        check(
            name + " emitted public teaching",
            bool((directory / f"{name}.answer.md").read_text().strip()),
        )
    check(
        "Correction changes Signals knowledge",
        scope(first, signals)["knowledge"] != initial_signals["knowledge"],
    )
    check(
        "Correction does not modify Numerical Methods",
        scope(first, numerical) == initial_numerical,
    )
    check(
        "Focused clarification leaves all portable state unchanged",
        states[second] == states[first],
    )
    check(
        "Focused clarification performs no learning_save",
        read(second + ".metrics.json")["tool_calls"].get("learning_save", 0) == 0,
    )
    check(
        "Interrupted return preserves Signals state",
        scope(third, signals) == scope(second, signals),
    )
    check(
        "Interrupted return adds actual attempt evidence",
        len(scope(third, numerical)["observations"])
        > len(initial_numerical["observations"]),
    )
    check(
        "Interrupted return finishes worksheet A",
        "worksheet-a-5b" not in scope(third, numerical).get("tasks", {}),
    )
    check(
        "Interrupted return preserves distinct worksheet B",
        scope(third, numerical).get("tasks", {}).get("worksheet-b-5b")
        == initial_numerical["tasks"]["worksheet-b-5b"],
    )
    check(
        "Private session preserves every portable record",
        states[fourth] == states[third],
    )
    check(
        "Private session publishes no learning artifact",
        read(fourth + ".artifacts.json") == read(third + ".artifacts.json"),
    )
    check(
        "Oral practice preserves Numerical Methods state",
        scope(fifth, numerical) == scope(fourth, numerical),
    )
    check(
        "Held-out correction preserves Signals state",
        scope(sixth, signals) == scope(fifth, signals),
    )
    check(
        "Held-out correction preserves actual attempt evidence",
        scope(sixth, numerical)["observations"]
        == scope(third, numerical)["observations"],
    )
    check(
        "Held-out correction changes aid knowledge",
        scope(sixth, numerical)["knowledge"] != scope(third, numerical)["knowledge"],
    )
    check(
        "Final production bytes match prepared version",
        read("final-source-digests.json") == read("prepared-source-digests.json"),
    )
    if held_out in states:
        current = scope(held_out, numerical)
        prior = scope(sixth, numerical)
        check(
            "New authority preserves actual attempts",
            current["observations"] == prior["observations"],
        )
        check(
            "New authority preserves unrelated free-parameter knowledge",
            current["knowledge"].get("free-parameter")
            == prior["knowledge"].get("free-parameter"),
        )
        check(
            "New authority preserves Signals state",
            scope(held_out, signals) == scope(sixth, signals),
        )
        check(
            "New authority registers the inspected notice",
            any(
                source.get("path") == "oral-notice.md"
                or source.get("path", "").endswith("/oral-notice.md")
                for source in current["sources"].values()
            ),
        )
    result = {
        "passed": sum(item["passed"] for item in checks),
        "total": len(checks),
        "failed": [item["check"] for item in checks if not item["passed"]],
        "checks": checks,
        "limitation": "Structural checks only. Full answer/state semantic review remains required.",
    }
    (directory / "checks.json").write_text(json.dumps(result, indent=2) + "\n")
    print(
        json.dumps(
            {key: value for key, value in result.items() if key != "checks"}, indent=2
        )
    )
    raise SystemExit(0 if all(item["passed"] for item in checks) else 1)


if __name__ == "__main__":
    main()
