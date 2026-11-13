# CourseLegend

The map candidate's legend (map-course.md): one line of the page's groups, each its map mark and its count, each lighting its topics. `course-legend.tsx`; `data-slot` `course-legend` (the group) and `course-legend-fact` (each fact, `data-group` its id). Facts from `legendFacts`, what is lit from `legendLight` (`map-plan.ts`).

## The facts, in the page's group order

| Fact | Counts | Mark |
|---|---|---|
| "7 need you" ("1 needs you") | the page's Needs you group: every topic with a line under its title (`needOf`) | the need line's icon its most pressing topic wears, 16px: ⊗ when a slip needs him (the group sorts slips first), else ↺ a review |
| "3 learning" | the Learning group | a half pie (TopicGlyph) |
| "5 not started" | the Not started group | the dashed ring |
| "1 on your own" | the On your own group: topics he can do on his own with nothing due | the full pie |

One partition: every topic is in exactly one fact, so the counts add up to the course (the research's legend). A group with no topics is left out, so a course with everything learned reads "16 on your own". "On your own" here leaves out a topic whose review is due (it needs him), so it can be smaller than the header's "3 of 16 on your own", which counts every full pie.

## Anatomy

| Part | Notes |
|---|---|
| line | 28px, facts 4 apart; pulled 12 left so the first mark sits on the header's icon edge |
| fact | shadcn `ToggleGroupItem`, `segmented` variant and `segment` size, with no track: a 28px pill, padding 0 12, mark 6 from the words, 13/18 at 400, tabular figures |

## States

| State | Look | Map |
|---|---|---|
| rest | muted ink, pointer cursor | nothing lit |
| pointed | full ink on `fill-hover` | its topics lit, the rest at 35%, after 150ms the area scrolls to them |
| reached by keyboard | full ink, 2px `ring` | as pointed |
| pressed (kept) | full ink on `fill-selected`, `aria-pressed` | its topics lit until pressed again or Esc |

A click's focus lights nothing on its own, so pressing a kept fact again, or Esc, leaves nothing lit even with focus still on it. A pointed fact wins over the kept one while it is pointed at. Nothing is stored: each visit starts with nothing kept.

## Keyboard

One stop (Radix roving focus; Tab is dead app-wide, so focus arrives by a click or Up from the map). Left and Right move along the line, Enter or Space keeps a fact, Esc lets go from anywhere on the page (claimed at the document, the app's one-Esc rule), Down goes to the map.

## Sources

The course page research (`map` direction: a one-line legend of four counted facts that lights its topics); shadcn toggle group (toggle-group.md); chart legends that show the marks they explain and filter on hover and pin on click (Apple's charting guidance); the owner's 13 Nov rule: icons with a few literal words.
