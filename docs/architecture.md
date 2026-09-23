# Journal architecture

Journal has two feature packages. `sync` renders journal notes and runs session,
media, and grade commands. `learning` owns study memory, lesson publication,
retrieval, and teaching-client integrations. Both belong to the same project;
neither needs a generic application framework.

Learning reads recorded study activity and schedules through
`sync.study.context.journal_summary`. That read-only interface owns knowledge of
the journal's Markdown schema. Learning does not access the Flow database.
`sync.study.repository.FlowSessionRepository` owns Flow persistence and
transactions; session enrichment remains pure study-domain logic.

Within sync, readers parse external Markdown into contracts, metrics calculate
results, and writers render typed chart/table specifications. Application
services coordinate external sources and note publication. The CLI parses first
and constructs the integrations needed by the selected command. Small protocols
remain where they isolate real filesystem, database, and status inputs.

Note publication owns locking, conflict detection, no-op comparison, and atomic
replacement. Learning storage separately owns revision-checked JSON publication;
its evidence and lesson-ownership rules belong to learning. Raw files, shortcuts,
and model-generated JSON are validated on entry. Internal typed values are not
repeatedly converted back into generic mappings and validated again.

Each period synchronization reads its required dates once. Flow interruption
totals are loaded in grouped queries. Learning retrieval indexes observation
counts and traverses correction relationships directly. None of these require a
persistent cache or background worker.

Learning retains optional agent-authored `knowledge` in the same schema-5
record. Text and explicit attribution/uncertainty/conflicts carry reusable
understanding; observations retain learner evidence, tasks retain continuation,
and preferences retain current teaching policy. `records.py` validates field
patches and links. Omitted knowledge fields survive unrelated edits; optional
null fields clear and null entries remove. Helper-owned source version and
fingerprint metadata may round-trip unchanged, never be invented. A raw snapshot
digest accompanies revisions to detect same-revision divergence; local locking
still does not coordinate remote iCloud writers.

`retrieval.py` owns default evidence budgets, whole-entry knowledge selection,
focused reads and lexical discovery. Default context selects at most 24 seed
observations; complete correction/support groups fit inside a 12,288-byte
observation-map budget. Interpretations whose support cannot fit are withheld
from that response. Knowledge uses a separate 4,096-byte allowance; exact reads
default to 8,192 bytes and either return complete entries or report required size.
`task_context.py` projects a 4,096-byte briefing of existing course/activity/route
fields, retaining omission descriptors. Metadata outside these projections is
not globally bounded. Every partial selection exposes its limits. Exact reads,
revision-bound pages and deliberate overrides support consequential decisions.

Task-purpose, current-step and direct-prerequisite knowledge is separate from
active-topic policy. Explicit aliases and accent-insensitive token matching aid
discovery; cross-course search returns handles, without transferring mastery,
evidence or preferences. Knowledge and imported content remain evidence, never
instructions. There is no vector service, background reflection worker, separate
curriculum database or numerical mastery model. Loaded context is reused; later
prompt cost still depends on the native host's requests and caching.

`sources.py` owns on-demand selected-file hashing and fingerprint capture. Byte
identity does not certify authority or retroactively verify an older reference.
`memory.py` owns inspection and preview-bound selective removal. Observation
erasure repairs structural links and invalidates affected interpretations. Course,
preference, owned-artifact and verified-backup operations have explicit distinct
boundaries; no operation promises deletion of unrelated semantic copies, native
history or provider data. File deletion reports per-file outcomes rather than
claiming multi-file atomicity.

The canonical skill and focused references own teaching workflows: natural
conversation, course-grounded practice, assistance fading, delayed independent
retrieval, transfer and feedback on native image/code inputs. Host adapters route
to these instructions, not a second pedagogical state model. Pi's three quiet
memory tools invoke the Python CLI directly. Default study tools retain reading
and bash but omit direct edit/write tools; this narrows accidental surface area
without pretending bash is sandboxed.

`lessons.py` separates generated teaching from learner-owned annotations, checks
generated-region fingerprints and publishes atomically. Pi streams readable
teaching in the terminal, then projects completed messages into Obsidian. An
optional Obsidian-only display mode retains fallback on publication/open failure.
Branch reconstruction and tutor corrections preserve annotation regions. A saved
artifact and a delivered answer remain different events.

No-save rejects portable mutations/publication. Private Pi sessions copy existing
learning state into a disposable root and disable local session persistence;
provider retention remains external. `readiness.py` inspects paths, canonical
links, copied instructions and runtime availability; installation performs a
preflight before managed changes. Neither readiness nor adapter fixtures prove
that an actual host UI delivered the intended learning experience.

## Maintenance

Run `python tools/check.py` from the project environment. Use `sync` or `learning`
as an optional argument for focused checks, and `--coverage` when coverage detail
is useful. Ruff, strict mypy, import contracts, Python tests, and the Pi adapter
tests cover the maintained code. The sync check also verifies rendering fixtures
without rewriting them.

Rendering fixtures are a compatibility contract, not refactoring targets. Changes
to architecture must preserve note text, whitespace, charts, tables, CLI behavior,
and stored learning records. Keep tests for observable behavior, external-input
errors, transactions, and concurrent publication. Avoid tests that merely assert
which private helper called another.
