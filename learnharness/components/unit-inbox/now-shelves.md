# Sessions

The one list at the sidebar's foot, under Today (`unit-inbox.md`, "Today on top"): the sidebar holds what to do today and his chats, like T3 Code's sidebar (Edo, 16 Nov 2026). `now-shelves.tsx` (`SessionsShelf`) draws `restSessions` (`now-inbox.ts`) on `UnitShelf`; `now-skeleton.tsx` (`NowSkeleton`) holds the top's place while the courses are read; `sidebar-note.tsx` (`SidebarNote`) is the list's quiet one-line note.

The Learning and On your own shelves are gone (16 Nov 2026): they sorted topics by standing, which the course page's groups, Home's map and the topic page already show per course, while the sidebar mixed every course together. The split itself stays where those pages read it (`restTopics`, through `sidebarSays`).

## Sessions

After a spacer (`mt-auto`) that rests it at the bottom of a short list.

| | |
|---|---|
| holds | every session under the course filter (every course, or the chosen course's), on a topic or on none, less a session Today draws as its own card |
| order | newest first, by its last change, as T3 Code's thread list |
| row | one line, a session (`SessionItem`, the shelf row's anatomy), with its menu |
| status | Your turn, the spinner and Tutor writing, or how long ago in Home's words; a title another listed session shares carries its day ("6 Nov") |
| folded | starts folded (`lh:topic-sidebar-folded`, `{ sessions }`); folded, it keeps in view the open page's row and a session the tutor writes in that Today does not show, with Tutor writing; a 6px accent dot on the header while a hidden session waits on him and Today does not show it (`saidOnTop`) |
| open | 10 rows, then "Show the rest", which shows every row (`UnitShelf`) |

**Today repeats nothing.** T3 Code lists a thread in one place: its inbox puts each thread in one section, and its thread list holds each once. So a session Today draws as its own card is not a Sessions row. A session on a topic Today takes up is still a row: the card is the topic and the row is the session, and the topic card already says its Your turn or Tutor writing, so that session lights no dot and is not kept in view while folded.

The header is the name alone, "Sessions", with no count (`SESSIONS_WORDS`; `tests/sidebar-sessions.test.tsx`, `tests/now-inbox.test.ts`).

## States

| State | List |
|---|---|
| loading | `NowSkeleton`: three 60px skeleton cards on the card pitch, `aria-busy`, an sr-only "Loading" |
| nothing needs him | `SidebarNote` "Nothing needs you today", then Sessions |
| no courses | "No courses yet", then Sessions |
| engine down | the waiting sessions as session cards, then "Couldn’t read your courses", then Sessions |

`SidebarNote`: `data-slot="sidebar-note"`, 12px muted, centred, 24px above and below.

Sources: T3 Code's sidebar (its thread list, newest first, each thread once; its folded shelves at the foot with a 12px header).
