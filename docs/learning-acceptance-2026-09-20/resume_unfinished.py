"""One unfinished-task continuation after the existing real native compaction."""

import json
from pathlib import Path
import run_acceptance as run

metadata = json.loads((run.OUT / "environment.json").read_text())
run.BASE = Path(metadata["temporary_root"])
run.VAULT = run.BASE / "vault"
run.ROOT = run.VAULT / "learn"
run.ENV.update(
    VAULT_DIR=str(run.VAULT),
    LEARNING_ROOT=str(run.ROOT),
    LEARNING_ASSETS=str(run.VAULT / "assets/learn"),
    LEARNING_SESSION_DIR=str(run.BASE / "pi-sessions"),
)
state = json.loads((run.OUT / "a-compacted-session.metrics.json").read_text())[
    "response"
]["data"]
tutor = run.Pi(state["sessionFile"], approve_project=True)
prompt = "Let's continue Exercise 8 from where we left it, in my usual course format."
(run.OUT / "a5-unfinished-after-compaction.prompt.txt").write_text(prompt + "\n")
try:
    tutor.request(
        "a5-unfinished-after-compaction", {"type": "prompt", "message": prompt}
    )
    tutor.request("a-unfinished-session", {"type": "get_state"})
finally:
    tutor.close()
for path in (run.ROOT / "sessions").glob("*.md"):
    (run.OUT / ("unfinished-continuation-lesson-" + path.name)).write_bytes(
        path.read_bytes()
    )
