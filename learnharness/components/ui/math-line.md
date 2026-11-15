# MathLine

`math-line.tsx`. A one-line label that may hold TeX, as `MathText` draws it (`math-text.md`), that ends on the last whole word or whole formula that fits its box, then "…", when it is too wide. An ellipsis from CSS alone cut a formula in half ("Product construction for …₁", the round-3 evaluation).

| Part | Notes |
|---|---|
| pieces | `mathUnits`: the label cut at each run of spaces, never inside a formula; a formula and the word glued to it ("$\sigma$-algebras") are one piece |
| fit | measured before the browser paints, a piece at a time from the end until the line fits (`mathPrefix`), again when the box changes width and once the fonts load |
| fallback | a single piece wider than the box still ends in the box's own `truncate` ellipsis |
| box | a `block truncate` span; the caller gives size, weight and ink |

Callers: the topic map's card titles, the course page's topic rows, Home's Today rows (course and lesson), and Today's done line.
