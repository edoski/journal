# Page frame

One frame for every page with a head over a body (`page-frame.tsx`): the course page and the topic page use it, so the two read as one family (Edo's ruling, 13 Nov 2026: both pages share one linked-columns layout; the round-2 evaluation found them in different frames, title weights and action styles). Tests: `tests/page-frame.test.tsx`.

## Parts

| Part | Slot | Notes |
|---|---|---|
| `PageFrame` | `page-frame` | the column (`PAGE_COLUMN`, which Home wears too): centred, up to 80rem (1280px; at Edo's 1512px window with the sidebar open it fills the 1256px beside the sidebar, 1208px of content), 24px sides, 24px under the window's 52px band and above the foot; the head, then the body filling the rest, 20px apart. A page in a scroller that must fit the window adds `h-full` |
| `PageHead` | `page-head` | the head, every line on the column's left edge, in reading order: `page-eyebrow` (a 32px row, 12/16 muted, for a page with a line above its title; the course page and the topic page have none), 4px, the title row (32px at least: `page-title` 20/26 at 500 in full ink, wrapping rather than cut, and `page-actions` at its right end), 8px, then the lines under the title (`page-lines`, 48px at least, the room of two 20px lines 8px apart): `lead` (`page-lead`, optional: what to do next, 14/20 at 500 in full ink, the head's primary line), `standing` (`page-standing`: the facts, 13/18 muted, tabular, wrapping, a 1px by 12px `border` hairline between facts on one line with 12px clear on each side, drawn in the gap before each fact and clipped at the line's left edge, so a fact that wraps starts there with none in front, round 18, m9), then its `children` (a mistake, an error). A 1px `border` at 60% hairline closes the head, 16px under its room, across the column |
| `PageFact` | `page-fact` | one fact of the standing line: a 16px mark, 6px, a few words, on one line |
| `PageNotice` | `page-notice` | what a page says in its place, the frame's first row (32px at least, 14/20 muted, wrapping), in its own `PageFrame` at `h-full`: Home, the course page, the topic page and the calendar alike (audit 17 Nov 2026, finding 10). The engine down is `CoursesUnavailable` (`../course-picker.tsx`) in it on every page |
| `PageReading` | `page-notice` `role=status` | every page while it reads: "Reading your courses…" in the notice's place |
| `PagePress` | `page-press` | the page's one press, on the course page's Now and the topic page's Now alike: its word (`pressWord`, `../study-words.ts`: Resume, Review, Continue, Start, Study) and a 16px arrow in a 32px pill in the send button's fill (`buttonVariants` `pill`, 500), centred on its row; the arrow moves 2px while the row (`group/press`) is hovered. Drawn inside the row that is the press, never a control of its own. Edo saw the pill last, on the course page (17 Nov 2026), so it replaced the topic page's word in the accent (audit 17 Nov 2026, finding 2) |

Edo, 14 Nov 2026, on the course page's head: "It's so messy with the four labels… I like its minimalism… it just needs a bit more structure. Maybe something like a few clean minimalist divider lines between the things, reordering them." Three sketches were compared at 1512×982: A, the lead under the title, divided facts, a hairline under the head; B, the same without the facts' icons and with no hairline; C, a hairline between the lead and the facts. A shipped: it keeps the icons he asked for (a few words with an icon), and the hairline under the head closes it off from the columns while the facts stay with what they describe.

Edo's ruling for maps (14 Nov 2026): "You are here" and the topics right after it are whole and readable. Up to 72rem, the course page's map was 696px wide at his window, too narrow for Probability's four next topics at 80% (851px in a row), so Poisson was cut. Up to 80rem, with the linked columns' list at 20rem, the map is 864px and holds them; heads still sit at y=99 and the columns at y=221, now from x=280 on both pages.

Other actions in `actions` are quiet shadcn `Button`s of the row size with a 16px icon and muted words (the course page's Add material), so nothing in the head competes with Now's press under it.

## The window's band

Every page that fills the window (Home, the course page, a topic page, the calendar, the start screen) sits in `WindowPage` (`window-page.tsx`), which draws the window's 52px band first in its DOM: the Mac app's drag region, which Electron resolves in DOM order. The band paints under the page (`-z-10` in the page's own stacking context), so a control drawn in it always takes the click, and the head's actions (`page-actions`) are `lh-no-drag`, so the Mac app hands them the click instead of dragging the window. Round 15, 2 D1: each page drew its own band over a head row that was not positioned, and Mistakes and Context on the course page could not be clicked. Test: `tests/window-band-presses.test.ts` (real Chrome, a browser and the Mac app).

## One height on every page

Every page's head has the same rows at the same heights, whatever it fills them with: the line above the title is kept when a page has none (the course page), and the lines under the title take two lines' room even when a page fills one (the topic page, unless it says a mistake). So the title sits at the same height on every page (y=99 at 1512×982 with the sidebar open) and so does the body under the head (y=221), and moving between the course page and a topic page nothing jumps (round 4: the titles sat at 79 and 99, the columns at 201 and 193). The rows live here, never as offsets on a page. A head that says more than two lines under its title (a topic page with a mistake and a start's error) grows, and only then.

## Notices

Every page says it is reading, or why it can't show, in one part (`PageNotice`) in its frame's first row, where its title or Home's tabs stand on the band's centre line, so the line sits at the same place on every page and the page arriving pushes nothing down. Reading is one sentence on every page, "Reading your courses…" (`PageReading`), never a skeleton of one page's head: the course page drew its head's skeleton, the topic page "Loading…", Home "Reading your courses…" at its column's top left and the calendar the same centred in the window (audit 17 Nov 2026, finding 10). A skeleton fits one page's head only, so Home, the topic page and the calendar would each need their own, and moving between pages on a slow read would show four shapes; one sentence in one row keeps "One height on every page" and Home on one screen. The engine not answering is `CoursesUnavailable` with its fix on every page; the course page's own sentence for it is gone.

## Props

```tsx
<PageFrame className?>               // a div; any div prop
  <PageHead
    eyebrow?={ReactNode}            // the line above the title
    title={ReactNode}               // the page's name
    actions?={ReactNode}            // quiet Buttons
    lead?={ReactNode}               // what to do next
    standing?={ReactNode}           // PageFacts
  >
    {lines under the standing}
  </PageHead>
  {body}                            // the linked columns
</PageFrame>

<PageNotice>{why}</PageNotice>       // in place of the page, in its own frame
<PageReading />                     // while it reads
```

## Sources

The topic page's head (`../unit-inbox/topic-page/topic-head.tsx`: the course line, the 20/500 title, the standing line) and its Now (`../unit-inbox/topic-page/pickup/pickup-parts.tsx`); the course page's head and Now (`../course-page/course-head/course-head.md`).
