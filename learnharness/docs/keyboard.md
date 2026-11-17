# Keyboard shortcuts

Decided 2026-09-17 (owner key-map review after the first draft; the whole
app must be usable with the keyboard only — voice first, keyboard as the
second pillar of input).

## Architecture

- **Registry**: `src/core/keyboard.ts` — `KEYBOARD_ACTIONS` holds every
  action: `{ id, label, scope, binding }`. The cheat sheet renders FROM
  the registry, so it can never list a non-functional shortcut.
- **Provider**: `components/keyboard-shortcuts.tsx` — one window-level
  keydown listener (bubble phase, mounted once in AppShell). Normalizes
  keys to `mod+d`-style strings, resolves overrides, dispatches
  `lh:kbd-<action-id>` window CustomEvents. Surfaces listen for their
  own events (matching the pre-existing `lh:chat-renamed` seam style).
- **Persistence**: overrides live under localStorage `lh:keymap` as
  `{actionId: binding}` merged over defaults. No editor yet — the
  settings milestone owns key map editing.
- **displayOnly entries**: the registry also lists SURFACE-owned keys
  (the question dock's row machine) for the cheat sheet only —
  `effectiveKeymap` skips them so bare arrows can never leak to pages
  where the surface isn't mounted.

## Rules

- **Tab is dead everywhere** (owner decision: browser tab-focus
  navigation abandoned). Modifier combos are the only keys that fire
  from typing surfaces; bare keys never do.
- **Esc priority chain**: topmost popover → cheat sheet → abort turn
  (local stream only — a server-side wake turn has
  no client request to abort). Every element/document-level Esc handler
  that acts calls `e.stopPropagation()` so the window chain never
  double-fires. The session search claims Esc to blur back to normal.
- **Focus ring**: browser Tab-focus is gone, so `:focus-visible` stays
  unstyled (an earlier experimental outline was live-rejected — inputs
  showed a red ring on plain click-focus).

## Key map (Wave A — global)

| Action | Binding | Seam |
|---|---|---|
| Where this lesson is | ⌘K | `lh:kbd-open-model-picker` (lesson-roadmap.tsx; the id predates the roadmap and stays, since saved rebinds key on it) |
| Toggle sidebar | ⌘B | `lh:toggle-sidebar` (sidebar.tsx) |
| Sessions search | ⌘⇧F | `lh:kbd-sessions-search` (sidebar.tsx) |
| Walk search results | ↑ / ↓ *in the search field* | sidebar-state.ts: focus goes to the first (↓) or last (↑) result row, course, topic or lesson, and the list's own arrows walk on (sidebar-tree.ts) |
| Open search result | Enter *in the search field* (the first result shown), or on a walked row | sidebar-state.ts |
| ~~Cycle session~~ | ~~⌥↑ / ⌥↓~~ | RETIRED (owner, 2026-10-10) — the search walk above replaces it |
| ~~Open selected session~~ | ~~⌥Enter~~ | RETIRED (owner, 2026-10-10) — the search Enter above replaces it |
| Jump to graph (home) | ⌘G | router.push in keyboard-shortcuts.tsx |
| New session | ⌘N | router.push in keyboard-shortcuts.tsx |
| Rename session | F2 | `lh:kbd-rename-session` (chat.tsx) |
| Cheat sheet | ? | keyboard-shortcuts.tsx |
| Find in this lesson | ⌘F | `lh:kbd-find` (session-find.tsx) |
| Try again | Enter *on the empty message box, or outside any field* | lesson/lesson-composer.tsx `enterAction` (`empty-action`) after a reply that never came or a failed turn |
| Stop the tutor | Esc, or a click on the square | the "Abort this turn?" confirm (abort-turn-dialog.tsx); Enter never stops a turn (round 3, 14 Nov 2026) |
| Go to the newest reply | ⌘↓ | `lh:kbd-jump-latest` (lesson/scroll-cue.tsx; acts only while the cue above the dock shows) |

## Page lists (audit 17 Nov 2026, finding 12)

Home's Today, the course page's road and the topic page's sections walk
one way, through one hook (`components/list-walk/use-list-walk.ts`,
spec `components/list-walk/list-walk.md`):

- **↑/↓** step, clamped at the ends, no wrap. **Home/End** jump to the
  list's first or last row. **Esc** leaves the walk.
- **↑ on the first row** steps onto the head's control above the list:
  Now's row on the course page, the trail's last link on the topic page,
  and **↓** from there comes back. Home's head is the map, which the walk
  never reaches (Edo, 15 Nov 2026, N3), so there ↑ keeps the first line.
- With nothing focused, ↓ or Home enters at the first row, ↑ or End at
  the last (window capture phase, ahead of the page's spatial arrows).
- A page's own keys sit on top: Home's ← →, f, o and c
  (`study-home/home-keys.ts`); the road's ← → on a header and → on a row.

## Model menu keyboard machine (owner polish, 2026-09-17)

(Removed from the settings/cheat-sheet registry 2026-10-10 — obvious
in-field navigation; the behavior below is unchanged.)

While the model menu is open, focus stays in the search field and the
menu owns ↑/↓/Enter inside the input's own handler:

- **↑/↓** walk the filtered results — clamped, no wrap. First ↓ starts at
  the first row; first ↑ at the last. The walked row gets a muted ring and
  scrollIntoView.
- **Enter** picks the walked row, or the **first result** when nothing is
  walked yet (owner decision). Typing a new query resets the walk.
- Clicking and Enter share one `pickModel` path; Esc still closes the menu.

## Question dock row machine (Wave B, owner rounds 2026-09-17)

While a question is expanded, the dock owns ↑/↓/Space/Enter/Tab:

- **↑/↓** walk every answerable row in order — options first, then the
  quiz's "I don't know" / the ask's "Other…" (never both) — **clamped at
  the ends, no wrap** (owner: faster to navigate when the walk stops).
  The walked row gets a subtle ring (`bg-accent/40`) and scrollIntoView.
- **Space** acts on the walked row exactly like a click: multi toggles,
  single displaces; Other also focuses its inline input for typing.
- **Enter** submits once an answer exists (`canSubmit`).
- **Tab (plain)** toggles focus between the thinking field and the
  answer rows — nothing else (owner round 3). From the thinking side it
  focuses the walked (or first) row; from the rows it returns to the
  thinking field. Focus follows the walk while the user is in the rows,
  so focused and walked never diverge. Shift+Tab is NOT the dock's —
  the global handler swallows it everywhere.
- Guards: keys from a typing surface keep their native meaning (arrows
  move the caret, space types — the thinking field is never hijacked),
  and modifier combos are never the dock's — Alt+arrows cycle sessions
  without ALSO walking the question rows (owner round 3). The listener
  lives only while the dock is expanded — collapsed, the bar's native
  Enter expands it.

## Status

- Wave A (global plumbing + shortcuts above) — landed, CDP-verified.
- Wave B (question row machine) — landed, CDP-verified.
- Wave C remainder: ⌘F chat transcript search (new feature, needs its own
  design pass), ⌘I import notes on graph. ⌘F graph node search shipped
  early (owner live-tested the gap).