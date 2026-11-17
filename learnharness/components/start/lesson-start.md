# Starting a lesson

`useLessonStart` (`use-lesson-start.ts`) is the one way a press opens a new session, on every surface: Home's lines, the course page (Now, Check it, a mistake, the exam's ways in, the composer), the topic page, the calendar, New lesson and the sidebar (a topic's press, a Today card). It takes the whole session (`SessionCreation`; `lessonCreation` builds a lesson on an opening, its topics and the lesson it picks up) and a `key`, which `starting` names while the start is in flight; a press while one is in flight does nothing. `take` takes up a course line's move (`courseMove`): the session that holds it opens, else a lesson starts on it. Home's lines, the course page's Now and the sidebar's Today cards all take a line through it. Home and the course page hand their lines' press one function, `takeLine(take, courses, chats)`: the line's step of its course (`courseMove` with that step), else the course's next; so the course page's Now takes up the step its line names, as Home's row does.

- **Signed out:** a signed-out Claude account opens sign-in (`SetupDialog`, drawn by the surface) and nothing is created until it passes.
- **A failed start:** the surface says "Couldn’t open the session. Try again." in its one place and keeps him where he is; nothing sends him to New lesson. The line belongs to the page it happened on, so a surface that outlives the page (the sidebar) drops it when he moves on.
- **A box (New lesson, the course page's composer):** its words and photos (`useStartDraft`) stay in it until the lesson has opened, so a failed start or a sign-in keeps them; the photos go with the lesson's first message.

A surface whose presses sit in several components (the course page, the sidebar) gives them its one start through `StartScope` (`start-scope.tsx`), which draws the sign-in; `useStartScope` reads it and `StartFailure` draws the failure line in the surface's place.

| Surface | Where a failed start says so |
|---|---|
| Course page | under the head's lines (`PageHead` children), for every start on the page, the composer's included |
| Topic page | under the head (`topic-lesson-error`) |
| Home | at the column's foot |
| Sidebar | in the footer, beside Settings: out of the list, so no row moves and it shows at any scroll |
| New lesson | under the box, inset 16 like the field's text |
| Calendar | at the window's bottom centre (it has no page head) |
