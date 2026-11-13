# Topic page candidate `steps`

Option `steps` of the Topic switch (`../topic-page.md`). Thesis: Home one level down: a map of one lesson's steps (nodes and edges, drawn as the topic map draws topics) over Home's rows, switched by lesson with line tabs; the step a lesson stopped on is marked and a node opens that lesson.

`steps-topic.tsx` takes `TopicPageProps`. It is a stub until its builder draws it: inside `ScrollArea bar={false}` (root `data-testid="unit-page"`, `data-topic-candidate="steps"`), the shared `TopicHead`, `PickupRows` (`facts.pickups`) and `SessionRows` (`facts.listed`), so the page works on this option.
