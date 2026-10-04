# Learning v6 specification (working spec, 2026-10-04)

Clean break from schema 5. Goals, in priority order:

1. The learner's experience during a study session: the first answer is fast and
   coherent, bookkeeping is invisible, the tutor never loses the thread.
2. A coherent knowledge path across sessions: what the learner has met, how
   solidly, what is shaky, what is due for retrieval, what comes next — computed,
   not reconstructed by the model.
3. Agent ergonomics: few calls, small payloads, writes that are hard to get
   wrong, errors that say how to fix them.
4. Simplicity: one course per workspace, one knowledge graph, one patch rule.

No legacy shims or backwards compatibility ship in the package. The existing
schema-5 workspaces are converted once by the one-off script
`tools/migrate_learning_v5.py` (run by the maintainer, then deleted); v6 code
never reads schema-5 shapes, the old flat registry or old lesson metadata.

Removed on purpose: scopes and scope resolution, revision/digest tokens and
conflict errors, `needs_confirmation` qualification guards, source editions and
fingerprints, `considered_observations`/`pending` interpretations, the separate
route-node graph and task micro-plans, topic/concept/domain/activity preference
selectors, the `catalog`/`knowledge`/`evidence`/`inspect`/`discover`/`journal`/
`import` verbs. Two sessions editing the same field: last writer wins.

## 1. Workspace

`DIR/.study/` (unchanged discovery: nearest `.study` ancestor of the cwd, else a
registered workspace whose linked material contains the cwd; `--workspace DIR`
selects exactly):

```
.study/workspace.json      manifest {"version": 1, "sources"?: "/abs/material"}
.study/course.json         the course record (schema 6)
.study/.course.lock        write lock (storage.lock_path)
.study/lessons/ assets/ conversations/   unchanged
```

`learning.workspace.Workspace` exposes `directory`, `root` (`.study`), `record`
(`.study/course.json`), `lessons`, `assets`, `conversations`, `sources` (material
directory: the linked one, else `directory`). `support_directory()` is
`~/Library/Application Support/Learning`.

Per-user registry `support_directory()/workspaces.json`:

```json
{"schema": 2, "workspaces": {"/abs/workspace": {"sources": "/abs/material"}, "/abs/other": {}}}
```

Every `init` registers its workspace; `link`/`unlink` set/clear `sources`;
the one-off migration registers converted workspaces. Discovery through a link verifies both directions as
today. Entries whose `.study/workspace.json` no longer exists are ignored when
read and pruned when the registry is next written. A registry without `schema`
is the old flat `{material: workspace}` map: is invalid (the one-off migration converts it). `plan --all` and `search --all` iterate registered workspaces that
contain a `course.json`.

Global preferences: `support_directory()/preferences.json` =
`{"schema": 1, "preferences": {dimension: instruction}}`.

## 2. The course record (`course.json`)

Stored top level (closed set): `schema` (6), `revision`, `updated_at` (storage
metadata), `next_observation` (helper), `title`, `goal`, `exam`, `journal`,
`sources`, `topics`, `observations`, `knowledge`, `tasks`, `focus`, `path`,
`preferences`.

Handles: `[a-z0-9][a-z0-9_-]{0,63}`. Topics, knowledge, tasks and sources share
ONE namespace within a course (a handle names at most one item across those four
maps); `o<digits>` is reserved for observations, which the helper numbers.

### Shapes (stored)

```jsonc
{
  "schema": 6,
  "title": "Linear Algebra",
  "goal": "Pass the written exam",                     // optional
  "exam": {                                             // optional, every field optional
    "date": "2026-11-02", "format": "Written 3h + oral", "coverage": "Ch. 1–4",
    "criteria": ["..."], "constraints": ["No calculator"], "unknowns": ["..."],
    "refs": [{"source": "syllabus", "locator": "Assessment"}]
  },
  "journal": "SMM",                                     // Journal activity label, optional
  "sources": {"syllabus": {"path": "syllabus.md", "title": "Syllabus"}},
  "topics": {
    "rank": {
      "title": "Rank and nullity",                     // optional
      "needs": ["systems"],                            // prerequisite topics; graph must be acyclic
      "refs": [{"source": "slides", "locator": "week 3"}],
      "aliases": ["rango"],                            // search terms, any language
      "introduced": "2026-10-05",                      // first taught; patch `true` stamps today
      "gap": "Counts vectors instead of the dimension of their span",   // tutor's current diagnosis
      "note": "Fluent with row reduction; justification is weak",       // tutor's free judgement
      "judged": "2026-10-05",                          // helper: day gap/note last changed
      "review": {"due": "2026-10-08", "prompt": "Rank of a 3x3 with a repeated row, unaided", "by": "engine"}
    }
  },
  "observations": {
    "o1": {
      "kind": "attempt",                               // attempt | exam | self_report
      "topics": ["rank"],
      "text": "Found rank 3 for a rank-2 matrix; fixed it after a hint about row 3",
      "response": "rank = 3",                          // optional: the learner's actual answer
      "help": "Pointed at the dependent third row",    // attempt: required; "none" = unaided
      "result": "correct",                             // attempt/exam: correct | partial | incorrect
      "transfer": true,                                // optional: success in a meaningfully different setting
      "date": "2026-10-05",                            // event day; defaults to today
      "recorded": "2026-10-05T09:12:44.123456+00:00",  // helper
      "task": "exercise-5",                            // optional task handle (kept after the task closes)
      "refs": [{"source": "sheet", "locator": "Ex. 5"}],
      "corrects": ["o0"],                              // optional: earlier observations this one supersedes
      "uncertain": "Could have read the answer from the notes"   // optional
    }
  },
  "knowledge": {
    "notation": {"text": "Lecturer writes g where the book writes h", "topics": ["rank"],
                 "refs": [...], "uncertain": "Not checked in the slides", "pinned": true,
                 "aliases": ["notazione"], "updated": "2026-10-05"}       // updated: helper
  },
  "tasks": {
    "exercise-5": {"title": "Exercise 5: uniqueness", "topics": ["rank"], "refs": [...],
                   "goal": "Justify uniqueness for the original system",
                   "step": "Why can distinct inputs give the same output?",   // the pending next step
                   "help": "Columns view explained",                          // help given so far
                   "note": "Learner asked for one step per message here",     // temporary handoff
                   "created": "2026-10-05", "updated": "2026-10-05"}         // helper
  },
  "focus": "exercise-5",                                // current task handle or absent
  "path": {"current": "rank", "order": ["systems", "rank", "eigen"], "basis": "Syllabus order"},
  "preferences": {"teaching_style": "Concrete example first, then the general idea"},
  "next_observation": 2
}
```

Observation rules (the same for stored and new observations; the one-off
migration resolves every old observation into a valid shape): `topics` ≥1 known topic; `text` nonempty; `kind` defaults to `attempt`.
`attempt` requires `help` and `result`. `exam` requires `result` and counts as
unaided. `self_report` (the learner's own statement about their understanding:
confusion, confidence, "I never studied this") forbids `result`, `help` and
`transfer`. `transfer` is allowed only with `result: "correct"`. `corrects` names
earlier observations. `date` ≤ today. `help` equal to `none` (case-insensitive)
means unaided; anything else is a description of the help.

Path: `current` is a topic or absent; `order` lists distinct topics. Rendering
order is the topological order of `needs` with ties broken by `order`, then by
handle; topics absent from `order` follow in that same topological order.

Preferences: map `dimension → instruction` where dimension matches
`[a-z][a-z0-9_]{0,39}`. Effective preferences = global merged with course
(course wins per dimension).

## 3. The patch rule (`save`)

One JSON object on stdin. Patchable top-level keys (closed set, did-you-mean on
unknown keys at every level): `title`, `goal`, `exam`, `journal`, `sources`,
`topics`, `observations`, `knowledge`, `tasks`, `focus`, `path`, `preferences`,
`global_preferences`. Helper fields (`schema`, `revision`, `updated_at`,
`next_observation`, `recorded`, `judged`, `updated`, `created`, `by`, `standing`,
`level`) are rejected with "helper-owned" in the message.

- Scalars (`title`, `goal`, `journal`, `focus`) replace; `null` clears.
- `exam`, `path`: objects merge by field; a `null` field clears it; `null` clears
  the whole object.
- `sources`, `topics`, `knowledge`, `tasks`: maps merge by handle; an entry
  object merges by field; a `null` field clears it; a `null` entry removes it.
  `topics[x].review` merges by field too; `null` removes the review.
- `preferences`, `global_preferences`: merge by dimension; `null` deletes.
  `global_preferences` writes the per-user file (all courses).
- Lists (`needs`, `topics`, `refs`, `aliases`, `order`, `criteria`, …) replace.
- `observations`: a list of new entries, appended; ids assigned in order.

Topic review input: `{"due": "YYYY-MM-DD"}` or `{"in_days": N}` and/or
`{"prompt": "..."}`. A due/in_days set by the tutor stores `by: "tutor"`.

Removals: removing a topic that observations reference is a validation error
naming those observations (forget them first, or keep the topic). Removing a
topic strips it from other topics' `needs`, `path.order`/`path.current`,
knowledge/task `topics`. Removing the focused task clears `focus`. Removing a
source that refs cite is a validation error naming the citing items.

Creating: an unknown topic in `topics` of an observation/task/knowledge/needs
must be created in the same patch (`"topics": {"span": {"title": "Span"}}`); the
error says exactly that and suggests close existing handles.

Duplicates: an incoming observation whose content (all agent fields, after
defaults) equals an existing observation recorded within the last 24 hours is
skipped and reported in `duplicates` — retries after an uncertain save are safe.

Writes run under the record lock on the latest content (storage.update); there
are no expected revisions. An unchanged result publishes nothing.

### Engine consequences of a save (learning/progress.py)

Derived standing per topic (computed on read, never stored). Effective
observations: those not named in any other observation's `corrects`. For a
topic, its attempts are effective `attempt`/`exam` observations listing it,
ordered by (`date`, id). Unaided = `help` is `none` or kind `exam`.

```
level:
  no attempts            → "introduced" if introduced else "new"
  no correct result      → "attempted"
  correct only with help → "assisted"
  any unaided correct with transfer           → "transferred"
  unaided correct on ≥2 distinct days ≥2 days apart (first to last) → "retained"
  otherwise              → "independent"
standing = {level, attempts, unaided_days, last: {id, date, result, unaided},
            lapsed?: true   (latest unaided attempt not correct, after an earlier unaided correct),
            stale?: true    (gap or note judged before the latest effective observation of any kind)}
```

Review ladder: for each topic that gains an effective attempt/exam in this save,
unless the same patch sets that topic's `review.due`/`in_days`, the engine sets
`review = {due, by: "engine", prompt: <kept>}` from the newest attempt `a`
(base day = `a.date`):

```
incorrect                       → 1 day
help given, or partial          → 2 days
correct unaided: n = unaided_days → LADDER[min(n, 6) - 1], LADDER = (3, 7, 16, 35, 75, 160)
exam.date after base: interval = min(interval, max(1, (exam - base).days // 3))
                      due = min(base + interval, exam - 1 day)  (never before base)
```

Setting `introduced` on a topic with no attempts and no review schedules
`{due: introduced + 1 day, by: "engine"}` (first retrieval after teaching).
Tutor-set dates after the exam are moved to `exam - 1 day` and reported.
`self_report` observations never reschedule.

Due reviews: topics whose `review.due` ≤ today, sorted by due then path order.

### Receipt

```json
{"revision": 14, "changed": true,
 "observations": ["o14"], "duplicates": [],
 "reviews": {"rank": {"due": "2026-10-13", "by": "engine"}},
 "levels": {"rank": {"from": "assisted", "to": "independent"}},
 "focus": "exercise-6", "path_current": "rank", "due_count": 2,
 "notes": ["rank: gap was judged before o14; revise or clear it if the diagnosis changed"]}
```

`reviews` lists every review this save set or moved; `levels` every level that
changed; `focus`/`path_current` always echo the stored values (null when absent);
`due_count` counts due reviews after the save; `notes` carries clamps, stale
judgements and automatic first-retrieval scheduling. A no-op save returns
`changed: false` with the same fields.

## 4. Verbs (agent CLI: `python -m learning [--workspace DIR] VERB`)

Every response is one JSON object on stdout. Failures print
`{"error": {"kind": "validation"|"io"|"no_save", "message": "..."}}` on stderr and
exit 1. Messages name the field path, the fix, and close handles/fields
(`difflib.get_close_matches`).

| Verb | Purpose |
| --- | --- |
| `resume [--task KEY]` | session opener (below) |
| `show HANDLE... [--limit N]` / `show --all` | whole items by handle; `--all` = whole record + standings + effective preferences |
| `search QUERY [--all] [--limit N]` | lexical discovery, this course or every registered course |
| `plan [--all] [--days N]` | due and upcoming reviews, open work, exam countdown, Journal effort |
| `save` | patch on stdin → receipt |
| `sources --scan` / `sources --add PATH...` | list material / register files (idempotent) |
| `forget HANDLE... [--lesson UUID]` / `forget --course` | remove exact items / the whole course record |
| `init [--sources DIR]`, `link DIR`, `unlink`, `start …`, `readiness [--host H]` | lifecycle |
| `lesson SESSION --title T`, `publish-lesson SESSION`, `visual --title T`, `note --title T` | artifacts (stdin bodies) |

Mutating: `save`, `sources --add`, `forget`, `init`, `link`, `unlink`,
`lesson`, `publish-lesson`, `visual`, `note`. With
`LEARNING_NO_SAVE=1` they fail with kind `no_save`. A missing `course.json` reads
as an empty course (`resume` shows `"new_course": true`); the first `save`
creates it.

### resume

```jsonc
{
  "today": "2026-10-10",
  "revision": 13,
  "course": {"title": "...", "goal": "...", "exam": {..., "days_left": 23}, "journal": "SMM"},
  "last_activity": {"date": "2026-10-06", "days_ago": 4},         // from updated_at; null when new
  "due": [{"topic": "span", "title": "Span", "due": "2026-10-08", "overdue": 2,
           "level": "assisted", "prompt": "...", "gap": "..."}],   // ≤8, then "due_more": N
  "path": {"current": "rank", "basis": "...",
           "topics": [["systems", "retained"], ["rank", "assisted"], ["eigen", "new"]]},
  "weak": [{"topic": "span", "level": "assisted", "gap": "...", "lapsed": true, "stale": true,
            "last": {"id": "o9", "date": "2026-10-06", "result": "incorrect", "unaided": true}}],  // ≤6
  "task": {"key": "exercise-5", ...task fields},                   // null when none
  "tasks": [{"key": "m3", "title": "...", "updated": "2026-09-21"}],   // other open tasks
  "topics": {"rank": {...topic fields, "standing": {...}}},        // active topics + their needs
  "evidence": {"o12": {...}},                                      // whole observations, ≤8192 bytes
  "evidence_omitted": 3,                                           // only when > 0
  "knowledge": {"notation": {...}},                                // whole entries, ≤4096 bytes
  "knowledge_omitted": ["k2"],                                     // eligible but over budget
  "knowledge_index": ["other-key"],                                // remaining keys
  "sources": {"slides": {"path": "...", "title": "..."}},          // cited by included items
  "preferences": {"teaching_style": "..."}
}
```

Selection: the task is `--task`, else `focus`, else the only task. Active topics:
the task's topics; with no task, `path.current` plus its `needs`. Evidence, whole
items in order until 8192 bytes: observations whose `task` is the selected task
(newest first), newest observations on active topics, newest 3 observations
overall; each with its correction partners. `weak`: topics that are `lapsed`,
`stale`, or have a `gap`, ordered by path order, excluding none. Knowledge
eligible in order: `pinned`, linked to active topics (with `uncertain` first),
entries with no topics; the rest go to `knowledge_index`. Keys with no content
are omitted (no nulls, no empty lists) except `task`, which is always present.

### show

`show HANDLE...` returns `{"items": {handle: {"kind": "topic"|"observation"|
"knowledge"|"task"|"source", ...}}, "evidence": {...}, "sources": {...}}`. A topic
includes `standing`, its `observations` (ids, newest first), the tasks and
knowledge that reference it, and its newest `--limit` (default 30) observations
whole under `evidence` (`evidence_more: N` when truncated). An observation
includes `corrected_by`. `show --all` returns the whole stored record plus
`standings` for every topic and `effective_preferences`.

### search

Tokens: casefold, strip accents, split on non-alphanumerics; tokens of ≥5
characters lose one trailing vowel or `s` (so `derivata`/`derivate`,
`integrale`/`integrali`, `function`/`functions` meet). A hit needs every query
token, or the whole query as a substring. Fields searched: topic handle, title,
aliases, gap, note, review prompt; knowledge key, text, aliases, uncertain; task
key, title, goal, step, help, note; source handle, path, title; observation text,
response, help, uncertain. Helper fields are never searched. Result:
`{"hits": [{"kind", "handle", "title"?, "excerpt"}], "total": N}`, phrase hits
first, then topic > knowledge > task > source > observation, observations newest
first; excerpt ≤160 characters around the first match. `--all` adds `workspace`
and `course` to each hit and searches every registered course.

### plan

```jsonc
{"today": "...", "courses": [{"workspace": "/abs", "title": "...",
  "exam": {"date": "...", "days_left": 23}, "due": [...as resume...],
  "upcoming": [{"topic", "due"}], "current": "rank", "task": {"key", "title", "step"},
  "open_tasks": 2, "last_activity": {...}, "journal": {"activity": "SMM", "study_minutes": 140, "sessions": 3}}],
 "journal": {...journal_summary without "daily"...}}
```

`--days` (default 7) bounds `upcoming` and the Journal window. Without `--all`
only the selected workspace. Journal data comes only from
`sync.study.context.journal_summary`/`journal_vault`; failures become
`{"error": "..."}` inside `journal`.

### sources, forget

`sources --scan` → `{"directory", "files": [{"path", "bytes", "handle"} |
{"path", "bytes", "suggested_handle"}], "truncated"}` (git-aware, hidden paths
skipped, ≤200 files). `sources --add PATH...` → registers under suggested
handles, returns `{"sources": {handle: {"path", "title"?}}, "existing":
{path: handle}, "revision"}`; an already-registered file returns its handle.

`forget HANDLE...` removes exact observations, knowledge entries, tasks and
topics (topics only together with every observation that references them);
removed observation ids are stripped from other observations' `corrects`; tasks
lose a removed focus. `forget --lesson UUID` removes one owned lesson note.
`forget --course` deletes `course.json` (lessons stay). Returns `{"removed":
[...], "revision"}`. There is no preview step: the tutor forgets only what the
learner explicitly asked for.

### One-off migration (tools/migrate_learning_v5.py, not shipped)

The script converts `.study/state/*.json` (schema 5) and
`.study/preferences.json` (rules) into `course.json`. Without `--apply` it prints
`{"course": <v6 record>, "global_preferences": {...}, "report": [...]}` and
writes nothing. With `--apply` it refuses if `course.json` exists, writes it,
merges global preferences (a differing existing global value wins and the
workspace value becomes a course preference; reported), moves `state/` and
`preferences.json` into `.study/v5/`, and registers the workspace. Several
scopes require `--scope`. Everything that does not map losslessly is listed in
`report`; unmappable content is kept as a knowledge entry `migrated-<field>`
(text = compact JSON) rather than dropped. Mapping:

| v5 | v6 |
| --- | --- |
| `title`, `goal` | same |
| `exam` (date), `coverage` (text or `{text, refs}`), `course_context` `{assessment, criteria, constraints, unknowns, refs, checked_on}` | `exam.date`, `exam.coverage`, `exam.format` (= assessment), `criteria`, `constraints`, `unknowns`, `refs` (merged) |
| `journal_activity` | `journal` |
| `sources` `{path, title, version, fingerprint}` | `{path, title}` |
| refs `{source, locator, excerpt, source_version, source_fingerprint}`; bare `source` | `{source, locator}` |
| topic `prerequisites` | `needs` |
| topic `assessment` `{summary, gap, status, uncertainty, assessed_at}` | `gap`; `note` = summary + status + uncertainty joined; `judged` = assessed day |
| topic `review` `{due, reason, task}` | `review {due, prompt: task — reason, by: "tutor"}` |
| topic `parent`, `concepts`, `domains`, `tags` | `aliases` (concepts/domains/tags), report `parent` |
| observation `origin` direct_attempt / external_assessment / self_report / tutor_inference / unknown | `kind` attempt / exam / self_report / attempt / attempt (report the last two) |
| observation `assistance`, `uncertainty`, `recorded_at` | `help`, `uncertain`, `recorded`; `date` = given date else recorded day |
| knowledge `attribution`, `uncertainty`, `conflicts` | text gains ` (Source: attribution)`; `uncertain` = uncertainty + conflicts joined |
| task `task`, `question`/`pending_question`, `assistance`, `frame.goal`/`completion`, `frame.within`, `why`, `instructions`, `plan`, other keys | `title`, `step`, `help`, `goal` (goal — done when completion), `title` prefix, `note` (why, instructions, plan position and remaining node labels, leftovers) |
| `current_task` | `focus` |
| `route` `{status, current, basis, nodes{label, needs, topics, done}}` | topics from nodes (a node without topics becomes a topic titled by its label); topic `needs` from node needs; `path.order` = node topics in route order; `path.current` = first topic of the current node; `done` nodes → `introduced` = record day; `basis` kept |
| `focus` (topic list, no route) | `path.current` = first focus topic |
| preferences rule `when {}` | global preferences (instruction text) |
| preferences rule `when {scope}` | course preferences |
| other selectors | course preference `<dimension>` with the selector prefixed to the instruction (reported) |

## 5. Modules

| Module | Owns |
| --- | --- |
| `clock.py` | `today()`, `now()`; `LEARNING_TODAY=YYYY-MM-DD` pins the day for simulations/tests |
| `storage.py` | lock, load, encode, publish_text, `update(path, transform) -> (record, changed)` |
| `schema.py` | field sets, handle rules, validation of the whole record, the patch rule, did-you-mean |
| `progress.py` | standings, levels, review ladder, due/upcoming lists, path order |
| `records.py` | load the course, `save(workspace, patch) -> receipt`, `forget` |
| `retrieval.py` | `resume`, `show`, `search` projections |
| `packing.py` | byte-budget packer (linear) |
| `planning.py` | `plan` |
| `preferences.py` | global file IO, effective merge |
| `sources.py` | scan, add |
| `workspace.py` | discovery, registry, links, init |
| `lessons.py`, `markdown.py`, `visuals.py` | artifacts (lessons lose their scope metadata; visuals embed relative to `.study/lessons` and require assets inside `.study`) |
| `cli.py`, `__main__.py` | command table, dispatch, no-save policy, error kinds |
| `runtime.py`, `pi.ts`, `install.py`, `readiness.py`, `study.py` | hosts |

Deleted: `assessments.py`, `briefing.py`, `course.py`, `observations.py`,
`memory.py`, `workspace_import.py`. The one-off conversion lives in
`tools/migrate_learning_v5.py` until it has run.

## 6. Pi adapter (superseded by §8: Pi was removed)

Tools (names unchanged): `learning_context` (`action`: resume|show|search|plan;
`task`, `handles`, `query`, `all`, `limit`, `days`), `learning_save` (`changes`:
the patch), `learning_manage` (`action`: sources_scan|sources_add|forget|no_save|
readiness; `paths`, `handles`, `lesson`, `course`, `host`), `correct_lesson`,
`quiz` (unchanged). Session behaviour:

- Before the first prompt of a session whose branch has no orientation, run
  `resume` and inject it as a hidden custom message; the model calls
  `learning_context` only to switch task, read more, or after compaction.
- After compaction, or when `--continue` finds `course.json` at a different
  revision than the conversation last saw, inject a fresh `resume` before the next
  prompt.
- A successful `learning_save` called in an assistant message that already
  contains teaching text ends the turn (`terminate`).
- Footer status: `title · current topic · N due` plus ` · not saving` in no-save.
- The skill body is placed in the system prompt when the Pi API supports
  sections; otherwise `--skill` stays.

## 7. Cross-module interfaces (implementation contract)

Core (records, schema, progress, retrieval, planning, packing, storage, cli,
`__main__`, study):

- `schema.validate_record(record: dict) -> dict` — whole stored record (schema 6),
  returns the normalized record or raises `ValueError` naming the field.
- `schema.apply_patch(record: dict, patch: dict, *, today: date, now: str) -> tuple[dict, PatchResult]`
  — pure; used by `records.save`.
- `records.load(workspace: Workspace) -> dict` — validated record, `{}`-based empty
  course (`{"schema": 6}`) when `course.json` is missing.
- `records.save(workspace: Workspace, patch: dict) -> dict` — receipt (§3).
- `records.forget(workspace: Workspace, handles: list[str], *, course: bool = False) -> dict`.
- `progress.standing(record, topic) -> dict`, `progress.standings(record) -> dict[str, dict]`,
  `progress.due(record, today) -> list[dict]`, `progress.upcoming(record, today, days) -> list[dict]`,
  `progress.path_order(record) -> list[str]`.
- `retrieval.resume(workspace, task=None)`, `retrieval.show(workspace, handles, limit=30, all=False)`,
  `retrieval.search(workspace, query, limit=12, everywhere=False)`.
- `planning.plan(workspace, vault: Path, *, everywhere: bool, days: int) -> dict`.

Periphery (workspace, preferences, sources, migrate, lessons, visuals,
readiness, install):

- `workspace.resolve(directory=None) -> Workspace`, `workspace.initialize(directory=None, sources=None) -> Workspace`
  (registers), `workspace.link(workspace, material) -> Workspace`, `workspace.unlink(workspace) -> Workspace`,
  `workspace.registered() -> list[Workspace]` (valid registered workspaces, sorted by directory),
  `workspace.registry_path() -> Path`, `workspace.support_directory() -> Path`.
- `preferences.read_global() -> dict[str, str]`,
  `preferences.validate(changes: object, field: str) -> dict[str, str | None]`,
  `preferences.merge(current: dict[str, str], changes: dict[str, str | None]) -> dict[str, str]`,
  `preferences.save_global(changes: dict[str, str | None]) -> dict[str, str]` (locked write),
  `preferences.effective(course: dict[str, str]) -> dict[str, str]`.
- `sources.scan(material: Path, registered: dict) -> dict`,
  `sources.prepare(material: Path, paths: list[str], registered: dict) -> tuple[dict[str, dict], dict[str, str]]`
  — (new handle → entry, already-registered path → handle); the CLI saves the new
  entries through `records.save(workspace, {"sources": new})`.
- `lessons.publish(root, session_id, text) -> Path`, `lessons.label(root, session_id, *, title) -> Path`,
  `lessons.remove(root, session_id) -> Path`.
- `visuals.publish_svg(root: Path, title: str, svg: str) -> dict[str, str]` — `root` is
  `.study`; assets in `root/assets`, embed relative to `root/lessons`.
- `readiness.check(workspace, host) -> dict`.

## 8. Hosts after Pi (decided 2026-10-04): one local MCP server

Pi, the Obsidian lesson mirror, private launches and the no-save environment
toggle are removed. One stdlib-only MCP server, `python -m learning.mcp`
(JSON-RPC 2.0 over stdio, newline-delimited; `initialize`, `ping`,
`tools/list|call`, `prompts/list|get`; server `instructions`), serves Claude
Desktop, Claude Code and Codex. It runs each verb as a subprocess of the CLI
(`python -m learning --workspace DIR VERB`), so the CLI stays the contract.

Course selection: every tool takes optional `course` — a workspace directory, or a
registered course's title/directory name (case- and accent-insensitive). Omitted:
the workspace containing the server's cwd if any (Claude Code, Codex), else the
only registered course, else an error listing the courses.

| Tool | Annotations | CLI |
| --- | --- | --- |
| `courses` | readOnly | registered courses: directory, title, exam days left, due count, current topic |
| `resume(course?, task?)` | readOnly | `resume` |
| `show(course?, handles?, all?, limit?)` | readOnly | `show` |
| `search(query, course?, all?, limit?)` | readOnly | `search` |
| `plan(course?, all?, days?)` | readOnly | `plan` |
| `list_sources(course?)` | readOnly | `sources --scan` |
| `guide(topic)` | readOnly | returns a skill reference file (records, practice, course, lifecycle, research) |
| `save(changes, course?)` | write, not destructive | `save` (stdin) |
| `add_sources(paths, course?)` | write | `sources --add` |
| `write_note(title, markdown, course?)` | write | `note --title` → `<workspace>/study-notes/<slug>.md` (Obsidian-visible) |
| `forget(handles?, course_record?, course?)` | destructive | `forget` |

Prompts: `study(course?, request?)` (skill body + fresh resume + request),
`review(course?)` (due reviews, interleaved), `mock_exam(course?, minutes?)`,
`plan_week()`. Engine errors become `isError` tool results carrying the error
JSON; protocol errors only for malformed requests or unknown tools.

Install: `python -m learning.install` writes the `learning` server into Claude
Desktop's `claude_desktop_config.json`, Claude Code (user scope) and Codex
(`[mcp_servers.learning]` in `~/.codex/config.toml`, replacing the old
developer-instructions block), keeps the `learn` skill links for Claude Code and
Codex, and builds `learn-claude.zip` from the real skill folder for upload to
Claude Desktop. The `study` command keeps `init`, `link`, `unlink`.
