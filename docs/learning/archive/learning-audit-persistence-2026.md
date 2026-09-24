# Learning persistence audit — 19 September 2026

Read-only implementation audit of storage, memory writes, preferences, and lesson publication. Only this report was added. All write probes used temporary directories; no real learner state was read or changed. Findings below come from current source and execution, not external research claims.

The storage foundation is sound for the documented single-machine concurrency model. The strongest improvements concern semantic authority and record lifecycle, not replacing JSON with a database.

## Confirmed findings

### 1. An inference can destroy an explicit preference

`learning/preferences.py:170–189` validates origin values but unconditionally replaces the existing selector/dimension. An `inferred` update can overwrite an `explicit` preference and erase its original instruction. Future retrieval cannot apply precedence because only the inference survives.

This contradicts `learning/skills/learn/SKILL.md:28` and `learning/skills/learn/references/preferences.md:13`, which state that inference must not override explicit feedback. Semantic overlap between different selectors reasonably belongs to the tutor; this exact-key authority downgrade does not require semantic interpretation.

Reproduced: save global `pace = {instruction: "One step at a time.", origin: "explicit"}` at revision 0, then replace global pace with `{instruction: "Use long uninterrupted lectures.", origin: "inferred"}` at revision 1. Revision 2 contains only the inferred instruction.

Worth fixing now: reject an inferred replacement of an explicit value at the same selector/dimension, preserving the entire record and revision. Keep explicit replacements and inferred-to-explicit promotion. Add one focused test. This guard cannot authenticate whether an agent truthfully marked a statement explicit; that remains an evidence/provenance concern. Do not build a general rule-ranking engine to fix this deterministic case.

### 2. Deleting a topic can break unrelated preference updates

`learning/memory.py:515–527` permits topic deletion after checking references inside its scope record. It does not account for references in `preferences.json`. `learning/preferences.py:198–212` subsequently validates every rule in the resulting policy, so one orphan topic rule blocks unrelated policy changes.

Reproduced sequence: create `course/retired`; save a preference with `when = {scope: "course", topic: "retired"}`; delete `retired` through the supported memory patch; attempt to add a global preference. The final step fails with `unknown topic in course: retired`. Existing observations were unnecessary for this probe, so the normal observation-reference guard does not prevent it.

Worth fixing when editing lifecycle boundaries: topic removal must either reject referenced topics with an actionable instruction to remove/reassign their preferences, or explicitly include preference cleanup in a defined deletion operation. Do not silently delete durable explicit feedback. Because preference save and topic save currently lock different files, a claimed invariant under concurrent writers also needs coordinated lock ordering for these operations. A shared lock around the rare topic-delete/reference-validation path is sufficient; distributed transactions are unnecessary. An alternative design can permit dormant preferences for retired identities, but then ordinary policy saves must not fail merely because those identities are absent. Choose one policy and test the sequential reproduction plus its critical concurrent boundary.

## Boundaries and worthwhile optional improvements

### Observation retries are conflict-safe, not idempotent

`learning/memory.py:551–560` assigns a new observation handle on every accepted append. Repeating the same patch at a newly read revision creates another observation with identical contents. A retry using the old revision fails before appending, so ordinary stale retries are safe.

This limitation is acknowledged and handled operationally: `learning/skills/learn/references/records.md:28–32` requires one submission per event and checking whether an uncertain save committed; `learning/pi.ts:239–240` explicitly warns about interrupted saves that may have completed. It is not an undocumented correctness failure.

If interrupted-save recovery becomes common, introduce a caller-generated operation/event identifier and return its prior receipt on an exact replay. Reject reuse with different content. Do not deduplicate by observation text: separate demonstrations can have the same wording. No background delivery service is justified for the current local tool. A bounded receipt design should be evaluated against actual retries rather than added solely for theoretical completeness.

### Corrupt scope isolation can improve discovery

`learning/memory.py:250–267` reads and validates every scope before returning the catalog. One malformed scope aborts the entire catalog, although direct access to healthy scopes still works. Reproduced with a valid `good.json` and `bad.json` containing `{`: catalog raises `JSONDecodeError`; direct `good` read succeeds.

Strict rejection is preferable to silently resetting a corrupt record. An optional improvement is a catalog response with healthy entries plus explicit per-scope errors, while all direct reads/writes of the broken scope continue to fail. This provides repair visibility without making corruption look like missing history. It is operational hardening, below the two confirmed lifecycle/authority bugs.

### Forgetting is not yet an application operation

Observations are append-only through `memory.save`; corrections preserve the original record. This is appropriate for epistemic corrections, as specified in `references/records.md:30`. It does not provide user-directed erasure. Preferences can be removed, but evidence and related lesson text require separate intervention.

If explicit forgetting becomes a supported product requirement, implement a narrow operation that lists and removes the selected canonical records and derived artifacts while preserving unrelated evidence. State its limits concerning provider-native history and backups. Do not interpret improved understanding as permission to erase history, or add automatic retention/deletion merely because this audit considered it.

## Existing guarantees worth keeping

- `learning/storage.py:58–99` performs revision comparison and transformation under the same `flock`, uses a deep copy, and preserves revisions/timestamps for effective no-ops. Stale writes cannot silently replace a committed local update.
- `learning/storage.py:37–55` writes a temporary sibling, flushes and fsyncs it, atomically replaces the destination, then fsyncs its directory. A failure after replacement can leave a committed write without a receipt; the interrupted-save guidance correctly acknowledges that boundary.
- `learning/storage.py:20–34` distinguishes absent records from corrupt ones and rejects invalid revisions/non-finite JSON constants. Validation failures are not converted into empty state.
- `learning/memory.py:235–247` rejects unsupported stored schema versions. A clean offline migration is compatible with the repository's clean-break policy; runtime compatibility shims are unnecessary. No migration was performed or inferred to be needed here.
- `learning/memory.py:512–562` publishes related scope changes together. Existing evidence survives task completion, and correction edges must point to earlier observations (`190–197`). Removing referenced topic/source identities fails validation inside the scope.
- `learning/lessons.py:69–99` serializes labels/publication and refuses to overwrite a note without the correct ownership marker. Explicit titles survive later projection. Publication is no-op-aware.
- `learning/pi.ts:255–269` queues projection mutations by lesson path and reads the active native branch inside that queue. Lesson files are derived reading surfaces; native history remains authoritative.

`learning/README.md:23` explicitly excludes simultaneous remote iCloud edits from local locking guarantees and separates stored writes from visible native responses. A synced lock file is not a cross-machine coordination service. Preserve this honest boundary. If multi-device concurrent writing becomes a requirement, first choose a single writer or explicit conflict resolution; current evidence does not justify CRDTs, a service, or a database rewrite.

## Validation

Ran `.venv/bin/python -m pytest tests/learning/test_memory.py tests/learning/test_preferences.py tests/learning/test_lessons.py -q -o addopts=''`: **41 passed**.

An independent temporary-directory, eight-process simultaneous-write probe gave **one successful revision-1 update, seven revision conflicts, final revision 2**. Additional isolated probes reproduced the authority downgrade, topic/preference orphan, duplicate append after revision refresh, and corrupt-catalog behavior described above.

No existing test covers the explicit-to-inferred same-key overwrite or the topic-deletion/preference-reference interaction. Existing tests already cover local contention, stale writes, no-op stability, malformed state, append preservation, and owned-note publication; retain those focused tests.
