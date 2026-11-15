# Exam readiness and open mistakes

What the course page's head says about the exam and the mistakes still open (Edo, 14 Nov 2026; he picked this placement, the head, on 15 Nov 2026): "am I ready for the exam, and where not?", and the mistakes he can see and start fixing. Both come from the engine's `standing` verb, read by `../use-course-standing.ts` (GET `/api/course-standing`, `src/server/course-standing.ts`) in the course frame beside the course itself, and the page draws once both are in, so the readiness line and Mistakes come with the head and never push the page down after it (round 8: they arrived 2.1 s late, and Linear Algebra's head showed readiness only sometimes); a standing that cannot be read never holds the page; the app sorts no topic and finds no mistake itself. `standing-model.ts` words them (pure, tested in `tests/course-standing-page.test.tsx`).

| | What it shows |
|---|---|
| the head's first line | `ReadyLine`: "Ready for the exam"; "Not ready yet in" and the bubbles of the arcs not ready, each showing its arc on the page; "Not ready for the exam yet" when no arc is |
| mistakes | Mistakes, a quiet press before Context, opens a popover of the rows (`mistakes-press.tsx`) |

Topics with no room before the exam lead the line in the warning ink, in the run-up's words ("No room before the exam to start Kernel"); a course the page shows without arcs names the topics not yet solid ("Not yet solid for the exam: Basis and Rank"), else those still to start; without an exam, what the plan does with its reviews (`noExamWords`); nothing when the engine cannot say.

## A mistake's row

`mistake-list.tsx`, `data-slot` `mistake-row`: Today's row at the list's width, 48px. The slip's mark (the one the sidebar and map draw for the topic, else the mistake's own), the topic and its arc's bubble; under it what went wrong in the tutor's words (the diagnosis, else the newest answer) and when ("Today", "3d ago"), with a hand when it had help. Its hint says what it was on and his answer. The whole row starts fixing it as the sidebar's rows do: Resume the session that waits on the topic, else a new session on it (`useStartUnit`). No count anywhere; the newest first. The press does not show when nothing is open.

## Open

- Keyboard: the arrow walk does not reach the mistake rows yet.
- In a course without arcs a topic's row may already say "Mistake to fix"; the mistakes list says what the mistake was.
