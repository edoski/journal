# Topic head

`TopicHead` (`data-slot="topic-head"`), the head every topic page candidate opens with. Props: `{ facts, busy, onAct }`.

| Line | Content | Style |
|---|---|---|
| Course | `facts.course.title` | `text-label` muted |
| Title | `facts.topic.title`, with the page's one button at its right | `h1` `text-heading font-medium` (Home's 20/500), row min 32px |
| Button | `ACTION_WORDS[facts.action.kind]`; `data-testid="topic-action"`, `data-action` | `Button size="sm"`, `text-row`; `default` (filled), `outline` for Study; disabled while `busy` |
| Head line | the map's 16px pie (`TopicGlyph`) and `facts.standing.words`, then each of `facts.marks` as an icon and a few words (slip: `CircleXIcon`, review: `HistoryIcon`, the map's and Today's icons), then `facts.studied` flush right | `data-slot="unit-standing"`, `text-row` muted, `gap-4`; marks `data-slot="topic-mark"` `data-kind`, 14px icons, `gap-x-4`, wrapping under the words; a hidden ". " before each mark so a screen reader pauses; "Studied…" `data-slot="topic-studied"`, its own paragraph, `text-label tabular-nums`. Absent when `facts.standing` is null (a topic not started that has a session) |
| Mistake | `facts.mistake`: the engine's diagnosis, else a weak topic's last attempt that was not right, in the tutor's words | `data-slot="unit-gap"`, `text-row` at 90% ink, `pl-8` |

Two left edges: the column's (course, title, pie) and 32px in (the head line's words, the mistake). One right edge: the button and "Studied…".
