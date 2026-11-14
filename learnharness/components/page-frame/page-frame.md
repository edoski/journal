# Page frame

One frame for every page with a head over a body (`page-frame.tsx`): the course page and the topic page use it, so the two read as one family (Edo's ruling, 13 Nov 2026: both pages share one linked-columns layout; the round-2 evaluation found them in different frames, title weights and action styles). Tests: `tests/page-frame.test.tsx`.

## Parts

| Part | Slot | Notes |
|---|---|---|
| `PageFrame` | `page-frame` | the column: centred, up to 72rem (1152px; at Edo's 1512px window with the sidebar open, 1104px of content between 76px margins), 24px sides, 24px under the window's 52px band and above the foot; the head, then the body filling the rest, 20px apart. A page in a scroller that must fit the window adds `h-full` |
| `PageHead` | `page-head` | the head, every line on the column's left edge, in reading order: `eyebrow` (optional, 12/16 muted: the topic page's course link), 4px, the title row (32px at least: `page-title` 20/26 at 500 in full ink, wrapping rather than cut, and `page-actions` at its right end), 8px, `lead` (`page-lead`, optional: what to do next, 14/20 at 500 in full ink, the head's primary line), 8px, `standing` (`page-standing`: the facts, 13/18 muted, tabular, wrapping, a 1px by 12px `border` hairline between facts with 12px clear on each side), then its `children` (lines under the standing: a mistake, an error). A 1px `border` at 60% hairline closes the head, 16px under its last line, across the column |
| `PageFact` | `page-fact` | one fact of the standing line: a 16px mark, 6px, a few words, on one line |
| `PageAction` | the caller's | the page's press, the topic page's Now press: its word in the accent at 500 and an arrow that steps 2px right on hover, on a quiet shadcn `Button` of the row size (32px, the hover fill, the 2px focus ring). `href` makes it a link; `disabled` greys it and stops a link |

Edo, 14 Nov 2026, on the course page's head: "It's so messy with the four labels… I like its minimalism… it just needs a bit more structure. Maybe something like a few clean minimalist divider lines between the things, reordering them." Three sketches were compared at 1512×982: A, the lead under the title, divided facts, a hairline under the head; B, the same without the facts' icons and with no hairline; C, a hairline between the lead and the facts. A shipped: it keeps the icons he asked for (a few words with an icon), and the hairline under the head closes it off from the columns while the facts stay with what they describe.

Other actions in `actions` are quiet shadcn `Button`s of the row size with a 16px icon and muted words (the course page's Add material), so the press is the only accent in the head.

## Props

```tsx
<PageFrame className?>               // a div; any div prop
  <PageHead
    eyebrow?={ReactNode}            // the line above the title
    title={ReactNode}               // the page's name
    actions?={ReactNode}            // quiet Buttons, then PageAction last
    lead?={ReactNode}               // what to do next
    standing?={ReactNode}           // PageFacts
  >
    {lines under the standing}
  </PageHead>
  {body}                            // the linked columns, or one notice
</PageFrame>
```

## Sources

The topic page's head (`../unit-inbox/topic-page/topic-head.tsx`: the course line, the 20/500 title, the standing line) and its Now press (`../unit-inbox/topic-page/pickup/pickup-parts.tsx`); the course page's head (course-head/course-head.md).
