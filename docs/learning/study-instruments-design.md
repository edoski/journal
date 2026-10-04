# Study loop: design (2026-10-05)

Status: proposal. This document combines four research reports, the 2026-10-05
Desktop click-test, the user's decisions and an adversarial review. The reports
were an engine audit of schema 6, a survey of study tools, a review of the
learning science, and the MCP Apps platform findings. Nothing here is
implemented. The contract stays in `learning/README.md` and the tutor skill
until a phase lands.

Binding decisions:

- **Chat only.**
- **Simplicity first.** One loop and the fewest instruments, with one entry
  point per activity. Every engine field is used by the loop or cut, and the
  vocabulary is the same in chat, the skill and the engine.
- **Cheap reviews.** A chat review must cost few tokens.
- **No daily reminder.**

## 1. The loop

**In the learner's two sentences:**

> Every study session starts with today's review: a few questions answered from
> memory, and anything I miss is explained and asked again differently until I get
> it; then I continue where I left off, doing each next step myself. At the start
> of each week the tutor offers a look back and a mixed set, and in the three weeks
> before an exam the sessions turn into mocks and targeted relearning.

| Activity | When | Entry point | Engine source |
| --- | --- | --- | --- |
| **A. Today's review** | start of every session | "studiamo" / "ripasso", or the `review` prompt | `resume.due` |
| **B. Session** | after the review | the conversation goes on, or the `study` prompt | `resume` (task, path, weak) |
| **C. Week** | offered once, in the first session of a new ISO week | `resume.new_week`, or the `plan_week` prompt | `plan` → `week` |
| **D. Exam run-up** | exam within 21 days | `plan` → `runup`; mocks via the `mock_exam` prompt | `plan` → `runup` |

**Vocabulary**, used identically everywhere:

| Term | Engine name | Meaning |
| --- | --- | --- |
| *today's review* | `due` | the topics to retrieve today |
| *review prompt* | `review.prompt` | the question a topic is reviewed with |
| *key points* | `review.points` | what an answer is marked against |
| *verdict* | (derived) | the one grade a topic gets for a counted day (§3.1) |
| *retry* | (an attempt) | relearning; never evidence of retention |
| *wrong method* | `chose` | the method wrongly chosen, recorded on the topic that should have been chosen |
| *competing methods* | `contrasts` | topics whose methods are known to compete |
| *mock* | attempts | a set of attempts; never `kind: exam` |

## 2. Why chat only

The tutor model judges reasoning, proofs and handwritten work far better than
any card. Chat is one surface that works the same in Claude Desktop, Claude Code
and Codex.

Every protocol the evidence supports can be run by the tutor in conversation:

- commit before feedback;
- marking against key points;
- interleaving;
- retry to criterion;
- timed mocks without hints.

Two findings point the same way:

- **No evidence for panels.** The research found no evidence that interactive
  panels add learning beyond what they enforce.
- **Weak return channels.** On this Mac a card can reach the model only through
  the engine record or a pre-filled composer message that shows a caution
  banner.

Card ideas are kept in §9, to revisit only if model usage becomes the bottleneck.

## 3. Engine

### 3.1 Verdicts (replaces the level and ladder inputs; fixes the inflation bug)

**The bug.** Day 1 unaided correct; day 5 unaided incorrect, then an unaided
correct retry. Today this yields `retained`, not lapsed, with a 3-day next
review. The skill's own retry-to-criterion inflates levels, and massed daily
practice climbs the ladder.

**Grades.** Each effective `attempt`/`exam` observation of a topic gets a grade:

- `solid`: correct, unaided, and no `uncertain`;
- `helped`: correct with help, partial, or correct but `uncertain`;
- `missed`: incorrect.

An `uncertain` attempt can lower a verdict but is never `solid`.

**Days.** A topic's attempts are grouped by date. Every date falls into exactly
one class. A **verdict** is the one grade a counted day contributes:

| Day | Which | Verdict |
| --- | --- | --- |
| **Learning day** | the earlier of `introduced` and the first attempt date | the **best** grade that day |
| **Probe day** | any later day on or after the *expected due date* (below), or any day with an `exam` observation | the **first** attempt's grade, lowered to `missed` only by a later unaided `incorrect` that day (partials never lower it) |
| **Practice day** | any other day | `missed` if the day has an unaided `incorrect`; otherwise no verdict, and nothing changes |

**Expected due date.** Replay the topic's verdicts in date order. The first
expected date is learning day + 1, the first retrieval. After each verdict it is
the verdict day plus the interval: `solid` → 3, 7, 16, 35, 75, 160 days by
streak; `helped` → 2; `missed` → 1. The exam clamp applies, using the current
exam date.

**Derived values:**

| Derived value | Definition |
| --- | --- |
| streak | the consecutive `solid` verdicts at the end |
| `unaided_days` | the number of `solid` verdicts |
| `level` | `new`/`introduced` with no attempts. `attempted`: no verdict better than `missed`. `assisted`: no `solid` verdict. `transferred`: an unaided, correct, not-`uncertain` `transfer` attempt on any day whose verdict is not `missed`. `retained`: ≥2 `solid` verdicts. Otherwise `independent`. |
| `lapsed` | the latest verdict is not `solid`, after an earlier `solid` one |
| `review.due` set by the engine | after a save that creates or changes a verdict: the next expected due date |

**Two edge cases:**

- **Practice day with no verdict.** If the stored `review.due` is on or before
  that day, the engine moves it to the expected due date. This stops a topic
  from staying due forever.
- **Tutor pins.** Pinned dates still win for scheduling. But an attempt before
  the expected due date is practice: only a failure counts.

**What this fixes:**

- a partial brain dump on the learning day takes the day's best grade, so it
  cannot lapse the topic;
- multi-day teaching registers only unaided failures;
- the first retrieval counts as a probe;
- `transferred` is reachable;
- massed daily practice no longer climbs the ladder.

### 3.2 Corrections and ordering

A correction (`corrects`) saved without a `date` takes the date of the earliest
observation it corrects. Attempts on one day are ordered by
`min(own number, numbers it corrects)`. A correction therefore takes the place
of what it replaced, and "first attempt" stays meaningful.

### 3.3 New fields

| Field | Rule | Used by |
| --- | --- | --- |
| topic `review.points` | a list of 1–5 short key points; merges with `review` | marking every review answer. It is shown in `due` items and listed in `TOPIC_DETAIL`, so it is not repeated when the topic is also shown whole. |
| observation `chose` | a topic handle (the method wrongly chosen). Only when `result` is not `correct`. It must not appear in the observation's `topics`. It counts as a reference that blocks removing that topic. | derived `standing.choice_errors`: observations with `chose` since the last `solid` verdict. Shown in `weak`; drives mixed-set selection. |
| topic `contrasts` | topic handles of methods known to compete. Symmetric on read. No self-reference. Stripped by `schema._strip_topics` when a topic is removed. | the order of `due`; mixed-set selection |

All three are optional additions. No stored shape changes.

### 3.4 `due`, the list for today's review

The keys `resume.due` and `due_more` keep their names. `DUE_LIMIT` goes from 8
to 5. Items gain `points`. The list is built as follows.

1. **Candidates:** topics with `review.due` ≤ today.
2. **Priority:**
   1. `lapsed` topics first;
   2. then, within 21 days of an exam, topics with no `solid` verdict in the
      last 14 days;
   3. then the most overdue;
   4. then path order.
3. **Selection:** the first 5 by priority. The rest are counted in `due_more`
   and carry over; nothing doubles after a missed day.
4. **Order (interleaving).** Build the list one topic at a time. Next comes the
   highest-priority unplaced topic whose `needs` inside the set are all placed.
   Right after it, add its first competing method (`contrasts`) that is still
   unplaced and whose `needs` inside the set are placed. Repeat until the set
   is empty. This always progresses, because `needs` is acyclic.

A topic leaves `due` when a save gives it a verdict, so another conversation the
same day does not repeat it.

### 3.5 Week and run-up in `plan`; `new_week` in `resume`

**`resume.new_week: true`** is set when `last_activity` falls in an earlier ISO
week than `today`. It needs no state.

**`plan.week`**, per course, covers the last 7 days:

- `levels`: topics whose level differs from a replay to the window start, as
  `{from, to}`;
- `probes`: the number of probe-day verdicts, and how many were `solid`;
- `attempts`: counts of `unaided` and `assisted`;
- `choice_errors`: each `{topic, chose}`;
- `minutes`: Journal study minutes (the existing `journal` effort).

**`plan.runup`**, per course, only when the exam is within 21 days:

- `days_left`;
- `not_introduced`: path topics never taught;
- `unready`: path topics with no `solid` verdict in the last 14 days;
- `study_days`: days with at least one study window from today to exam − 8.
  This comes from the existing `journal_summary(...).upcoming_schedule`; `plan`
  passes `horizon = max(days, 21)` when any listed exam is within 21 days;
- `pace` = `not_introduced` ÷ `study_days`.

`study_days` and `pace` are omitted when the Journal errors or `study_days` is
0. The phase is not stored; the skill derives it from `days_left` (§4D).

### 3.6 Smaller fixes

- **`mock_exam` prompt.** It says "save each answer as kind exam". Mocks are
  `attempt`s; `exam` stays for graded work from outside.
- **Duplicate window.** It narrows from 24 hours to **30 minutes**, enough for
  a re-sent save after an uncertain receipt. The 24-hour window silently dropped
  genuine identical retries. The wording changes everywhere it appears:
  - `SAVE_RULES` in `learning/mcp.py`;
  - `references/records.md`;
  - `learning/README.md` ("a repeated observation within 30 minutes is
    skipped").
- **Prompts embed the protocol.** The `review` and `mock_exam` prompts do not
  load the skill, so they embed their protocols (§6).

### 3.7 Schema and existing records

Stay on **schema 6, additive**: no migration and no shim (open decision 1).

Levels are derived, so they change on deploy. Stored review dates are *not*
recomputed: they stay until the topic's next verdict.

A one-off script, `tools/report_verdict_changes.py`, is read-only and deleted
after use. It lists, per live course:

- topics whose level changes;
- engine-set `review.due` dates later than the replayed expected due date.

The maintainer, in a normal study session, pulls the worst of those earlier by
pinning `review.due` to the replayed date with an ordinary `save`.

## 4. Tutor playbook

### A. Today's review (start of every session)

**Evidence:**

- Retrieval with feedback, g≈0.50 (Yang 2021).
- Successive relearning to criterion (Rawson and Dunlosky 2011/2022).
- Interleaving in math, d=0.83 (Rohrer 2020), with method choice as the skill
  trained (Brunmair and Richter).
- Explanatory feedback, g=0.49 vs 0.05 for right/wrong (Van der Kleij 2015).
- Free recall beats multiple choice (Kang 2007).
- Confident errors are corrected readily but return within a week (Butler,
  Fazio and Marsh 2011): hence an explicit contrast now and the 1-day retest
  the ladder gives.

**Protocol.** This is the SKILL.md text, which the `review` prompt also
carries. It applies at an open-ended start with `due` non-empty. A specific
request comes first, but take an unaided first try on any due topic it touches
before helping with it.

1. One line, then the first question. Ask the topic's `prompt` as stored for
   definitions, statements and conditions, and "when does X apply". For a
   procedural prompt, pose a fresh instance and ask for the method and the
   first decisive step.
2. Wait for the answer. No hints unless asked; a hinted answer is `helped`. On
   a `lapsed` topic, ask "quanto sei sicuro?" with the question. A confident
   error gets an explicit contrast now ("eri sicuro che X; è Y perché…").
3. Mark against `points`:
   - a correct answer gets one line;
   - a miss gets at most three lines on the gap, then a *different* question
     on that topic later in the review, until one unaided success.
4. Put the next question in the same message.
5. Save once, at the end of the review or when the learner leaves. Record every
   attempt with `response`, `help` and `result`, plus `chose` for a wrong
   method. A confident error also rewrites `gap` and the `prompt`.
6. Only the first try on a due day counts; retries are relearning. No recap:
   continue with the session.

**Details:**

- **Closed notes.** Ask once per course whether reviews are done with closed
  notes, and store the answer as the course preference `review_notes`. With
  open notes, attempts are `uncertain`.
- **Fresh instances.** Prefer exercises from the course sheets. Work a
  generated instance's solution yourself before judging the answer: LLM-written
  hints failed quality checks on 32% of problems (13% in statistics with
  self-consistency; Pardos and Bhandari 2024).
- **A mock replaces the day's review** for the topics it covers.

**Cost.** Each item is one learner message plus one model call: a tutor turn of
one to four lines with no tool call. The review ends with one model call that
saves. Five items cost about six model calls in total, instead of about eleven
with a save every turn. Every call reprocesses the conversation (mostly cached),
so short turns and no recaps are what keep the review cheap.

**Recorded:** one observation per attempt: `topics`, `text` (the question
actually asked), `response`, `help`, `result`, and `chose`/`uncertain` where
they apply.

**Failure modes and mitigations:**

| Failure | Mitigation |
| --- | --- |
| Teaching before the attempt | "wait for the answer"; acceptance case |
| Lenient marking | stored `points`; a contested verdict becomes a `corrects` observation |
| Rote memorisation of a stored prompt | fresh procedural instances; the tutor rewrites a conceptual prompt that has become rote |
| The learner leaves mid-review without saying so | the next `resume` still lists the topics as due; nothing false is recorded |
| A topic missed again and again | when `weak` shows it lapsed again, re-teach it in the session instead of quizzing |

### B. The session (after the review)

**Evidence:**

- Worked examples fading into problems, g≈0.48 in math (Barbieri 2023; Renkl),
  with expertise reversal (Kalyuga).
- Prediction before explanation helps conceptual topics only (Sinha and Kapur).
- A prediction must come before a visual; passive demonstration does nothing
  (Crouch 2004).
- Unguarded AI help harms later performance (Bastani 2025: −17%; Liu 2026).
- Next-item correctness is Khan's metric.

**Protocol:**

1. **Where to continue:** the open task's `step`; else `path.current`; else the
   next topic whose `needs` are at least `independent` and not lapsed. Check a
   weak prerequisite with one question first.
2. **New topic.** For a conceptual topic with solid prerequisites, optionally
   take a committed prediction first (2–5 minutes) and build the explanation on
   it. Then:
   1. one worked example with the reason for each step;
   2. a partly worked problem where the learner supplies the decisive step;
   3. an independent problem.

   Fade after two unaided correct steps; go back one rung after a failure. Skip
   the example when the evidence shows independence.
3. **Hints, smallest first:** where to look, then name the principle, then show
   the step, then a worked example of the step. Record the highest one given in
   `help`, in words. Honour "just show me", and record it.
4. **Next-item check.** After an assisted success, give a *new* problem of the
   same structure, unaided. The same problem re-solved after an example stays
   assisted.
5. **Mixing.** Once methods that compete have been practised, give problems
   whose first step is choosing the method. Record a wrong method with `chose`.
6. **Visuals and code.** The learner states a prediction before the tutor draws
   the plot or simulation, or runs the code. Only the prediction is evidence.
7. **Unwatched work.** Work the tutor did not see being produced in this
   conversation (homework done earlier, pasted solutions) is recorded with
   `uncertain`.
8. **Close, only in sessions that taught a new topic** (2–3 minutes; skipped if
   the learner is leaving):
   1. Write the new topic's `review.prompt` and `review.points` from the course
      source. The prompt should be one idea, precise, answerable in under 2
      minutes, not answerable by copying, and say what it tests. A procedural
      prompt is a structure specification, and a misconception probe follows an
      observed `gap`.
   2. Then ask for a brain dump ("Senza guardare: l'idea chiave e i passi"),
      mark it against those points, and record it as an attempt.
   3. Finally set the task `step` or `path.current`.

**Codebases** use the same loop. Review prompts ask about invariants, ownership
and data flow. Practice is "predict the output, or where the change goes, then
check".

### C. The week (offered once at the start of a new ISO week)

**Evidence:**

- Interleaving and discriminative contrast. Learners rate it harder and believe
  they learn less (Samani and Pan).
- No percentages or streaks (Hanus and Fox; Silverman and Barasch).

**Protocol.** When `resume.new_week` is set, offer the week in one line after
today's review. On acceptance, or via `plan_week`:

1. **Look back** in four to six plain lines from `plan.week`: what moved, what
   is shaky and why, and the wrong-method pairs. No percentages.
2. **Propose one mixed set per course**: 4–6 problems from sheets or past papers
   on 2–3 topics with `contrasts` or recent wrong-method errors, at level
   `assisted` or better.
   - Problems do not reveal their type, and no two in a row use the same
     method.
   - Each starts with "method + one-line reason", then the solve. Paper and
     photos are fine.
   - Feedback comes after each full answer. The set takes 30–45 minutes.
   - The first time, say once that interleaving feels harder and works better.
3. **The learner decides** whether and when.

### D. Exam run-up (exam within 21 days)

**Evidence:**

- Exam-format match moderates the testing effect (Yang 2021).
- Retrieval practice protects recall under stress (Smith, Floerke and Thomas
  2016).
- Feedback after a full attempt.
- Oral rehearsal: weak to moderate evidence, but directly relevant to *orali*.

**Phase by `days_left`** (this table lives in the skill):

| Days left | Phase |
| --- | --- |
| 21 … 8 | today's review plus two mixed sets a week. Introduce the remaining path topics at `pace` per study day. |
| 7 … 5 | mock 1 |
| 4 … 3 | targeted relearning: mock-1 failures, lapsed topics, `unready` |
| 2 | mock 2, or an oral simulation for an *orale* |
| 1 | a light mixed review only |

The exam clamp makes reviews dense near the exam. Mocks are the honest
compression: each answer is an unaided attempt on the topics it genuinely
exercised, which gives those topics a probe verdict. Prerequisites get no
implicit credit.

**Written mock** (this text is carried by the `mock_exam` prompt):

1. Agree the time limit and aids, posed in the conversation. The learner works
   on paper, times themselves, gets no hints, and sends photos at the end.
   This counts as watched work.
2. Transcribe the photos with numbered lines, and wait for the learner to
   confirm.
3. Mark each question in three columns: mathematical error, missing
   justification, presentation. Give a score only against a rubric the learner
   supplied or a registered marking scheme.
4. Record one `attempt` per question and per topic it genuinely exercised:
   `help` `none` unless help was given after a pause, `refs` to the paper, and
   `chose` for a wrong method. Never use `kind: exam`.
5. If marking spans sessions, an open task holds the step.

**Oral mock (*interrogazione*):**

1. Ask one opening question from `exam.coverage`, weighted to `unready` topics.
   The learner answers in voice or text.
2. Follow with 2–3 probes on assumptions, conditions and a concrete
   consequence. No hints.
3. Give feedback afterwards against `exam.criteria`, in the same three columns.
4. Record one attempt per topic, `uncertain` when a transcription garbled a
   formula.

## 5. Conflicts resolved

| Conflict | Decision | Reason |
| --- | --- | --- |
| FIRe prerequisite credit (survey for; science and audit against) | **Rejected.** An attempt lists every topic it genuinely exercised, and mocks compress reviews. | `needs` means needed to learn, not exercised by every problem. FIRe is untested, and direct solves barely consolidate procedures (Rawson 2020). |
| Self-grading, AI judging or deterministic checks | **The tutor judges against stored `points`.** Contested verdicts become `corrects` observations; unwatched work is `uncertain`. | Chat only. The tutor judges reasoning best, key points bound leniency, and self-grading inflates. |
| A CAS or JS equivalence check | **None.** Prefer course solutions; work generated instances yourself first. | Stdlib only; there is no card. |
| Item bank vs one prompt per topic | **One prompt plus key points per topic.** The tutor generates fresh procedural instances and retry questions. | Stable prompts and consistent marking where storage helps, variety where the model is good. No caps, wear tracking or migration. |
| Confidence on every item vs occasionally | **Not stored.** Ask "quanto sei sicuro?" on lapsed topics only, and act on a confident error at once. | Confidence ratings barely improve learning (Double et al. 2018: g=0.05). No consumer justifies a field (open decision 2). |
| Error-type enum vs method choice | **`chose: <topic>`**, with choice errors derived. `contrasts` only for methods known to compete. | One field carries the wrong-method signal and the pair (open decision 3). |
| MCQ | **Not used.** Method choice is answered free-response. | Recognition inflation (Kang 2007). |
| Next review after a failed probe | **From the first try:** 1 day if missed, 2 if helped. | A same-day retry does not erase a failure. |
| First-learning day | **Best grade counts;** the first retrieval is a probe. | Initial criterion; retention needs later probes. |
| Massed daily practice | **Practice days count only failures.** | Spacing, not repetition, earns the next rung. |
| `event` ids vs duplicate window | **A 30-minute window;** no ids. | Retries ask different questions, so only re-sent saves stay identical. |
| No new topics while a backlog exists (survey) | **Not enforced.** The cap of 5 plus `pace` show the trade-off. | Topics, not cards, bound the load. |
| Learner approves drafted prompts (survey) | **No.** The brain dump is the generation step. | Speculative benefit; adds a closing ritual. |
| Daily reminder (survey, science) | **Dropped** (user decision). | Every session starts with the review anyway. |

## 6. MCP surface and skill changes

**Tools.** The tool set is unchanged.

- `resume`: `due` capped at 5 with `points`, plus `new_week`.
- `plan`: `week` per course, and `runup` when an exam is within 21 days.
- `SAVE_RULES`: gains `review.points`, `contrasts` and `chose`, and the
  30-minute duplicate wording.

**Prompts:**

- `study`: unchanged.
- `review`: today's review protocol (§4A) plus `resume`.
- `plan_week`: the week protocol (§4C) plus `plan --all`.
- `mock_exam(course?, minutes?, part?)`: the written or oral mock protocol
  (§4D) plus `resume`. It never mentions `kind: exam`.

**SKILL.md:**

- the review protocol (§4A, about eight lines);
- "a mock replaces the day's review for the topics it covers";
- the unwatched-work rule;
- the closed-notes preference;
- the open-start order: review, then the week offer when `new_week`, then the
  session.

**practice.md** is rewritten around §4B–D, replacing "Reviews and spacing",
"Mixing methods", "Confidence and self-reports" (self-reports stay) and "Oral and
mock examinations", including the run-up table. **records.md** gains the verdict
rule, the three fields, correction dating and the duplicate window. The total
skill text should not grow by more than about 15%.

## 7. Build plan

Sizes: **S** ≈ half a day, **M** ≈ 1–2 days of agent work, with tests and
documentation. Every phase:

- passes `python tools/check.py learning`;
- updates `behavioral-acceptance.md`;
- ends by rebuilding `tutor-claude.zip` with `python -m learning.install`,
  re-uploading it in Claude Desktop, and restarting the `learning` server.

### Phase 1: verdicts and honesty fixes (M)

**Changes:**

- §3.1 in `progress.py`;
- correction dating and ordering;
- the `uncertain` grade cap;
- the 30-minute duplicate window, reworded everywhere;
- the `mock_exam` prompt;
- the records.md rule;
- `tools/report_verdict_changes.py`, run once and deleted.

**Tests:**

- The bug case: day 1 `solid`; day 5 (a probe) `missed` then correct. Expect
  `independent` and `lapsed`, next review on day 6, `unaided_days` 1.
- Learning day: a partial brain dump after an unaided correct gives `solid`
  (best grade), and the topic is not lapsed.
- Multi-day teaching: day 2 assisted attempts before the expected due date
  change nothing. An unaided incorrect on day 2 gives `missed`.
- First retrieval: introduced on day 1 with no attempts. A day-2 correct
  answer is a probe and `solid`.
- Massed practice: unaided correct answers on days 1–4, with the expected due
  date on day 4. Days 2–3 add nothing; day 4 is the second `solid`.
- A probe's first try is `helped`, then an unaided incorrect comes later:
  `missed`. A first try `solid`, then a later partial: still `solid`.
- `transferred` is reachable on a practice day, and unreachable on a `missed`
  day or with `uncertain`.
- An `uncertain` correct answer is never `solid`; an `uncertain` incorrect one
  lowers the verdict.
- An `exam` observation always counts as a probe.
- A practice day with a stored due date in the past moves `review.due` to the
  expected due date.
- A correction without `date` takes the corrected observation's date and
  position.
- Duplicates: an identical observation is skipped at 5 minutes and kept at 31.
- The `mock_exam` prompt text contains no `kind exam`.

**Behavioural case:** a review missed and retried in one conversation. Expect
two attempts, the second with a different question. The next review is in 1
day, with no level gain and one save at the end.

### Phase 2: today's review (M)

**Changes:**

- `review.points`, `contrasts`, `chose`, with validation, stripping and
  removal blocking;
- derived `choice_errors` in `weak`;
- `DUE_LIMIT` 5, the §3.4 priority and order, `points` in `due` and
  `TOPIC_DETAIL`;
- the `review` prompt;
- the SKILL.md and practice.md rewrite for A and B.

**Tests:**

- Validation:
  - `chose` is rejected with a correct result, with an unknown topic, or when
    it names one of the observation's own `topics`;
  - a self-contrast is rejected.
- Removal:
  - removing a topic strips it from other topics' `contrasts`;
  - removing a topic that some `chose` names is a validation error.
- Priority: a lapsed topic beats a more overdue one. Within 21 days of the
  exam, a topic without a recent `solid` verdict comes before an overdue one.
- Selection: a cap of 5, with `due_more`.
- Order:
  - a prerequisite precedes its dependent even at lower priority;
  - a competing partner follows immediately once its needs are placed.
- `points` appear in `due` but not again when the topic is shown whole.
- A topic leaves `due` after a verdict-creating save.
- The resume byte budget holds.

**Behavioural cases** (fresh fixtures plus a held-out variant):

1. An open start with three due topics, two of them competing:
   - adjacent order;
   - correct answers get one line, and the next question comes in the same
     message;
   - one save at the end, no recap, about four model calls for three items.
2. A lapsed topic: the tutor asks how sure the learner is. A confident error
   gets an explicit contrast and a rewritten `gap` and `prompt`.
3. A procedural prompt gets a fresh instance.
4. A wrong method is recorded as `chose` on the right topic.
5. A specific request touching a due topic: the tutor first takes an unaided
   try on it, then helps.
6. A session that taught a new topic closes with the prompt and points written
   first, then the brain dump marked against them. A session that taught
   nothing new has no brain dump.
7. A mock on a day with due topics replaces their review.

### Phase 3: week and run-up (S–M)

**Changes:**

- `resume.new_week`;
- `plan.week` (with the replay to the window start);
- `plan.runup` (with the `horizon` passed to `journal_summary`);
- the `plan_week` and `mock_exam` prompts;
- the skill's C and D, including the phase table.

**Tests:**

- `new_week` is true when `last_activity` is in the previous ISO week and false
  within the same week. A year boundary uses the ISO year.
- The replay equals a recomputation on a truncated record. `levels` lists only
  changed topics.
- `probes` and `attempts` are counted over the window.
- `runup` is present only within 21 days.
- `study_days` counts windows up to exam − 8 from a synthetic `PROTOCOL.md`,
  and `pace` divides by it.
- A Journal error or zero study days omit `study_days` and `pace`.
- `unready` uses the 14-day window.

**Behavioural cases:**

- The first session of a new week offers the look-back once, after the review.
  The second session that week does not.
- "Com'è andata la settimana?" is answered without percentages and proposes a
  mixed set.
- A photographed written mock: a confirmed transcription, per-question
  attempts, a score only with a rubric.
- A 10-minute oral with three-column feedback.

## 8. Rejected

| Idea | Reason |
| --- | --- |
| Daily reminder | user decision; the session opens with the review |
| Automatic FIRe credit | untested; inflates prerequisites |
| FSRS/HLR fitted schedulers | need many outcomes per atomic item; a topic gets 5–10 per semester |
| Again/Hard/Good/Easy self-rated ease | ambiguous; unsupported for math |
| Streaks, XP, badges, leaderboards | unstable or negative effects; people quit when streaks break |
| Mastery %, "% ready", completion bars | inflate perceived competence |
| MCQ drills | recognition inflation |
| Bulk AI card generation from PDFs | volume without diagnosis |
| An item bank (several stored items per topic) | one prompt plus key points, with tutor-generated variants, covers the loop |
| A stored `confidence` field and a calibration line | no consumer strong enough; ask in the moment on lapsed topics |
| An `error` enum | `chose` carries the only error type the loop acts on |
| A `grader` field, a key checker, `event` ids | chat only; the tutor judges; the duplicate window suffices |
| Mock marks, a task clock, `exam.exclude`, a review forecast, a stored run-up phase | no step of the loop needs them |
| `hint_level`, `format`, response-time fields | `help` text carries the hint tier |
| A dashboard | views stay on request, in chat |
| Remote connector or cloud tasks | expose study data |

## 9. Later, only if model usage becomes the bottleneck

The click-test showed that cards from the local stdio server render in Desktop
chat with Temml MathML, and that app-only tool calls run without prompts. But
`ui/message` only pre-fills the composer behind a caution banner, and neither
`ui/update-model-context` nor `structuredContent` reaches the model.

If chat reviews ever cost too much of the weekly limit, the one card worth
building is a **review deck**:

- today's `due` with zero model calls after opening;
- mechanical commit-before-reveal;
- a self-check against `points`.

It would need:

- a `grader` field (self-grades counting for scheduling and `independent`,
  never `retained`);
- app-only `check`/`record` tools;
- `event` ids;
- results reaching the tutor only through `resume`.

A stdlib numeric-sampling checker for sourced final answers would come with it.
Mock, predict-then-see and progress-map cards were rejected even then. The
prototype is in `/tmp/mcp-apps-proto/`.

## 10. Open decisions (with recommendations)

1. **Schema:** stay on schema 6, additive (*recommended*: no stored shape
   changes, no migration), or bump to 7 as a clean marker.
2. **Confidence:** no stored field; ask on lapsed topics in the moment
   (*recommended*). The alternative stores `confidence` with a one-in-three
   sample, a derived confident-error flag and a weekly calibration line.
3. **Method errors:** one field, `chose: <topic>` (*recommended*), or an
   `error: recall|choice|execution` enum with contrasts set after each choice
   error.
4. **Run-up phase:** derived by the skill from `days_left` (*recommended*), or
   a stored `plan.runup.phase`.
5. **Early tutor pins:** an attempt before the expected due date is practice,
   so only failures count (*recommended*), or a pinned date always creates a
   probe day. The second needs pin history.
6. **Review size:** 5 topics per course (*recommended*), or a time budget.
7. **Duplicate window:** 30 minutes (*recommended*), or 24 hours plus `event`
   ids.
8. **Run-up horizon:** 21 days (*recommended*), or 14 for short courses.
