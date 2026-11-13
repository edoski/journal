# Resume options (hybrid topic page)

The Resume switch (`design-variant.ts`, group `resume`, options `line`, `target`, `chips`, each wearing Design's Proposed and Topic's `hybrid`). Current keeps the hybrid with the head's button and the plain composer. An option replaces the composer foot (`TopicPage`'s `resume` prop, `RESUME_FEET` in `resume-options.ts`) and takes the head's button away: the foot holds the page's action.

Every option covers the whole action table (`topicAction`, `../topic-page.md`): Resume, Open, Review, Continue a task, Start, Continue, Study. Each says whether a typed message continues a lesson or starts one.

| Option | Thesis | The action | A typed message | File |
|---|---|---|---|---|
| `line` | GitHub's merge box over its comment field: one quiet line on the composer's top edge says what waits and does it | the line, one press | always a new lesson | `resume-line.tsx` |
| `target` | Slack's and Linear's "reply in thread": a menu picks where the message goes | the empty composer's button, labelled with the press | into the chosen lesson, or a new one | `resume-target.tsx` |
| `chips` | Suggested actions in the toolbar, as agent apps put them | one chip per place to pick up | always a new lesson | `resume-chips.tsx` |

## Shared

- `resume-facts.ts`, pure, tested in `tests/topic-page-resume.test.tsx` across all seven rows: `resumeLine`, `resumeChips`, `resumeTargets`, `targetAtFirst`, `emptyPress`, `targetPlaceholder`, `freshAction` (`topicAction` with no session: what a new lesson does), `sessionName` ("today's lesson", "yesterday's practice").
- `resume-parts.tsx`: `ResumeProps` (what `TopicPage` gives every option), `TopicComposer` (the Proposed composer), `ResumeIconMark` (the reply mark in the accent, the tutor's spinner, the review clock, the task bookmark, else the topic's pie).
- The Proposed composer gained two props for this (`../../../composer.md`): `head`, a row docked inside its surface above the field, and `emptyAction`, which the empty composer's button wears instead of the send, as the practice pause's Next problem does.

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

## `target`

A composer chip (`data-slot="composer-chip"`, `data-target`) opens a shadcn `DropdownMenu` of radio rows (`data-slot="resume-target"`): New lesson, then the topic's five newest sessions by day ("Today's lesson", "Lesson of Tue 3 Nov"), each with its title muted and its why mark. It starts on the session the action opens, else New lesson.

- Empty field: the button reads `emptyPress` (Resume, Open while the tutor writes, else the new lesson's action word) and does it; Enter does it too.
- Typed message to a session: the page writes it to `lesson-message.ts` and opens the lesson, whose page takes it once and sends it through its own send (a steer while the tutor writes). A lesson where a question waits keeps it as the draft until he answers: the field says so ("Message today's lesson; it waits until you answer its question"). Checked in the running app: a message sent to the finished Determinants lesson arrives there as `POST /api/chat` with its id and text.
- Typed message to New lesson: a new lesson, as the page always did.

## `chips`

In the toolbar's left: the action's chip ("Resume today's lesson", "Open today's lesson", "Start a review", "Continue <task>", "Start learning", "Keep learning", "Study ahead"), then a chip per other open task holding the topic ("Continue <task>"). Quiet 32px pills in ink, `type="button"`. Field as `line`.

## Trade-offs (see the report of 13 Nov 2026)

- `line` says the most (what waits and where) in the fewest controls, and keeps the field's meaning fixed. It shows one place to pick up; other open tasks are not offered.
- `target` is the only one where a message continues a lesson. Its most common target, a lesson waiting on his answer, cannot take a message until the question is answered, so the message waits as a draft. The menu is one more thing to read before typing.
- `chips` offers every place to pick up, but chips in a toolbar read as options rather than the one thing to do, and their words are shorter than the line's.
