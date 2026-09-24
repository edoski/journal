# Preference scope: small acceptance challenge

Design only, 18 September 2026. Based on [current preferences](learning-current-preferences-design.md) and [integrated retrieval](learning-context-retrieval-design.md). No implementation, real-vault access or model runs. The existing global/course proposal needs broader applicability; this report tests the semantics rather than selecting a universally optimal architecture.

## Minimality and applicability

| Choice | Useful property | Failure or cost |
| --- | --- | --- |
| Global → course → topic hierarchy | Simple ownership and predictable nested overrides; reuses existing IDs | Cannot express “all mathematical proofs” or “programming explanations across courses” without duplication or hiding cross-cutting scope in prose |
| Sparse typed selectors plus explicit task context | Reuses course/topic references and a few established domain/activity labels; handles cross-cutting preferences directly | Different axes overlap without a natural total order; the tutor must resolve semantic compatibility |
| General rule engine or expanding subject taxonomy | Can encode many combinations and inheritance paths | Adds mechanisms before evidence of need; conflicts still depend on natural-language meaning |

Prefer the second option for the stated requirement, while keeping its representation small. Retain one current preference value per dimension and exact selector. Use existing stable course/topic identities where available; introduce domain/field/activity labels only for actual user distinctions. “Field” need not become a separate selector type unless it means something useful that a domain label cannot express. Tags are reusable labels, not a demand to classify every source, topic or lesson.

The context identifies the current task's known course, topics and any grounded domain/activity labels. A selector matches exact typed identities; if a genuine combined exception needs several conditions, all must match. Global guidance needs no selector. Normalize ordering and duplicate selector terms so the same applicability cannot acquire two current values accidentally. Omitted dimensions impose no restriction; missing context never proves a required label matches.

For example, context may contain course `smm`, scoped topic `smm/linear-algebra`, domain `mathematics` and activity `proof`. These are independent known facts, not a inferred chain in which every topic has one field and every field one domain. A proof rule does not match a programming task merely because a retrieved worksheet contains a proof. Evidence tags can aid discovery; the tutor supplies the current activity from the request and work actually underway.

Do not give domain, course, topic and activity arbitrary rank numbers. Within the same origin, an applicable selector that contains all another selector's conditions plus an additional condition is structurally narrower. Singleton `course:smm` and singleton `activity:proof` are incomparable. Likewise, `topic:smm/linear-algebra` is narrower than course `smm` only through its existing ownership relation, not a guessed semantic relationship. Matching and valid ownership can be deterministic; compatibility of “brief explanations” with “show every proof step” remains tutor judgment.

## Meaningful examples

| Case | Synthetic current rules and request | Required result |
| --- | --- | --- |
| Overlapping axes | Mathematics asks for notation before examples; SMM asks for concise prose; linear algebra asks to connect equations to geometry; proof activity asks to expose each inference. Request is an SMM linear-algebra proof. | Retrieve all applicable current instructions with their scopes/origins. They can coexist: concise wording does not mean omitted proof steps. No domain/course/activity rule vanishes merely because another has a higher made-up priority. |
| Actual overlap conflict | Explicit SMM rule says “give only final results”; explicit proof rule says “show the reasoning.” The current request asks for a proof in SMM. | Honor the requested proof now. Do not silently rewrite either durable preference or use timestamps as semantic precedence. If future applicability remains consequentially ambiguous, clarify that exception naturally; otherwise use a defensible local interpretation. |
| New broad default | Old explicit SMM depth exception remains; user establishes a new general concise default. | Replace the global current value and preserve the intentional exception unless the user's correction clearly includes it. Newness alone does not erase scoped intent. |
| Explicit everywhere correction | Same setup, but user says “Stop appending summaries everywhere, including these proofs.” | Replace the relevant global dimension and remove or rewrite conflicting narrower current values in the same preference publication, including domain/topic/activity intersections. Preserve unrelated dimensions. The tutor determines conflict from meaning; Python applies the explicit patch. |
| Inference versus explicit | Explicit global rule requests connected prose; inferred programming habit suggests bullet-only answers. | The inference cannot override the explicit rule. It may fill a compatible missing preference; it cannot acquire authority merely through narrower scope or repetition. |
| Untagged or changing task | Course/topic are known but activity is absent; later the learner switches from proving a property to implementing it. | Apply known matches and globals; do not pretend all potentially relevant rules were evaluated. Establish an activity only when supported by the current task, and recompute applicable guidance on the switch. No compulsory taxonomy questionnaire or routine extra classifier pass. |
| Rename and movement | Course/topic display names change; an existing scoped topic is deliberately moved to another course. | Stable identities preserve preferences across display renames. A true identity/ownership change requires an explicit reference update; do not infer the old course's exception follows automatically. Unresolved explicit references are reported, not broadened to global rules. |
| One-off and superseded values | User says “For this answer only, use a table,” then later gives an ongoing format correction for programming. | The table request controls this answer without a durable write. Replace the affected programming value with one coherent current instruction; never concatenate the old and new rules or feed superseded wording back as active guidance. |

“Everywhere” applies to the dimension and behavior actually corrected, not every preference in the file. A new global format rule must not delete an unrelated proof pacing preference. Conversely, deleting only the global entry is insufficient if a narrower current entry still produces the explicitly rejected behavior. Keep the complete sparse policy available for an intentional broad edit, while ordinary teaching receives only applicable entries.

If a narrower instruction combines still-valid content with a rejected clause, rewrite that current value to preserve the valid part. No semantic delete operation belongs in the backend. Temporary overrides carried in active work need the existing revision freshness/reconciliation mechanism so a later everywhere correction does not revive obsolete behavior on resume.

## Deterministic checks versus tutor judgment

Focused fixtures can prove exact typed matching, conjunction semantics, scoped-topic ownership, canonical selector identity, exclusion of unrelated preferences, preservation through display renames, replacement rather than accumulation, explicit-before-inferred ordering, and atomic whole-policy updates. Reuse existing conflict/no-op publication checks. The overlap fixtures should prove that unresolved incomparable entries remain visible with their origins instead of being discarded by an arbitrary winner function.

The native tutor decides which contextual labels are justified, how compatible instructions combine, what a correction means, and whether its scope is durable. It does so during ordinary teaching with the user's current request, not an extra classifier or reflection model. A backend must not claim semantic conflict resolution because it sorted entries successfully.

Clarification is warranted only when incompatible interpretations materially affect the current teaching action and the request does not resolve them. Do not ask the learner to choose selector types, edit tags or approve every preference save. A limited local interpretation can remain temporary instead of growing the durable policy to encode an uncertain exception.

When later evaluating native hosts, reuse the proof-to-programming switch and the explicit everywhere correction within one short synthetic exchange. Inspect both behavior and the saved current policy: a correct JSON shape does not prove the tutor followed it. No model run occurred here, and these examples do not establish universal preference inference or an optimal architecture.

The practical growth bound is sparse actual preferences and selective retrieval, not a fixed rule count. Avoid creating every course × topic × activity combination, duplicating domain rules into each course, loading all unmatched rules each turn, or retaining old versions as active context. Add an intersection only when a demonstrated preference cannot be expressed faithfully by the existing applicable values.
