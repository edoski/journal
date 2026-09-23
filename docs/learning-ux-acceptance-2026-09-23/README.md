# Learning experience acceptance — 23 September 2026

The subsequent [fidelity follow-up](../learning-fidelity-followup-results-2026-09-23.md)
records the reviewed implementation and 34 GPT-6 Sol sessions. The sections below
retain the earlier evaluation and its historical limits.

**Behavioral acceptance is not fully green.** The final targeted native run
preserves resource uncertainty, keeps course facts out of learner observations,
produces a relevant explicit transfer question and correctly resolves uncertainty
from new evidence. It still rewrites unrelated notation/provenance, narrates
evidence classification and needs two retrieval retries. These are residual
model-level failures, distinct from the passing implementation tests/review.

| Evidence | Tested scope/version | Outcome |
| --- | --- | --- |
| [Run 3: final targeted review](run-3/semantic-review.md) | Three fresh cases at `d74bbd7`; Pi 0.85.1, `openai-codex`/`gpt-5.5` | Main targeted boundaries pass; notation fidelity and quiet prose still fail |
| [Run 2: full revised run](run-2/semantic-review.md) | Seven fresh cases at `975e0ca`, including the new authority variant | Correct task closure, assistance/source fidelity, no-save and uncertainty resolution; narrower memory issues remained |
| [Run 1: original failures](run-1/semantic-review.md) | Six fresh cases; exact working-tree hashes and patch retained | Lost qualification, invalid completion and repeated tool errors identified |
| [Actual UI observation](ui-observation.md) | Synthetic Obsidian interaction at `13d5f32` | Rendering, annotation entry/preservation and note reopening pass; Pi UI access blocked; presentation limitations documented |

All learner/course material is synthetic. Native runs did not modify production
learner records, authentication or GUI configuration. The separately reported UI
check opened a temporary vault and removed it from Obsidian's recent-vault list.
Later documentation ownership changes are not retroactively covered by earlier
native source hashes. Neither these observations nor deterministic tests establish
long-term learning gains or reliable behavior on every host.

`fixtures.py` defines six fresh-session cases over two courses.
`evaluator-expectations.md` specifies semantic expectations separately from tutor
input. `run_acceptance.py` prepares an isolated vault by default; `--run` makes
native calls through the already authorized Pi `openai-codex` provider. The runner
installs no packages and changes no global model default; it pins the requested
session model (currently GPT-6 Sol/high). Each run uses a new evidence subdirectory;
historical runs stay intact. `--resume --only CASE` supports a reviewed retry
without replaying successful cases.

`--heldout` appends a seventh case prepared after run 1. Its new synthetic document
is written into the vault only immediately before that case, preventing earlier conversations
from seeing it. It tests whether new evidence can appropriately resolve a specific
uncertainty while leaving unrelated evidence intact. Exact case facts were withheld
from implementation workers until the next source freeze.

```sh
.venv/bin/python docs/learning-ux-acceptance-2026-09-23/run_acceptance.py --output run-1
.venv/bin/python docs/learning-ux-acceptance-2026-09-23/run_acceptance.py --output run-1 --resume --run
```

The final subset used a new fixture with:

```sh
.venv/bin/python docs/learning-ux-acceptance-2026-09-23/run_acceptance.py --output run-3 --run --only s1-qualified-correction s8-explicit-transfer s7-new-authority
```

Run only after implementation and skill bytes are frozen. The runner stops if
those bytes change during a native case. It records per-case hashes, current Git
revision/diff, synthetic snapshots, public traces without private reasoning,
provider usage with cache categories, tool calls/errors and delivery timing.
Raw stderr and native session files stay in the temporary synthetic workspace;
they are not published as evidence. GUI opening is disabled. Generated lesson
artifacts remain inspectable through their synthetic-root paths and hashes.

This is bounded native-model observation. It is not GUI verification, a success
rate estimate, proof of universal source-injection resistance, or evidence of
improved human learning.

The initial trace sanitizer removed legitimate JSON null fields along with
private reasoning blocks. Runs 1 and 2 retain their original traces unchanged;
the supplemental `*.public-calls.jsonl` files restore exact public call arguments,
including task-deletion and uncertainty-clearing nulls, from the isolated native
session messages. Their call IDs/names are checked against the event traces.
No private reasoning is exported. The sanitizer is corrected for subsequent runs;
saved learner-state snapshots were always unaffected.

The original transfer request was ambiguous across fresh sessions whose earlier
clarification/private material was intentionally unsaved. Its narrow concept
expectation is marked inconclusive in the later report. The final subset supplies
that target explicitly. Earlier outputs remain intact; the evaluator correction
is documented rather than presented as an implementation defect.
