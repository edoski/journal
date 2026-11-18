# Crumbs

`Crumbs` in `crumbs.tsx` (`data-slot="crumbs"`), the app's one "where am I" trail: the lesson's top bar (`../lesson/lesson-top-bar.md`: Course › Topic › title) and the topic page's head (`../unit-inbox/topic-page/topic-head.md`: Course › Arc). Tests: `tests/one-crumbs.test.tsx`. It was the lesson's trail; the topic head's own chevrons and links went (audit 17 Nov 2026, finding 14).

| Part | Notes |
|---|---|
| crumb | any run of course, arc and topic (`Crumb`), each `data-slot="crumb"` with `data-kind`. 14 `muted-foreground`, as wide as its words, giving way first when the trail is full (`shrink-[2]`, truncating; round 8 found "Rank and the column s…" cut at a fixed 160px with half the bar free). A link to its page lifts to full ink on hover, as shadcn's breadcrumb link does, with a 2px focus ring; with no page to open it is plain words. Titles go through `MathText` |
| arc | its one label (`ArcLabel`, `../course-map/arc-label.md`): its number in study order, then its whole name, at the crumb's size; never a pill and never "Course · Arc" text (Edo, 14 and 16 Nov 2026). The link is a `group/arc`, so the pointer brightens the label |
| chevron | `crumb-chevron`, 14px, `muted-foreground` at 60%, between crumbs and before `end`, none trailing |
| end | what closes the trail, not a crumb: the lesson's title (its rename button or input) |

The box is a flex row 6px apart; each place gives it its room (the lesson's top bar grows it, the topic head sets it on its standing line at 20px).
