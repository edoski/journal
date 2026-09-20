"""Read-only native-store selection probes and a no-op save in a disposable copy."""

from copy import deepcopy
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.path.insert(0, str(REPO))
from learning import records  # noqa: E402

base = Path(json.loads((HERE / "environment.json").read_text())["temporary_root"])
vault = base / "vault"
root = vault / "learn"
env = dict(os.environ, VAULT_DIR=str(vault), LEARNING_ROOT=str(root))
outputs = {}
for name, args in {
    "unrelated_topic": ["--topics", "quantization"],
    "literal_discovery": ["--query", "impulse response"],
    "exact_entry": ["--knowledge", "materials-orientation"],
}.items():
    result = subprocess.run(
        [
            str(REPO / ".venv/bin/python"),
            "-m",
            "learning",
            "context",
            "signals-studio",
            *args,
        ],
        cwd=REPO,
        env=env,
        text=True,
        capture_output=True,
        check=True,
    )
    outputs[name] = json.loads(result.stdout)
copy_root = Path(tempfile.mkdtemp(prefix="learning-generic-noop-"))
(copy_root / "state").mkdir()
path = root / "state/signals-studio.json"
shutil.copy2(path, copy_root / "state/signals-studio.json")
state = json.loads(path.read_text())
entries = deepcopy(state["knowledge"])
for entry in entries.values():
    for ref in entry.get("refs", []):
        ref.pop("source_version", None)
before = (copy_root / "state/signals-studio.json").read_bytes()
receipt = records.save(
    copy_root, "signals-studio", state["revision"], {"knowledge": entries}
)
after = (copy_root / "state/signals-studio.json").read_bytes()
outputs["identical_save_in_copy"] = {
    "receipt": receipt,
    "bytes_unchanged": before == after,
    "sha256": hashlib.sha256(after).hexdigest(),
}
outputs["native_state_unchanged"] = path.read_bytes() == before
(HERE / "boundary-results.json").write_text(json.dumps(outputs, indent=2) + "\n")
checks = {
    "unrelated_topic_excludes_response_knowledge": "materials-orientation"
    not in outputs["unrelated_topic"]["knowledge"],
    "unrelated_topic_includes_only_routed_hardware_entry": set(
        outputs["unrelated_topic"]["knowledge"]
    )
    == {"bench-wiring"},
    "literal_query_discovers_saved_prose": any(
        x["kind"] == "knowledge" and x["key"] == "materials-orientation"
        for x in outputs["literal_discovery"]["candidates"]["items"]
    ),
    "exact_read_preserves_complete_entry": outputs["exact_entry"]["knowledge"][
        "materials-orientation"
    ]
    == state["knowledge"]["materials-orientation"],
    "exact_read_omits_learner_history_and_policy": all(
        x not in outputs["exact_entry"]
        for x in ["observations", "topics", "tasks", "preferences"]
    ),
    "identical_save_keeps_revision_and_bytes": receipt["revision"] == state["revision"]
    and before == after,
    "native_state_unchanged": outputs["native_state_unchanged"],
}
(HERE / "boundary-checks.json").write_text(json.dumps(checks, indent=2) + "\n")
print(json.dumps(checks, indent=2))
raise SystemExit(0 if all(checks.values()) else 1)
