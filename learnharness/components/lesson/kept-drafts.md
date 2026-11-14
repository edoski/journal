# Kept drafts

`kept-drafts.ts`: his typed work and waiting photos, kept on this Mac per box, so nothing he was writing is lost (round 3, 14 Nov 2026).

| When | What happens |
|---|---|
| A reload or a restart | Every box opens with what he had typed and the photos waiting in it: the New lesson box, a lesson's message box, a check or question, a practice problem. |
| Hint on a check | His answer so far goes to the course's carry; the check the tutor asks again opens with it. |
| Done for today with a check open | His answer so far goes to the course's carry; the answer is never shown. When the tutor asks the question again, in this lesson or the next one of the course, it opens with his words. |
| A question or problem closes | Its box is forgotten. A sent message empties the message box. |
| New lesson with photos | The photos go with the lesson's first message. |

## Scopes

| Scope | Box |
|---|---|
| `new` | the New lesson box |
| `<chat>:composer` | a lesson's message box |
| `<chat>:q:<question key>` | an open check or question (its whole form: choice, thinking, answer, confidence) |
| `<chat>:p:<problem call id>` | an open practice problem's thinking |
| `<chat>:opening` | photos for a new lesson's first message, taken once |
| `carry:<course workspace>` | what the next question in the course opens with, taken once |

Words live in localStorage under `lh.kept.<scope>`, read after mount so the server's page and the first client render agree. Photos live in IndexedDB (`lh-kept`, store `photos`), too large for localStorage. Storage that is full or refused leaves the box working without surviving a reload.
