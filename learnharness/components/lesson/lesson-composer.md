# Lesson composer

`<LessonComposer />` (`lesson-composer.tsx`): the reading lessons' box at the bottom, lifted from T3 Code's composer (`ChatComposer.tsx`, `ComposerSurface.tsx`; MIT, notice in `T3CODE_LICENSE.txt`). `LessonSessionComposer` wraps it with its own keystroke state, as `ChatSessionComposer` wraps today's. Testids are today's (`composer`, `composer-send`, `photo-attach`, `next-problem-button`), so focus-home, the photo shortcut and the tests find it.

## Anatomy

| Slot | Element | Measured at 1512×982 |
|---|---|---|
| root `data-slot="composer"` | `form` | 16px radius, `card` fill, a 1px hairline at white 5% with a 3% inset highlight on `::after`; 520px wide in the reading column; 110px empty (109.5) |
| body `composer-body` | `div` | padding 16 top and sides, 8 bottom |
| field `composer-field` | `textarea` | 14/22.75 (`text-control`, 1.625), two lines tall (53.5px) growing to 208px, then it scrolls with no bar |
| toolbar `composer-toolbar` | `div` | padding 0 8 8: attach on the left, the host's chips right-aligned 2px apart, then the send |
| chips `composer-chips` | `ComposerChip` | 32px pills, 13px muted, the hover fill; `pressed` reads selected |
| send `composer-send` | `button` | 32px circle, `primary`; 40% while there is nothing to send; a square on `fill-selected` while a turn runs and the field is empty (Stop) |

## Props the candidates use

| Prop | What it does |
|---|---|
| `placeholder` | the field's words; a host names what an open question wants |
| `toolbar` | quiet chips before the send (Hint, confidence), as `ComposerChip`s |
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
