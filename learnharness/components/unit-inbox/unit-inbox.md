# Topic sidebar and topic page

The Proposed sidebar (`unit-sidebar.tsx`, behind the Sidebar switch) is T3 Code's sidebar with course topics in place of threads. A row is a topic the learner has started; one click opens its page (`unit-page.tsx`, `/unit/<course>/<topic>`). Sessions are never rows under a topic: they live on the topic's page.

## Sections

| Section             | T3 Code's | A topic is in it when                                                                                                                        | Order                                                                                                                         | Row                 |
| ------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| the list, no header | Active    | taught and not yet solid (`introduced`, `attempted`, `assisted`), a session on it waits on the learner, or it is solid and its review is due | waits on the learner, then being learned (the latest studied first), then due reviews (weak first, then the longest past due) | card                |
| Working             | Working   | the tutor is writing in one of its sessions                                                                                                  | the latest studied first                                                                                                      | card                |
| Known               | Snoozed   | solid (`independent` and up) and not due: on the engine's timer, back on the list when its review falls due                                  | the soonest back first                                                                                                        | one line            |
| Other sessions      | Settled   | sessions tied to no listed topic: a general question, or older than the course rule                                                          | newest first                                                                                                                  | one line, a session |

`units.ts` (`buildInbox`) is the one classifier; the engine owns every level and date. A topic not started (`new`) is not listed: the tutor routes there. The shelves sit at the foot (a spacer with `mt-auto`, so on a short list they rest at the bottom), start folded, and show 10 rows, then "Show 25 more". A folded shelf still shows the open row, and Other shows a 6px accent dot when a hidden session waits on the learner. Folding persists in `lh:topic-sidebar-folded`, the course filter in `lh:unit-inbox-scope`.

## Anatomy

| Part         | Element                                           | Notes                                                                                                                                                                                                                                                                                                                                                                             |
| ------------ | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| top band     | empty, `lh-lights-band`                           | only in the Mac app, where the traffic lights sit over it: 52px and the window's drag surface; elsewhere it is not drawn and the sidebar opens on its Home row (Edo, 12 Nov 2026)                                                                                                                                                                                                 |
| home row     | `data-slot="sidebar-home"` and close              | 8px from the top (or the band), a drag surface around its controls; built like the search row so their fills match: the Home link fills the row (house glyph 16px, "Home" 14/500 muted, hover fill; `fill-selected` and full ink on `/`), then Close sidebar (28px) at its right end, in line with New lesson below                                                               |
| calendar row | `data-slot="sidebar-calendar"`                    | under Home, built as Home: the Calendar link fills the row (calendar glyph 16px, "Calendar" 14/500 muted, hover fill; `fill-selected` and full ink on `/calendar`), ending where Home's and Search's fills end, with no button beside it (spec: `components/calendar/calendar.md`) |
| list         | `data-testid="unit-inbox"`                        | scrolls with no visible bar or track (`ScrollArea bar={false}`), as T3 Code's sidebar                                                                                                                                                                                                                                                                                             |
| header       | `data-slot="sidebar-header"`                      | the search field (32px, 14/500, fills on hover and focus) with the course filter (`course-scope.tsx`, a 28px icon button: the filter glyph, or the chosen course's mark; the menu lists each course with its exam countdown) inside its right end, then New lesson (28px, square pen); one icon outside each of the two top rows, so Home's and Search's fills are the same width |
| card         | `data-slot="unit-card"`, `data-testid="unit-row"` | 60px, padding 8 × 10, radius 8: the course mark (16px monogram tile) and name (12px muted) with the status slot, then the title (14/500, full ink). T3 Code's third line has no useful twin here: the standing in words ("Right with help") told Edo nothing (12 Nov 2026), and the topic's page carries it. A topic the tutor writes in recedes to 70% until hovered             |
| one-line row | `data-slot="unit-slim"`                           | 36px, padding 0 10, gap 10: the course mark at 40% and greyscale until hovered, the title (14px muted, full on hover), the status slot                                                                                                                                                                                                                                            |
| status slot  | `data-slot="unit-status-slot"`                    | right-aligned, 12px tabular: Your turn (accent, question glyph), Working (spinner), Review (history glyph), a known topic's return (alarm clock, `in 5d`), else how long ago it was studied                                                                                                                                                                                       |
| row action   | `data-slot="row-action"`                          | over the status slot, which fades out on hover or when the action has keyboard focus: Resume (opens the session waiting on the learner, or running) else Study (starts a session on the topic, opened on its title)                                                                                                                                                               |
| shelf header | `data-slot="unit-section-header"`                 | 32px button, 12/500 muted, the count in tabular figures, a 12px chevron turned -90° folded                                                                                                                                                                                                                                                                                        |
| footer       | `data-slot="sidebar-footer"`                      | Settings as a 28px icon button; background agents above it only while one runs                                                                                                                                                                                                                                                                                                    |

States: hover lifts the row to `fill-hover`, the open row (its page, or one of its sessions) holds `fill-selected` with `aria-current="page"`, keyboard focus is a 2px inset ring with no fill change.

## Width

The right edge resizes the sidebar, as T3 Code's rail does (`sidebar-width.ts`, `sidebar-resize-handle.tsx`, `data-slot="sidebar-resize"`).

| | Value | T3 Code's |
|---|---|---|
| default | 256px (16rem) | `THREAD_SIDEBAR_DEFAULT_WIDTH = 16 * 16` (`threadSidebarWidth.ts`) |
| minimum | 208px (13rem) | `THREAD_SIDEBAR_MIN_WIDTH = 13 * 16` |
| maximum | the window less 640px for the page, never under the minimum | `THREAD_MAIN_CONTENT_MIN_WIDTH = 40 * 16`, `resolveThreadSidebarMaximumWidth` |
| handle | 16px wide, centred on the border, from under the 52px window band to the foot; a 2px line shows on hover, focus and drag | `SidebarRail`: `w-4`, `after:w-[2px]`, `hover:after:bg-sidebar-border` (`ui/sidebar.tsx`) |
| cursor | `w-resize` on the handle, `col-resize` on the body while dragging, with text selection off | `SidebarRail` `cursor-w-resize`; `useResizeDrag` sets `col-resize` and `user-select: none` |
| drag | pointer capture; the width is written straight to the sidebar each frame with its slide off, and stored once the pointer lets go; leaving the window commits where the pointer was; closing the sidebar mid-drag drops the drag | `useResizeDrag` (`requestAnimationFrame`, blur commits, unmount cancels) |
| double-click | back to 256px, the stored width forgotten | `AppSidebarLayout` `SidebarRail onDoubleClick={resetSidebarWidth}` |
| kept | `localStorage` `lh:sidebar-width`, narrowed to fit a smaller window | `chat_thread_sidebar_width`, `resolveInitialThreadSidebarWidth` |
| keyboard | the handle is a focusable `separator` (vertical, with its value, minimum and maximum, controlling the sidebar): ← and → move it 16px, Home to the minimum, End to the maximum; the tooltip says "Drag to resize" | T3 Code's rail has none; WAI-ARIA's window splitter pattern |

The open and close slide, the window's drag band and the Home row with its close button are as before; the handle exists only while the sidebar is open.

## Keyboard

Every row is a Tab stop; `sidebar-tree.ts` moves focus without opening: ↑/↓ step through the rows, Home and End jump to the ends, → opens a folded shelf (or steps into an open one), ← folds it or goes back from a shelf row to its header. Enter opens; Space opens a topic. ↓ from an empty search goes to the first row; with a query, ↑/↓ walk the matching sessions and Enter opens one.

## Search

Topics and sessions whose titles match, under Topics and Sessions, in the rows' own anatomy.

## The topic page

Laid out like a T3 Code thread: the 52px top band, then a 736px column with the course (12px muted), the title (20/600), its standing in a few words (the engine's level and review), and where it slips when the engine calls it weak. Then the session to resume, if one waits on the learner or runs (`data-testid="unit-active-session"`: a card with lesson or practice, its title, Your turn or the spinner, and Resume; the whole card opens it). Then the topic's other sessions as quiet rows, newest first, lesson or practice by their glyph. The composer (`composer.md`, Proposed) is pinned at the foot.

In the Proposed design the header is `topic-header.tsx` (`data-slot="topic-header"`), the page the topic map's node opens: the course, the title with Study at its right (a primary 32px button, `data-testid="study-topic"`, which starts a lesson on the topic in one press; absent while a session waits to be resumed, since Resume is then the page's one button), then the map's 16px pie with the standing in the map's words ("Nearly on your own. A mistake to fix", "On your own. Back Fri 13 Nov"; `topic-map.md`), the mistake the engine diagnosed in its own sentence, and the open task that holds the topic ("In Problem sheet 4, at part (c)"). The old line ("Right with help. Review due") stays only on the Current design; the Map switch that also gated this header went when Edo picked the topic map on 13 Nov 2026.

Behind the Topic switch (`design-variant.ts`, group `topic`, which wears Design's Proposed) the page's body is one of three candidates, `brief`, `steps` and `trail`, drawn by `topic-page/topic-page.tsx` around a shared head, pick-up rows and session rows; Current's body above is not touched. See `topic-page/topic-page.md`.

Sending starts a new session in the topic's course through `useLessonStart` (the start screen's and the study home's path, with its setup guards). Its first message is the prompt, led by the topic's title unless the prompt names it (`openingFor`), so the tutor works on that topic. The session is created on the topic (`topics` on its record, `POST /api/chats`), so its row stays selected and the page lists it before the transcript names the topic.

## Sessions to topics

A session's topics come from its own transcript (`sessionTopicsOf` in `src/core/native-messages.ts`): the topics of each problem it posed and observation it saved, the topics a save introduced (a save sent as JSON text read as the engine reads it), and the topics it was started on. A plan step never counts, whatever its name, and an open task links its sessions to the task, not to each topic it covers. Only topics the course map lists count; a session on two topics is under both. Sessions started on a topic's page are on it from their first turn.

## Sources

T3 Code's sidebar at `pingdotgg/t3code@315b06c5` (`Sidebar.tsx`, `AppSidebarLayout.tsx`, `threadSidebarWidth.ts`, `hooks/useResizeDrag.ts`, `ui/sidebar.tsx`'s `SidebarRail`, `Sidebar.logic.ts`, `sidebar/SidebarThreadRow.tsx`, `ui/collapsible-section-header.tsx`, `lib/sidebarTree.ts`), in its default inbox mode, the one Edo uses: the headerless list of cards (78px there, 60px here without the third line), the folded Working, Snoozed and Settled shelves at the foot with counts, chevrons and the 10-row tail, the open row kept on a folded shelf, the status slot that gives way to one action on hover, the project filter and new-thread button beside the search, arrow keys that move focus without opening. Its thread view puts the composer at the foot of a 46rem column.
