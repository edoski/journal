# LineText

A one-line label made from text written for a page: a folded question in the lesson's bar, a session named by its first message (the topic page's Earlier and Next, the calendar), the tutor's sentence about an attempt. `line-text.tsx`; the formulas go through MathText (ui/math-text.md), unchanged.

| Part | Notes |
|---|---|
| inline marks | `**bold**`, `__bold__`, `*italics*` and `_italics_` (a `_` only at a word's edge, so snake_case stays) are drawn as `strong` and `em`; a link reads as its words; code reads as its words, since the app sets no mono type |
| block marks | a heading's hashes, a quote's bar, a bullet or a number at a line's start are dropped; a table's rule rows are dropped and its bars read as " · "; lines join with a space |
| formulas | kept whole before any mark is read, so a `*` or `\|` in TeX is never markdown; display math joins the line; a matrix or a case split becomes KaTeX's `smallmatrix`, fenced as written (round 3: "B = ⋯" said nothing); rows of equations sit side by side; `\dfrac` becomes `\tfrac`; a bare number reads in the label's own type (plain-numbers.ts) |
| dollars | a literal `\$` stays a dollar |
| truncation | the caller's: everything is inline |

`lineRuns` and `lineWords` are the pure parts; `lineTex` the formula's one-line form. Tested in `tests/line-text.test.tsx`.

His own typed text never goes through it: see typed-text.md.
