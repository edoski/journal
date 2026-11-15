# Study words

`study-words.ts`: the app's one wording for where he stands on a topic and why it needs him (Edo, 14 Nov 2026). The map, Home's rows, the sidebar, the course page, the topic page and the calendar read it, so no two surfaces say the same thing differently. Pure; tested in `tests/study-words.test.ts`.

## Where he stands

One phrase per step of the topic's pie (`topic-standing.ts` sets the fill from the engine's level and weak verdict). The words follow the pie, never the level: a weak topic he could do on his own draws a 3/4 pie and says "Right with help".

| Pie | Words |
|---|---|
| empty | Not started |
| 1/4 | Taught, not tried |
| 1/2 | Tried, not right yet |
| 3/4 | Right with help |
| full | On your own |

On a topic not yet solid (`attempted` or `assisted`), the words say how he answered it since his newest answer that was not right, the engine's `right` (`RIGHT_WORDS`, `standingWords`): Right on your own, check another day; Right with help; Right, but a guess; Right, not yet confirmed; Partly right when that newest answer was partly right. Right answers after a review day's wrong first try never read "Tried, not right yet" (round 7); `attempted` with no right answer since keeps it. The pie stays the pie.

## Why it needs him

One form each, wherever it shows.

| Reason | Words |
|---|---|
| a slip, the first signal that holds, each with its own icon (`slip-icons.ts`) | Fixed, check again later (`repaired` on his own, a check); with no wrong answer open (the engine's `mistake`, which any right answer closes, with help or not), Check on your own (a person with a check), whatever else the record says, since the signals below describe a wrong answer a right one has since answered (round 7: "Not right last time" after a right last try); else Not right last time (`lapsed`, a crossed circle; never "Missed", which beside an overdue review read as a review he skipped); Mistake to fix (`gap`, an alert); Mixed up with Cramer's rule (`choiceErrors`, the method's title, two arrows); Sure, but wrong (`confidentErrors`, a warning); else Mistake to fix. A repair made only with help (`repairedWithHelp`) is not "Fixed", since help may have carried it. |
| a review come due | Due today, 3d overdue, 16d overdue (always days, round 4) |
| a review dated ahead | Back in 5d, Back in 21d, Back in 60d |
| unfinished work holds it | Left off today, Left off yesterday, Left off 3d ago, Left off 20d ago; Unfinished when no day is known. Never the tutor's step text. |
| a review the plan holds back | the engine's held words (`heldWords`, from the plan's `held`): Waits for your Probability exam when another course's final review came first, else Earlier days are full; once memory's day has passed, since when it was due first (`reviewWords`): Due since 21 Oct |
| a topic not started, on its page's Now row | First lesson (`FIRST_LESSON`): the head already says Not started; under it the day the plan starts it, once (Planned today, Planned Wed 11 Nov) |

### Which one a topic says

A topic often has more than one reason, and a row says one. Every surface takes them in the same order (`unitStatus` in `unit-inbox/units.ts`, Home's `whyOf`), and the course page's rows and the map's cards read the sidebar's own words for each topic (`sidebarSays` in `unit-inbox/sidebar-says.ts`), so a topic says the same thing wherever it shows (Edo's brief, 14 Nov 2026: one fact per topic across surfaces):

1. a session on it waits on him, or the tutor writes in it (Your turn, Working);
2. a slip;
3. a review come due (Due today, 3d overdue): the engine dates it today;
4. unfinished work that holds it (Left off 2d ago);
5. when its review comes back (Back in 5d), a review the plan holds back included (Due since 21 Oct): the engine dates that review on a later day, so the work he left comes first. A review held past memory's day is due already, so it is a fact that needs him, with the review's icon, and the map's card says it as the lists do (round 6: Cramer's rule read Due since 6 Nov in the lists and its standing on the map);
6. how long since he studied it.

Both "left off" and "due" are true at once, and neither is wrong: a review due today is today's work, so it leads; a review the plan has moved to a later day is not, so the unfinished work leads until that day. A topic Home's Today takes up says Today's reason instead, wherever it shows (the sidebar's card, the course page's Needs you).

Home's line names the lapsed topic when the line is about another one ("Not right last time: Chain rule", `lapsedOnWords`, `row-facts.ts`), only while that topic's slip is a lapse (`lapsedNow`), as every line that names a lapse reads. An attempt's result in a topic's history (Right, Partly right, Not right: `ATTEMPT_WORDS`) is not a reason and keeps its own words.

## Arcs

An arc is one of a course's chapters (`course-arcs.ts`). Its words follow the engine's state, never a count: the pie beside it draws the share.

| State | Words |
|---|---|
| `new` | Not started |
| `learning` | In progress |
| `ready` | Ready for its check |
| `checked` | Check passed |
| `taught` (a course that takes no questions) | All taught |

An arc the next exam does not examine whole reads Partly on the exam or Not on the exam (`ARC_EXAM_WORDS`, from `examCovers`). With no exam, or an exam over the whole course, nothing mentions it.

## Why a topic starts then

`startsWhyWords`: the engine's `starts_why`, in the course's names. `startsWhyShort` cuts it to fit a row's reason beside its icon ("After Expectation", "Early, from Orthogonality"), for Home's rows and the sidebar's cards; the topic page keeps the whole sentence. "After Probability's new topics" (`startsAfterWords`) stays beside it for another course's starts.

| Reason | Words |
|---|---|
| `next` | Next in Matrices; without arcs, Next in Linear Algebra; in an arc before the one "You are here" is in (`currentArc`), Back to Matrices, earlier in the course (short: Back to Matrices), so a lesson that moved him ahead never reads against "Next in" an arc behind him (round 6) |
| `after`, its prerequisites | After Expectation, which it needs |
| `after`, a method it competes with | After Separable equations, so the two methods stay apart |
| `early` | Early, from Orthogonality; without arcs, Early, ahead of its place; then, while earlier topics wait on Rank, or, when the exam's pace took it, to keep pace with the exam |

## In a lesson

`LESSON_WORDS`: what happened to his work, said the same way everywhere.

| Moment | Words |
|---|---|
| a reply arrived below what he can see | New reply (the cue above the dock) |
| the tutor's turn ended with no reply | You stopped the tutor before it replied. (his stop, from any window, before it wrote anything) / You stopped the tutor mid-reply. (his stop after it had written to him) / The tutor stopped before replying. (the app restarted while it ran); then Try again |
| the connection dropped mid-reply | The connection dropped before the tutor finished replying. |
| another window answered the question he was typing in | Answered in another window. What you typed here is in the box below. (once the next question holds the box: Answered in another window. Press Esc to see what you typed here.) |
| another window asked for a hint on it, or asked the tutor something | Another window asked for a hint. / Another window asked the tutor something. Then: What you typed here comes back when the tutor asks the question again. |
| he stops for the day | Done for today; a question he left reads Left for next time, in full; a problem he left reads Left for next time. |
| he skips | a question: Skipped, then the question; a problem: You skipped this problem. |
| the lesson's course was deleted | This course was deleted. Its lessons stay as history. (with what he had written: What you wrote here is in the new lesson box.) Start a new lesson |
| a course's record can't be read | Couldn't read this course's record, then why (`UNREADABLE_WORDS`): macOS won't let the app open its files: Get Info on the course folder in Finder shows who can read it. / Its file is damaged. / Its file can't be opened. |

## Labels in a lesson

| What | Words |
|---|---|
| a choice question's free field (`CHOICE_NOTE`) | Anything to add? A choice may be his goal, not an answer to justify |
| Esc's confirm (`STOP_WORDS`) | Stop the tutor's reply? What it has written so far stays. Stop / Skip this question? The tutor goes on without your answer. Skip / Skip this problem? The tutor moves on, and the solution stays hidden. Skip; while the tutor writes, The tutor's reply stops too. |

## Background work

`BACKGROUND_WORDS`: one name, Background work, for the sidebar's foot and every mention of it ("You can follow it under Background work in the sidebar and start studying now."). Each piece says what it does for which lesson or course in full, never cut and never timed (`backgroundWorkWords`): Building the topic map of Graph Theory; Grouping the topics of Calculus into arcs; Saving what you learned in Eigenvalues; Drawing a figure for, Looking things up for, Building a demo for, Reading a PDF for a lesson.

## An answer's mark

`MARK_WORDS` and `MARK_HOW_WORDS`: the record's mark on an answered card (answer-mark.md). How an attempt counted is `markHow` (`src/core/contracts/marks.ts`), the one rule the card and the topic page's Earlier both read.

| Fact | Words |
|---|---|
| result | Right, Partly right, Not right |
| counted | Prediction, not counted; Gave up; With help; Not yet confirmed (a right answer the engine doubts, `uncertain`, such as one given straight after Explain instead: not his own yet, as Right, not yet confirmed says of the topic); On your own (no help, a guess or a partly right answer included) |
| confidence he chose | Guessing, Confident; none when he left the meter alone (Neutral is never shown as his choice) |
| a dispute | Dispute; Disputed: and the tutor's ruling; in the transcript, You disputed the mark, You think: Partly right |

## Counts

| Where | Words |
|---|---|
| a course's progress (Home's ring, the course page's standing line) | No topics on your own yet; Some topics on your own; Most topics on your own (more than half); Every topic on your own (`courseShareWords`). No count: the ring draws the share |
| a folded list's last row (the sidebar's shelves, the course page's groups) | Show the rest (`moreWords`): every folded list shows all its hidden rows in one press, so the action has one name (round 4 found "Show the rest" and "Show more" side by side). No number: a bare count told him nothing |
