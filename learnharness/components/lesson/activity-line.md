# ActivityLine

`<ActivityLine label="Thinking…" />`: the lesson's only working-state signal. `data-slot="activity-line"`, `role="status"`.

| Slot | Notes |
|---|---|
| root | 24px row, 13/18 (`text-row`) |
| text | the shimmer (a lighter band sweeping `muted-foreground` text, 1.6s loop) in sentence case |

Used for: the turn starting and a tool the tutor is running, saying what he waits for or "Thinking…" (`workingLine`, `toolActivityLabel`): "Writing a question…", "Planning the lesson…" from the probe's end to the lesson's first step, "Building a demo…", "Making a visual…", "Summarising the lesson so far…" while Claude Code compacts. A tool whose work he never sees (a search, a file, a save, a hand-off) never names itself (round 11, 3 n9). Thinking blocks, tool-call rows with their arguments, and spinners stay out of the lesson (the owner's "agent chrome out"; research/learning-first.md "bookkeeping invisible").

Sources: T3 Code's streamed-text shimmer and 13px status text; Claude desktop's single "Thinking" line.
