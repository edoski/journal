# Independent fidelity accounting review

Audited all 34 completed GPT-6 Sol/high sessions: 15 baseline, 15 candidate,
and four controls. The aborted GPT-5.5 batch is excluded. This review checks
accounting and file integrity; semantic verdicts and the separate core Standards
review remain independent.

No accounting discrepancies were found. Counts were independently reconstructed
from public tool start/end events and assistant-message usage, then compared with
per-case metrics and every group in `fidelity-summary.json`, including medians
and ranges. All started tools have matching completion events.

| Arm | Sessions | Model rounds | Tool calls | Actual errors | Review previews | Acknowledged successful saves |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline | 15 | 85 | 116 | 0 | 0 | 0 |
| Candidate | 15 | 102 | 129 | 0 | 10 | 10 |
| Controls | 4 | 22 | 30 | 0 | 0 | 0 |

Candidate previews comprise five qualified-correction and five new-authority
cases. They are normal noncommit results, not tool errors. No session exercised
a knowledge read with `evidence_budget`; no shell calls bypassed this count.

| Arm | Uncached input | Cache reads | Cache writes | Output | Total tokens | Returned tool-text bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline | 146,916 | 384,000 | 0 | 12,660 | 543,576 | 314,340 |
| Candidate | 155,258 | 545,536 | 0 | 15,889 | 716,683 | 359,889 |
| Controls | 52,605 | 90,752 | 0 | 2,857 | 146,214 | 89,048 |

Every environment records Pi 0.87.1, GPT-6 Sol, high reasoning, and the expected
commit; every actual assistant message reports `openai-codex/gpt-6-sol`.
All prepared, per-run, and final learning-source SHA-256 manifests match the
tracked bytes at baseline `6238921153bb67d7b861bb9a6c688bfd2c2e9555` or candidate
`b8c2876e74390169330f36dfad2da771fb780a97`, including the controls. All processes
completed successfully without timeouts.

Fixture source files and evaluator-uploaded documents retained their expected
bytes. No cross-scope record changes were found; the unrelated bench entry and
every pre-existing observation remain identical in all 34 sessions. Baseline
`1-f3-course-recall` and candidate `5-f3-course-recall` each added `lab-notation`;
recall was therefore not universally write-free. The first three controls leave
records unchanged; the held-out control changes its targeted numerical-methods
knowledge/task/source and appends observation `o2`. New vault artifacts are only
34 generated lessons, their lock files, and 11 evaluator-provided documents.

The static size figures reproduce exactly: skill words 1,122 to 1,145,
description words 805 to 843, and registered schema bytes 11,522 to 11,914.
Descriptions are already included in schema bytes. Registration includes all
five extension tools, including the quiz disabled for headless runs. The
on-demand records reference separately adds 136 words and 1,086 UTF-8 bytes.
These are source/registration measurements, not request tokens or peak context.

Usage totals accumulate model rounds; tool bytes count returned text only.
Latency and usage differences are descriptive, with model variability, tool
choices, cache state, and run ordering still present. No causal performance,
population reliability, billing, or learning-gain claim follows from these counts.
