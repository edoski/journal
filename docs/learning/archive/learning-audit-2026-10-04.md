# Learning audit, 2026-10-04

Five parallel audits of the schema-5 learning subsystem, focused on the learner's
experience during study sessions and on tracking the knowledge path across
sessions: real-session forensics (read-only), learning science, a hands-on
four-session tutor simulation on a synthetic course, an engine code and
performance audit, and a Pi host audit. Their findings led to the schema-6 clean
break specified in [learning-v6-spec-2026-10-04.md](learning-v6-spec-2026-10-04.md).

## Evidence base

Real tutoring was thin: a handful of Pi turns on an earlier verb surface, native
Claude Code sessions in one linked workspace (mostly job onboarding), Codex
captures of course facts. Every real workspace held exactly one scope; real
preferences used only workspace-wide and scope selectors, with the same
workspace-wide values copied into each workspace; route nodes mapped almost one
to one onto topics; records held 0–13 observations. Findings about record use are
well supported; findings about teaching behaviour are small-sample.

## Findings

Continuity across sessions:

- `resume` exposed interpretations and evidence only for the active task or focus
  topics. Overdue reviews, stale assessments and weak prerequisites were invisible
  unless `plan` was called, and the skill never mentioned `plan`. There was no
  `today`, no time since the last session, no exam countdown.
- Completing a task (the normal outcome) left `resume` with an empty learner state;
  only the route position remained.
- Route `done` meant covered, not learned, and nothing connected it to
  assessments. Real records distinguished what was taught from what was learned
  only in prose; one route had to be reset wholesale when the learner said the
  earlier lessons had never been studied.
- Assessments were free text with a `pending` flag that required listing every
  considered observation to clear; review intervals were left entirely to the
  model, with the exam used only as a cap that stacked reviews on its eve.

Didactics (skill text):

- The turn instructions defaulted to explaining; the calibration loop, the closing
  check and the planning pointer of earlier versions had been dropped. A literal
  model would lecture, then save, then stop.
- No spacing defaults, no interleaving, no handling of recurring errors or learner
  confidence; self-reports had no consistent home.

Agent ergonomics:

- Revision plus digest tokens on every write; the forget receipt returned the
  selection digest under the name every other receipt used for the record digest,
  causing false conflicts.
- Knowledge qualification guards blocked whole patches (including unrelated task
  and route changes) behind a confirmation flag that neither the skill nor the
  error named.
- Route and task plans replaced as units: moving `current` meant resending every
  node, and no read verb returned the full nodes, so agents read the state file
  directly.
- Misspelled fields were stored silently at every level except knowledge; graded
  work could be saved as a direct attempt through a typo.
- The 4 KB automatic knowledge budget dropped standing conventions, pushing an
  agent to store them in exam coverage.
- Engine defects: the evidence packer could evict the task's own evidence for
  incidental topics; paged history under a budget skipped observations; explicit
  review dates after the exam never surfaced; a new course handle could resolve to
  another course through an alias; the packer was quadratic.

Pi host:

- Each new session spent round trips reading the skill and calling `resume`
  before teaching; each saving turn needed an extra model call after the receipt.
- Nothing re-oriented the tutor after compaction or when `--continue` met changed
  records; there was no visible status (course, position, due reviews, no-save).
- Diagrams failed in linked workspaces because assets were checked against the
  material directory.
- Lessons and diagrams under `.study/` are hidden from Obsidian's index; the
  learner chose to keep that placement for now.

## Decision

The learner approved a clean break (2026-10-04): one course per workspace; topics
as the single knowledge graph with derived levels; engine-scheduled reviews on a
successive-relearning ladder that the tutor can pin; a `resume` that opens the
session with time, due reviews, the path with levels and weak topics; merge
patches without tokens or confirmation guards; fewer verbs; Pi preloading,
re-orientation, turn termination on save and a footer status; a skill organised
around the session arc (open, teach generatively, record, close the loop).

Research grounding cited by the audits: successive relearning and spacing
(Rawson and Dunlosky; Cepeda et al. 2008; Latimier et al. 2021), interleaving
(Rohrer et al.; Brunmair and Richter 2019), ICAP (Chi and Wylie 2014), step-based
tutoring (VanLehn 2011), guarded versus unguarded AI tutors (Bastani et al.
2025; Kestin et al. 2025), hypercorrection (Butterfield and Metcalfe 2001), and
metacognitive monitoring (Dunlosky and Rawson 2012).
