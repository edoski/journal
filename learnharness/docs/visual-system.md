# Visual system

The app's visual system on one page: what every page draws with, where each value lives, and what measures it. A fix points at a line here; a value not here is a finding. Measured at Edo's window, 1512×982, sidebar open, with `polish measure` on Home, a course page, a topic page, a lesson and Settings (15 Nov 2026). Dark only, SF Pro.

## Type

**Proposed (the Visual system switch): macOS's own text styles,** as Apple publishes them for macOS (Apple HIG, Typography, "macOS built-in text styles", developer.apple.com/design/human-interface-guidelines/typography): size, line height and weight, nothing of our own. Tokens in `app/globals.css` (`@theme`, `--text-*`), only the styles the app uses.

| Token | Apple style | Size / line / weight | Job |
|---|---|---|---|
| `text-large-title` | Large Title | 26 / 32 / 400 | the composer's question |
| `text-title-1` | Title 1 | 22 / 26 / 400 | a page's title, Home's question and every dialog's and sheet's title: one kind of title, one look |
| `text-title-3` | Title 3 | 15 / 20 / 400 | the calendar's day numbers |
| `text-headline` | Headline | 13 / 16 / 700 | an item's title over its own line: a sidebar card, a Today row, the topic page's Now, a mistake, a page's lead, the lesson's name in its top bar |
| `text-body` | Body | 13 / 16 / 400 | everything else that reads: nav, tabs, buttons, page facts, one-line list rows (the course page's topics), the maps' card titles, Settings, the lesson's trail |
| `text-callout` | Callout | 12 / 15 / 400 | meta: a row's course line, standing, slip and reason, section headers, a page's eyebrow, tooltips, a map card's line and the maps' tags (You are here, Next) |
| `text-subheadline` | Subheadline | 11 / 14 / 400 | calendar events, a card's caption in the lesson |
| `text-caption-2` | Caption 2 | 10 / 13 / 500 | the course's two-letter badge |

Weight comes with the style, never from a `font-*` class: emphasis is Headline, and meta that was 500 is Callout at 400 with its ink saying the rest. A map card's title is Body, since Headline's bold cut the current topic's name on its fixed card. Lesson prose stays at his reading size (`text-prose`, Settings), and its markdown headings, tables and KaTeX are the prose's own.

**How the switch works.** Each use names its macOS style and keeps Current's classes under the `system-current:` variant (`text-body system-current:text-row system-current:font-medium`), which applies while `<html>` has no `data-polish-system="proposed"`, so production draws Current. Tokens alone could not switch it: Current's styles fold into macOS's unevenly (14/500 is Body for nav and Headline for a title), and Tailwind's `font-medium` is one number for every role. Shipping deletes every `system-current:` class and the variant: a deletion diff.

**Current:** one name per job, two weights in the chrome, 400 and 500.

| Token | Size / line | Job |
|---|---|---|
| `text-caption` | 11 / 14 | a map card's line, "You are here" (500) |
| `text-label` | 12 / 16 | meta: a row's course line, its standing, slip and reason, a page's eyebrow |
| `text-row` | 13 / 18 | a topic's title on the map and the course page, page facts, tabs |
| `text-control` | 14 / 20 | a lesson's title on Today and the sidebar, a page's lead |
| `text-prose` | 16 / 26 | lesson prose |
| `text-subheading` | 18 / 24 | a dialog's title (600, shadcn's `DialogTitle`) |
| `text-heading` | 20 / 26 | a page's title and Home's question (500) |
| `text-display` | 30 / 36 | the composer's question |

The older `text-xs`…`text-3xl` names resolve to the same sizes (`--lh-text-*`). Maths renders at 1.1em (KaTeX).

## Space, corners, surfaces

- **Space:** Tailwind's 4px steps; the app uses 2, 4, 6, 8, 12, 16, 20, 24, 32. A row's icon to its words is 6 (a 14 mark) or 4 (a 12 mark); a page's head to its body is 20.
- **Corners** (`--radius-*`): 8 for controls and every row with a hover fill (nav, sidebar, course page, Settings, Home's Today on Proposed); 12 for cards and dialogs (map nodes, Settings); 16 and 20 on the lesson's composer and message bubbles.
- **Surfaces:** the background, the sidebar, `card` with a 1px `border` (map nodes, dialogs). Rows have no surface at rest, a `fill-hover` on hover, and a 1px `border` hairline at 50% between them.

## Rows

| Row | Height | Anatomy | Shared component |
|---|---|---|---|
| nav | 32 | 16 icon, 8, words | `nav/nav-row.tsx` |
| course page topic | 32 (36 roomy) | pie 16, 16, title, fact at the end | `course-page/course-topic-row.tsx` |
| Today | 64 | course ring (on the Visual system's Proposed, the course's badge on the course line, `CourseMark`), two lines; standing column (Proposed); reason column flush right | `study-home/agenda-rows/hybrid` |
| sidebar card | 60 or 80 | course badge, course and status, title | `unit-inbox/row-card.tsx` |
| Settings nav | 32, 2 apart | words | `settings/settings-dialog.tsx` |

## Icons

Lucide, as shadcn uses it. 16 for navigation and a page head's facts, 14 for marks inside a row (Today's reason, standing and slip), 12 in a sidebar card's status slot and on a map card (drawn at 80% on Home's map). Lucide draws a 2px stroke on its 24px grid, so the stroke scales with the size: 1.33 at 16, 1.17 at 14. That is the app's one icon weight, lucide's own default: Edo tried a fixed 2px line at every size and found it heavy (15 Nov 2026).

## The standing legend

One mark, one ink and one phrase per state, on Home's Today rows, the topic map's cards, the course page's rows and the topic page's head (`tests/standing-legend.test.tsx` holds them equal).

| State | Mark | Ink | Words |
|---|---|---|---|
| not started | the pie's outline alone (`TopicGlyph`, `ui/pie.tsx`) | muted at 60% | Not started (Home's row says it with "Start …" instead) |
| being learned | a quarter, a half, three quarters | muted | Taught, not tried · Tried, not right yet · Right with help, and the other `RIGHT_WORDS` |
| on his own | full | muted | On your own |
| slipping | the pie, a quarter short of full, on a topic he could do on his own whose newest counted answer is not right (`slipsNow`) | `warning` | Slipping (`SLIPPING_WORDS`), and the slip beside it, each with its own icon (`SLIP_ICON`): Check on your own, Mistake to fix, Not right last time, Check again another day, Sure, but wrong, Mixed up with … |
| review due | History (`WHY_ICON.review`) | muted | Due today · Due since 5 Nov |

Words come from `study-words.ts` and `topic-standing.ts` (`standingOf`, `slipBeside`) only.

## Frame

- **Window band:** 52px at the top, a drag strip; the lesson's top bar sits in it, 16 in from the sidebar.
- **Page column** (`PAGE_COLUMN`, `page-frame/page-frame.tsx`): centred, up to 80rem, 24 sides, 24 under the band and above the foot. At 1512 with the sidebar open it is 1256 wide and its content runs from x=280 to 1488; a page's first line sits at y=76, its title at y=99. The course page, the topic page and Home sit on it.
- **Lesson column:** centred, about 736 wide, as T3 Code's and Claude Desktop's (Edo, 14 Nov 2026).
- **Settings:** a dialog, 880 wide, its own nav column.

## Open (Edo's call)

- The research's budget of one icon stroke would mean lucide's `absoluteStrokeWidth` everywhere.
