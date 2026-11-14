# Exam readiness and open mistakes

What the course page says about the exam and the mistakes still open (Edo, 14 Nov 2026): "am I ready for the exam, and where not?", and the mistakes he can see and start fixing. Both come from the engine's `standing` verb, read by `../use-course-standing.ts` (GET `/api/course-standing`, `src/server/course-standing.ts`); the app sorts no topic and finds no mistake itself. `standing-model.ts` words them (pure, tested in `tests/course-standing-page.test.tsx`).

Two candidates, the options of the Exam & mistakes switch (`../standing-variant.ts`, group `standing`), drawn by `standing-body.tsx`; Current is the page as it was. Shipping one deletes the other, Current's pace line and the switch.

| | `head` | `arcs` |
|---|---|---|
| head's first line | `ReadyLine` `where`: "Ready for the exam"; "Not ready yet in" and the bubbles of the arcs not ready, each showing its arc on the page; "Not ready for the exam yet" when no arc is | `ReadyLine` `verdict`: "Ready for the exam" or "Not ready for the exam yet" |
| each arc's line | unchanged | in place of its exam words, how it stands for the exam (`PART_WORDS`): "Solid for the exam", "Not solid yet", "Won't all fit" in the warning ink, each with its mark; an arc off the exam keeps "Not on the exam". The words give way before the arc's name |
| mistakes | Mistakes, a quiet press before Context, opens a popover of the rows | Mistakes to fix, one foldable group under the list, open on arrival |

Both: topics with no room before the exam lead the line in the warning ink, in the run-up's words ("No room before the exam to start Kernel"); a course the page shows without arcs names the topics not yet solid ("Not yet solid for the exam: Basis and Rank"), else those still to start; "No exam day set" without an exam; nothing while the engine is read.

## A mistake's row

`mistake-list.tsx`, `data-slot` `mistake-row`: Today's row at the list's width, 48px. The slip's mark (the one the sidebar and map draw for the topic, else the mistake's own), the topic and its arc's bubble; under it what went wrong in the tutor's words (the diagnosis, else the newest answer) and when ("Today", "3d ago"), with a hand when it had help. Its hint says what it was on and his answer. The whole row starts fixing it as the sidebar's rows do: Resume the session that waits on the topic, else a new session on it (`useStartUnit`). No count anywhere; the newest first. Neither the press nor the group shows when nothing is open.

## Open

- Keyboard: the arrow walk does not reach the mistake rows yet.
- In a course without arcs a topic's row may already say "Mistake to fix"; the mistakes list says what the mistake was.
