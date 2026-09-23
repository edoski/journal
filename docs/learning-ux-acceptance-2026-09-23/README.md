# Learning experience acceptance — 23 September 2026

Prepared for the integrated learning revision. No native results are claimed until
a run directory contains public traces, answers, states, metrics and a semantic
review. All learner/course material is synthetic. Production learner records,
installed authentication and GUI configuration are not modified.

`fixtures.py` defines six fresh-session cases over two courses.
`evaluator-expectations.md` specifies semantic expectations separately from tutor
input. `run_acceptance.py` prepares an isolated vault by default; `--run` makes
native calls through the already authorized Pi `openai-codex` provider. No package
installation or model override occurs. Each run uses a new evidence subdirectory;
historical runs stay intact. `--resume --only CASE` supports a reviewed retry
without replaying successful cases.

```sh
.venv/bin/python docs/learning-ux-acceptance-2026-09-23/run_acceptance.py --output run-1
.venv/bin/python docs/learning-ux-acceptance-2026-09-23/run_acceptance.py --output run-1 --resume --run
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
