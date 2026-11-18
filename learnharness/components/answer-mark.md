# Answer mark

`answer-mark.tsx`: how the record marked an answer, on the answered card itself, and one press to dispute it (Edo, 14 Nov 2026: one answer wrongly marked right can hide a topic for months, and he never saw the mark). The checks, recalls and practice problems all show it.

## Where the mark comes from

Never the app's judgement, and never a guess at which attempt is whose. `core/answer-marks.ts` links each answer to the attempts that name it: the tutor saves each attempt with `question`, the id the answer carried to it, and the save's receipt gives each attempt's id in order (`saved`); a problem's are its `conclude` receipt. An answer he gave in words, in a message of his rather than through a question, is named `his-message` by the save, which stands for his newest message before it (round 5: such answers were recorded and showed no mark, after Explain instead and on a same-day return); his bubble then carries the mark like any answer. An answer no attempt names shows no mark (round 4: a late save of an earlier check showed on the next card). Each save's links, a problem's conclude's included (under the conclude's call), are also kept with the lesson the moment the engine takes the save (`answerSaves` on the chat record), so a card shows while the turn still runs, before the tutor's closing words end it (round 15, 2 D2: a First try / Then card came only after the turn-end read, 1.5 to 2 s late under load; while a turn runs, a kept link names a call the transcript gets only when the turn ends), so an answer saved just before a restart, whose save never reached the transcript, keeps its mark, can be disputed, names its session on the topic page, and the resumed tutor reads it as already saved (round 8). A kept link fills in only an attempt no save in the transcript links, so it never copies a mark onto another answer, as when he sent a message while the turn ran. Then `GET /api/chats/:id/marks` reads them whole from the engine with `show`, following `corrected_by` to the attempts that stand. The session reads the marks again whenever a turn settles. A record the engine cannot read is a failed read (503), never "no marks", so the session keeps the marks it drew until the record reads again (round 17, m23: with `course.json` unreadable every earlier mark vanished).

## The line

Under his answer (`MarkLine`, `lesson/mark-line.md`), 13px muted, icons with a few words:

| Fact | Words |
|---|---|
| result | Right, Partly right, Not right (the result in `foreground`) |
| counted | `markHow`, the rule Earlier reads too, so both say the same: Prediction, not counted (`predicted`); Gave up (`gave_up`); With help (the attempt records help); Not yet confirmed (a right answer the record marks `uncertain`, such as one answered straight after Explain instead); On your own (no help, a guess or a partly right answer included: the result and the confidence beside it say the rest) |
| confidence he chose | Guessing, Confident (`chosenSure`); a recorded `neutral` is the meter left alone and shows nothing. Once a mark is shown the card's label row drops the confidence he picked: a dispute may have corrected it |
| disputed | Disputed · the mark stands, or Disputed · the mark changed (`changed`: the ruling changed an attempt's result, how it counted or its confidence). The ruling's words are the tutor's reply under his dispute, never repeated here (round 16, m20: the stamp printed the whole ruling the reply had just said) |

A practice problem with two attempts reads two rows, First try and Then; rows split by topic carry the topic's title. Dispute sits before the facts: a quiet 32px button with a flag, its tooltip "Dispute this mark ⌘⇧M", off while a turn runs. A card of several rows gives each row its own Dispute, which disputes that row's attempt alone (round 16, m19: one Dispute for First try and Then never said which try a pick would set); ⌘⇧M opens the last row's.

## The dialog

shadcn Dialog, 448 wide: "Dispute this mark", the current mark ("First try: marked Partly right · On your own" for one row of several) and one line, the three marks as a segmented toggle (optional), a field for what's wrong, Cancel and Send to the tutor (needs words or a pick). The field takes focus; ↑ from its start reaches the marks, ← → move between them, ↓ comes back, ⌘↵ sends, Esc closes.

## What happens

The dispute is its own input (`dispute`) and its own message to the tutor (`[MARK DISPUTED]`, naming the answer, the attempts that stand, or the one try he disputes and its attempt, his words and his pick); the transcript shows it as a learner row, its stamp naming the try ("You disputed the mark · First try · You think: Right"). The tutor re-judges and records a re-marked attempt that corrects the old one, agreeing or not, with `disputed` and `ruling` (the engine's correction path, `learning/skills/tutor/references/evidence.md`). A question open when he disputed is set aside unanswered, and the tutor asks it again.

⌘⇧M opens the dialog on the newest marked answer.
