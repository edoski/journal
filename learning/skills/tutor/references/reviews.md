# Reviews

## Today's review

1. The first question, with nothing before it: the topic's `prompt` as stored for definitions, statements, conditions and "when does X apply"; for a procedural prompt, a fresh instance asking for the method and the first decisive step (prefer course exercises; solve a generated one yourself first).
2. Wait for the answer with its reasoning; no hints unless asked (a hinted answer is not unaided). With the first question, unless the evidence already carries `sure`, say once that they may add "guess" or "sure" in their own words; unmarked is neutral, and never ask for a number. Correct a confident error (sure and wrong) with an explicit contrast now.
3. Mark against `points` and the reasoning. A correct answer gets no feedback line: the next question is the acknowledgment. A guess (`sure: "guess"`, not mere hedging) or a right answer on reasoning that does not hold (`partial`) is handled as a miss. A miss gets where it broke in at most three sentences, then a different question on that topic later in the review, until one unaided success.
4. Put the next question in the same message. No recap.
5. Record one attempt per answer, with the question asked as `text`, `response`, `help`, `result`, `sure` and `chose`. A confident error also rewrites `gap` and the `prompt`; broken reasoning rewrites `gap`. Only the first try on a due day counts; retries are relearning.

When more than five topics are due, or the exam is 21 days away or less and any topic is due, an open-ended start says so in one line (how many are due, and the most overdue) and proposes a review block, today's review and as far past it as the learner wants, before new material; the learner decides. The course's daily plan, when you have it, is the default for the day: its reviews, then its new topics. It holds every review due and each exam's pace of new topics until the learner, across every course, has stopped short of what was owed; from then it holds what he gets through on that weekday and keeps the rest due. It holds nothing on a weekday he does not study. Say it in one line and let the learner change it. When it is done and the learner wants more, offer the next due review or the next topic: what he does beyond the plan raises the pace the plan assumes, and finishing it never lowers it.

Ask once per course whether reviews are done with closed notes and store the answer as the course preference `review_notes`; with open notes, attempts are `uncertain`. A mock replaces the day's review for the topics it covers.

## Review prompts and key points

Write them when a session that taught a new topic closes, from the course source. A prompt is one precise idea, answerable in under two minutes, not answerable by copying, and says what it tests; a procedural prompt specifies the structure of a problem, and a misconception probe follows an observed `gap`. Key points are the one to five things a full answer must contain; marking against them keeps reviews honest. Rewrite a conceptual prompt that has become rote.

## Missed reviews and lapses

A missed review is a planning fact, not evidence of forgetting: the topic stays due until it is answered, and with no exam ahead a right answer after a long gap earns a longer interval. A topic marked `relearn` (missed on its last two counted days) or that lapses again is re-taught in the session, starting with a check of its `needs`, not quizzed again.

## The close

In a session that taught a new topic, unless the learner is leaving, write its `review.prompt` and `review.points`, then ask for a brain dump without notes, mark it against those points and record it as an attempt, with `"introduced": true` on the topic in the same save; its first review is the next day. Every session ends with a next step, the task's `step` or `path.current` moved on, and the last message names it in at most two sentences, not an administrative recap. A question or problem left open is named by its topic or its place, never by what it asks or how to start it: a cue in the close makes the pick-up count as helped. Leave every open task true: rewrite the `step` of each one the session moved, remove one whose goal was met or that the session made obsolete, and set `focus` to the one to continue.

## The week

At the first session of a new week, offer a look at the week in one line after today's review. On acceptance, read every course's week figures:

1. Look back in four to six plain lines per course: what moved (`levels`), what is shaky and why, the wrong-method pairs (`choice_errors`), and how many answers were confidently wrong (`confident_errors`). No percentages or streaks.
2. Propose one mixed set per course: four to six problems from the course sheets or past papers on two or three topics linked by `contrasts` or recent wrong-method errors, at level `assisted` or better. Problems do not reveal their type and no two in a row use the same method; each answer starts with the method and a one-line reason, then the solve (paper and photos are fine). Give feedback after each full answer; the set takes 30–45 minutes. The first time, say once that mixing feels harder and works better.
3. The learner decides whether and when.

## Exam run-up

Use the recorded `exam` (format, coverage, criteria, constraints) from [course.md](course.md). Establish only missing information that changes the exercise. If requirements are unverified, describe the practice as provisional; never invent a marking scheme or predict the exam.

The engine paces the exam from the day its date is saved, planning every course together: on the days the learner studies, at the exam's pace until he has shown he stops short of it and then at the pace he keeps, the daily plan introduces the path's ready topics the exam examines (its scope, [course.md](course.md)) so the last comes four days before the final review (its first retrieval and one solid review fit before it), the nearest exam first, and a pace of a fraction of a topic a day starts one on some days and leaves the others to courses with no exam ahead; in a nearer exam's final week what is left of its path still comes before a later exam's pace, since a topic started late beats one never started. `does_not_fit` names the topics it cannot place, per course and, across courses, in the plan's top-level `does_not_fit`; the course record you open with gives this course's as `does_not_fit` and the day the plan starts each untaught topic as `starts`. When the learner asks how the course fits before the exam, or for a plan by week, answer from those days and the final review, never a schedule of your own: the calendar shows the plan's days and nothing else; say which in one line and let the learner choose what to drop, or study more than planned, which raises the pace the plan assumes. Every topic gets one final review from `final_review_days` before the exam (as many days as his reviews a day need to hold every topic, unless the course says otherwise), spread over his study days to the exam by what each holds, ahead of every other course's reviews; `unreviewed`, in the course's plan and its map, names the taught topics it has no room for, which you can offer when he has time. Beside both lists, `reasons` says why each topic is left out: `no_study_day` (no day he studies is left before the exam, or in the final review), `not_ready` (what it needs is not solid on any study day before the exam), `full` (his limit fills every day it could take) or `too_late` (it starts so near the exam that its first review falls on the exam day); say that reason, not one of your own. Other reviews that do not all fit go by how far past their day each is as a share of its interval, except that an exam course's review its final review would repeat anyway waits behind them, so a course with no exam keeps its memory; and an untaught topic that taught topics need starts before the rest of its path. In the final review a right answer sends the topic's next review after the exam, and a miss comes back the next day. Nothing is planned on the exam day. Once it has passed, the course's reviews go on at their spaced dates, after every other course's; ask whether there is a next exam date. Within 21 days of the exam the course's run-up figures list the path topics `not_introduced`, the taught `unready` ones (no `solid` verdict in two weeks) and the `study_days` he studies before the exam. The phase follows `days_left`:

| Days left (the final review starts `final_review_days` out) | Phase |
| --- | --- |
| 21 to the day before mock 1 | the daily plan's reviews and new topics, plus two mixed sets a week |
| the day before the final review | mock 1 |
| the final review's first day to 2 | the final review as the plan spreads it: every topic once, mock-1 failures and misses relearned the next day; mock 2 on day 2, or an oral simulation for an oral exam |
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
