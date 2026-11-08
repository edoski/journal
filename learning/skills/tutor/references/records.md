# The course record

A workspace holds one course. Its record has course facts (`title`, `goal`, `exam`, `journal`), `sources`, `topics` (the knowledge path), `observations` (learner evidence, recorded as [evidence.md](evidence.md) says), `knowledge` (what you know about the course), `tasks` (unfinished activities), `focus` (the current task), `path` (study order and position) and course `preferences`. The helper owns ids, dates, revisions and everything it computes.

## Saving

`save` takes one JSON patch as `changes` and applies it to the latest record. Send only what changed; text with invisible characters (zero-width, bidirectional or control characters other than newline and tab) is refused. There is no revision to pass; an identical observation re-sent within 30 minutes is skipped as a duplicate, so an uncertain save can simply be repeated. A genuine new try is a new observation, even with the same question.

| Field | Rule |
| --- | --- |
| `title`, `goal`, `journal`, `focus` | replace; `null` clears |
| `exam`, `path` | merge by field; a `null` field clears it; `null` clears the whole object |
| `sources`, `topics`, `knowledge`, `tasks` | merge by handle; an entry merges by field; a `null` field clears it; a `null` entry removes it |
| `topics[k].review` | merges by field; `null` removes the review |
| `preferences`, `global_preferences` | merge by dimension; `null` deletes; `global_preferences` applies to every course |
| lists (`needs`, `topics`, `refs`, `aliases`, `order`, …) | replace |
| `observations` | a list of new entries, appended |

Handles are 1–64 lowercase letters, digits, `-` or `_`, starting with a letter or digit. Topics, knowledge entries, tasks and sources share one set of handles; `o` followed by digits is reserved for observations. Anything you reference (a topic in an observation, a source in a ref) must exist or be created in the same patch.

A typical turn after a hinted attempt on an exercise:

```json
{
  "topics": {"rank": {"gap": "Counts vectors instead of the dimension of their span"}},
  "observations": [{
    "topics": ["rank"],
    "text": "Gave rank 3 for a matrix with a dependent third row; corrected it after a hint",
    "response": "rank = 3",
    "help": "Pointed at the third row",
    "result": "correct",
    "task": "exercise-5",
    "refs": [{"source": "sheet", "locator": "Exercise 5(b)"}]
  }],
  "tasks": {"exercise-5": {"step": "Justify why the third row adds nothing", "help": "Hint about the dependent row"}}
}
```

The receipt returns new observation ids, the reviews it set, level changes, the current `focus` and `path_current`, the number of due reviews, and `notes` worth acting on (for example a `gap` recorded before the latest attempt).

## Topics and the knowledge path

A topic is one idea or method you would check separately: `title`, `needs` (prerequisite topics; no cycles), `contrasts` (topics whose methods are known to compete; symmetric), `refs`, `aliases` (other names and languages, for search), `introduced`, `gap`, `note`, `review`.

- `introduced: true` when you first teach it; the helper stamps the day and, if nothing is scheduled, a first retrieval for the next day.
- `gap`: the precise misconception or missing piece, phrased so a later session can test it. `null` once evidence shows it resolved.
- `note`: any other judgement worth carrying (fluent but slow, relies on a picture, avoids proofs).
- `review`: `{"in_days": N}` or `{"due": "YYYY-MM-DD"}` pins the next retrieval; `{"prompt": "..."}` says what to ask then and `{"points": ["...", "..."]}` lists the one to five key points an answer is marked against. The fields merge; pin only for a reason, otherwise the helper schedules.

How the helper judges and schedules. Each attempt gets a grade: `solid` (correct, unaided, no `uncertain`, not a guess), `helped` (correct with help, partial, or correct but `uncertain` or a guess) or `missed` (incorrect). Each day of attempts on a topic counts at most once, as one verdict:

- the learning day (the earlier of `introduced` and the first attempt) takes its best grade;
- a day on or after the expected review, or any day with an `exam`, is a probe: the first try counts, lowered to `missed` only by a later unaided incorrect that day, so retries are relearning;
- any other day is practice: only an unaided incorrect counts, so help, retries and massed repetition before the review earn nothing.

After a verdict the next expected review is 1 day after `missed`, 2 after `helped`, and 3, 7, 16, 35, 75 then 160 days after consecutive `solid` verdicts. Before an exam the gap stays within a third of the time left. A save that creates or changes a verdict sets the review to that date; practice on a day when the review was already due moves it there too. A date you pin wins, but an attempt before the expected review is still practice. A `self_report` does not reschedule.

The `standing` of a topic (in `resume` and `show`) gives its level, attempt count, unaided days (`solid` verdicts), the last attempt, `lapsed` (the latest verdict is not `solid` after an earlier `solid` one), `choice_errors` (wrongly chosen methods since the last `solid` verdict, with counts), `confident_errors` (confident errors since the last `solid` verdict) and `stale` (the gap or note was judged on an earlier day than the latest evidence). Levels: `attempted` (only `missed` verdicts), `assisted` (no `solid` verdict), `independent` (one), `retained` (two or more), `transferred` (a `solid` `transfer` attempt on a day not `missed`).

`resume.due` is today's review: at most five topics whose review date has come (`due_more` counts the rest, which carry over, and `due_oldest` names the most overdue when it is among them). Lapsed topics come first, then, in the 21 days before an exam, topics without a `solid` verdict in the last two weeks, then the most overdue, then path order. Prerequisites are listed before the topics that need them, and a competing method follows its partner. A topic leaves the list when a save gives it a verdict.

## Path and tasks

`path` is the course-level study order: `{"current": "rank", "order": ["systems", "rank", "eigen"], "basis": "Syllabus order, weeks 1-4 examinable"}`. Order follows `needs` first, then `order`. Move `current` as the learner advances; there is no `done` flag, because the levels already say what was covered and how well.

A task is one unfinished activity: `title`, `topics`, `refs`, `goal` (what finishing means), `step` (the exact next step or pending question), `help` (support given so far), `note` (a temporary instruction for this task only). `focus` names the task a plain "continue" resumes. Keep the `goal` stable across detours; a detour changes the `step`. When the goal is met, remove the task with `null` and keep the final attempt as an observation.

## Knowledge

Understanding of the course that is costly to rebuild: notation correspondences, which resource is authoritative for what, conventions the learner chose, unresolved conflicts between documents. Fields: `text` (required), `topics`, `refs`, `uncertain` (what is unverified or conflicting), `pinned` (load it in every session, for standing conventions), `aliases`. Pinned entries share 1536 bytes: a save that would take them past it is refused with each one's size, so in that same save merge or shorten them, or unpin those that belong to topics and give them `topics`; a save that changes knowledge reports `pinned` usage in its receipt. Add distinct facts as separate entries. Before rewriting an entry's meaning, read it whole with `show`; keep its `uncertain` unless evidence resolved it.

## Preferences

`{"preferences": {"explanation_depth": "Short first, details on request"}}` sets a course preference; `global_preferences` sets one for every course. One instruction per dimension (`response_format`, `explanation_depth`, `lesson_pace`, `question_style`, `teaching_style`, or another short name); `null` deletes. Record them from the learner's explicit feedback, or a narrow one from repeated feedback; never from silence or praise. A one-answer request ("bullets this time") stays in the conversation; a condition for one unfinished task goes in that task's `note`.

## Sources

`list_sources` lists material in the course directory (inside a git work tree, only files git does not ignore) with suggested handles; `add_sources` registers them, and an already registered file returns its handle. A save may also register `{"sources": {"syllabus": {"path": "admin/syllabus.pdf", "title": "Syllabus"}}}`. A ref is `{"source": handle, "locator": "page, slide, exercise"}`.

## Failures

- **validation**: nothing was saved; the message names the field and the fix. Repair and resend.
- **io**: the record could not be read or written; say so only if it changes what you can teach.
