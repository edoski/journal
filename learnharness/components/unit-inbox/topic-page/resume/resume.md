# Resume options (hybrid topic page)

The Resume switch (`design-variant.ts`, group `resume`, option `line`, each wearing Design's Proposed and Topic's `hybrid`). Current keeps the hybrid with the head's button and the plain composer. An option replaces the composer foot (`TopicPage`'s `resume` prop, `RESUME_FEET` in `resume-options.ts`) and takes the head's button away: the foot holds the page's action.

Every option covers the whole action table (`topicAction`, `../topic-page.md`): Resume, Open, Review, Continue a task, Start, Continue, Study. Each says whether a typed message continues a lesson or starts one.

| Option | Thesis | The action | A typed message | File |
|---|---|---|---|---|
| `line` | GitHub's merge box over its comment field: one quiet line on the composer's top edge says what waits and does it | the line, one press | always a new lesson | `resume-line.tsx` |

## Shared

- `resume-facts.ts`, pure, tested in `tests/topic-page-resume.test.tsx` across all seven rows: `resumeLine`, `freshAction` (`topicAction` with no session: what a new lesson does), `sessionName` ("today's lesson", "yesterday's practice").
- `resume-parts.tsx`: `ResumeProps` (what `TopicPage` gives every option), `TopicComposer` (the Proposed composer), `ResumeIconMark` (the reply mark in the accent, the tutor's spinner, the review clock, the task bookmark, else the topic's pie).
- The Proposed composer gained a prop for this (`../../../composer.md`): `head`, a row docked inside its surface above the field.

## `line`

`data-slot="resume-line"`, a `button type="button"` 44px tall, the composer's first row, hairline under it, top corners following the surface (19px). Icon, then the words in `text-row font-medium` ink, then the detail muted and truncating, then the press in the accent with a 16px arrow that moves 2px on hover. `data-action` is the action's kind.

| Row | Words | Detail | Press |
|---|---|---|---|
| Resume | Your turn in today's lesson | the step, else Question waiting / Problem waiting | Resume |
| Open | The tutor is writing in today's lesson | the step | Open |
| Review | the head's review words: Review overdue by 2 days | | Review |
| Continue a task | the task's title | its step | Continue |
| Start | Not started | | Start |
| Continue | the standing's words: Nearly on your own | | Continue |
| Study | Next review Fri 13 Nov | | Study |

Field: "Ask about <topic> to start a new lesson".

## Trade-offs (see the report of 13 Nov 2026)

- `line` says the most (what waits and where) in the fewest controls, and keeps the field's meaning fixed. It shows one place to pick up; other open tasks are not offered.
