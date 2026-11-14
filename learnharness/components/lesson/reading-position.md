# The lesson's reading position

`reading-position.ts` (pure) and `scroll-cue.tsx` (its controller and cue). Decided once, round 2 (14 Nov 2026).

| Moment | What the lesson does |
|---|---|
| He acts: sends, answers, steers, presses Hint, Show me, Explain instead or Next problem | The lesson goes to its end, so his card and "Thinking…" are in view. The transcript's last element at that moment becomes the reply's anchor. |
| The reply arrives | The view follows it down until the reply's first line reaches the top, then holds there. Layout shifts (the dock shrinking back to the composer) never stop the follow. |
| Part of the reply sits below what he can see | The cue above the dock reads "New reply" with a down arrow. |
| He has seen the end, but is above the bottom | A plain down arrow. |
| He scrolls up with the wheel or keys | The hold lets go; the reply keeps arriving below and the cue says so. |
| He presses the cue or ⌘↓ | The lesson goes to its newest line and follows its end again. |

While a turn runs, "Thinking…" shows at the end of the lesson except while the tutor's words or a tool card it is writing are arriving there (`working-sign.ts`). The practice dock keeps his work in the field after Hint, Show me and Explain instead, and its buttons wait until the reply ends.
