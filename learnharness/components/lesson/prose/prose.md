# Prose lesson

The lesson screen, picked by Edo over Current and Slot on 14 Nov 2026. **Thesis:** the tutor asks in its own words, and the one composer becomes the answer field until he answers. No dock, no record cards: the lesson is prose, his bubbles and one mark line. Source: `research-ui.md` direction A and its inventory (14 Nov 2026).

## Files

| File | What |
|---|---|
| `prose-question.tsx` | `ProseQuestion`: a question in the tutor's message, open or answered; `ChoiceRows`, `QuestionWords`, `YourTurn`, `Disclosure` |
| `prose-practice.tsx` | `ProseProblem`, `ProseConclude`, his work, requests and disputes as bubbles |
| `learner-bubble.tsx` | `LearnerBubble`: his words on the right, at most 80% wide, the mark under it; `BubbleMark`; `LearnerWords`: his words exactly as typed, plain text with its line breaks, never Markdown (round 5: `2*30` lost its star, `[2, ∞)` became a blocked link, "$5 and $10" became maths); only maths he wrapped in a delimiter is typeset, by `MathText`'s rule, which keeps money as money |
| `prose-composer.tsx` | `ProseComposer`: the lesson's composer, the answer field while something is open, Ask instead, the quote |
| `prose-answer.tsx` | the open item's picks, confidence and mode, shared by the option rows and the composer |
| `prose-question-data.ts` | pure: what a question asks, the placeholder, readiness, the answer his field and picks make, digit keys |

`chat.tsx` draws each part through these and puts the composer at the foot of the column (`DockOverlay`).

## Moments

| Moment | Prose draws |
|---|---|
| A question waits | its words end the tutor's message under "Your turn" (13px muted); a check re-asked after a hint, its words already above the hint, draws no label: "Your turn" never heads nothing; a choice's options are plain rows, a digit then the words, filled when picked; rows never take focus |
| The composer while open | `data-mode="answer"`; placeholder by what is asked ("Your prediction, and why", "Your answer", "Pick one above, or write your own answer", "Anything to add?", "Work here, think out loud."); icons beside attach: Hint (a lightbulb, checks), Hint, Show me (an eye) and Explain instead (a book) on problems, each its words and key in its tooltip; beside Send, how sure he is (a meter of three bars: one lit for Guessing, two for Neutral, three for Confident, its words in the tooltip; a press never takes his field's focus, so Enter right after sends with it) and the Answer or Ask toggle (`data-slot="composer-mode"`: a segmented pair, the pen for answering, the question bubble for asking, the chosen one filled); photos on text answers and problems |
| He answers | his answer is his bubble; the mark's line sits under it, its facts ending where his words do, Dispute before them on hover; the tutor's committed answer is never drawn: its reply says where his answer stands |
| Hint | his bubble with a lightbulb and "Hint" and his words so far; the re-asked check opens with them in the field |
| Asking (Esc, or the toggle) | the composer is a message to the tutor ("Ask anything. The question stays open." / "Ask anything. The problem stays open."), the same toggle beside Send now on the question bubble; Esc or the pen turns it back. Either stays open (round 6: a side question stamped the question "Skipped" and it came back in full): a question is set aside through the silent dismissal with the reason `asked`, which draws no stamp and tells the tutor to answer his message, then ask the question again word for word; that re-ask draws only "Your turn", as after a hint, and opens with his answer so far (the carry, `../kept-drafts.md`). Another check posed instead, even on the same step, is a new question: its words are drawn and the field starts empty (round 17, M7). A problem stays open as it is. The message goes marked as asked (`asked`), so the tutor reads it as a question, never an answer, and a problem's `conclude` refuses to call it solved and never takes an earlier note's confidence for it. Ask is one message: once the reply settles the composer answers again, unless he is already typing his next question. Answer and Ask each keep their own draft: Esc only switches, so his half answer stays in the answer box while he asks, and his side question stays in the message box (round 8: Esc carried the half answer into Ask, and the side question typed over it destroyed it) |
| He writes while the tutor replies to his work | on a problem the box shows Stop while it is empty and Send once he has written; Send or Enter sends his words to the running reply, as the lesson box's do while the tutor writes, and a refused one comes back as he typed it (round 11, 4 major 1: Enter sent nothing and the words were erased when the problem closed). Words still in the box when the problem closes go to the message box as typed |
| A question or problem opens over his unsent message | one muted line under the transcript: "Your unsent message is kept. Press Esc to see it." It goes once he switches to Ask, types there or the box empties (round 11, 4 minor 2: a message kept while the app was down sat hidden behind Esc after the restart) |
| A problem ends | the mark under the bubble that ended it; "Model solution" behind a disclosure, open after Show me; a skip or Done for today is one muted line |
| Long statement | when the open question's first line has scrolled above the view, the composer quotes it in its head (14px, muted, at most min(40dvh, 20rem), scrolls with no bar); it goes once the line is 40px back in view. Measured on the 3×5 matrix problem at 1512×982: quote 187px, composer 296px |
| The plan | nothing in the transcript beyond the tutor's own words: the top bar's roadmap holds it (../lesson-roadmap.md). Phase seams (opening questions, planning, teaching, practice) draw nothing either |

## Keys

Enter or Send answers; ⇧Enter is a newline. 1 to 9 pick a choice from anywhere but a field holding words. Esc turns the composer between answering and asking while the tutor waits on him, and asks to stop the tutor's reply while it replies (round 9: Esc mid-reply switched to Ask and nothing stopped it); a click on the toggle switches either way (← → move between its two halves when it has focus). ⌘⇧H, ⌘⇧S, ⌘⇧E are Hint, Show me, Explain instead; ⌥↑ ⌥↓ move confidence, as does a press on its meter; ⌘⇧P attaches a photo; ⌘⇧D is Done for today; ⌘⇧M disputes the newest mark. The cheat sheet lists the digits and Esc under Question.

## Kept

What he types while something is open is kept in the same box the docks keep (`<chat>:q:<key>`, `<chat>:p:<call>`), so a reload, Hint and Done for today keep it exactly as they do today; a sent answer forgets it.
