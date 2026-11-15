# MathLine

`math-line.tsx`. A one-line label that may hold TeX, as `MathText` draws it (`math-text.md`). When it is too wide for its box, its words run to the box's edge and the box's ellipsis cuts the last one ("Random variables and distrib…"), but a formula that does not fit is left out whole, ending the line on the piece before it, then "…". An ellipsis from CSS alone cut a formula in half ("Product construction for …₁", the round-3 evaluation); ending every line on a whole word left up to a long word's width empty ("Random variables and…" in a row with room for more, the round-8 evaluation).

| Part | Notes |
|---|---|
| pieces | `mathUnits`: the label cut at each run of spaces, never inside a formula; a formula and the word glued to it ("$\sigma$-algebras") are one piece |
| fit | measured before the browser paints, halving the counts still unknown until it settles on the longest prefix that fits (`nextFit`, `mathPrefix`), so a long label settles in about log2 of its pieces renders, never one per dropped piece; every measure narrows the range, and a settled fit is not measured again; again from the whole label when the box changes width and once the fonts load |
| ending | once the fit settles on a dropped piece with no formula, one more measure asks whether that piece's first letter fits after the kept ones, then "…" (`lineText`, `measuredFit`). When it does, the piece is drawn too; that text is known not to fit, so the box's `truncate` ellipsis cuts it mid-word at the edge, and the box then fills its room, so a content-sized box starts no refit. A dropped formula, or a letter that does not fit, ends the line on the last whole piece, then "…", so neither a formula nor a lone space meets the ellipsis; a single piece wider than the box ends in the box's ellipsis |
| box | a `block truncate` span; the caller gives size, weight and ink |

Callers: the topic map's card titles, the course page's topic rows and What next, the open mistakes' rows, Home's Today rows (course and lesson), Today's other lessons, and Today's done line.
