# Inline figure

`inline-figure.tsx`: a tutor's figure (`InlineVisual`) or demo (`InlineDemo`) inside his reply, as the reading lessons draw them (`SubagentSteerCard figures="inline"`). `data-slot="inline-figure"`.

| Part | Treatment |
|---|---|
| frame | the column's width, no border, no caption, 8px above and below |
| demo | a sandboxed iframe (`allow-scripts` only: no same origin, so never the app's storage, cookies or DOM), `srcdoc`, no scrolling; its height its content's (the bridge's `demo-resize`, clamped 80 to 2,400px) |
| demo theme | the app's tokens as `:root` variables (`--foreground`, `--muted-foreground`, `--card`, `--border`, `--primary`, `--ring`, `--danger`, `--success`, `--warning`, `--font-sans`, `--radius`), `color-scheme: dark`, a transparent page in the lesson's text colour and face; injected first, so the demo's own styles win |
| a demo's light page | the bridge reports a light page (`demo-page`); the lesson inverts it to the page's own dark (`FIGURE_ON_DARK`) unless he switched it back |
| figure | the maker's SVG as an image document, inverted to the page's dark by default; a declared width sits at its size |
| controls | top right, only while pointed at or focused: invert, download, and full screen for a figure; the invert choice is kept on the record |
| error | the demo's error chip with Send to teacher, as on the card |

Sources: T3 Code `HtmlRenderFrame.tsx` and `packages/shared/src/htmlRender.ts` (in the flow at reply width, height from the content, tokens injected, "no background, no outer card, border, banner title"); Claude's inline visuals; research-ui.md §1 and §2.

Today's demo builder asks for a light page, which the inversion turns dark; telling it to draw on the transparent themed page waits until a reading lesson ships, since Current's card draws demos on white.
