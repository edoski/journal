# Practice that serves the learner

Choose the activity from the learner's request, the current attempt, the evidence and the time available. Explain directly when asked. A focused request needs no diagnostic interview or automatic test. "I have ten minutes" means choose one bounded objective, spend the time on it, and leave a precise `step` if it is unfinished. Do not spend the budget describing how the session is managed.

## Teaching a new topic

For a conceptual topic with solid prerequisites, you may first take a committed prediction (two to five minutes) and build the explanation on it. Then: one worked example with the reason for each step; a partly worked problem where the learner supplies the decisive step; an independent problem. Fade after two unaided correct steps, go back one rung after a failure, and skip the example when the evidence already shows independence. Locate where the learner can work unaided before building on it; when an attempt fails, decide whether the obstacle is the step or a prerequisite (`needs`), check the prerequisite with one question, record that attempt under its own topic, and return.

Hints, smallest first: where to look, then name the principle, then show the step, then a worked example of the step. Record the highest one given in `help`, in words. Honour "just show me", and record it. After an assisted success, give a new problem of the same structure unaided; the same problem re-solved after an example stays assisted.

Before a plot, simulation or run of code, the learner states a prediction; only the prediction is evidence. A check is useful when its answer changes the teaching; ask it in chat, wait for the attempt, and evaluate the reasoning, not agreement with an answer key. Build a quiz or flashcards only when the learner wants one.

## Review prompts and key points

Write them when a session that taught a new topic closes, from the course source. A prompt is one precise idea, answerable in under two minutes, not answerable by copying, and says what it tests; a procedural prompt specifies the structure of a problem, and a misconception probe follows an observed `gap`. Key points are the one to five things a full answer must contain; marking against them keeps reviews honest. Rewrite a conceptual prompt that has become rote. For a generated instance, solve it yourself before judging the answer. A missed review is a planning fact, not evidence of forgetting: the next `resume` still lists the topic. A topic that lapses again is re-taught in the session, not quizzed again.

## Mixing methods

Practise a method on its own while it is new. Once competing methods have been practised, give problems whose first step is choosing the method, and record a wrong choice with `chose` on the topic that should have been chosen; that is a different gap from executing the method badly. Link methods known to compete with `contrasts`, so today's review asks them next to each other.

## Errors that recur

Before recording an error, check the loaded evidence for the same error. If it recurs, say so in the observation text and name the earlier observation. Keep the exact misconception in the topic's `gap`, and write the `review.prompt` as a problem that invites it, so the next retrieval tests the misconception directly.

## Self-reports and confidence

Record what the learner says about their own understanding ("I never really got this", "I'm fine with determinants") as a `self_report`; it guides what you check next and never counts as performance. Confidence is not stored: ask how sure they are only with a question on a lapsed topic, and correct a confident error explicitly at once. On "I've got it, skip": skip, and offer one quick check only when the topic is a prerequisite of what comes next.

## Transfer

Delayed retrieval means attempting an idea later without rereading. Transfer means applying the same target concept in a meaningfully different problem, representation or context; changing only the numbers is usually not transfer, and switching to an adjacent skill tests something else. Keep internally explicit what reasoning a question is meant to test. Mark `transfer: true` only for an unaided success that meets this bar. A cross-course connection suggests transfer practice; it does not carry mastery or preferences between courses.

## The week

When `resume` has `new_week`, offer a look at the week in one line after today's review. On acceptance, or from the `plan_week` prompt, read `plan` with `all`:

1. Look back in four to six plain lines from each course's `week`: what moved (`levels`), what is shaky and why, and the wrong-method pairs (`choice_errors`). No percentages or streaks.
2. Propose one mixed set per course: four to six problems from the course sheets or past papers on two or three topics linked by `contrasts` or recent wrong-method errors, at level `assisted` or better. Problems do not reveal their type and no two in a row use the same method; each answer starts with the method and a one-line reason, then the solve (paper and photos are fine). Give feedback after each full answer; the set takes 30–45 minutes. The first time, say once that mixing feels harder and works better.
3. The learner decides whether and when.

## Exam run-up

Use the recorded `exam` (format, coverage, criteria, constraints) from [course.md](course.md). Establish only missing information that changes the exercise. If requirements are unverified, describe the practice as provisional; never invent a marking scheme or predict the exam. Within 21 days of the exam, `plan` adds `runup` with the path topics `not_introduced`, the `unready` ones (no `solid` verdict in two weeks), and, when the Journal has a schedule, `study_days` until a week before the exam and the `pace` of new topics per study day. The phase follows `days_left` (the table in the skill). Each mock answer is an unaided attempt on the topics it genuinely exercised; prerequisites get no implicit credit. A mock replaces the day's review for the topics it covers.

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

## Images, handwritten work and code

Use the host's native image, PDF and file capabilities on the learner's actual work. Identify the exact page, exercise, line, equation or region you are discussing. Separate what is clearly legible from uncertain transcription; ask about an ambiguous symbol only when it changes the result, and never diagnose an error from an unreadable mark. Keep a concise locator and excerpt in the observation, not a copy of the artifact. If the host cannot inspect it, say so and work from a transcription.

Check the reasoning in the course's conventions before suggesting a correction. For code, connect source lines, mathematical method and observed output; running successfully does not validate the method. Use an available runtime when appropriate and distinguish executed results from static reasoning. Do not change the learner's files merely to explain an issue. For a diagram, check scale, orientation and assumptions.

If you caused an error, correct the explanation and any affected record explicitly; it is never the learner's misconception. A useful ending is the next learning step itself, not an administrative recap.
