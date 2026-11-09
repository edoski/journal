# LessonCard

`<LessonCard label="Check" note="Confident">…</LessonCard>`: a record in the lesson's reading column. `data-slot="lesson-card"`, the label row `data-slot="lesson-card-label"`. Used by the answered question card, the practice problem and conclusion, the probe summary, the plan map, the malformed-question notice and the research card under the Proposed design.

| Slot | Notes |
|---|---|
| root | radius 12, 1px border (white 8%), `card` fill, padding 16 |
| label | 13/18 (`text-row`) in `muted-foreground`, sentence case, 8px below; an optional note after a middle dot |
| body | the record: prose at 16/26, secondary lines at 13 muted |

Sibling cards share this one surface; nothing nests a second raised surface inside (sub-parts use a hairline or spacing).

Sources: T3 Code cards (radius 12, white 8% edge on a #1a1a1a fill), Apple HIG grouped content, the plan's "radius 12 for cards and docks" (plan.md, findings 9 and 10).
