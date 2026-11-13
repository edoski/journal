# Link options (hybrid topic page under Pick up)

The Link switch (`design-variant.ts`, group `link`, options `split` and `connected`, each wearing Design's Proposed, Topic's `hybrid` and Pick up's `sections`). Current keeps the two panes side by side with nothing between them (`PlainPanes`). An option is the component that lays the panes out (`LINK_PANES` in `link-options.ts`, given by `TopicPage`'s `link` prop to `HybridTopic`'s `panes`). Each takes the list and the map already drawn (`PanesProps`) and keeps `data-slot="topic-panes"`.

Edo's ask (13 Nov 2026): tie the list and the lesson's step map together visually, minimal and Apple-like.

| Option | Thesis | How the selected lesson reads | File |
|---|---|---|---|
| `split` | One bounded surface, as Mail or Linear draw a list beside its detail | its row's fill runs flush to the hairline between the panes, so the map reads as that row's detail | `split-panes.tsx` |
| `connected` | The panes as they are, joined by one thin line | a line from the row's right edge down the gap and across to the step its lesson stopped on; pointing at either end lights the other | `connected-panes.tsx` |

## Split

`rounded-xl` with a `border-border/60` hairline, reaching 12px past the column (`-mx-3`) so the rows' icons keep the head's edge; the list's cell `px-3 pt-1` with a hairline on its right, the map the rest. No fill on the surface. A row inside it (`NowRow`, the history's `SessionItem`) drops its radius (`in-data-[link=split]:rounded-none`), so the selected fill meets the surface's edge and the hairline.

## Connected

- One `svg` under the panes (`pointer-events-none`), drawn first so the map's steps paint over the line where it passes them. The path (`connectorPath`, tested): from the selected row's right edge, which its 12px bleed puts in the middle of the 24px gap, down the gap to the step's height, one 8px bend, then across to the step's left edge. A 2px dot at each end. `white/25` at rest.
- It follows the list's scroll and the map's pan and zoom (a `MutationObserver` on the panes' `style`, `data-shown` and `aria-current`, scroll caught on capture, a `ResizeObserver`), measured once per frame, and leaves while either end's middle is out of its pane.
- Two-way hover: pointing at or focusing the selected row or the step it stopped on sets `data-lit` on the panes. The line takes the ring's ink, the row gets an inset ring (`in-data-[lit]:data-shown:ring-1`), and the step a stronger glow (`in-data-[lit]:` on `StepNode`'s current step). Attempts carry no step in the engine's record, so only the lesson's row answers.

## What it changed in shared parts

- `../hybrid/hybrid-topic.tsx`: the `panes` prop, `PlainPanes` by default.
- `../hybrid/history.tsx` (`SessionItem`), `../pickup/pickup-parts.tsx` (`NowRow`) and `../steps/step-node.tsx` (the current step): the `in-data-[link=split]` and `in-data-[lit]` classes, inert outside these options.
- `../topic-page.tsx` and `../../unit-page.tsx`: the `link` prop, read through `useLinkVariant`.

Tests: `tests/topic-page-link.test.tsx`.

## Trade-offs (13 Nov 2026)

- `split` ties the panes by structure, once: the surface and the flush fill say "this list, this detail" without any moving part. It adds the page's one outline.
- `connected` names the exact step, which split leaves to the ring on the map, and its hover answers both ways. The line is one more mark on a quiet page, it runs along the list's right edge, and it hangs on measuring the DOM as the map pans.
