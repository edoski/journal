# CourseHeader

The course page's header, (course-page.md). `course-header.tsx`, `data-slot="course-header"`; its skeleton `course-header-skeleton.tsx`, `data-slot="course-header-skeleton"`.

## Anatomy, top to bottom (gap 8)

| Row | Slot | Notes |
|---|---|---|
| title row, 32px | `course-title` | the course's name, 20/28 at 600 (`text-xl font-semibold`), one line, truncates |
| | `course-add-material` | Add material, left of the primary button: shadcn `Button` outline, size `sm`, a file-plus mark; it opens `AddMaterialDialog` (`course-manage-dialogs.tsx`), New course's material field for this course, which posts to `app/api/courses/material` and then follows the map growing until Done |
| | `course-action` | the page's one primary button at the right: shadcn `Button` size `sm` (32px, radius 8, 13px label at 500) through Home's `LessonButton`, so it does what Home's line for this course does: Resume (a link to a session in this course waiting on him since yesterday, the topic page's word), Review, Continue or Start (Home's Continue, which takes up the course's next step) |
| facts line, 20px | `course-facts` | 13/18 at 400, muted, tabular figures, 16 between facts; each `course-fact` a 16px mark and a few words: Home's `ProgressPie` with "3 of 16 on your own" (the topics the pie counts), a calendar with "Exam in 21 days" (left out with no exam; the one place on the page that says it), a clock with "Studied 2 days ago" or "Not studied yet" |
| next step, 20px | `course-next` | what the button takes up, in Today's words (`stepWords`, or the waiting session's title), 13/18 in full ink, led by Today's 16px icon for why it is next, then `course-next-why`: the reason in a few words ("1w overdue", "Missed Chain rule", "Your turn" in the accent at 500) |

Height 88px. The marks are 16px so the pie and the icons are one size.

## States

- Busy (a lesson starting): the lesson button is disabled.
- The lesson could not start: `course-lesson-error`, one line under the next step in the danger ink ("Couldn’t open the session. Try again."), `role="alert"`, so the feedback sits under the button he pressed. The course frame sets it through `CourseLessonError`, so the page gets it unchanged.
- Loading: the skeleton draws the same three rows at the same heights (a 24px block for the name, the button's 80x32 block, two 14px lines), `role="status"`, "Reading the course"; shadcn `Skeleton` with its pulse off under reduced motion.
- Long names: the name and the next step truncate; the button and the reason never shrink.

## Sources

Topic header (the 20/600 title and the 32px button at its right); Home's hybrid row (the pie, the reason's icons and short words); one primary action per view (polish principles); the course page research's targets 4 to 6 and 19.
