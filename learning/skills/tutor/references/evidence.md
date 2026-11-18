# Evidence

Evidence is what the learner did, kept apart from knowledge about the course and from preferences. The record derives levels, verdicts and reviews from the attempts and decides which of them count, so record each attempt as it happened and never claim more than the evidence supports.

## What counts

- A graded question is free response: the learner answers in their own words with their reasoning, rough and unedited. Diagnose from the reasoning; the same wrong answer can come from different gaps.
- A prediction before a plot, a simulation or a run of code, about what has been taught, is an attempt; what the run reveals is not. A prediction before a step not yet taught is recorded too, as it went, with `predicted: true`: it stays in the history and on the answer, and never counts for levels or reviews, since before the teaching a wrong guess is expected.
- Your explanations, the learner's questions, "I understand", a finished task and hours studied are not evidence.

## Observations

One entry per actual attempt, external result or explicit self-report. Fields: `topics` and `text` (required), `kind`, `response` (the learner's actual answer, short), `help`, `shown`, `result`, `gave_up`, `predicted`, `sure`, `chose`, `transfer`, `date` (the event day when not today), `task`, `refs`, `corrects`, `disputed`, `ruling`, `uncertain`.

| `kind` | When | Required |
| --- | --- | --- |
| `attempt` (default) | the learner tried something with you | `help` (`"none"` when unaided) and `result` |
| `exam` | graded work from outside the session | `result`, no `help`; counts as unaided |
| `self_report` | the learner's statement about their own understanding | no `result`, `help`, `sure` or `transfer` |

`help` is the strongest support given on this question, before or during the attempt, in words: a hint rung, a step worked for them, this question's solution or a worked example of this same problem. A solution reproduced right after you showed it, or the same problem re-solved after its example, is assisted. Teaching the idea is not help, and neither is a worked example of a different problem nor an earlier question's revealed answer: a check after teaching, answered with no hint, is `help` `"none"`. The record already counts the day a topic is learned as helped at best, so naming the lesson as help counts it twice. `shown: true` marks help that showed this question's method or answer before the attempt (its solution, the step worked for them), as against a hint during it. The solution revealed after the learner gives up is not help: `gave_up: true` marks an attempt they abandoned without an answer, with `result` `incorrect`. A request to be taught instead, before any answer, is not an attempt: record nothing. `transfer: true` marks an unaided success on a meaningfully different problem, representation or context than the one taught. `chose` names the topic of a wrongly chosen method; record the attempt on the topic that should have been chosen, with a result that is not `correct`. `uncertain` marks doubtful evidence: possibly read from notes, an illegible symbol, work you did not watch (earlier homework, a pasted solution). An `uncertain` attempt is never `solid`.

A misrecorded observation is superseded by a new one, describing what really happened, with `corrects: ["o7"]`: the original stays visible but stops counting, and without a `date` the correction takes the earliest corrected observation's day and its place in that day's order. Only an observation recorded today can be superseded by an attempt, except by a re-mark the learner asked for (below): an earlier session's attempts stand as recorded, so never regrade them on your own from a transcript you resume. When the learner says an older one was wrong, their statement is a `self_report` that corrects it. Later improvement is simply a new observation, a repair included: never `corrects` a wrong answer the learner then fixed, since the record reads a correct answer after a wrong one as the mistake repaired.

**A disputed mark.** When the learner disputes how an answer was marked (in LearnHarness a dispute arrives as its own message naming the observations; elsewhere, in their words), re-judge it now: read the observation whole and judge its `response` against its question, and the committed answer when you have it, by the same rules as any answer. The dispute is evidence like any other, not a verdict: agree when the answer earned a different mark (a right result the mark missed, help that was not given, a confidence misread), and hold the mark when it stands, never to please or to look strict. Either way record the re-marked attempt: a copy of it with the mark you now judge right, `corrects` naming it, `disputed` with what the learner said was wrong and `ruling` with why the mark stands as it does, in one or two lines. A re-mark may correct an attempt from any day and takes its day and place, so the level and the review date follow the corrected record; re-mark the observation that stands (the newest in a chain of corrections). Then tell the learner your ruling in one or two lines.

## Grading

Grade the answer as it stands, in `result`: `correct` (a right guess too, with `sure: "guess"`; the record treats it as helped), `partial` (part of it right: some of its parts right and others not, or a right result on reasoning that does not hold; when your verdict names a part he got right, it is not `incorrect`) or `incorrect` ("I don't know" included: a gap, not an error).

Classify a miss by its first break: cue miss (nothing came to mind), discrimination error (a competing method won; record `chose`), execution slip (the right idea run wrongly), careless, or structural (a misconception; it goes in the topic's `gap`). A `gap` names only what answers that count showed: never what a prediction got wrong, not even as an aside beside a later miss, since a wrong guess before the teaching is expected. A `gap` is resolved, and set to `null`, only by an unaided correct answer to a question that invites it, on a later day than its repair; a repair or an assisted check the same day rewrites the `gap` to what is still unsure, said to the learner as what goes wrong ("You find the second column as..."), never as an instruction to a later session ("Check that..."): the check itself goes in the topic's `review.prompt`. Before recording an error, check the loaded evidence for it. When it recurs, name the earlier observation in the topic's `note`, and make the topic's `review.prompt` a problem that invites it.

## Confidence and self-reports

Confidence has three states, never a number: the learner may mark an answer as a guess or as sure, in their own words; unmarked is neutral. Store it as `sure`: `guess` or `confident`, omitted when unmarked (`neutral` is for hosts that ask all three). A confident error, sure and wrong, gets an explicit contrast once the answer is settled (in a practice problem, after the learner has found the break or asked for the answer) and rewrites the topic's `gap` and `review.prompt`.

A statement about their own understanding ("I never really got this", "I'm fine with determinants") is a `self_report`: it guides what you check next and never counts as performance.

## The learner's work

Transcribe handwritten work with numbered lines and mark what is unreadable; ask about an ambiguous symbol only when it changes the result, and never diagnose from an unreadable mark. Name the exact page, exercise, line, equation or region you discuss. For code, connect the source lines, the method and the output: a program that runs does not validate its method. Run code when a runtime is available and it helps, and keep executed results apart from static reasoning. Keep a locator and a short excerpt in the observation, not a copy.

Your own mistakes are never the learner's: correct the explanation, and any record they touched today.
