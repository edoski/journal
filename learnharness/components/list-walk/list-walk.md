# List walk

One arrow walk for every page's list: Home's Today (`../study-home/study-home.md`, Keys), the course page's road (`../course-page/split/split-course.md`, Keyboard) and the topic page's sections (`../unit-inbox/topic-page/hybrid/hybrid.md`, Keys). `use-list-walk.ts` (`useListWalk`, and `walkTo`, pure). Tests: `tests/one-list-walk.test.tsx` (the three pages), `tests/course-page-split.test.tsx` (`walkTo`).

Tab is dead app-wide (owner, 17 Sep 2026), so lists walk with arrows. The walk is the course page's (audit 17 Nov 2026, finding 12); before it, Home walked with ↑ ↓ only and the topic page's sections had no walk of their own.

| Key | What it does |
|---|---|
| ↓ ↑ | step to the next or previous stop; at either end focus stays |
| Home, End | jump to the list's first or last stop |
| ↑ on the first stop | steps onto the head's control above the list (`head`): Now's row on the course page, the trail's last link on the topic page. Home's head is the map, whose tabs and cards the walk never reaches (Edo's notes, 15 Nov 2026, N3), so there ↑ keeps the first line |
| ↓ on the head's control | steps back onto the first stop; Esc leaves it |
| Esc | leaves the walk: focus goes, and the next arrow enters again |
| with nothing focused | ↓ or Home enters at the first stop, ↑ or End at the last |

The page names its stops top to bottom (`stops`, read at each key) and wires two handlers: `onKeyDown` on the list, `onHeadKeyDown` on the head. A stop's own keys (a road header's ← →, a row's → onto the map) claim theirs first. The entry with nothing focused listens window-wide in the capture phase, so the page's arrows (`../spatial-arrows.ts`) never take it first; no key fires while he types, holds a modifier, or has a dialog, menu or popover open. Each stop it reaches takes focus without a jump and scrolls into view as little as it can.

| Page | Stops | Head |
|---|---|---|
| Home | Today's lines, the lessons Also today folds in included (`data-line`) | none (N3) |
| Course page | each arc's or group's header, an arc's Check it, the rows of the open one (`walkStops`) | Now's row (`course-action`) |
| Topic page | each row's press in the sections, Now's first: Builds on, Next, Earlier, Show the rest | the head's trail, its last link |
