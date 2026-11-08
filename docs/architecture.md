# Journal architecture

Journal has three feature packages. `sync` renders journal notes and runs session,
media, and grade commands. `learning` owns study memory, lesson publication,
retrieval, and teaching-client integrations. `finance` fetches the owner's bank
data into a local store. They belong to the same project; none needs a generic
application framework. `learnharness` is the study app that teaches on top of
`learning`; it is TypeScript with its own gate and AGPL license. It runs the
engine through the engine's CLI and reads the tutor skill's references as prompt
text, nothing else.

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
replacement. Learning storage separately owns locked, atomic JSON publication;
its evidence and lesson-ownership rules belong to learning. Raw files, shortcuts,
and model-generated JSON are validated on entry. Internal typed values are not
repeatedly converted back into generic mappings and validated again.

Each period synchronization reads its required dates once. Flow interruption
totals are loaded in grouped queries. Learning derives topic standings from the
observations in one pass per read. None of these require a persistent cache or
background worker.

## Learning

One workspace studies one course; its record is `.study/course.json` (schema 6).
`learning/schema.py` declares the record shapes, the handle namespace shared by
topics, knowledge, tasks and sources, whole-record validation and the single patch
rule (maps merge by handle, entries by field, `null` removes, lists replace,
observations append), rejecting unknown fields with close matches. `progress.py`
derives each topic's standing from the observations through one verdict per
counted day (learning, probe or practice day), giving levels, unaided days, lapses
and stale diagnoses, and schedules reviews on the successive-relearning ladder
within the exam window. `records.py` applies a patch to the latest record under the
record lock, schedules, validates and publishes atomically, returning a receipt
with the consequences, and refuses a save that grows pinned knowledge past its
budget; it also forgets exact items. Consumers read validated
`dict` records; the typed layer lives at the validation boundary.

`retrieval.py` builds `resume` (the session opener: time, due reviews, the path
with levels, weak topics, the open task, evidence and knowledge within byte
budgets), `show` (whole items) and `search` (accent-insensitive lexical
discovery with light stemming) on the one packer in `packing.py`. Whole items are
kept or omitted, never clipped, and omissions are reported. `planning.py` joins
reviews and open work across registered workspaces with Journal effort, the week
in review (replayed from the window start) and, near an exam, the run-up pace
from the Journal schedule.

`cli.py` is a command table: one small handler per verb with its mutation policy
declared beside it; `__main__.py` parses, selects the workspace and dispatches.
`mcp.py` is a stdlib MCP server over stdio that exposes the same verbs as typed
tools and prompts to Claude Desktop, Claude Code and Codex, running each verb as a
CLI subprocess so the CLI stays the contract. `workspace.py` owns discovery,
material links and the per-user registry; `preferences.py` merges global and
course preferences; `sources.py` scans and registers material; `storage.py`
publishes atomically under locks; `clock.py` owns the study day; `install.py` and
`readiness.py` register and check the hosts.

The canonical skill and its references own teaching workflows; host adapters
route to them rather than keeping a second pedagogical state model. Observations
are appended for actual attempts (with the help given and the result), external
results and explicit self-reports; the tutor's own explanations are not evidence.
Levels and review dates are computed, not asserted. There is no vector service,
background reflection worker or curriculum database.

## LearnHarness

`learnharness/` is LearnHarness, a Next.js and Electron study app, brought in with
its full history by `git subtree` from a fork of an AGPL-3.0 project; its `LICENSE`
covers that folder only. The engine is the learner's memory and the app is the
classroom: it runs one lesson (probe, plan, teach, check, practice, hints, visuals,
demos, PDFs, research) and holds no learner state across sessions. Every session
belongs to one engine course. Its own `AGENTS.md` and `docs/architecture.md`
describe its code; `docs/merged-study-system.md` assigns each concern to the app or
the engine.

The app runs `python -m learning [--workspace DIR] VERB` as one child process per
verb through its `CourseRecords` adapter, so the CLI is the contract and grading,
levels and scheduling exist only in Python. The engine root defaults to the
repository root with its `.venv/bin/python`; `LH_LEARNING_ENGINE` and
`LH_LEARNING_PYTHON` override them, which a packaged desktop app outside the
repository needs. The tutor's teaching doctrine is host-neutral: `evidence.md`
(attempts, grading, confidence), `teaching.md` (the edge, predict-teach-check,
hints, practice problems) and `reviews.md` (reviews, the close, the week, the exam
run-up) in `learning/skills/tutor/references/` name no tools, and each host maps
them to its own tools (the skill's tool table, the app's course adapter). The app's
course prompt composes, for each of its agents, the files and `##` sections listed
in its `ENGINE_DOCTRINE` by repository-relative path, including `records.md`'s
tasks and preferences and `course.md`'s exam facts, and its own prompts keep only
what is specific to the app. Its desktop build copies that folder beside the server
payload, and its tests fail when a listed file or section is missing. The app leaves
out the week and the exam run-up until its course brief carries their figures.

## Finance

`finance` reads the bank accounts of every bank listed in `finance.toml`
(`[[bank]]` tables; none means FinecoBank) through Enable Banking (a PSD2 account
information provider), each bank with its own consent file. `client.py` signs each call with an RS256 JWT made by the
system `openssl` (`jwt.py`; the key never enters the process) and sends it over a
verifying TLS context (`tls.py`: Python's default roots, else the macOS system
roots, else `/etc/ssl/cert.pem`). `connect.py` runs the redirect consent: the
consent length from the bank's `maximum_consent_validity` (GET /aspsps), the
bank link opened in Google Chrome, the redirected address read from Chrome's tabs
(pasted only when Chrome cannot be opened or read), its `state` check, and the
session stored in `session-<bank key>.json`, the previous one closed. Chrome and
notifications sit behind `desktop.py`'s `Browser` and `Notifier` (AppleScript
through `osascript`; tests use fakes). `fetch.py` is one locked run over every
bank, one bank's failure never stopping another, followed by the renewal
(`connect.renew_bank`) of each consent that ends that day or has ended, and a
fresh fetch of each bank renewed: the longest history
first, then from the last booked date minus an overlap, all pages or nothing per
account (an item it cannot read is kept aside in `rejected`, never fatal),
upserts keyed on `entry_reference` with booking date, direction, amount and
occurrence (else a content hash and occurrence), stored rows the bank stops
returning reported rather than hidden, balances once a day, a 6-hour pause after
a 429 and a "needs reconsent" stop after a session error. `store.py` owns the SQLite schema; accounts are keyed by
`identification_hash`, which survives re-consent.

Categories are not stored. `rules.py` validates `categories.toml` and assigns
categories when the store is read (`read.py`), so editing the rules re-categorises
history. Rules see every stored entry, not one: a bank that sends no text (Trade
Republic) is matched by account, amount, day of the month and pairs of entries,
and its own transfers by the holder's entry on another account. Its Round up
debits (`roundup.py`) are each run's exact sum of the card payments' round-ups;
a run that does not add up is reported, never guessed, and its candidate debits
stay Other. Pairs and runs are found
over the whole store, so an entry gets the same category whatever range is read. `read.read_entries` is the single read interface: sync's
`FinanceStoreSource` adapter is the only sync module that imports finance, and
finance imports nothing from sync. Period builders turn the `FinanceBundle` into
the FINANCES section, the SPENT summary row and the monthly transactions notes
(`sync/periods/finances.py`); with no store they render exactly what they did
before, and with unreadable bank data FINANCES is one line naming the reason
while the rest of the note renders as usual. The biz tool asks `python -m finance credits/debits/balance --json` and never
opens the store itself; `debits` also lists the Round up runs (`roundups`).

## Maintenance

Run `python tools/check.py` from the project environment. Use `sync`, `learning`,
`finance` or `learnharness` as an optional argument for focused checks, and `--coverage` when coverage detail
is useful. Ruff, strict mypy, import contracts and Python tests cover the
maintained Python code. The sync check also verifies rendering fixtures
without rewriting them. The full check and the `learnharness` scope run the app's
typecheck, lint and tests (`npm ci` in `learnharness/` first); its tests run the real
engine from the repository's `.venv`.

Rendering fixtures are a compatibility contract, not refactoring targets. Changes
to architecture must preserve note text, whitespace, charts, tables, `sync` CLI
behavior, and stored learning records. Keep tests for observable behavior,
external-input errors, transactions, and concurrent publication. Avoid tests that
merely assert which private helper called another.

### Study workspace ownership

The learning engine is installed once; each initialized course/project directory
owns `.study`. `learning/workspace.py` resolves explicit selection or the nearest
ancestor, validates the versioned marker, and derives local output paths. There is
no global state fallback or inherited parent workspace. A workspace may instead
study linked material elsewhere: its manifest names the material directory and the
per-user registry maps that directory back, and discovery follows a link only when
no nearer marker exists and both directions still agree. The registry lists every
workspace so planning and search can span courses. `learning/study.py` owns
the short user command (`init`, `link`, `unlink`); `__main__.py` is the canonical
agent CLI. The MCP server resolves a course per tool call from its argument, the
server's working directory or the registry.
