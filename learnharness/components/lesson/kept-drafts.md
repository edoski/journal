# Kept drafts

`kept-drafts.ts`: his typed work and waiting photos, kept on this Mac per box, so nothing he was writing is lost (round 3, 14 Nov 2026).

| When | What happens |
|---|---|
| A reload or a restart | Every box opens with what he had typed and the photos waiting in it: the New lesson box, a lesson's message box, a check or question, a practice problem. |
| Hint on a check | His answer so far goes to the course's carry; the same check asked again opens with it. |
| Done for today with a check open | His answer so far goes to the course's carry; the answer is never shown. When the tutor asks the question again, in this lesson or the next one of the course, it opens with his words. |
| Another question opens while the carry waits | It opens empty, and the carry keeps waiting for its own question (round 6: the Done-for-today draft filled an unrelated Yes/No question). A newer carry replaces it. |
| A question or problem closes | Its box is forgotten. A sent message empties the message box. |
| Another window answers the question he was typing in | His words go to the message box with a line saying so, while nothing is open. When the next question or problem opens they leave the box, unless he typed on from them (`stranded-draft.ts`, kept as `<chat>:rescued`). A question replaced at once by the next takes its draft with it. |
| New lesson with photos | The photos go with the lesson's first message. |

## Scopes

| Scope | Box |
|---|---|
| `new` | the New lesson box |
| `<chat>:composer` | a lesson's message box |
| `<chat>:q:<question key>` | an open check or question (its whole form: choice, thinking, answer, confidence) |
| `<chat>:p:<problem call id>` | an open practice problem's thinking |
| `<chat>:opening` | photos for a new lesson's first message, taken once |
| `carry:<course workspace>` | his words for one question, with that question's words (`question`); taken once, by that question asked again word for word, spacing aside |

A box belongs to the window it was typed in (round 5): words typed in one window never fill a box in another. Each window has an id that survives its reloads (sessionStorage, `lh.window`) and holds a Web Lock named `lh.window:<id>` while it is open. A window opening after another has closed (an app restart) takes the closed window's words and photos for a box it has none in, once; an open window's are never taken.

Words live in localStorage under `lh.kept.<window>|<scope>`, read after mount so the server's page and the first client render agree. Photos live in IndexedDB (`lh-kept`, store `photos`), too large for localStorage. Storage that is full or refused leaves the box working without surviving a reload.
