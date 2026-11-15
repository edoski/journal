# StartScreen

The start surface: the draft at `/chat/new` (`/` is the study home). The composer and nothing else, as T3 Code's new-chat screen. `data-slot="start-screen"`. T3 Code's new-chat anatomy (research/agent-apps.md).

## Anatomy, top to bottom

| Part | Notes |
|---|---|
| heading | 30/36 (`text-display`), weight 400, tracking -0.025em, centred, 32px above the composer. "What do you want to work on?" |
| composer | `Composer` (composer.md), centred in a 736px column; the composer sits on the screen's vertical centre: the heading fills the half above, everything else the half below, so a message appearing under it never moves it |
| toolbar | the course chip (`CourseControl`) only; the tutor routes the request to teaching or practice |
| messages | 16px under the composer, text inset 16 like the field's text: start error, "Pick a course first", the sign-in action ("Sign in to Claude to start", in `link`, while the Claude account in use is signed out), the engine-unavailable line with its fix |

No model chip, thinking level or cost: there is no model or thinking choice (every agent runs Claude Opus 5.5 at high effort), and cost lives in the lesson's details.

## Behaviour

A session is created only when something is sent, by `SessionStarter` (the current screens' path). Before any creation: missing models or keys open setup, an unavailable model opens its picker.
