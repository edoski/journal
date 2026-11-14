# Arc pill

`ArcPill` in `arc-strip.tsx` (`data-slot="arc-pill"`, `data-arc` its handle): one arc as a bubble, the strip's own pill (`toggleVariants` at variant `pill`, `../ui/toggle.tsx`): a hairline bubble, muted words, hover `fill-hover` and full ink, a 2px ring on keyboard focus. Inside, the arc's ring (`Ring`, `../ui/pie.md`) when it has a share, then its name on one line. Sizes: `segment-xs` (20px) keeps a line of facts at its height (the course head, the readiness line, What next, the mistakes); `segment-sm` (24px) is the topic page's head.

With `href` it is a link, not a toggle: it picks nothing on the page it sits in, it goes to `href`. The topic page's head ends its facts row with one (`../unit-inbox/topic-page/topic-head.md`), opening the course page on that arc (`arcHref`); the course head's opens it on the page (`arcOnPage`).

The name is whole (round 6: "Sam…" and "De…" meant nothing after days away). Each place states the widest a pill may grow: the head and the topic head the line's width; What next and the mistakes three fifths of their line (`max-w-3/5`, room for a name like "Sampling distributions"), the title beside it keeping the rest. A name wider than that ends in "…" and shows whole in a tooltip under the pointer (`ArcName`, `data-cut`). The strip (`ArcStrip`) wraps onto another row before it cuts a name, with no scrollbar.

An arc never shows as "Course · Arc" text after a course name (Edo, 14 Nov 2026, three times: sidebar cards, Today's rows, the topic head). Where an arc labels something, it is this bubble or the strip.
