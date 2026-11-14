# CourseHeader

The course page's header, (course-page.md). `course-header.tsx`, `data-slot="course-header"`; its skeleton `course-header-skeleton.tsx`, `data-slot="course-header-skeleton"`.

## Anatomy

The shared page head (`PageHead`, `../page-frame/page-frame.md`), top to bottom (gap 4):

| Row | Slot | Notes |
|---|---|---|
| title row, 32px | `course-title` in `page-title` | the course's name, 20/26 at 500, wrapping rather than cut |
| | `course-add-material` | Add material: a quiet shadcn `Button` of the row size with a file-plus mark and muted words; it opens `AddMaterialDialog` (`course-manage-dialogs.tsx`), New course's material field for this course, which posts to `app/api/courses/material` and then follows the map growing until Done |
| | `course-action` | the page's press at the right end (`PageAction`): its word in the accent with an arrow, doing what Home's line for this course does: Resume (a link to a session in this course waiting on him since yesterday, the topic page's word), Review, Continue or Start (Home's Continue, which takes up the course's next step) |
| standing, 20px | `page-standing` | 13/18 muted, tabular, 16 between facts; each `page-fact` a 16px mark and a few words: the course's progress with "Some topics on your own" (`courseShareWords` in `../study-words.ts`), a calendar with "Exam in 21 days" (left out with no exam; the one place on the page that says it), a clock with "Studied 2 days ago" or "Not studied yet" |
| next step, 20px | `course-next` | what the press takes up, in Today's words (`stepWords`, or the waiting session's title), 13/18 in full ink, led by Today's 16px icon for why it is next, then `course-next-why`: the reason in a few words ("1w overdue", "Not right last time: Chain rule", "Your turn" in the accent at 500) |

The marks are 16px so the pie and the icons are one size.

## States

- Busy (a lesson starting): the press is disabled.
- The lesson could not start: `course-lesson-error`, one line under the next step in the danger ink ("Couldn’t open the session. Try again."), `role="alert"`, so the feedback sits under the button he pressed. The course frame sets it through `CourseLessonError`, so the page gets it unchanged.
- Loading: the skeleton draws the same three rows at the same heights (a 24px block for the name, a 24px block for the actions, two 14px lines), in the page frame, `role="status"`, "Reading the course"; shadcn `Skeleton` with its pulse off under reduced motion.
- Long names: the name and the next step wrap; the actions and the reason never shrink.

## Sources

The topic page's head and Now press, now the shared page frame; Home's hybrid row (the pie, the reason's icons and short words); one primary action per view (polish principles); the course page research's targets 4 to 6 and 19.
