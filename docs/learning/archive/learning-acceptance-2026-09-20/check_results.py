"""Independent assertions over sanitized native acceptance artifacts."""

from pathlib import Path
import json

HERE = Path(__file__).resolve().parent


def read(name):
    return json.loads((HERE / name).read_text())


def scope(snapshot, name="algebra-lab"):
    return snapshot["scopes"][name]


def text(value):
    return json.dumps(value).lower()


def check(label, condition):
    checks.append({"check": label, "passed": bool(condition)})


initial = read("initial.state.json")
a1 = read("a1-study.state.json")
a2 = read("a2-clarification.state.json")
a3 = read("a3-restart-closure.state.json")
b1 = read("b1-judgment-plan.state.json")
checks = []
first = scope(a1)
check(
    "All exercised scope files use schema 5",
    all(s["schema_version"] == 5 for s in a3["scopes"].values()),
)
check(
    "Original Algebra Lab evidence remains",
    first["observations"]["o1"] == scope(initial)["observations"]["o1"],
)
corrections = [
    v for v in first["observations"].values() if "o1" in v.get("corrects", [])
]
check("Misattributed original has a linked correction", bool(corrections))
check(
    "Assisted attempt explicitly retains hint",
    any(
        "hint" in text(v.get("assistance", ""))
        or "subtract" in text(v.get("assistance", ""))
        for k, v in first["observations"].items()
        if k != "o1"
    ),
)
check(
    "Exercise 8 unchanged after study",
    first["tasks"]["exercise-8"] == scope(initial)["tasks"]["exercise-8"],
)
check(
    "Exercise 7 is the active continuation after study",
    first.get("current_task") == "exercise-7",
)
check("Temporary clarification does not rewrite learner state", a1 == a2)
check(
    "Temporary clarification has exactly two bullet lines",
    sum(
        x.lstrip().startswith(("- ", "* "))
        for x in (HERE / "a2-clarification.answer.md").read_text().splitlines()
    )
    == 2,
)
check(
    "Course preference remains reason-first",
    any(
        r["when"] == {"scope": "algebra-lab"} and "reason" in text(r["values"])
        for r in a3["preferences"]["rules"]
    ),
)
check(
    "No temporary two-bullet rule persisted",
    "two bullet" not in text(a3["preferences"])
    and "exactly two" not in text(a3["preferences"]),
)
check(
    "Requested Exercise 7 closed after restart",
    "exercise-7" not in scope(a3).get("tasks", {}),
)
check(
    "Exercise 8 survives restart and closure unchanged",
    scope(a3)["tasks"]["exercise-8"] == scope(initial)["tasks"]["exercise-8"],
)
check(
    "Actual native compaction succeeded",
    read("a-forced-compact.metrics.json")["response"].get("success") is True,
)
check(
    "Restart preserved the session ID",
    read("a-pre-restart-stats.metrics.json")["response"]["data"]["sessionId"]
    == read("a-final-stats.metrics.json")["response"]["data"]["sessionId"],
)
check(
    "Compacted native session survives a further process restart",
    read("a-session.metrics.json")["response"]["data"]["sessionId"]
    == read("a-compacted-session.metrics.json")["response"]["data"]["sessionId"],
)
check(
    "Post-compaction clarification leaves learner state unchanged",
    read("before-forced-compaction.state.json")
    == read("a4-after-compaction.state.json"),
)

check(
    "Native lesson retains pre-compaction teaching exactly",
    next(HERE.glob("after-compaction-lesson-*.md"))
    .read_text()
    .startswith(next(HERE.glob("before-compaction-lesson-*.md")).read_text()),
)

judgment = scope(b1, "exam-prep")
check(
    "Genuine contrary attempt unchanged",
    judgment["observations"]["o2"] == scope(initial, "exam-prep")["observations"]["o2"],
)
check(
    "Tutor misattribution corrected separately",
    any("o3" in v.get("corrects", []) for v in judgment["observations"].values()),
)
check(
    "Revised interpretation considers contrary evidence",
    "o2"
    in judgment["topics"]["singular"]["assessment"].get("considered_observations", []),
)
check(
    "Stalled task remains available after recommendation",
    "stalled-classification" in judgment.get("tasks", {}),
)
check(
    "Other course policy survives",
    any(r["when"] == {"scope": "exam-prep"} for r in a3["preferences"]["rules"]),
)
unfinished = read("a5-unfinished-after-compaction.state.json")
prior = read("a4-after-compaction.state.json")
check(
    "Unfinished work resumes in the same compacted native session",
    read("a-session.metrics.json")["response"]["data"]["sessionId"]
    == read("a-unfinished-session.metrics.json")["response"]["data"]["sessionId"],
)
check(
    "Exercise 8 becomes the current task",
    scope(unfinished)["current_task"] == "exercise-8",
)
check(
    "Exercise 8 retains original purpose, source and pending step",
    scope(unfinished)["tasks"]["exercise-8"] == scope(initial)["tasks"]["exercise-8"],
)
check(
    "Continuation invents no learner performance",
    scope(unfinished)["observations"] == scope(prior)["observations"],
)
check(
    "Continuation preserves honest assisted assessment",
    scope(unfinished)["topics"] == scope(prior)["topics"],
)
check(
    "Continuation preserves durable preferences",
    unfinished["preferences"] == prior["preferences"],
)
trace = [
    json.loads(line)
    for line in (HERE / "a5-unfinished-after-compaction.public-trace.jsonl")
    .read_text()
    .splitlines()
]
check(
    "Continuation retrieves the explicit unfinished task from portable state",
    any(
        e.get("type") == "tool_execution_start"
        and e.get("toolName") == "learning_context"
        and e.get("args") == {"scope": "algebra-lab", "task": "exercise-8"}
        for e in trace
    ),
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
