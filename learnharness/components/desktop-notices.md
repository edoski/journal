# Notifications

The Mac app's macOS notifications, very sparing (Edo, 19 Nov 2026: "macOS notifications (VERY sparingly) on the most important key events, like a due review, session or lesson"). The browser never sends any. Tests: `tests/desktop-notices.test.ts`.

| Notice | When | Words | A click opens |
|---|---|---|---|
| Today's plan | at most once a day, when the app is first in use that day (its window opening, the Mac waking or unlocking), only when today holds a line and only in his study hours (today's windows in his Journal, from the first one's start to the last one's end; none on a day the Journal gives no hours) | "Today", then Today's lines by their one name (`lessonTitle`) in Today's order: "Review Binomial distribution, Calculus I review, Continue Rank practice" | Home |
| A course's topic map | the map build he started saved, while no window of the app is focused | the course's name, then "Its topic map is ready" | the course page |
| A new lesson | its opening turn (the tutor's plan and first question) settled with the tutor's answer, while no window of the app is focused | the lesson's title, then "Your turn" | the lesson |

Nothing else: no reminders, no repeats, no streaks, no counts. Each notice has an id (`plan:<day>`, `map:<course>:<when>`, `lesson:<id>`) and the shell shows an id once; the day's plan id is kept in `userData/notices.json`, so a relaunch never repeats it. Settings, General, "Study notifications" turns them all off (`settings.json` `notifications.enabled`); macOS's own permission and Focus apply on top.

## Parts

- `desktop-notices.ts`: the rules and words, pure (`planNotice`, `workNotice`, `inStudyHours`); the words are `NOTICE_WORDS` in `study-words.ts`.
- `desktop-notice-bridge.tsx`: in the app shell; offers the plan on mount and on `lh:in-use`, and the server's `work-finished` events; opens a clicked notice's place (`lh:open`).
- `electron/main.cjs` (`installNotices`, `showNotice`, `openNoticePlace`): shows a notice at most once, holds a work notice while a window is focused, and logs each notice shown or held in `userData/logs/main.log`.
- `src/server/work-finished.ts` and `course-map.ts` (`onBuilt`): announce `work-finished`; `study.ts` (`todayHours`) gives Home's read today's study windows.
