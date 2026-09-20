"""Independent artifact assertions; semantic answer review is recorded separately."""

import json
from pathlib import Path
import re

HERE = Path(__file__).resolve().parent


def read(name):
    return json.loads((HERE / name).read_text())


def state(name):
    return read(name + ".state.json")["signals-studio"]


def prose(record):
    return "\n".join(entry["text"] for entry in record.get("knowledge", {}).values())


checks = []


def check(label, result):
    checks.append({"check": label, "passed": bool(result)})


initial = state("initial")
s1 = state("s1-orientation")
s2 = state("s2-correction-close")
s3 = state("s3-unrelated-topic")
s4 = state("s4-fresh-recall-conflict")
for name, current in [
    ("initial", initial),
    ("orientation", s1),
    ("correction", s2),
    ("unrelated", s3),
    ("recall", s4),
]:
    check(name + " uses additive schema 5", current["schema_version"] == 5)
    check(
        name + " preserves seeded unrelated hardware note",
        current["knowledge"]["bench-wiring"] == initial["knowledge"]["bench-wiring"],
    )
    check(name + " invents no learner performance", not current["observations"])
    check(
        name + " invents no learner assessment",
        all(not t.get("assessment") for t in current["topics"].values()),
    )
check("Native orientation saves additional generic knowledge", len(s1["knowledge"]) > 1)
for name, current in [
    ("orientation", s1),
    ("correction", s2),
    ("unrelated", s3),
    ("recall", s4),
]:
    text = prose(current)
    check(
        name + " retains lecturer g and textbook h",
        bool(re.search(r"\bg\b", text))
        and bool(re.search(r"\bh\b", text))
        and "Atlas" in text,
    )
check(
    "Correction completes the orientation task",
    "orientation" not in s2.get("tasks", {}),
)
check(
    "Correction retains current versus old time distinction",
    "discrete" in prose(s2).lower() and "continuous" in prose(s2).lower(),
)
check(
    "Unrelated clarification leaves generic knowledge unchanged",
    s3["knowledge"] == s2["knowledge"],
)
check("Unrelated clarification leaves all learner state unchanged", s3 == s2)
check(
    "Unrelated answer omits unnecessary hardware and course recap",
    all(
        term not in (HERE / "s3-unrelated-topic.answer.md").read_text().lower()
        for term in ["q7", "violet", "lumen", "atlas"]
    ),
)
check(
    "Fresh recall does not recreate finished orientation",
    "orientation" not in s4.get("tasks", {}),
)
check(
    "Conflict is retained with both time conventions",
    "discrete" in prose(s4).lower() and "continuous" in prose(s4).lower(),
)
for name in [
    "s1-orientation",
    "s2-correction-close",
    "s3-unrelated-topic",
    "s4-fresh-recall-conflict",
]:
    metrics = read(name + ".metrics.json")
    check(name + " native process completed", metrics["returncode"] == 0)
    check(
        name + " used stable production and skill bytes",
        not metrics["source_changed_during_run"],
    )
(HERE / "checks.json").write_text(json.dumps(checks, indent=2) + "\n")
print(
    json.dumps(
        {
            "passed": sum(c["passed"] for c in checks),
            "total": len(checks),
            "failed": [c["check"] for c in checks if not c["passed"]],
        },
        indent=2,
    )
)
raise SystemExit(0 if all(c["passed"] for c in checks) else 1)
