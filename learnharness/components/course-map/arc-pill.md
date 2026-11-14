# Arc pill

`arc-pill.tsx` (`ArcPill`, `data-slot="arc-pill"`, `data-arc` its handle): one arc as a bubble that opens a page. The arc strip's quiet pill, from the same source (`toggleVariants` at variant `pill`, size `segment-sm`, `../ui/toggle.tsx`): a hairline bubble, 24px, 12px muted words, hover `fill-hover` and full ink, a 2px ring on keyboard focus. Inside, the arc's ring (`Ring`, 14px, `../ui/pie.md`) when it has a share, then its name, one line, a long name ending in "…".

It is a link, not a toggle: it picks nothing on the page it sits in, it goes to `href`. The topic page's head ends its facts row with one (`../unit-inbox/topic-page/topic-head.md`), opening the course page on that arc (`arcHref`).

An arc never shows as "Course · Arc" text after a course name (Edo, 14 Nov 2026, three times: sidebar cards, Today's rows, the topic head). Where an arc labels something, it is this bubble or the strip.
