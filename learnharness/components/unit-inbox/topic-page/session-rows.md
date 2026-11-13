# Session rows

`SessionRows` (`data-slot="topic-sessions"`), the topic's sessions as quiet rows, newest first. Props: `{ entries, title = "Sessions" }`. Renders nothing for an empty list.

- Header: 28px, `text-label font-medium` muted.
- Rows (`data-testid="unit-page-session"`): 40px, Home's row grid with one line (`row-classes.ts`): kind icon 16px muted, the title in `text-row` ink, truncating; trailing `WhyMark` when the session waits or is being written, else how long ago (`agoWords`) in `text-label` muted `tabular-nums`. A hairline above every row but the first. Each row is a link to `/chat/<id>`.
- Past five (`SHOWN_SESSIONS`): one more 40px row, "Earlier sessions" with a chevron that turns (`data-slot="topic-earlier"`, a shadcn `Collapsible`), holding the rest. No count anywhere.
