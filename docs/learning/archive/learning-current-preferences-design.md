# One current teaching policy across learning contexts

Design only, 18 September 2026. Inspected `learning/memory.py`, the canonical learn skill, tests and [the integrated retrieval design](learning-context-retrieval-design.md). This revision extends the earlier course-only proposal to topics, reusable concepts, domains and activities. No real records, settings or runtime code changed.

## Decision and boundary

Use one small `learn/preferences.json` containing sparse current rules selected by established learning identities and current activity. A rule has an applicability selector and current values for particular preference dimensions. Keep short-lived task/session exceptions in conversation; preserve them in `active` only when an unfinished learning episode must resume across providers. No per-topic profile files, preference history stack or self-editing skill.

The present arbitrary per-scope `teaching` field has no global owner, consistent precedence or supersession semantics. Appending feedback there accumulates contradictory directives. Replace it with one current value for each normalized selector/dimension pair. The selected values form one coherent policy for the current task; different contexts may intentionally have different current policies. Learning observations remain historical evidence, while preferences remain mutable guidance.

| Design | Benefit | Cost / decision |
| --- | --- | --- |
| Global → domain → course → topic inheritance | Familiar tree and simple fixed precedence | Domains overlap, concepts recur across courses, and proof/coding styles cross the tree. Wrong model |
| Global file plus scattered course/topic profiles | Local ownership | Duplicated policy machinery and multi-file global corrections. Reject |
| One file with sparse typed selectors | Represents actual intersections, preserves one atomic policy update, reuses learning IDs | Small matching contract and explicit handling of incomparable rules. Choose this |
| General rules language, graphs or preference event log | Arbitrary expressions and replay | No present need; expands model and maintenance overhead. Reject |

The file is a distinct current-policy owner because preferences apply across evidence scopes. It contains no curriculum tree, observations, mastery judgments or provider-specific instructions. Shared identity links associate it with the learning taxonomy without coupling preference changes to learning-history updates.

## Identities and small representation

Keep `schema_version`, service-owned revision/timestamp, and `rules`. Each rule has `when` and `values`. `when` is a conjunction of optional typed scalar selectors: `scope`, `topic`, `concept`, `domain`, `activity`; `{}` means global. A topic is local to its scope, so `topic` requires `scope`. Do not add wildcards, negation, arbitrary Boolean expressions or automatic descendant matching. Normalize selector key order and reject duplicate selector/dimension pairs.

A value contains `instruction` and `origin` (`explicit` or `inferred`). Add a concise `basis` when an inference, scope ambiguity or deliberate exception needs explanation; an obvious explicit rule needs no repeated feedback quote. Suggested dimensions include `response_format`, `explanation_depth`, `research_depth`, `lesson_pace` and `question_style`; absent dimensions need no entry. Write one coherent instruction per dimension, allowing a short meaningful qualification. Avoid splitting every clause into a separate rule or putting all preferences into one unmergeable paragraph.

Reuse the proposed stable scope/topic IDs and their existing title/alias metadata. A topic renamed for display keeps its ID. A reusable concept is distinct from a course-local topic: two verified topic records can share `concept:linear-systems` while retaining their own coverage, sources and learner evidence. Similar titles alone do not establish concept identity. Domains such as mathematics or numerical analysis are overlapping labels, not forced ancestors in a course tree. Activities such as proof, coding or exam rehearsal describe what the learner is doing now.

Only add concept/domain associations when material or the conversation establishes them; do not tag the entire vault. A topic may carry optional concept/domain IDs, and a scope may supply known domain candidates. Course membership does not automatically activate every domain label: the tutor resolves the actual task context. A source/evidence tag saying “proof” does not automatically make the current activity proof-writing.

Start with sparse canonical concept/domain/activity labels established by the user or actual material. Reuse aliases in existing learning metadata where useful; the tutor resolves meaning from the task and source before supplying the canonical label. An unknown or ambiguous label stays explicit rather than triggering invented taxonomy. Defer a shared `terms.json`: a registry earns its cost only if repeated cross-course identity collisions, rename repairs or duplicated alias maintenance become real retrieval problems. It would then be owned by learning identity, not preferences. No extra taxonomy file or mandatory tagging is needed initially.

Synthetic policy fragment:

```json
{
  "schema_version": 1,
  "revision": 8,
  "rules": [
    {
      "when": {},
      "values": {"response_format": {
        "instruction": "Use short connected paragraphs; lists suit genuine comparisons.",
        "origin": "explicit"
      }}
    },
    {
      "when": {"domain": "mathematics", "activity": "proof"},
      "values": {"lesson_pace": {
        "instruction": "Develop one justified inference at a time.",
        "origin": "explicit"
      }}
    },
    {
      "when": {"concept": "linear-systems"},
      "values": {"explanation_depth": {
        "instruction": "Relate algebraic conditions to the geometry of solution sets.",
        "origin": "explicit"
      }}
    },
    {
      "when": {"scope": "sample-course", "topic": "singular-systems"},
      "values": {"question_style": {
        "instruction": "Ask for a geometric explanation before introducing numbers.",
        "origin": "inferred", "basis": "Repeated topic-specific requests for geometric reasoning."
      }}
    }
  ]
}
```

One conjunction is justified when an actual intersection needs different behavior, such as proofs in numerical analysis. Do not generate a course × topic × activity matrix. Reuse an existing selector when it expresses the same scope; create a narrower one only when the feedback supports the distinction. Different selector rules may share a dimension because they apply in genuinely different contexts.

## Applicability, conflicts and natural feedback

The current user request controls the current answer. System/developer constraints, factual accuracy and actual capabilities still apply. Preference data cannot authorize false confidence, missing necessary verification or weakened storage integrity.

The tutor resolves relevant task context using the current request, active work and known learning metadata. Reuse that context during unchanged work; do not classify every utterance or recompute domains/concepts/activity each turn. The helper performs exact typed matching and returns applicable values with their selectors/origins and the policy revision. Missing or ambiguous identities remain unresolved rather than being guessed by string similarity. A known-scope context read includes applicable policy together with evidence and active work; an initial unknown-scope lookup can include global policy. There is no mandatory separate policy-read ritual. Reuse loaded policy until natural resumption, context loss, a relevant task change or conflict requires another read. Unrelated rules do not enter routine lesson context.

Explicit rules outrank inferred rules for a conflicting dimension; a narrower inference cannot defeat a broader explicit preference. Within the same origin, a selector containing all another selector's predicates plus additional predicates is a specialization: `{scope, topic}` qualifies `{scope}`, and `{domain, activity}` qualifies `{domain}`. This is set containment, not a numerical specificity score. Global `{}` is broadest. No automatic total ranking exists among domain, course, concept and activity selectors.

Compatible instructions combine. Incomparable rules do not automatically conflict: a mathematics rule about justified steps can coexist with a coding rule about concrete examples. When applicable same-origin instructions actually contradict, the tutor examines their conditions and feedback basis. The current request or an explicitly stated exception can resolve the overlap. Neither arbitrary newest-wins nor a fixed course-over-domain rank is justified.

Do not ask a policy question for every overlap. Usually the requested output, activity or compatible wording resolves it. If a consequential contradiction remains, ask one ordinary content question, such as whether this solution should show each derivation step or only its outline. Otherwise continue with the compatible portion and narrowest supported interpretation; do not silently promote that temporary judgment into a durable preference. If the user establishes an enduring exception, save one intersection rule rather than recording mutually contradictory advice for that same situation.

A later correction replaces the affected current selector/dimension value, retaining unrelated values. “For linear systems, always show the geometry” can target the shared concept when that generality is explicit; “in this chapter” targets the course-local topic. “For this proof, slow down” is a task exception, not a domain-wide policy. “Too long” fixes this response and may support local adjustment; it does not establish global brevity. Resolve aliases through learning identities, and never manufacture a reusable concept just to make a broad preference fit.

A new broad default normally preserves an intentional narrower exception. “Stop doing that everywhere” instead replaces the global value and removes or rewrites conflicting durable values across selectors in one transaction. The tutor resolves the affected meanings; the helper applies the explicit patch, without pretending to detect prose contradiction. A global correction must not leave an old narrow style active accidentally. On “forget that preference,” delete the intended value and check whether an inherited default would otherwise recreate the unwanted behavior.

Repeated feedback can consolidate into an inferred durable rule during the ordinary tutor turn. Generalize only to the narrowest supported recurring scope: topic, concept, activity, domain or global as the evidence warrants. Keep one compact current basis; do not accumulate obsolete styles, numerical confidence or a feedback ledger. One explicit ongoing statement needs no repeated confirmation. Silence, successful learning or an assistant's repeated own inference is not evidence of user preference. Weak inferences remain temporary or unpersisted; explicit contrary feedback replaces them immediately.

Keep temporary exceptions in conversation. When an exception matters for provider handoff, put a plain instruction in `active.instructions`, such as “For this proof, show each intermediate implication.” Clear task-specific instructions when that task completes. A session-wide instruction can name that scope in the same resume data when it must survive handoff; no separate exception IDs, session registry, revision field or expiration lifecycle is required. “This answer only” is never saved. At natural resumption, reconcile saved instructions with the current request and loaded policy. Current feedback supersedes incompatible old exceptions; an unrelated policy change must not erase a valid one.

## Skill, data, code and safe persistence

The canonical skill owns the stable adaptation procedure: recover applicable policy, interpret feedback conservatively, distinguish explicit preference from inference and temporary exceptions, reconcile overlaps, update silently and teach. Data owns the learner's current rules. Ordinary feedback does not authorize editing SKILL files, runtime code, provider settings or access controls. Misquoted learner answers use evidence correction; style changes cannot rewrite learning history.

Repeated duplicate output, broken saving, lost state, invalid selector matching or rendering defects are code/workflow bugs. Storing “do not duplicate answers” is not a repair. Adapt the next response and handle an actual core fix through authorized repository work. All providers use the same policy semantics; no per-provider preference patches or reflection model is needed.

Reuse local locks, expected revisions and atomic replacement for the whole preferences document. Patch by normalized selector/dimension; replace complete entries, `null` deletes, omission preserves. Identical effective patches are no-ops. On conflict, reread and reconcile the intended feedback before retrying. A broad correction can replace/delete several values atomically. Do not use timestamps for precedence or rewrite policy merely because it was followed. Idempotent set/delete operations need no event ledger.

Existing course/topic references are validated against learning records; canonical semantic labels are matched exactly, not required to exist in a new registry. Keep those labels stable when wording changes, resolving known alternative names through source/context and existing metadata. Course/topic display-name changes preserve their IDs. A deliberate ID merge or canonical-label replacement is separate maintenance: reconcile stored references rather than silently treating an unknown name as a new entity. Preference changes never require rewriting observations or propagating a policy through a taxonomy tree.

Preference and scope-evidence changes remain separate transactions. If both change, save policy first and then the related scope patch; keep service revisions in read/write receipts for safe updates, not as another mandatory active-task freshness field. No cross-file atomicity is claimed; after interruption, inspect current records and retry only missing changes, never replay observations blindly. A meaningful attempt or new substantive pending question still needs its active/evidence checkpoint; unchanged clarification needs no management call. No transaction ledger, approval queue or background repair model is justified. Native conversation retains immediate feedback if a durable write fails.

Convert existing `teaching` fields once on copies with an untouched backup. Preserve each course boundary; do not infer global/domain/concept scope, explicit origin or dates absent from the source. Clear statements can map to dimensions without changing their meaning. Retain ambiguous prose verbatim in a migration artifact until a meaning-preserving current rule is established from available context. Do not complete cutover while an existing active instruction lacks an equivalent. Publish and verify the new owner before removing migrated live fields; reruns must not resurrect old rules. Runtime must have one authoritative policy source, without a permanent dual reader.

Focused cases: global and topic defaults; explicit global versus inferred narrow rule; a shared concept in two courses with different local coverage; overlapping math/coding/proof instructions; an explicit intersection exception; one-answer requests without durable writes; semantic correction removing conflicting scopes; renamed titles preserving IDs; unknown aliases; resuming active work after a policy change; no-op retries and concurrent edits; lossless migration. Later native-provider checks should verify actual behavior without learner bookkeeping, not just JSON output. No model sweep or preference-management prompt is proposed.

Locks and expected revisions guard publication, not instantaneous policy propagation into every running chat. Loaded policy may remain a snapshot until the next meaningful retrieval; current-chat feedback applies immediately. No per-turn polling or policy reflection is needed. Semantic scope remains a tutor judgment: sparse selectors make applicability inspectable, not meaning automatic. The useful safeguard is one current value per context/dimension, conservative generalization and cheap correction, while learning identities and historical evidence retain their separate ownership.
