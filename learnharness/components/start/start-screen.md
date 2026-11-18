# StartScreen

The start surface: the draft at `/chat/new` (`/` is the study home). The composer and nothing else, as T3 Code's new-chat screen. `data-slot="start-screen"`. T3 Code's new-chat anatomy (research/agent-apps.md).

## Anatomy, top to bottom

| Part | Notes |
|---|---|
| heading | 30/36 (`text-display`), weight 400, tracking -0.025em, centred, 32px above the composer. "What do you want to work on?" |
| composer | the lesson's composer (`../lesson/lesson-composer.md`, `LessonComposer`), centred in a 736px column; the composer sits on the screen's vertical centre: the heading fills the half above, everything else the half below, so a message appearing under it never moves it |
| toolbar | attach, then the course chip (`CourseControl`, in `leading`) as its one control; the tutor routes the request to teaching or practice |
| messages | 16px under the composer, text inset 16 like the field's text: the start's failure ("Couldn’t open the session. Try again.", `useLessonStart`'s), a photo that could not be read, "Pick a course first", the sign-in action ("Sign in to Claude to start", in `link`, while the Claude account in use is signed out), the engine-unavailable line with its fix |

No model chip, thinking level or cost: there is no model or thinking choice (every agent runs Claude Opus 5.5 at high effort), and cost lives in the lesson's details.

## Behaviour

A session is created only when something is sent, words or a photo alone, through the one start path (`useLessonStart`, `lesson-start.md`): a signed-out Claude account opens sign-in first and nothing is created until it passes. The box's words and photos survive a reload (`useStartDraft`, kept as `new`) and stay in it until the lesson has opened, so a failed start or a sign-in keeps them.
