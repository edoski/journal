# Memory, planning and host boundaries

These operations serve natural requests: "what do you remember?", "forget that", "don't save this", "what should I study today?". They use the same `learning` tools as teaching. Keep routine inspection quiet.

## Memory questions

Answer "what do you remember?" or "what am I weak at?" in plain language from `resume` (`path` with levels, `weak`, `due`, the open task and evidence), separating what the learner did, your interpretation, and what is uncertain. `show` with a topic handle reads its full history; `show` with `all` returns the whole record when the learner wants everything.

## Forgetting

Translate an explicit request into exact handles and remove them with `forget` and those `handles` (observations, knowledge entries, tasks, sources nothing cites; a topic only together with its observations). `forget` with `course_record` takes the whole course out of every list and the plan (its record stays as the history of his study, so his pace and the days he was told in other courses hold); notes in `study-notes/` are ordinary files the learner deletes. There is no preview: remove exactly what was asked, and ask first only when the request is ambiguous about what it covers. A correction is not erasure: when a record is wrong rather than unwanted, append an observation that `corrects` it (an attempt only for today's records; the learner's own `self_report` for an older one; a re-marked attempt with `disputed` and `ruling` when they dispute a mark, from any day).

Forgetting does not reach copies in other notes or source files, native transcripts, provider history, device backups or cloud recovery; say so when a broad request needs it.

## Not saving

For "don't save this", stop calling `save` for the rest of the conversation and keep teaching from what is loaded; if an attempt was already saved, forget exactly that observation. In Claude Desktop the learner can also block the `save` tool in the connector's settings, or study in an incognito chat. None of this erases what was saved earlier or controls provider retention.

## Planning

`plan` shows this course's reviews the daily plan puts today (`due`) and on the days after (`upcoming`, each with its `planned` day), the open task, the current path position (with its title as `current_title`), the exam countdown and recent study time from the Journal; `plan` with `all` covers every registered course. Each course also has `week` for the last seven days (`levels` that changed, first tries on review days as `probes` with how many were `solid`, `unaided` and `assisted` attempts, `choice_errors` and Journal `minutes`) `plan`, the daily plan (each day's `reviews` and `new` topics, planned with every other course, `final_review_days`, `does_not_fit` when the path no longer fits before the exam, and `unreviewed` when the final review has no room for every taught topic, with `reasons` saying why each is left out), and, within 21 days of the exam, `runup` (`days_left`, `not_introduced`, `unready` and `study_days`); see [reviews.md](reviews.md). Its top-level `capacity` says which weekdays the learner studies and, for reviews and new topics, how many he gets through on each (`reviews_per_day`, `new_per_day`): a limit he has shown by stopping short of what was owed when `limited` names the kind, otherwise the most he has shown he does, with the plan proposing everything owed; learned from every course's record, and its top-level `does_not_fit` names, across courses, what no longer fits before each exam. Use it for "what should I study today/this week?" and to balance courses before exams. It informs a suggestion; the learner decides.

## Sources

`list_sources` lists course material in the course directory (the linked material when the workspace is kept elsewhere; inside a git work tree only files git does not ignore) with suggested handles. `add_sources` registers files; registering an already registered file returns its handle.

## Concurrency and hosts

Saves apply to the latest record under a local lock. Two sessions changing the same field at once: the later one wins, so after working in parallel conversations, `resume` before relying on what the other changed. Shared records give portable continuity, not identical behaviour on every provider. `python -m learning readiness` checks the installed hosts, skill links, registry and course records without changing anything; use it for installation, relocation or a concrete access problem.
