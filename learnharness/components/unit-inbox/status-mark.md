# Status mark

One fact about a topic or a session as an icon and a few words ("Your turn", "Tutor writing", "Due since 6 Nov", "At part (c)", a slip, where he stands), drawn by one component from one icon table everywhere it shows (audit 17 Nov 2026, finding 3: seven components and five icon tables drew it, so the tutor writing was a pen on Home and a spinner elsewhere, an open task a clipboard on the calendar, a new topic an open book there, and Your turn muted on a map card). `status-mark.tsx` (`StatusMark`, `FactIcon`) over `fact-icon.ts` (`FACT_ICON`, `Fact`, `factInk`, `reasonMark`). `tests/one-fact-one-look.test.tsx` holds every surface to it.

## The table (`FACT_ICON`)

| Fact (`Fact["kind"]`) | Icon | Ink |
|---|---|---|
| `your-turn`, a turn that waits on him | message-circle-question | `link` |
| `working`, the tutor writing ("Tutor writing", `TUTOR_WRITING`) | the braille spinner (`BrailleSpinner`, its own size and ink) | muted |
| `stopped`, a reply cut off | pause | muted |
| `slip` | its own (`SLIP_ICON`: a miss the crossed circle) | muted |
| `review`, due or overdue | History | muted |
| `task`, an open task, and a lesson he began (`StartsWhy` `begun`) | bookmark | muted |
| `next`, a new topic: today's plan starts it, the calendar's new topic, the topic page's first lesson, the exam's road | arrow-right | muted |
| `after`, `early`, why the plan starts a new topic (`startsFact`) | corner-down-right, fast-forward | muted |
| `back`, when a review comes back | calendar-clock (the calendar's alarm clock means overdue) | muted |
| `here`, You are here | map-pin | muted |
| `exam`, `lesson`, `practice` (the calendar's looks, the topic page's lesson that goes on) | graduation-cap, message-square, dumbbell | `exam` full ink, else muted |
| `standing`, where he stands | the topic's pie (`TopicGlyph`), a dashed ring while there is none | the pie's own |
| `studied`, `unstarted` | none: words alone | muted |

A new topic is Home's arrow, not the calendar's open book: Home's Today row is the surface Edo settled (Hybrid, 13 Nov 2026), the sidebar, the course page and the map already wore the arrow, and the open book means In your material on the topic page.

## Anatomy

| Part | Notes |
|---|---|
| root | `data-kind` the fact's kind, its ink (`factInk`); the surface places it (`className`) and names it (`data-slot`: `today-why`, `today-standing`, `why-mark`, `unit-status`, `course-topic-fact`, `topic-need`, `topic-why`) |
| icon | `FactIcon` in a 16px-tall box, kept whole; none for words alone |
| words | `data-slot="status-words"`, TeX rendered; `whole` keeps them on one line, never cut, else they end in an ellipsis |

## Sizes

| Size | Where | Icon | Layout |
|---|---|---|---|
| `row` (default) | Home's row (`whole`), the course page's Now and rows (`whole`), the topic page's session rows, the calendar | 14px | an inline row, 6px apart |
| `slot` | a sidebar card's status slot; a map card's header strip (its own flex, 4px apart) | 12px | `contents`, so the icon and words are the slot's own items, with a screen-reader comma before the words ("Linear Algebra, Your turn") |

`short`, at size `row`: what it says instead while its words would be cut. The course page's Now gives a new topic's reason (`reasonMark`, "After Expectation") and its plain words ("Planned today") as `short`, measured in the row and again when the row's width changes.

`FactIcon` alone draws a fact's icon where the words sit elsewhere: the topic page's Now (16px), its Next and Scheduled rows, the topic head's marks (`PageFact`), and the calendar's month cells; `label` names it for a screen reader.

Sources: T3 Code's sidebar status label (`size-3` icon, 12px); hybrid.md (Edo, 13 Nov 2026: reasons as icons and a few literal words, never sentences).
