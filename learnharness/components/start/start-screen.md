# StartScreen

The Proposed start surface: Today at `/` (`today`) and the draft at `/chat/new` (`?mode=practice`). `data-slot="start-screen"`. T3 Code's new-chat anatomy (research/agent-apps.md).

## Anatomy, top to bottom

| Part | Notes |
|---|---|
| heading | 30/36 (`text-display`), weight 400, tracking -0.025em, centred, 32px above the composer. Today: "What are we learning today?" / "What are we practising today?"; draft: "What do you want to learn?" / "What do you want to practise?" |
| composer | `Composer variant="proposed"` (composer.md), centred in a 736px column; the composer sits on the screen's vertical centre: the heading fills the half above, everything else the half below, so a message appearing under it never moves it |
| toolbar | course chip (`CourseControl variant="proposed"`), the Teach / Practice segmented control (toggle-group.md), and in practice the Pick nodes chip |
| messages | 16px under the composer, text inset 16 like the field's text: start error, "Pick a course first", the setup action ("Set up your models to start" / "Add a provider key to start", in `link`), the engine-unavailable line with its fix |
| course chips | Today only, 24px below: `CourseChips` (course-chips.md) |

The chain table opens over the column for practice picks. No model chip, thinking level or cost: they live in Settings.

## Behaviour

A session is created only when something is sent, by `SessionStarter` (the current screens' path). Before any creation: missing models or keys open setup, an unavailable model opens its picker. A course chip starts a teaching session in its course with the opening "Let's continue"; the tutor takes the reviews due first, then the open task (course-chips.md).
