# Prose lesson

The lesson screen, picked by Edo over Current and Slot on 14 Nov 2026. **Thesis:** the tutor asks in its own words, and the one composer becomes the answer field until he answers. No dock, no record cards: the lesson is prose, his bubbles and one mark line. Source: `research-ui.md` direction A and its inventory (14 Nov 2026).

## Files

| File | What |
|---|---|
| `prose-question.tsx` | `ProseQuestion`: a question in the tutor's message, open or answered; `ChoiceRows`, `QuestionWords`, `YourTurn`, `Disclosure` |
| `prose-practice.tsx` | `ProseProblem`, `ProseConclude`, his work, requests and disputes as bubbles |
| `learner-bubble.tsx` | `LearnerBubble`: his words on the right, at most 80% wide, the mark under it; `BubbleMark` |
| `prose-composer.tsx` | `ProseComposer`: the lesson's composer, the answer field while something is open, Ask instead, the quote |
| `prose-answer.tsx` | the open item's picks, confidence and mode, shared by the option rows and the composer |
| `prose-question-data.ts` | pure: what a question asks, the placeholder, readiness, the answer his field and picks make, digit keys |

`chat.tsx` draws each part through these and puts the composer at the foot of the column (`DockOverlay`).

## Moments

| Moment | Prose draws |
|---|---|
| A question waits | its words end the tutor's message under "Your turn" (13px muted); a choice's options are plain rows, a digit then the words, filled when picked; rows never take focus |
| The composer while open | `data-mode="answer"`; placeholder by what is asked ("Your prediction, and why", "Your answer", "Pick one above, or write your own answer", "Anything to add?", "Work here, think out loud."); chips Hint (checks), Hint · Show me · Explain instead (problems), confidence, Ask instead; photos on text answers and problems |
| He answers | his answer is his bubble; the mark's line sits under it, its facts ending where his words do, Dispute before them on hover; "The answer" (a check's committed answer) behind a disclosure |
| Hint | his bubble with a lightbulb and "Hint" and his words so far; the re-asked check opens with them in the field |
| Ask instead (Esc) | the composer is a message to the tutor ("Ask anything. Sending skips this question." / "Ask anything. The problem stays open."), chip "Back to answering" (Esc). A question is set aside through the silent dismissal before the message goes; a problem stays open. Esc carries his words to the other side when that side holds none |
| A problem ends | the mark under the bubble that ended it; "Model solution" behind a disclosure, open after Show me; a skip or Done for today is one muted line |
| Long statement | when the open question's first line has scrolled above the view, the composer quotes it in its head (14px, muted, at most min(40dvh, 20rem), scrolls with no bar); it goes once the line is 40px back in view. Measured on the 3×5 matrix problem at 1512×982: quote 187px, composer 296px |
| The plan | nothing in the transcript beyond the tutor's own words: the top bar's roadmap holds it (../lesson-roadmap.md). Phase seams (opening questions, planning, teaching, practice) draw nothing either |

## Keys

Enter or Send answers; ⇧Enter is a newline. 1 to 9 pick a choice from anywhere but a field holding words. Esc turns the composer between answering and asking. ⌘⇧H, ⌘⇧S, ⌘⇧E are Hint, Show me, Explain instead; ⌥↑ ⌥↓ move confidence, as does a press on its chip; ⌘⇧P attaches a photo; ⌘⇧D is Done for today; ⌘⇧M disputes the newest mark. The cheat sheet lists the digits and Esc under Question.

## Kept

What he types while something is open is kept in the same box the docks keep (`<chat>:q:<key>`, `<chat>:p:<call>`), so a reload, Hint and Done for today keep it exactly as they do today; a sent answer forgets it.
