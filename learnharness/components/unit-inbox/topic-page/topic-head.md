# Topic head

`TopicHead` (`data-slot="topic-head"`), the topic page's head. Props: `{ facts }`. It has no button: the page's action is Now in the history pane (`pickup/pickup.md`).

| Line | Content | Style |
|---|---|---|
| Course | `facts.course.title`, a link to the course's page (`courseHref`, `data-slot="topic-course-link"`) | `text-label` muted, full ink on hover, 2px focus ring |
| Title | `facts.topic.title` | `h1` `text-heading font-medium` (Home's 20/500), row min 32px |
| Head line | the app's one pie (`../../ui/pie.md`, `TopicGlyph`, the one Home's rows and the map's cards draw) leading `facts.standing.words`, which follow the pie's fill ("Right with help" by a three-quarter pie, never "On your own"; `components/study-words.ts`), then each of `facts.marks` as an icon and its words (slip: `CircleXIcon`, review: `HistoryIcon`, the map's and Today's icons), then `facts.studied` flush right | `data-slot="unit-standing"`, `text-row` muted, 20px; the pie and its words `data-slot="topic-standing-words"`, 6px apart, as each mark's icon and words are; 16 between the parts; marks `data-slot="topic-mark"` `data-kind`, 14px icons, wrapping under; a hidden ". " before each mark so a screen reader pauses; "Studied…" `data-slot="topic-studied"`, its own paragraph, `text-label tabular-nums`. Absent when `facts.standing` is null (a topic not started that has a session) |
| Mistake | `facts.mistake`: the engine's diagnosis, else a weak topic's last attempt that was not right, in the tutor's words, through `MathText` (a formula typesets once the tutor writes it as `$…$`) | `data-slot="unit-gap"`, `text-row` at 90% ink |

One left edge, the column's, for every line (Edo, 14 Nov 2026: the head "looks so messy and unstructured": the pie hung on its own edge, the words and the mistake on a second one 32px in). One right edge: "Studied…".
