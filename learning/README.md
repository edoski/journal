# Learning

One installed learning engine supports natural study conversations in Claude Desktop, Claude Code and Codex through one local MCP server. The learner asks to explain, continue, practise, review or plan; the tutor teaches and keeps memory quietly. There are no management commands for the learner, no compulsory intake, no dashboard.

## Workspace

A course or project directory owns a hidden `.study/` after `study init`; `.study/course.json` is the course record (schema 6). One workspace studies one course. Notes the learner asks to keep are written to `study-notes/` beside it, where Obsidian sees them. Material stays where it is; relative source paths resolve from the directory. Running from a descendant finds the nearest workspace.

Material that must stay free of study files, such as a code repository, is linked instead: `study init --workspace ~/study/course --sources ~/code/repo` records the material directory in the workspace manifest and in the per-user registry `~/Library/Application Support/Learning/workspaces.json`, which lists every workspace. Relative source paths then resolve from the material, and running from the material or any descendant finds the workspace when no nearer `.study/` exists. A link is used only while the workspace still names the material. `study link DIR` relinks moved material and `study unlink` restores the workspace's own directory. Preferences that apply to every course live beside the registry in `preferences.json`.

```sh
cd /path/to/course && study init
study init --workspace ~/study/course --sources /path/to/repo   # study files kept outside the material
python -m learning.install --study-root DIR                      # offer the MCP server in Claude Desktop and, below DIR, Claude Code and Codex
```

## Agent interface

`python -m learning.mcp` is a stdlib MCP server over stdio. Its tools (`courses`, `resume`, `show`, `search`, `plan`, `list_sources`, `guide` read-only; `save`, `add_sources`, `write_note`; `forget`, destructive) take an optional `course` (title or workspace directory; omitted inside a course folder or with a single course) and run the CLI below; its prompts (`study`, `review`, `mock_exam`, `plan_week`) load the playbook with a fresh `resume`. The installer offers the server only in study folders: Claude Code finds it through `.mcp.json` in each study root (`--study-root DIR`, repeatable and remembered), and Codex through a `.codex/config.toml` in each study root and course folder that the installer marks trusted; `init` and `link` configure Codex for new courses. It also links the `tutor` skill for Claude Code and Codex and builds `tutor-claude.zip` for upload to Claude Desktop.

`python -m learning [--workspace DIR] VERB` is the underlying CLI. Every response is JSON on stdout; every failure is `{"error": {"kind": validation|io, "message"}}` on stderr with exit 1, and the message names the field, the fix and close matches.

| Verb | Purpose |
| --- | --- |
| `resume [--task KEY]` | the session opener: today, last activity, exam countdown, due reviews, the path with levels, weak topics, the open task, active topics, recent evidence, relevant knowledge, preferences |
| `show HANDLE...` / `show --all` | whole items: a topic with its standing and history, an observation, a knowledge entry, a task, a source; or everything |
| `search QUERY [--all]` | accent-insensitive lexical discovery with light stemming, in this course or every registered course |
| `plan [--all] [--days N]` | due and upcoming reviews, open work, exam countdown, Journal study time |
| `save` | apply a JSON patch from stdin; returns observation ids, review dates, level changes and notes |
| `sources --scan` / `--add PATH...` | find and register course material |
| `forget HANDLE...` / `--course` | remove exactly what the learner asked to forget |
| `note --title T` | write a Markdown note from stdin to `study-notes/` |
| `init`, `link`, `unlink`, `readiness` | workspace lifecycle and host checks |

The [skill](skills/tutor/SKILL.md) is the agent's playbook; its references define the [record and patch rule](skills/tutor/references/records.md), [practice and reviews](skills/tutor/references/practice.md), [course, exam and path](skills/tutor/references/course.md), [memory, planning and hosts](skills/tutor/references/lifecycle.md) and [research](skills/tutor/references/research.md).

## Record model

`topics` are the knowledge path: each is one idea or method with prerequisite `needs`, an optional diagnosis (`gap`, `note`) and a `review`. `observations` are learner evidence: one per attempt (with the `help` given and the `result`), external exam result, or explicit self-report; misrecordings are superseded by a correcting observation, never edited. From them the engine derives one verdict per counted day (`solid`, `helped` or `missed`: the learning day's best grade, a review day's first try, or a practice day's unaided failure only) and from the verdicts each topic's level (`new`, `introduced`, `attempted`, `assisted`, `independent`, `retained`, `transferred`), lapses after earlier success, and stale diagnoses. A save that creates or changes a verdict schedules the next retrieval on a successive-relearning ladder (1 day after a miss, 2 after help, then 3, 7, 16, 35, 75 and 160 days for consecutive solid verdicts), kept within a third of the time to the exam; the tutor can pin a date and a retrieval prompt. `path` orders the topics and marks the current one; `tasks` hold unfinished activities with their goal, next step and help given; `knowledge` holds what the tutor knows about the course; course facts and course preferences complete the record.

Saves are merge patches applied to the latest record under a lock and published atomically; unchanged results publish nothing, and a repeated observation within 30 minutes is skipped, so an uncertain save is safe to retry. Two sessions changing the same field: the later one wins. `resume` returns whole items within byte budgets and lists what it left out.

## Code

`schema.py` defines record shapes, the shared handle namespace, whole-record validation and the patch rule. `progress.py` derives standings and levels and schedules reviews. `records.py` loads the course, publishes saves and receipts, and forgets. `retrieval.py` builds `resume`, `show` and `search` on the one packer in `packing.py`. `planning.py` joins reviews and open work with read-only Journal effort through `sync.study.context.journal_summary`. `preferences.py` merges global and course preferences. `sources.py` scans and registers material. `notes.py` writes requested notes to `study-notes/`. `storage.py` publishes atomically under locks; `clock.py` owns the study day (`LEARNING_TODAY` pins it for simulations). `cli.py` is the command table and `__main__.py` the entry point; `mcp.py` is the MCP server; `install.py` and `readiness.py` set up and check the hosts; `workspace.py` owns discovery, links and the registry.

Run `python tools/check.py learning` for the focused gate (Ruff, strict mypy, import contracts, Python tests). Tests use synthetic state only. The behavioral acceptance protocol and the dated design reports are under [docs/learning](../docs/learning/README.md).
