"""Force native compaction using a temporary-vault-only Pi settings override."""

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
settings = {"compaction": {"keepRecentTokens": 512}}
(run.VAULT / ".pi").mkdir(exist_ok=True)
(run.VAULT / ".pi/settings.json").write_text(json.dumps(settings) + "\n")
run.dump("forced-compaction-project-settings.json", settings)
state = json.loads((run.OUT / "a-session.metrics.json").read_text())["response"]["data"]
run.snapshot("before-forced-compaction")
for path in (run.ROOT / "sessions").glob("*.md"):
    (run.OUT / ("before-compaction-lesson-" + path.name)).write_bytes(path.read_bytes())
tutor = run.Pi(state["sessionFile"], approve_project=True)
try:
    tutor.request("a-forced-compact", {"type": "compact"})
finally:
    tutor.close()
# An actual process restart tests the persisted compacted native session.
tutor = run.Pi(state["sessionFile"], approve_project=True)
prompt = "One last clarification about the exercise we just finished: repeat the parameterization and why it satisfies both original equations. Use my usual course format. No new attempt or task change."
(run.OUT / "a4-after-compaction.prompt.txt").write_text(prompt + "\n")
try:
    tutor.request("a4-after-compaction", {"type": "prompt", "message": prompt})
    tutor.request("a-compacted-session", {"type": "get_state"})
    tutor.request("a-compacted-stats", {"type": "get_session_stats"})
finally:
    tutor.close()
for path in (run.ROOT / "sessions").glob("*.md"):
    (run.OUT / ("after-compaction-lesson-" + path.name)).write_bytes(path.read_bytes())
