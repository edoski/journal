# Generic memory native acceptance — 20 September 2026

Four fresh Pi sessions retained useful course/resource/notation prose, revised it without losing the unrelated g/h correspondence, completed the orientation task, and recalled the information after that task was gone. All **40 structural artifact assertions and seven direct boundary checks passed**. Manual review found limits: uncertainty and attribution were not preserved consistently, four invalid saves required recovery, and retrieval was broader than necessary. These results do not establish full semantic fidelity, optimal tool use or teaching efficacy.

The [runner](run_acceptance.py) used the actual Pi extension, Python CLI and canonical learning skill. No prompt supplied the `knowledge` field, entry keys or a memory-management recipe. Each learner message ran in a new native process with a separate session directory. Only the synthetic shared record and source files carried continuity; no earlier transcript, evaluator expectation or answer was forwarded.

## Fixture and provenance

The temporary-vault path and host version are recorded in [environment.json](environment.json). Pi **0.85.1** used the already-authorized **openai-codex OAuth** provider; every model response identifies **gpt-5.5**. No model override, installation, sign-in, global configuration change, GUI access or real learner write occurred. API-key/bearer overrides were removed from child environments without exposing values. This run does not test other native clients or TUI delivery.

The initial synthetic record contained two topics, an unfinished orientation task, and an unrelated hardware entry tagged to quantization. It contained no saved course interpretation, resource strategy or g/h correspondence. The overview file only lists resource names and chapter headings. The two lab documents give conflicting continuous/discrete-time instructions and explicitly lack dates or edition identifiers. Notation and lecturer-check information first appear in the natural learner messages.

Each session has an exact `*.source-digests.json` SHA-256 manifest for production code and canonical skill/reference bytes, plus a before/after equality check. **All four runs used stable bytes**, and their manifests match the [final manifest](final-source-digests.json). The source baseline commit is recorded in the environment; execution covered the uncommitted generic-memory implementation, not that baseline alone. [The source patch](tested-learning-source.patch) preserves the tested changes. These digests identify what was actually tested if subsequent documentation or implementation changes differ.

The tutor read both conflicting lab files already during the first orientation. Therefore the fourth session tests renewed inspection and restoration of uncertainty about an existing conflict; it is not an unseen-conflict trial. Evaluator expectations were kept [outside the tutor's vault](evaluator-expectations.md).

## Native observations

**Session 1: tentative orientation.** Pi created one reusable `materials-orientation` entry separate from the task and learner evidence. It retained the lecturer-g/Atlas-h correspondence, resource roles, the learner's tentative relationship between response and stability, and the conflicting lab documents. The entry explicitly attributed the notation correspondence to the learner and qualified its verification. No observation or learner assessment was created. [Prompt](s1-orientation.prompt.txt), [answer](s1-orientation.answer.md), [public trace](s1-orientation.public-trace.jsonl), [state](s1-orientation.state.json).

Two writes were rejected before the successful atomic save: a raw string was supplied where an entry object was required, then a reference named an unregistered source. Errors identified the invalid field/source; the tutor read the records contract and registered sources in the repaired patch. No evaluator intervention or repeated model trial occurred.

**Session 2: correction and task completion.** From a fresh conversation, Pi read the complete entry before replacing it. It saved the learner-reported lecturer correction about recurring viewpoints and old continuous-time sheets, preserved g/h and Atlas's derivation role, and removed the orientation task. The generic entry survived task completion. One save copied helper-owned `source_version` values from retrieved references; validation explicitly told it to omit them, and retry succeeded. [Trace](s2-correction-close.public-trace.jsonl), [state](s2-correction-close.state.json).

This turn also exposes a semantic limitation: the replacement adopted current-discrete advice from the learner's lecturer report and omitted the previously explicit unresolved documentary conflict. The known undated sheet was effectively treated as old/misleading without establishing its edition. Attribution to the learner's check remained at the start of the entry, but uncertainty was narrowed too far. A structurally valid save cannot prove that this inference is warranted.

**Session 3: unrelated clarification.** A new conversation asked only why a one-bit quantizer has two output levels. The tutor answered in one short paragraph, omitted course/resource and hardware trivia, and made **no state write**; the complete parsed record and its revision remained unchanged. [Answer](s3-unrelated-topic.answer.md), [trace](s3-unrelated-topic.public-trace.jsonl).

This was not an efficient zero-retrieval follow-up: the session was fresh and used six calls, including source reads and ordinary scoped context with an unnecessary 5,000-byte allowance. It did not select the quantization topic explicitly. Thus this native turn demonstrates appropriate non-use in the answer and unchanged state, not ideal retrieval selection. Direct boundary checks below separately test topic-selective projection.

**Session 4: fresh recall and conflict.** Pi recovered the corrected resource strategy, recurring viewpoints and g/h distinction after task completion. It used the knowledge index and exact full-entry retrieval, then reread the conflicting documents. The final answer explicitly said the undated sources cannot establish the authoritative current convention. The replacement entry restored that unresolved conflict and preserved the other useful details. No learner evidence, assessment or new orientation task was created. [Answer](s4-fresh-recall-conflict.answer.md), [trace](s4-fresh-recall-conflict.public-trace.jsonl), [state](s4-fresh-recall-conflict.state.json).

The first attempted save invented a `course-materials` topic handle. Validation rejected it; the tutor retried with the existing `response` handle. Its exact read also included the unrelated hardware note, despite that note being unnecessary to answer. Finally, the replacement dropped the earlier explicit learner-reported attribution for the viewpoint and g/h claims. The answer and saved prose retained some tentative wording, but this is **not full provenance preservation**. The conflict was restored after a direct question; that recovery does not erase session 2's earlier uncertainty loss.

## Structural checks and actual cost

[Forty executed assertions](checks.json) cover additive schema 5, unchanged unrelated knowledge, absence of fabricated observations/assessments, g/h retention, native task completion, unchanged clarification state, conflict text, native completion and source stability. They are mechanical checks, not a semantic judge. The uncertainty and attribution limitations above remain findings despite every structural assertion passing.

[Seven direct boundary checks](boundary-checks.json), with [complete outputs](boundary-results.json), establish that:

- Explicit quantization context includes the routed hardware note and excludes response/orientation knowledge.
- Literal `impulse response` search discovers the saved prose; exact retrieval returns the complete entry without learner-history or preference payloads.
- An identical entry replacement in a disposable copy preserves both revision and exact bytes. The native synthetic record was unchanged by these evaluator probes.

These checks invoke the production CLI or publisher directly. They do not establish that agents always choose the most selective available call.

| Fresh session | Complete turn | Tool calls | Recovered errors | Input tokens including cache | Cached subset | Output tokens |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Orientation | 62.81 s | 12 | 2 | 64,419 | 43,520 | 2,114 |
| Correction and closure | 36.78 s | 9 | 1 | 40,785 | 24,576 | 1,198 |
| Unrelated clarification | 17.21 s | 6 | 0 | 21,360 | 14,848 | 367 |
| Recall and conflict | 42.20 s | 10 | 1 | 49,876 | 35,840 | 1,414 |

Counts come from actual provider usage and include all inference calls, source/skill reads and retry overhead. Pi reports uncached input and cache reads separately; the table adds them for total input. Completion is process wall time, not first useful teaching or verified reading-surface delivery. No benchmark variants ran, and no token or latency improvement is claimed.

## Reproduction and limits

Public traces retain visible answers and tool calls/results, omitting private reasoning, signatures and credentials. Reproduce with existing native authentication from the repository root:

```sh
.venv/bin/python docs/learning/archive/learning-generic-memory-acceptance-2026-09-20/run_acceptance.py
.venv/bin/python docs/learning/archive/learning-generic-memory-acceptance-2026-09-20/check_results.py
.venv/bin/python docs/learning/archive/learning-generic-memory-acceptance-2026-09-20/check_boundaries.py
```

This recreates a synthetic vault and consumes native model usage. The narrow assertions exit nonzero on failure. Reproduction may yield different agent choices.

No source or state was repaired by the evaluator, no failed dialogue was rerun, and no production edit was made by this acceptance worker. The four tool errors recovered autonomously through actionable validation, but they remain real friction. Useful retention, correction and task-independent recall were observed; durable uncertainty/provenance discipline and minimal tool use remain imperfect. Long histories, multi-client concurrent semantic edits, adversarial material, educational outcomes, other models and GUI behavior are outside this run.
