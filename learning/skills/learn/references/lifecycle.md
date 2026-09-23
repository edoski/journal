# Memory, sources and host boundaries

These operations serve natural requests such as “what do you remember?”, “forget that mistaken record,” and “don't save this session.” Use `learning_manage` when available; other hosts use the commands below. Keep routine inspection quiet. Explain a retention limitation when it matters to the request; do not interrupt ordinary lessons with a privacy checklist.

## Inspection and deliberate forgetting

`scripts/learn inspect [SCOPE]` inventories portable memory and its retention boundaries. Scoped inspection includes the full course record; unscoped inspection exposes scopes, snapshot-local preference handles, owned generated artifacts and verified migration backups. This is an administrative inspection, not the default teaching retrieval. Answer a memory question in ordinary language and distinguish evidence, interpretation and uncertainty.

Translate an explicit forgetting request into exact handles. Pipe the selection to `scripts/learn forget [SCOPE]` to preview before applying. Use the preview's revision **and digest**, bound to that exact selection and snapshot, with `forget [SCOPE] --apply --expect REV --expect-digest DIGEST`. A context receipt cannot substitute for the preview. If the request clearly authorises the exact removal, the preview is an internal safety step; ask only when the desired scope or consequential collateral removal is unclear. Never expand a request silently.

Each transaction selects one group:

| Selection | Scope argument | Effect |
| --- | --- | --- |
| `{"observations":["o1"],"knowledge":["notation"],"tasks":["exercise-5"]}` | Required | Remove exact selected entries; these three lists can combine |
| `{"course":true}` | Required | Clear the course while retaining publication revision and observation high-water mark |
| `{"preferences":["p1"]}` | Omitted | Remove exact preference rules from the inspected snapshot |
| `{"artifacts":["sessions/UUID.md","assets/name-HASH.svg"]}` | Omitted | Remove exact owned generated files |
| `{"backups":["backups/schema4-to5-BATCH/state/course.json"]}` | Omitted | Remove exact verified migration backup files |

Use actual returned paths/handles, not the illustrative values above. Groups cannot mix. Course removal requires resolving its scoped preferences separately first. Observation removal drops affected references and invalidates assessments/reviews that depended on it; unrelated evidence remains. Generated-file removal reports each outcome and is not an atomic multi-file transaction. Inspect after an interrupted or uncertain apply rather than assuming nothing was removed.

For a correction rather than erasure, preserve the history with an observation linked through `corrects`; field patches can redact or revise selected knowledge. Do not turn a request to fix an interpretation into a broad deletion. Conversely, an explicit erasure request should not be answered merely by appending a correction.

These operations do not search out semantic copies in unrelated prose, source files, native transcripts, provider history, device backups or cloud recovery. Course removal does not imply artifact/backup deletion. Generated lessons and retained migration backups need their own explicit selections. State the actual boundary when fulfilling a broad “forget” request; never promise universal erasure.

## No-save and private study

For a temporary “don't save this,” enable the Pi `learning_manage` no-save control when available. Continue from existing context without publishing observations, preferences, source captures, lessons or generated assets. Do not bypass the control through shell/file tools. Other hosts must honour the same intent through their available controls; `LEARNING_NO_SAVE=1` makes mutating learning CLI commands reject publication, but cannot disable a general host's file tools or history.

`study --private` starts Pi with disposable local study state and no saved Pi session. It may read the copied prior learning state to maintain continuity; it does not publish back to the durable vault. Do not combine private study with continuation of a saved session. Enabling no-save partway through a conversation does not erase already saved memory or history. Provider retention, terminal scrollback and independently captured material remain outside these controls. Use the actual host's guarantees rather than calling every mode “private.”

## Source freshness

`scripts/learn sources SCOPE --sources '["worksheet"]'` reads only the selected local source fingerprints. Status is `unverified`, `unchanged`, `changed` or `missing`; a source may remain unverified when it is not an inspectable local file. The result reports stored/current fingerprints when available and references that lack a verified fingerprint.

After inspecting the relevant material, the same command with the current `--expect REV --expect-digest DIGEST` captures an uncaptured fingerprint. An unchanged capture is a no-op. Changed or unavailable content is not silently accepted: inspect it and use a new source handle for changed cited content. A moved file with identical content can preserve its handle. Existing citations without a captured fingerprint remain unverified; capturing today cannot certify what an earlier reference described.

A fingerprint is a SHA-256/size identity check, not proof of an official edition, source authority or correctness. Check relevant material when new information or a consequential decision warrants it; do not scan every source each session. Preserve unresolved conflicts between course documents, learner reports and tentative inference.

## Readiness and conflict limits

`scripts/learn readiness --host codex|claude|pi|all` checks paths, canonical links, copied-instruction drift and runtime availability without changing configuration. Use it for installation, relocation or a concrete access problem, not before every answer. Installation preflight is separate from a successful live lesson. Folder permissions, browser/UI access, model behaviour and provider histories remain host-specific.

Writes use local locking, revisions, snapshot digests and atomic replacement. Digests catch same-revision divergence visible before publication; they do not coordinate simultaneously offline machines or guarantee distributed iCloud locking. Report a detected conflict and reconcile before retrying. Shared records provide portable continuity, not identical behaviour on every provider.
