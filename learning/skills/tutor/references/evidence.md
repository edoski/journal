# Evidence

Evidence is what the learner did, kept apart from knowledge about the course and from preferences. The record derives levels, verdicts and reviews from the attempts and decides which of them count, so record each attempt as it happened and never claim more than the evidence supports.

## What counts

- A graded question is free response: the learner answers in their own words with their reasoning, rough and unedited. Diagnose from the reasoning; the same wrong answer can come from different gaps.
- A prediction asked before a step, a plot or a run of code is an attempt; what the run reveals is not.
- Your explanations, the learner's questions, "I understand", a finished task and hours studied are not evidence.

## Observations

One entry per actual attempt, external result or explicit self-report. Fields: `topics` and `text` (required), `kind`, `response` (the learner's actual answer, short), `help`, `result`, `sure`, `chose`, `transfer`, `date` (the event day when not today), `task`, `refs`, `corrects`, `uncertain`.

| `kind` | When | Required |
| --- | --- | --- |
| `attempt` (default) | the learner tried something with you | `help` (`"none"` when unaided) and `result` |
| `exam` | graded work from outside the session | `result`, no `help`; counts as unaided |
| `self_report` | the learner's statement about their own understanding | no `result`, `help`, `sure` or `transfer` |

`help` is the strongest support given before or during the attempt, in words: a hint rung, a worked example, a reminder of the method. A solution reproduced right after your explanation, or the same problem re-solved after an example, is assisted. `transfer: true` marks an unaided success on a meaningfully different problem, representation or context than the one taught. `chose` names the topic of a wrongly chosen method; record the attempt on the topic that should have been chosen, with a result that is not `correct`. `uncertain` marks doubtful evidence: possibly read from notes, an illegible symbol, work you did not watch (earlier homework, a pasted solution). An `uncertain` attempt is never `solid`.

A misrecorded observation is superseded by a new one, describing what really happened, with `corrects: ["o7"]`; without a `date` it takes the earliest corrected observation's day and place. Later improvement is simply a new observation.

## Grading

Grade the answer as it stands, in `result`: `correct` (a right guess too, with `sure: "guess"`; the record treats it as helped), `partial` (a right result on reasoning that does not hold) or `incorrect` ("I don't know" included: a gap, not an error).

Classify a miss by its first break and name the class in `text`: cue miss (nothing came to mind), discrimination error (a competing method won; record `chose`), execution slip (the right idea run wrongly), careless, or structural (a misconception; it goes in the topic's `gap`). Before recording an error, check the loaded evidence for it. When it recurs, say so and name the earlier observation, and make the topic's `review.prompt` a problem that invites it.

## Confidence and self-reports

Confidence has three states, never a number: the learner may mark an answer as a guess or as sure, in their own words; unmarked is neutral. Store it as `sure`: `guess` or `confident`, omitted when unmarked (`neutral` is for hosts that ask all three). A confident error, sure and wrong, gets an explicit contrast at once and rewrites the topic's `gap` and `review.prompt`.

A statement about their own understanding ("I never really got this", "I'm fine with determinants") is a `self_report`: it guides what you check next and never counts as performance.

## The learner's work

Transcribe handwritten work with numbered lines, mark what is unreadable and let the learner confirm before you diagnose and cite a line; never diagnose from an unreadable mark. For code, connect the source lines, the method and the output: a program that runs does not validate its method. Keep a locator and a short excerpt in the observation, not a copy.

Your own mistakes are never the learner's: correct the explanation and any record they touched.
