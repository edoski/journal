# Answer mark

`answer-mark.tsx`: how the record marked an answer, on the answered card itself, and one press to dispute it (Edo, 14 Nov 2026: one answer wrongly marked right can hide a topic for months, and he never saw the mark). The checks, recalls and practice problems all show it.

## Where the mark comes from

Never the app's judgement, and never a guess at which attempt is whose. `core/answer-marks.ts` links each answer to the attempts that name it: the tutor saves each attempt with `question`, the id the answer carried to it, and the save's receipt gives each attempt's id in order (`saved`); a problem's are its `conclude` receipt. An answer he gave in words, in a message of his rather than through a question, is named `his-message` by the save, which stands for his newest message before it (round 5: such answers were recorded and showed no mark, after Explain instead and on a same-day return); his bubble then carries the mark like any answer. An answer no attempt names shows no mark (round 4: a late save of an earlier check showed on the next card). Then `GET /api/chats/:id/marks` reads them whole from the engine with `show`, following `corrected_by` to the attempts that stand. The session reads the marks again whenever a turn settles.

## The line

The card's foot, under a hairline, 13px muted, icons with a few words:

| Fact | Words |
|---|---|
| result | Right, Partly right, Not right (the result in `foreground`) |
| counted | `markHow`, the rule Earlier reads too, so both say the same: Prediction, not counted (`predicted`); Gave up (`gave_up`); With help (the attempt records help); Not yet confirmed (a right answer the record marks `uncertain`, such as one answered straight after Explain instead); On your own (no help, a guess or a partly right answer included: the result and the confidence beside it say the rest) |
| confidence he chose | Guessing, Confident (`chosenSure`); a recorded `neutral` is the meter left alone and shows nothing. Once a mark is shown the card's label row drops the confidence he picked: a dispute may have corrected it |
| disputed | Disputed: and the tutor's ruling, math rendered |

A practice problem with two attempts reads two rows, First try and Then; rows split by topic carry the topic's title. Dispute sits at the right: a quiet 32px button with a flag, its tooltip "Dispute this mark ⌘⇧M", off while a turn runs.

## The dialog

shadcn Dialog, 448 wide: "Dispute this mark", the current mark and one line, the three marks as a segmented toggle (optional), a field for what's wrong, Cancel and Send to the tutor (needs words or a pick). The field takes focus; ↑ from its start reaches the marks, ← → move between them, ↓ comes back, ⌘↵ sends, Esc closes.

## What happens

The dispute is its own input (`dispute`) and its own message to the tutor (`[MARK DISPUTED]`, naming the answer, the attempts that stand, his words and his pick); the transcript shows it as a learner row. The tutor re-judges and records a re-marked attempt that corrects the old one, agreeing or not, with `disputed` and `ruling` (the engine's correction path, `learning/skills/tutor/references/evidence.md`). A question open when he disputed is set aside unanswered, and the tutor asks it again.

⌘⇧M opens the dialog on the newest marked answer.
