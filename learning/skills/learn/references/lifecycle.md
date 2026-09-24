# Memory, sources and host boundaries

These operations serve natural requests: "what do you remember?", "forget that mistaken record", "don't save this". In Pi use `learning_manage`; elsewhere the commands below. Keep routine inspection quiet; explain a retention limit only when it matters to the request.

## Inspection and forgetting

`inspect [SCOPE]` inventories portable memory: the full course record, preference handles for this snapshot, owned generated files, and what the operation cannot reach. Answer a memory question in ordinary language, distinguishing evidence, interpretation and uncertainty.

Translate an explicit forgetting request into exact handles, preview with `forget [SCOPE]` and the selection on stdin, then apply with the preview's revision **and digest**: `forget [SCOPE] --apply --expect REV --expect-digest DIGEST`. The digest binds the exact selection and snapshot; a context receipt cannot substitute. If the request clearly authorises the removal, the preview is an internal safety step; ask only when the scope or collateral effects are unclear. Never expand a request silently.

| Selection | Scope | Effect |
| --- | --- | --- |
| `{"observations":["o1"],"knowledge":["notation"],"tasks":["exercise-5"]}` | required | remove exact entries; these lists can combine |
| `{"course":true}` | required | clear the course, keeping its revision and observation high-water mark |
| `{"preferences":["p1"]}` | omitted | remove exact preference rules from the inspected snapshot |
| `{"artifacts":["lessons/UUID.md","assets/name-HASH.svg"]}` | omitted | remove exact owned generated files |

Groups cannot mix. Course removal requires removing its scoped preferences first. Observation removal drops affected references and invalidates assessments and reviews that depended on it; unrelated evidence stays. File removal reports per-file outcomes and is not atomic. After an interrupted apply, inspect rather than assume.

A correction is not erasure: preserve history with an observation that `corrects` the wrong one, or patch the affected knowledge fields. Forgetting does not search semantic copies in other prose, source files, native transcripts, provider history, device backups or cloud recovery; say so when a broad request needs it.

## No-save and private study

For "don't save this", enable the Pi `no_save` action; continue from loaded context without publishing observations, preferences, sources, lessons or assets. Other hosts honour the same intent through their controls; `LEARNING_NO_SAVE=1` makes every mutating command reject. `study --private` starts Pi on disposable copies of the workspace's records with no saved Pi session. Neither control erases what was saved earlier or controls provider retention.

## Sources

`sources SCOPE --scan` lists course material under the workspace with a suggested handle per file and whether it is registered. `sources SCOPE --add '["path", ...]' --expect REV [--expect-digest D]` registers files and returns their handles. `sources SCOPE --check '["handle"]'` reports each source as `unverified`, `unchanged`, `changed` or `missing` by SHA-256 and size; adding `--expect REV --expect-digest D` captures an uncaptured fingerprint. Changed content is never silently recaptured: inspect it and register a new handle. A fingerprint establishes byte identity, not authority or edition. Check sources when new information or a consequential decision warrants it, not every session.

## Readiness and conflicts

`readiness --host codex|claude|pi|all` checks paths, skill links, copied-instruction drift and runtime availability without changing anything. Use it for installation, relocation or a concrete access problem.

Writes use local locks, revisions, snapshot digests and atomic replacement. Digests catch same-revision divergence before publication; they do not coordinate simultaneous writers on different machines. Report a detected conflict and reconcile before retrying. Shared records give portable continuity, not identical behaviour on every provider.
