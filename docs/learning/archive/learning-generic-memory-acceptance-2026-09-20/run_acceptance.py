"""Four fresh native tutoring sessions over one isolated synthetic learner store."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
sys.path.insert(0, str(REPO))
from learning import records  # noqa: E402

BASE = Path(tempfile.mkdtemp(prefix="learning-generic-acceptance-20260920-"))
VAULT = BASE / "vault"
ROOT = VAULT / "learn"
VAULT.mkdir()


def dump(name, value):
    (HERE / name).write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def sanitize(value):
    if isinstance(value, dict):
        if value.get("type") in {"thinking", "reasoning"}:
            return None
        return {
            k: sanitize(v)
            for k, v in value.items()
            if not any(t in k.lower() for t in ("thinking", "reasoning", "signature"))
        }
    if isinstance(value, list):
        return [sanitize(v) for v in value if sanitize(v) is not None]
    return value


def digests():
    return {
        str(p.relative_to(REPO)): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in sorted((REPO / "learning").rglob("*"))
        if p.is_file() and "__pycache__" not in p.parts
    }


def snapshot(name):
    dump(
        name + ".state.json",
        {p.stem: json.loads(p.read_text()) for p in (ROOT / "state").glob("*.json")},
    )


def setup():
    sources = {
        "course-overview.md": "# Signals Studio\nWorking course material list supplied by the lecturer:\n- Lumen: lecture notes, organised as response, stability, frequency.\n- Atlas: reference textbook with longer derivations.\n- Lab sheets: laboratory questions.\nThis list gives no prerequisite ordering, edition status or assessment format.\n",
        "lab-notice.md": "# Signals Studio laboratory notice\nThis lab uses discrete-time signals. The impulse response is written g[n].\nNo issue date or edition identifier is provided.\n",
        "current-lab-sheet.md": "# Signals Studio current laboratory sheet\nUse continuous-time signals for this lab. The impulse response is written g(t).\nNo issue date or edition identifier is provided.\n",
    }
    for name, text in sources.items():
        (VAULT / name).write_text(text)
        (HERE / name).write_text(text)
    records.save(
        ROOT,
        "signals-studio",
        0,
        {
            "title": "Signals Studio",
            "focus": ["response"],
            "sources": {"overview": {"path": "course-overview.md"}},
            "topics": {
                "response": {"title": "Response and stability"},
                "quantization": {"title": "Quantization"},
            },
            "knowledge": {
                "bench-wiring": {
                    "text": "For the optional quantization bench only, the violet lead is wired to jack Q7; this hardware detail does not concern course organization or the theory of response and stability.",
                    "topics": ["quantization"],
                }
            },
            "tasks": {
                "orientation": {
                    "task": "Form a provisional picture of Signals Studio",
                    "topics": ["response"],
                    "pending_question": "How should the course resources and recurring viewpoints fit together?",
                    "refs": [{"source": "overview"}],
                }
            },
            "current_task": "orientation",
        },
    )
    snapshot("initial")
    dump(
        "environment.json",
        {
            "temporary_root": str(BASE),
            "repo": str(REPO),
            "pi_version": subprocess.check_output(
                ["pi", "--version"], text=True
            ).strip(),
            "git_head": subprocess.check_output(
                ["git", "rev-parse", "HEAD"], cwd=REPO, text=True
            ).strip(),
        },
    )


ENV = dict(os.environ)
for key in list(ENV):
    if key.endswith("_API_KEY") or key in {
        "ANTHROPIC_AUTH_TOKEN",
        "ANTHROPIC_OAUTH_TOKEN",
        "AWS_BEARER_TOKEN_BEDROCK",
    }:
        ENV.pop(key, None)
ENV.update(
    VAULT_DIR=str(VAULT),
    LEARNING_ROOT=str(ROOT),
    LEARNING_PYTHON=str(REPO / ".venv/bin/python"),
    LEARNING_PACKAGE=str(REPO),
    LEARNING_OPEN="0",
    PI_OFFLINE="1",
)
BOUNDARY = (
    f"Use the canonical learn skill at {REPO}/learning/skills/learn/SKILL.md and its actual tools. "
    f"This is an isolated synthetic study vault: {VAULT}. Environment variables already point to it. "
    "Read course sources and write learner state only in this vault. Do not access real learner data, edit repository or configuration, open GUI, browse or spawn agents. Answer the learner normally.\n\n"
)
PROMPTS = {
    "s1-orientation": "Let's get our bearings for Signals Studio; the available resources are in course-overview.md. I suspect response and stability are two ways of looking at the same ideas rather than separate modules, but I'm not sure yet. In the lecturer's notation g is the impulse response; Atlas calls that h. The old lab sheets seem to track the lecturer's assumptions closely, whereas Atlas is more useful for derivations. Help me form a rough picture. I don't want a fixed curriculum, an exercise or a quiz right now, and I've not demonstrated understanding of the material yet.",
    "s2-correction-close": "Back to Signals Studio. I checked with the lecturer: response and stability are recurring viewpoints; the frequency chapter revisits both, rather than being a third independent module. Also, my earlier impression of the old lab sheets was misleading: those sheets assume continuous time, while the current lab is discrete time. Use Lumen for the current conventions; Atlas still helps with derivations. These are corrections to our picture, not evidence that I've learnt the mathematics. Explain briefly how this changes things, without starting an exercise. That finishes our orientation activity; leave it complete.",
    "s3-unrelated-topic": "In Signals Studio, set the course orientation aside. Just clarify in one short paragraph why a one-bit quantizer has two possible output levels. I haven't made a new attempt, and don't start a new study activity or quiz.",
    "s4-fresh-recall-conflict": "Back to Signals Studio in this new conversation. Before the next lab, how should I choose between the resources and connect the response, stability and frequency material? Remind me of the lecturer-versus-textbook symbol difference we noticed. Also look at lab-notice.md and current-lab-sheet.md: they seem to disagree about the time convention. Can we actually settle that from what we have? Keep uncertain points provisional and don't infer my mathematical ability from discussing the course.",
}


def run(name, prompt):
    full_prompt = BOUNDARY + prompt
    (HERE / f"{name}.prompt.txt").write_text(full_prompt + "\n")
    dump(f"{name}.source-digests.json", digests())
    cmd = [
        "pi",
        "--provider",
        "openai-codex",
        "--offline",
        "--no-context-files",
        "--no-extensions",
        "--no-skills",
        "--no-prompt-templates",
        "--extension",
        str(REPO / "learning/pi.ts"),
        "--skill",
        str(REPO / "learning/skills/learn"),
        "--session-dir",
        str(BASE / name),
        "--tools",
        "read,bash,edit,write,grep,find,ls,learning_context,learning_save",
        "--print",
        "--mode",
        "json",
        full_prompt,
    ]
    start = time.monotonic()
    result = subprocess.run(
        cmd, cwd=VAULT, env=ENV, capture_output=True, text=True, timeout=360
    )
    elapsed = time.monotonic() - start
    (BASE / f"{name}.stderr.txt").write_text(result.stderr)
    events = []
    for line in result.stdout.splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if event.get("type") in {
            "tool_execution_start",
            "tool_execution_end",
            "message_end",
            "extension_error",
        }:
            events.append(sanitize(event))
    (HERE / f"{name}.public-trace.jsonl").write_text(
        "".join(json.dumps(e, ensure_ascii=False) + "\n" for e in events)
    )
    messages = [
        e["message"]
        for e in events
        if e.get("type") == "message_end" and e["message"].get("role") == "assistant"
    ]
    answer = "\n\n".join(
        part["text"]
        for m in messages
        for part in m.get("content", [])
        if part.get("type") == "text"
    )
    (HERE / f"{name}.answer.md").write_text(answer + "\n")
    metadata = {
        "seconds": round(elapsed, 3),
        "returncode": result.returncode,
        "calls": sum(e.get("type") == "tool_execution_start" for e in events),
        "errors": sum(
            e.get("type") == "tool_execution_end" and bool(e.get("isError"))
            for e in events
        ),
        "usage": [
            {
                "model": m.get("model"),
                "provider": m.get("provider"),
                "usage": m.get("usage"),
            }
            for m in messages
        ],
        "source_changed_during_run": digests()
        != json.loads((HERE / f"{name}.source-digests.json").read_text()),
    }
    dump(f"{name}.metrics.json", metadata)
    snapshot(name)
    print(
        json.dumps(
            {k: v for k, v in metadata.items() if k != "usage"} | {"name": name}
        ),
        flush=True,
    )
    if result.returncode:
        raise RuntimeError(f"{name} failed")


if __name__ == "__main__":
    setup()
    for name, prompt in PROMPTS.items():
        run(name, prompt)
    dump("final-source-digests.json", digests())
