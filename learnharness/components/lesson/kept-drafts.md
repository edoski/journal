# Kept drafts

`kept-drafts.ts`: his typed work and waiting photos, kept on this Mac per box, so nothing he was writing is lost (round 3, 14 Nov 2026).

| When | What happens |
|---|---|
| A reload or a restart | Every box opens with what he had typed, how sure he said he was, and the photos waiting in it: the New lesson box, a lesson's message box, a check or question, a practice problem. |
| Hint on a check | His answer so far goes to the course's carry; the check asked again opens with it. The question asked right after a hint or a side question is that question again, in whatever words (round 7: a re-ask that dropped "Say why." lost his work). |
| Done for today with a check open | His answer so far is kept with the lesson, on the question it was left on (`QuestionAnswerData.draft`, sent with the Done for today input): the tutor never reads it and the question's answer is never shown. "Left for next time" shows it as his bubble (with nothing typed, nothing shows under the question: round 16, m16), and the question asked again opens with it, the next question of its kind (the same tool and form, and the same plan step when both name one) in whatever words (round 8), on every way back and in any window, since every way back opens the same record (round 15, 3 m1: it rode the course's one carry slot, which a later lesson's hint replaced, and reopening from Sessions brought nothing back). A view of the lesson already open is told when the question is asked again (`record-changed`). His words in the box since win. Its photos still go to the course's carry. A practice problem's unsent work is dropped (Edo's ruling): its line says "Problem set aside for today", never an empty "Left for next time". |
| Another question opens while the carry waits | It opens empty, and the carry keeps waiting for its own question (round 6: the Done-for-today draft filled an unrelated Yes/No question). A newer carry replaces it. |
| A question or problem closes | Its box is forgotten. A sent message empties the message box. |
| Another window answers the question he was typing in | His words go to the message box with a line saying so, and stay there while the next question is open: the line then says Esc shows them, and Esc back to the answer never moves them into it (`stranded-draft.ts`, kept as `<chat>:rescued` with the question they came from). Once a question after theirs closes, words he left untouched leave the box, and a newer rescue replaces untouched older words rather than merging with them (round 8: they came back during a later hint and merged into the next rescue). |
| Another window asks for a hint on it, or asks the tutor something | His words go to this window's carry, and a line says they come back when the hint is done, or when the tutor asks the question again. |
| A lesson started from a box (New lesson, a course page's composer) | The photos go with the lesson's first message. The box empties only once the lesson has opened: a failed start or a sign-in keeps its words and photos (`start/use-lesson-start.ts`). |

## Scopes

| Scope | Box |
|---|---|
| `new` | the New lesson box |
| `course:<workspace>` | a course page's composer |
| `topic:<workspace>:<topic>` | a topic page's composer |
| `<chat>:composer` | a lesson's message box |
| `<chat>:q:<question key>` | an open check or question (its whole form: choice, thinking, answer, confidence) |
| `<chat>:p:<problem call id>` | an open practice problem's thinking and confidence |
| `<chat>:opening` | photos for a new lesson's first message, taken once |
| `carry:<course workspace>` | his words for one question, with that question's words (`question`) and call (`from`); taken once, by that question asked again word for word, spacing aside, by the question asked right after that call when a hint or a side question left it open, or by the next question of its kind after Done for today set it aside |

A box belongs to the window it was typed in (round 5): words typed in one window never fill a box in another. Each window has an id that survives its reloads (sessionStorage, `lh.window`) and holds a Web Lock named `lh.window:<id>` while it is open. A window opening after another has closed (an app restart) takes the closed window's words and photos for a box it has none in, once; an open window's are never taken.

Words live in localStorage under `lh.kept.<window>|<scope>`, read after mount so the server's page and the first client render agree. Photos live in IndexedDB (`lh-kept`, store `photos`), too large for localStorage. Storage that is full or refused leaves the box working without surviving a reload.
