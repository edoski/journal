# Reviews

## Today's review

1. One line, then the first question: the topic's `prompt` as stored for definitions, statements, conditions and "when does X apply"; for a procedural prompt, a fresh instance asking for the method and the first decisive step (prefer course exercises; solve a generated one yourself first).
2. Wait for the answer with its reasoning; no hints unless asked (a hinted answer is not unaided). With the first question, unless the evidence already carries `sure`, say once that they may add "guess" or "sure" in their own words; unmarked is neutral, and never ask for a number. Correct a confident error (sure and wrong) with an explicit contrast now.
3. Mark against `points` and the reasoning. A correct answer gets one line; a guess (`sure: "guess"`, not mere hedging) or a right answer on reasoning that does not hold (`partial`) is handled as a miss. A miss gets at most three lines on the gap, then a different question on that topic later in the review, until one unaided success.
4. Put the next question in the same message. No recap.
5. Record one attempt per answer, with the question asked as `text`, `response`, `help`, `result`, `sure` and `chose`. A confident error also rewrites `gap` and the `prompt`; broken reasoning rewrites `gap`. Only the first try on a due day counts; retries are relearning.

Ask once per course whether reviews are done with closed notes and store the answer as the course preference `review_notes`; with open notes, attempts are `uncertain`. A mock replaces the day's review for the topics it covers.

## Review prompts and key points

Write them when a session that taught a new topic closes, from the course source. A prompt is one precise idea, answerable in under two minutes, not answerable by copying, and says what it tests; a procedural prompt specifies the structure of a problem, and a misconception probe follows an observed `gap`. Key points are the one to five things a full answer must contain; marking against them keeps reviews honest. Rewrite a conceptual prompt that has become rote.

## Missed reviews and lapses

A missed review is a planning fact, not evidence of forgetting: the topic stays due until it is answered. A topic that lapses again is re-taught in the session, not quizzed again.

## The close

In a session that taught a new topic, unless the learner is leaving, write its `review.prompt` and `review.points`, then ask for a brain dump without notes, mark it against those points and record it as an attempt. Every session ends with a next step, the task's `step` or `path.current` moved on, and the last message is that step itself, not an administrative recap.

## The week

At the first session of a new week, offer a look at the week in one line after today's review. On acceptance, read every course's `week`:

1. Look back in four to six plain lines per course: what moved (`levels`), what is shaky and why, the wrong-method pairs (`choice_errors`), and how many answers were confidently wrong (`confident_errors`). No percentages or streaks.
2. Propose one mixed set per course: four to six problems from the course sheets or past papers on two or three topics linked by `contrasts` or recent wrong-method errors, at level `assisted` or better. Problems do not reveal their type and no two in a row use the same method; each answer starts with the method and a one-line reason, then the solve (paper and photos are fine). Give feedback after each full answer; the set takes 30–45 minutes. The first time, say once that mixing feels harder and works better.
3. The learner decides whether and when.

## Exam run-up

Use the recorded `exam` (format, coverage, criteria, constraints) from [course.md](course.md). Establish only missing information that changes the exercise. If requirements are unverified, describe the practice as provisional; never invent a marking scheme or predict the exam. Within 21 days of the exam the record's `runup` lists the path topics `not_introduced`, the `unready` ones (no `solid` verdict in two weeks) and, when the Journal has a schedule, the `study_days` until a week before the exam and the `pace` of new topics per study day. The phase follows `days_left`:

| Days left | Phase |
| --- | --- |
| 21–8 | today's review plus two mixed sets a week; introduce the remaining path topics at `pace` per study day |
| 7–5 | mock 1 |
| 4–3 | targeted relearning: mock-1 failures, lapsed and `unready` topics |
| 2 | mock 2, or an oral simulation for an oral exam |
| 1 | a light mixed review only |

Each mock answer is an unaided attempt on the topics it genuinely exercised; prerequisites get no implicit credit. A mock replaces the day's review for the topics it covers.

### Written mock

1. Agree the time limit and aids in the conversation. The learner works on paper, times themselves, gets no hints, and sends photos at the end; this counts as watched work.
2. Transcribe the photos with numbered lines and wait for the learner to confirm.
3. Mark each question in three columns: mathematical error, missing justification, presentation. Give a score only against a rubric the learner supplied or a registered marking scheme.
4. Record one `attempt` per question and per topic it genuinely exercised: `help` `"none"` unless help was given after a pause, `refs` to the paper, and `chose` for a wrong method. Graded work from outside the session is the only `exam` evidence.
5. If marking spans sessions, an open task holds the step.

### Oral mock

1. Ask one opening question from `exam.coverage`, weighted to `unready` topics. The learner answers in voice or text.
2. Follow with two or three probes on assumptions, conditions and a concrete consequence. No hints.
3. Give feedback afterwards against `exam.criteria`, in the same three columns.
4. Record one attempt per topic, `uncertain` when a transcription garbled a formula.
