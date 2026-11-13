# Brief course page

The `brief` option of the Course switch (../course-page.md): three answers, then the picture. It answers the three questions he opens a course with (what to fix, what to review, what comes next), three topics each, names the one mistake the engine can put in words, and puts the course's map underneath as the full picture. `brief-course.tsx`.

## Layout, top to bottom

One column of Home's width (960 less 32 a side, so 896 at 1440), fitting the window (`h-full`), 20 above and 24 below, 24 between parts.

| Part | File, `data-slot` | Notes |
|---|---|---|
| header | the shared `CourseHeader` (../course-header.md) | name, one button, facts line, next step |
| standing bar | `standing-bar.tsx`, `brief-standing` | one 20px line: the course's pie unrolled, then the counts the header does not say (below) |
| mistake | `brief-mistake.tsx`, `brief-mistake` | 16 under the bar, only when a topic to fix has the engine's sentence (below) |
| answers | `brief-answers`, each `brief-answer` with `data-answer` `fix`, `review` or `next` | three equal columns, 24 either side of a 1px hairline at 50% `border` between them; the outer columns reach 24 past the column so the three are one width; no card or fill behind anything |
| map | `brief-map.tsx` and `brief-map-view.ts`, `brief-map` with its `brief-map-pane` | the rest of the window, at least 160 (below it the page scrolls with no bar showing) |

An empty course shows "Topics appear as you study this course." (Home's map's words) under the header and nothing else.

## Standing bar

- One line, 20 high: an 8px bar (shadcn Progress's `h-2 rounded-full`) filling the line in up to three parts, 2px apart, each as wide as its share of the topics: on your own (`muted-foreground`, the full pie's ink), learning (at 45%), not started (at 15%, the track). A part with no topics is left out.
- On your own counts exactly the topics the header's pie counts (`courseProgress`: on his own and not weak); not started counts the topics at the engine's `new` level; learning is the rest.
- After the bar, 16 apart, the counts the header does not already say, 13/18 muted, tabular figures, each led by the 16px pie a topic in that part wears on the map (`TopicGlyph`: half, dashed): "7 learning", "6 not started". The header's "3 of 16 on your own", right above, names the first part, so nothing is said twice.
- A screen reader hears one sentence, "3 on your own, 7 learning and 6 not started, of 16 topics".
- shadcn's Progress is not in `components/ui` and draws one value, so the bar is three plain spans on its tokens. The part's width is the one inline value, as Progress sets its indicator's.

## Mistake

The engine's sentence for the mistake (`signals.gap`) on the first topic to fix that has one: a 16px circle-x (the map's slip icon) on the rows' pie edge, then the topic's name at 500 in full ink and the sentence muted, 13/18, two lines at most and no wider than 75 characters (the research's 45 to 75), so it fits in two lines at 1100. It sits across the column rather than in a 266px answer, where it was cut off. A click opens the topic's page; the hover fill and focus ring are a row's. The sentence appears once on the page (he called sentences on rows too much text, 13 Nov 2026).

## Answers

Each answer is the shared `CourseGroup` (28px header, 12/16 at 500 muted, no count) over `CourseTopicRow`s with `detail` and `compact`: two-line rows, all one height (54): the title 13/18 at 500, then what the row says, 13/18 muted, with that fact's 14px icon at the row's end (in the accent for "Your turn") so the icons line up down each column, its words in a hint. A hairline between rows; the hover fill reaches 12 past the column. The first three topics show (two when the window is 760 high or less, so the map keeps a full layer of topics), then "Show N more". Escape folds an opened answer back. A click opens the topic's page.

Each topic sits in one answer.

| Answer | Holds, in order | Empty |
|---|---|---|
| Fix first | the topics the engine calls weak, in the Needs you group's order: a wrong answer he was sure of on top (Butterfield and Metcalfe 2001), then the longest overdue | "Nothing to fix" |
| Review | every other topic whose review is due, whatever his level, the longest overdue first. With Fix first that is every topic the header's Review takes up, so the page, the button and Home agree | when the first topic comes back and which, the day first so a long title truncates before it, "Back Mon 9 Nov: Quotient rule"; "Nothing due" with none scheduled |
| Next | the topics the header's lesson takes up, then the rest being learned in the sidebar's order, then the topics not started, the ones he can start now first. So Next starts where the button does | "Nothing new to start" |

What a row says, the first that holds:

1. A session waits on him, "Your turn" (message-circle-question, accent), or the tutor is writing, "Working" (the braille spinner): the sidebar's.
2. The open task where he left it, "Problem sheet 4, part (c)" (bookmark), on the one topic it sits on (the current topic if the task holds it, else the first in path order).
3. Why the answer holds it. Fix first: the map's reason ("Missed last time", "Sure, but wrong", "A mistake to fix", "Mixed up with …"; circle-x). Review: how overdue, in Home's and the header's words ("Due today", "3d overdue", "1w overdue"; history). Next: "You are here" (map-pin); a topic not started, "Ready to start" or "Needs 2 topics first" (no icon; counted rather than named so the line stays one line, the map's lines and the topic's page name them); else where he stands ("Nearly on your own"; no icon).

## Map

The topic map (../../course-map/topic-map/topic-map.md) as Home frames it (../../study-home/home-map.md): no outline and no heading (Edo, 12 Nov 2026), its edges fading 64 in from the sides and 40 from the top and bottom (`mapFade`).

- The map draws the whole course at full size (every title at 13px) on a surface as big as the course plus the map's room (64 across, 40 and the 20 tag room down), never smaller than the pane, so it fits and never moves its own camera. The pane (`brief-map-pane`) scrolls over the surface with no bar. Geometry: `brief-map-view.ts`.
- It opens with "You are here" in the middle, as near as the surface's edges allow, unless he can already do that topic on his own and nothing about it is due (the sidebar's Known shelf: Calculus I's Limits); then it opens on the first topic the answers name, so the map shows what the page points at (`mapAim`). It returns there whenever the pane grows or shrinks.
- Wheel and trackpad scroll the pane (a pinch stays the map's); a drag on the background scrolls it; a drag that starts on a topic stays a click. A topic the keyboard walk reaches scrolls clear of the fade (200ms smooth, at once under reduced motion). A click on a topic opens its page.
- Pointing at an answer or a row lights nothing on the map: one picture and three lists, nothing to learn (the first build lit a whole column and dimmed the frame when its topics were out of view).

## States

The header's states (loading, the engine not answering, a read failing, an unreadable course, a course not here) are the frame's (../course-page.md). No exam: the header leaves it out. Everything learned: one full bar, "Nothing to fix", when the first topic comes back, and Next keeps only a topic with a session waiting ("Nothing new to start" when none waits). A long title truncates in the header and in its row. At 1100x700 the columns are 228 wide, each shows two topics, and the map keeps about 190, one full layer; "Show N more" lets the page scroll and Escape folds it back.

## Sources

The course page research's `brief` direction and targets 15 and 16 (audit/course-page, 13 Nov 2026); the review of the first build (review-brief, 13 Nov 2026); Linear's project overview (a summary, then the picture); Apple's charting guidance (a headline that states the takeaway); shadcn progress (`h-2 rounded-full`); Home's map frame, hybrid row and Today's reasons (`whyOf`); Butterfield and Metcalfe 2001 (confident errors first).
