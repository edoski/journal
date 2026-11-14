# Answer line (Lesson · Slot)

Candidate B of the lesson Explore (`lesson=slot`, `lesson-variant.ts`): each question owns an answer line right under it in the flow, and the composer stays for talking to the tutor. No dock, no cards. Research: `research-ui.md` direction B and its inventory (14 Nov 2026).

## Anatomy

| Slot | Element | Treatment |
|---|---|---|
| root `answer-slot` | `div`, `data-mode` text, single-select or multi-select | no fill, no border; at the end of the transcript column, after everything the tutor wrote |
| choices `slot-choices` | `button` rows | 16px prose, a 20px digit marker that fills `primary` once picked (a square for multi-select); hover and walked rows take `fill-hover`; a plain question adds "Your own answer…" as the last row |
| field `slot-field` | `textarea` | 16px `lh-input`, a 1px `border` hairline under it and nothing else; one line, growing to 256px, no scrollbar; "Your answer", "Anything to add?" under choices, "Work here, think out loud." on a problem |
| actions `slot-actions` | one 32px row | attach, confidence as three 13px words (the picked one underlined), Hint, Show me, Explain instead, all quiet; Check (Send on a plain question) a 32px `primary` pill on the right |

## Behaviour

- **Arrival.** Focus goes to the line when its question arrives, unless he is mid-sentence elsewhere: the field of a typed answer or problem, the line itself for choices.
- **Keys.** Enter checks from the field or anywhere outside one; ⇧Enter is a newline; Esc leaves the field. Choices: 1–9 pick, ↑ ↓ walk, Space picks the walked row. ⌥↑ ⌥↓ move the confidence, ⌘⇧H ⌘⇧S ⌘⇧E are the requests, ⌘⇧P attaches a photo. An empty field's arrows and page keys read the lesson.
- **Answered.** The line becomes his answer in place: the question where it was asked, his words on the same hairline or the picked rows filled, then `MarkLine` (Dispute on hover, ⌘⇧M), then "The answer" or "Model solution" behind a disclosure. A question left by Done for today says "Left for next time" and never shows its answer.
- **Hint.** A request, never an answer: his work waits in the course's carry and fills the line of the question the tutor asks next. The hinted question folds to one muted line, so the page says it once.
- **Kept.** Every change is kept per question on this Mac (`kept-drafts.ts`), and nothing is kept until the restored words are back in the line.

## The composer during a question

It stays, as "Ask about this…", with no photos. The server takes no message while a question waits for its answer, so his words go through the answer events that exist:

| Open | His words go as | The tutor |
|---|---|---|
| a check, prediction or recall | a Hint request carrying them, beside his work so far | replies and asks again; his work fills the new line. The record counts the check as helped |
| a plain question | his reply in his own words (its "own answer") | reads it as his answer; plain questions are never marked |
| a problem | a message about it | replies; the problem stays open |

## Streaming

The line sits at one place in the tree, keyed by its question, so what the tutor writes or draws above it never remounts it: the field keeps its node, its focus and every character. Measured on 14 Nov 2026 in a practice lesson longer than the window, typing while the tutor replied above the line: 709 frames over 12 s, the transcript grew 116 to 221px, the line held the same node and focus in every frame and lost no character; it never moved while words streamed, and when a record landed above it (his request, the working line) it was back in place within 1 to 3 ms, under one frame. On a page shorter than the window it moves down as the lesson fills above it, as any chat does.

## Records it replaces

Answered card, plan card (one line that opens the plan), problem card (the statement as prose), thinking card (his words on the hairline), conclusion card (verdict, mark, solution disclosure), request card (one quiet line), dispute row (a quiet line and his words as a bubble). His messages are bubbles on the right, at most 80% wide (T3 Code).
