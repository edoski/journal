# ActivityLine

`<ActivityLine label="Thinking…" />`: the lesson's only working-state signal. `data-slot="activity-line"`, `role="status"`.

| Slot | Notes |
|---|---|
| root | 24px row, 13/18 (`text-row`) |
| text | the shimmer (a lighter band sweeping `muted-foreground` text, 1.6s loop) in sentence case |

Used for: the turn starting ("Thinking…"), a compaction his message waits on ("Compacting the conversation…"), and a tool the tutor is running ("Reading your notes…", from `toolActivityLabel`). Thinking blocks, tool-call rows with their arguments, and spinners stay out of the lesson (the owner's "agent chrome out"; research/learning-first.md "bookkeeping invisible").

Sources: T3 Code's streamed-text shimmer and 13px status text; Claude desktop's single "Thinking" line.
