# Lesson composer

`<LessonComposer />` (`lesson-composer.tsx`): the lesson's box at the bottom, lifted from T3 Code's composer (`ChatComposer.tsx`, `ComposerSurface.tsx`; MIT, notice in `T3CODE_LICENSE.txt`). `LessonSessionComposer` wraps it with its own keystroke state. Its testids (`composer`, `composer-send`, `photo-attach`, `next-problem-button`), so focus-home, the photo shortcut and the tests find it.

## Anatomy

| Slot | Element | Measured at 1512×982 |
|---|---|---|
| root `data-slot="composer"` | `form` | 16px radius, `card` fill, a 1px hairline at white 5% with a 3% inset highlight on `::after`; 736px wide in the lesson column (lesson-column.ts); 110px empty (109.5). Nothing around it clips: a wrapper's 20px rounded clip once cut the hairline at every corner |
| body `composer-body` | `div` | padding 16 top and sides, 8 bottom |
| field `composer-field` | `textarea` | 14/22.75 (`text-control`, 1.625), two lines tall (53.5px) growing to 208px, then it scrolls with no bar |
| toolbar `composer-toolbar` | `div` | padding 0 8 8: `composer-leading` on the left (attach, then the host's request icons, 2px apart), `composer-controls` on the right (the host's controls, 4px apart), then the send |
| icons `composer-control` | `ComposerIcon` | 32px circles, 16px icons in muted ink, the hover fill, the attach button's size; `pressed` reads selected; the words are in each one's tooltip and aria-label (Edo, 14 Nov 2026: composer controls are icons, not text chips) |
| send `composer-send` | `button` | 32px circle, `primary`; 40% while there is nothing to send; a square on `fill-selected` while a turn runs and nothing can go: the message field is empty, or the answer waits for the turn to end (Stop; round 10: a dead send arrow showed while the tutor was still writing) |

## Props

| Prop | What it does |
|---|---|
| `placeholder` | the field's words; a host names what an open question wants |
| `leading` | icons after attach (Hint, Show me, Explain instead), as `ComposerIcon`s |
| `toolbar` | controls before the send (how sure he is, the Answer or Ask toggle) |
| `answer: { onSubmit, ready, label? }` | Send and Enter submit an answer while `ready`, whatever the field holds; the send reads "Submit answer" (or `label`), the field "Your answer"; `data-mode="answer"` |
| `head` | a row inside the surface above the field |

Everything today's composer does stays: Enter sends, ⇧Enter is a newline, ⌘Enter sends; the photo button, paste, drop and ⌘⇧P with thumbnails above the field; drafts kept across reload (the lesson's `value` and `revision`); Stop while a turn runs; Next problem and Try again on the empty field.

## States

| State | Treatment |
|---|---|
| field focused | the ring at 50% as a 1px outline over the hairline |
| photo dragged over | the ring outline |
| control focus-visible | 2px ring, the send offset 2px |

Sources: T3 Code `apps/web/src/components/chat/ChatComposer.tsx` (body `px-4 pt-4 pb-2`, footer `px-2 pb-2`, controls `gap-0.5`), `ComposerSurface.tsx` (`rounded-2xl`, the `::after` outline), `ComposerPromptEditorTiptap.tsx` (`max-h-52 min-h-[calc(2lh+--spacing(2))] leading-relaxed`), `ComposerPrimaryActions.tsx` (`size-8 rounded-full`); research-ui.md §1.


## Compact

`compact` (the host wants it compact): while it is, and the field is empty, holds no photos and is not focused, the composer is one row, 44px: the field on one line at the lesson composer's own left inset (12px to the text), send at its end 8px from the edge, the toolbar and the head (a posed question's quote) folded away. Focusing it, or words or photos in it, opens it to this composer exactly as the lesson draws it: the field grows to two lines and the toolbar slides open under it (grid rows 0fr to 1fr, padding and min-height eased over 200ms, none under reduced motion); the field never changes element, so focus is kept. The course page keeps it compact always; a lesson while he reads up its conversation, away from the newest reply (`ReadingUp` in chat.tsx, from use-stick-to-bottom's `isAtBottom`), as T3 Code's composer collapsed (Edo, 17 Nov 2026).
