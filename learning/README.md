# Learning

One installed learning engine supports natural study conversations in native agents and Pi. Ask to explain, continue, practise, review or plan; the agent handles memory quietly. The canonical skill keeps the conversation specific to the course and current problem, honours direct answers and time budgets, and uses ordinary chat for checks. No management commands, compulsory intake, curriculum dashboard or fixed teaching template are required from the learner.

## State and agent interface

Each initialized directory owns a hidden `.study/`. `.study/workspace.json` marks its format; `.study/state/<scope>.json` holds metadata, observations, source references, assessments/reviews, unfinished tasks and reusable knowledge (schema 5). `.study/preferences.json` stores workspace-wide/scoped preferences. `.study/lessons/` contains generated notes and Pi lessons, `.study/assets/` contains generated visuals, and `.study/conversations/` holds resumable Pi sessions. Material stays in its existing folders, with relative source paths resolved from the owning directory. Everything generated stays in `.study`; no separate notes directory or global learner-state store is used. Native/provider conversation histories have separate ownership and retention. Sharing records does not provide universal host access or identical model behaviour.

Python owns validation, selection and publication. `records.py` handles records; `retrieval.py` selects context; `observations.py` follows correction relationships; `task_context.py` projects activity orientation. `sources.py` inspects selected local fingerprints. `memory.py` owns inspection and explicit forgetting. `lessons.py` and `visuals.py` publish through `storage.py`. Planning reads Journal only through `sync.study.context.journal_summary`; learning does not access Flow or sync adapters.

Pi exposes quiet `learning_context`, `learning_save` and `learning_manage` tools over the same Python CLI. The management tool covers preferences, planning, Journal context, source checks, memory inspection/forgetting, discovery, readiness and no-save control. Python remains the validation authority. Successful bookkeeping stays hidden unless expanded; actionable failures remain visible. Other hosts use `learning/skills/learn/scripts/learn`. A successful save returns revision and digest; no confirming read is needed. Validation rejection, snapshot conflict and uncertain completion require different recovery, documented in the [record contract](skills/learn/references/records.md).

Known scopes and tasks bypass catalog discovery. Ordinary context returns an internal briefing of existing course destination, current task, route and source pointers. Task frames retain purpose while checkpoints retain the next question, assistance and detour. Task objects patch fields; omitted fields survive, null fields clear, and null tasks remove only that activity. Frame and plan objects replace as units. The current-task pointer is a fallback, never an override of the learner's request.

Knowledge stores useful local understanding independently of learner evidence: notation, resource context, tentative interpretations and unresolved conflicts. Entries patch fields, preserving omitted text, attribution, uncertainty, conflicts and links; optional null fields clear and null entries delete. Whole-entry reads precede changes to meaning. New entries need text; optional aliases support terminology across sources/languages. Source references retain helper-owned version and fingerprint information. Completing an exercise does not remove knowledge. Structural validation cannot prove an update preserves the intended meaning.

## Relevant context and learning

Default retrieval selects at most 24 seed observations, prioritising task-linked evidence then recent events. Whole correction/support groups fit under a 12,288-byte observation-map allowance. Whole relevant knowledge entries use a separate 4,096-byte allowance, including newly required source locations; the internal briefing has its own 4,096-byte bound. These are serialized UTF-8 byte budgets, not model-token estimates or a bound on all metadata. Omission/completeness descriptors make partial coverage explicit. Exact observations, revision-pinned pages and deliberate budget overrides expand evidence when a decision needs it. Exact knowledge reads default to 8,192 bytes and return complete entries or a size error. See [retrieval](skills/learn/references/retrieval.md).

Task purpose, current-step and direct-prerequisite knowledge are eligible without activating incidental-topic preferences. Discovery matches phrases, accent-insensitive token sets and stored aliases. Cross-course discovery returns handles, not evidence or policy transfers; it is lexical discovery, not arbitrary semantic search. The tutor compares course assumptions and notation before drawing a connection. Loaded context is reused during unchanged work; caching and later prompt costs remain host-dependent.

Observations distinguish direct attempts, self-reports, tutor inference and external assessment; assistance omitted is unknown. Assessments and reviews declare supporting observations separately from evidence actually considered, including contrary evidence and corrections. Incomplete consideration remains pending. These checks expose provenance and stale interpretation; they do not verify sound judgment or estimate numerical mastery. Task completion, copied solutions and study time are not independent learning evidence.

The [practice workflow](skills/learn/references/practice.md) supports worked explanations, fading assistance, independent attempts, delayed retrieval and meaningfully different transfer problems. Course-grounded oral/mock exams respect known criteria, notation, methods and aids. Native image/PDF/code capabilities support feedback on actual attempts with exact locations and uncertainty about unreadable material. The system adds no OCR service or provider bridge. A quiz is optional; useful teaching is not conditional on answering one.

Course orientation uses existing scope, knowledge and task fields, without a separate curriculum model. Optional `course_context` holds source-grounded assessment format, criteria, constraints and unknowns; `exam` and `coverage` own deadlines and examinable material. Reviews link recommendations to actual evidence and chosen retrieval tasks. Planning combines these with read-only Journal effort and scheduled study windows; windows are not confirmed availability and hours are not mastery. No optimal spacing schedule or durable learning gain has been established by software tests.

## Pi and native clients

Run `study init` once in the course/project directory, then `study` to launch Pi in the terminal. Initialization is idempotent, needs no model and does not create a subject or ingest sources. `.study/.gitignore` excludes personal state/history from accidental Git commits. Running from a descendant finds the nearest enclosing workspace; nested workspaces are independent. A malformed nearer workspace fails rather than using its parent. `study --workspace /path/to/course` explicitly selects an initialized directory. No workspace means an actionable error, never a global fallback. The launcher preserves the caller's directory until it selects and pins the workspace. Teaching remains readable while it streams; completed messages are mirrored into an Obsidian note, created/opened on the first teaching or quiz. `LEARNING_READING_MODE=obsidian` opts into hiding terminal teaching, with readable fallback if publication/opening fails. `study --continue` resumes the latest saved Pi conversation in that workspace; `study "Continue exercise 5"` starts with that request. Empty startup creates no lesson. Notes contain teaching with automatic turn dividers, math normalization and native Mermaid; they are reading surfaces, not continuity databases or generated course indexes.

Each lesson separates generated teaching from a protected **Your notes** region. Publication and reconstruction preserve learner text outside the generated region. Edits inside generated teaching cause a conflict instead of silent overwrite. Existing earlier-format content is preserved when adopting the region layout. `correct_lesson` applies exact message-targeted corrections in the current branch and adds a visible correction marker; learner evidence is corrected separately. Saving a note and successfully displaying it are separate events.

Optional quizzes require learner-language control labels; free-text questions open input directly. Choice grading compares the supplied key; correctness and reasoning remain the tutor's responsibility. Ordinary conversation remains the default. Static SVG publication handles useful spatial geometry without an additional service; native Mermaid handles relationships.

`skills/learn/` is canonical. Codex/Claude Code use local links; the Claude Desktop locator reads repository instructions live through granted folder access. Pi loads the same skill and local extension. `readiness --host codex|claude|pi|all` checks paths, links, copied-instruction drift and runtime availability without mutating setup. `install.py` preflights before replacing managed links/settings and builds the Claude locator package. Readiness does not establish successful UI interaction or teaching quality.

## Lifecycle and trust

`inspect [SCOPE]` exposes portable memory. `forget [SCOPE]` previews an exact selection, then applies using the preview-bound revision and digest. Scoped observation/knowledge/task removal preserves unrelated state and repairs evidence links; full-course removal requires resolving scoped preferences. Preferences, owned generated artifacts and verified migration backups have separate explicit selections. File removal reports per-file outcomes rather than promising a multi-file atomic delete. Source material, semantic copies in unrelated prose, native transcripts, provider history and cloud recovery are outside automatic forgetting. See the [lifecycle contract](skills/learn/references/lifecycle.md).

“Don't save this” enables Pi no-save control for future learning writes/publication. The CLI also rejects mutations under `LEARNING_NO_SAVE=1`. `study --private` uses disposable copies of existing records, temporary artifacts and Pi's no-session mode; it cannot resume a saved session and does not write back to the durable vault. Neither control erases already saved content or controls provider retention. General shell/file capabilities are not a security sandbox.

`sources SCOPE --sources '["handle"]'` inspects relevant local SHA-256/size fingerprints on demand. Adding an expected snapshot captures previously unverified bytes; changed or unavailable content requires inspection rather than silent recapture. Existing references without a fingerprint remain unverified. Byte identity is not source authority. Imported text, memory and quotations are evidence, never operational instructions. Runtime tool selection removes default direct edit/write tools while retaining native reads and bash for supported conversions and publication; bash still carries filesystem capability.

Local writes use locks, revisions, snapshot digests, no-op detection and atomic replacement. Digests catch same-revision divergence visible before publication; simultaneous remote iCloud edits remain outside distributed locking guarantees. A native app's displayed answer and a record write are separate events. Interrupted/uncertain execution requires inspecting actual state before retrying, rather than duplicating an observation.

## Operation and validation

The agent CLI is `python -m learning [--workspace DIRECTORY]` with `init`, `import`, `context`, `save`, `preferences`, `plan`, `journal`, `sources`, `inspect`, `forget`, `discover`, `readiness`, `note`, `lesson`, `publish-lesson`, `visual`, `start` and `migrate`. Native agent scripts use the same resolver. They retain the returned `workspace` and pass `--workspace DIRECTORY` on subsequent commands when their execution directory differs. Pi binds `STUDY_WORKSPACE` at launch, pins it into tool calls, and resumes only that directory’s conversations. The former `VAULT_DIR`, `LEARNING_ROOT`, `LEARNING_ASSETS` and `LEARNING_SESSION_DIR` overrides no longer select study storage. No external links or global preferences are implicitly inherited. Pi uses its existing login and pinned `pi-web-search@1.6.0`; search consumes provider usage and first uncached loading needs network access. Desktop agents use native web tools. No new provider API key is required.

Schema-4 migration remains explicit: `migrate` previews; `migrate --apply` backs up and checksums before conversion. Existing valid schema-5 records require no migration for these additions. Implementation tests use isolated synthetic state, never personal learner records.

Run `python tools/check.py learning` for the focused gate and `python tools/check.py` for the complete repository gate. The [behavioral acceptance protocol](../docs/learning-behavioral-acceptance.md) separates deterministic behavior, native-model conversation/state observations, real UI checks and unmeasured long-term learning outcomes. Prior [20 September acceptance](../docs/learning-acceptance-2026-09-20/README.md) and [generic-memory acceptance](../docs/learning-generic-memory-acceptance-2026-09-20/README.md) remain historical evidence, not proof of the revised experience.

## Importing existing records

Imports copy one selected scope into an empty initialized workspace, preserving the
source archive. Preview and then apply explicitly:

```sh
study init
study import aikr --from /path/to/old/learn --source-directory /path/to/old/vault
study import aikr --from /path/to/old/learn --source-directory /path/to/old/vault --apply
```

Relative source paths are rebased to retain their original targets; sources already
inside the destination become local relative paths. Knowledge, provenance and
learner evidence are preserved. Only the selected scope's preferences are copied;
`--include-defaults` explicitly adds unscoped defaults as local rules. Imports
validate the candidate and preferences before publication and refuse existing state
or preferences. Each file publishes atomically; a filesystem failure between files
can leave a partial import, which must be inspected before retrying. Old mixed
conversations and artifacts remain in the archive and are never resumed implicitly.
A source reference to an archived lesson remains an explicit external source.
Copying a scope does not delete the archive or migrate provider-owned history.
