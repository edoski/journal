# Topic page candidate `brief`

Option `brief` of the Topic switch (`../topic-page.md`). Thesis: today, for one topic: say what to do and stop. Home's rows and nothing else; no graph of steps.

`brief-topic.tsx` takes `TopicPageProps`. It is a stub until its builder draws it: inside `ScrollArea bar={false}` (root `data-testid="unit-page"`, `data-topic-candidate="brief"`), the shared `TopicHead`, `PickupRows` (`facts.pickups`) and `SessionRows` (`facts.listed`), so the page works on this option.
