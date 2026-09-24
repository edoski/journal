# Learning

One installed learning engine supports natural study conversations in Pi and in native agents (Claude, Codex). The learner asks to explain, continue, practise, review or plan; the tutor teaches and keeps memory quietly. There are no management commands for the learner, no compulsory intake, no dashboard.

## Workspace

Each course or project directory owns a hidden `.study/` after `study init`. `.study/state/<scope>.json` is one course record (schema 5), `.study/preferences.json` holds teaching preferences, `.study/lessons/` and `.study/assets/` hold generated notes and diagrams, `.study/conversations/` holds resumable Pi sessions. Material stays where it is; relative source paths resolve from the directory. Running from a descendant finds the nearest workspace; nested workspaces are independent; there is no global fallback.

```sh
cd /path/to/course
study init
study                      # Pi in this workspace
study --continue           # resume the latest Pi conversation
study --private            # disposable copies, no saved session
study "Continue exercise 5"
```

## Agent interface

`python -m learning [--workspace DIR] VERB` is the agent CLI; `learning/skills/learn/scripts/learn` is the same entry point for native agents; Pi exposes `learning_context`, `learning_save` and `learning_manage` over it. Every response is JSON on stdout; every failure is `{"error": {"kind": validation|conflict|io|no_save, "message"}}` on stderr with exit 1.

| Verb | Purpose |
| --- | --- |
| `resume [SCOPE] [--task KEY]` | one call to continue: task, briefing, evidence, knowledge, preferences; no scope selects the latest course and lists the others |
| `catalog [SCOPE]` | scope list with workspace paths, or one scope's topic/source/task/knowledge handles and route position |
| `search SCOPE QUERY` | lexical discovery: matching evidence plus handle candidates with excerpts |
| `knowledge SCOPE [KEY...]` | whole entries, or the paged key index |
| `evidence SCOPE --topics …` / `--observations …` | topic histories or exact observations with correction groups |
| `save SCOPE --expect REV [--expect-digest D]` | publish a field patch from stdin; returns a receipt or a `needs_confirmation` preview |
| `sources SCOPE --scan` / `--add PATHS` / `--check HANDLES` | find, register and fingerprint local material |
| `preferences`, `plan`, `journal`, `discover`, `inspect`, `forget`, `readiness` | policy, scheduling, cross-scope discovery, memory inspection and previewed removal, host checks |
| `note`, `lesson`, `publish-lesson`, `visual` | generated artifacts |
| `init`, `import`, `start` | workspace lifecycle and the Pi launcher |

A scope argument may be the handle or an unambiguous course title or alias. The [skill](skills/learn/SKILL.md) is the agent's playbook; its references define the [record contract](skills/learn/references/records.md), [retrieval](skills/learn/references/retrieval.md), [tasks and the route](skills/learn/references/lessons.md), [course facts](skills/learn/references/course.md), [practice](skills/learn/references/practice.md), [preferences](skills/learn/references/preferences.md), [lifecycle](skills/learn/references/lifecycle.md), [research](skills/learn/references/research.md) and [visuals](skills/learn/references/visuals.md).

## Record model

A course record separates four things. `observations` are learner evidence: appended once per actual attempt or external assessment, with response, assistance and source locator, corrected by linked follow-ups rather than edits. `knowledge` is the tutor's reusable understanding of the course with attribution, uncertainty and conflicts; field patches preserve omitted qualifications and removing one requires an explicit acknowledgment. `tasks` are unfinished activities with a stable frame and a small plan; `route` is the course-level path with a current node. Preferences live outside the record and apply only to the active topics and explicit selectors.

`resume` returns whole items within byte budgets and lists what it omitted. Nothing is clipped; a consequential judgement expands exact evidence or stays qualified. Writes use locks, revisions, snapshot digests, no-op detection and atomic replacement; conflicts are reported, never merged silently. A no-save session or `LEARNING_NO_SAVE=1` rejects every mutating verb.

## Code

`schema.py` defines record shapes, one handle rule, and per-type validation and patching. `records.py` composes them into whole-record validation, scope resolution and publication. `retrieval.py` implements the five read verbs on one packer, `packing.py`. `briefing.py` projects course orientation and route position. `planning.py` joins reviews, unfinished work and read-only Journal effort through `sync.study.context.journal_summary`. `sources.py` scans, registers and fingerprints material. `memory.py` owns inspection and previewed forgetting. `lessons.py` and `visuals.py` publish artifacts through `storage.py`. `cli.py` is the command table and `__main__.py` the entry point; `pi.ts` is the Pi adapter; `runtime.py` launches Pi; `workspace.py` and `workspace_import.py` own directory workspaces.

Run `python tools/check.py learning` for the focused gate (Ruff, strict mypy, import contracts, Python tests, Pi adapter tests). Tests use synthetic state only. The behavioral acceptance protocol and the dated evaluation reports are under [docs/learning](../docs/learning/README.md).
