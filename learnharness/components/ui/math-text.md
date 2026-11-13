# MathText

A one-line label that may hold TeX, typeset inline with KaTeX: topic titles on the map, the course page and Home, lesson titles, reason words that name a topic ("Missed $\sigma$-algebras"), the brief's mistake sentence. `math-text.tsx`, `data-slot="math-text"` on each formula.

| Part | Notes |
|---|---|
| formulas | `$…$`, `\(…\)`, `\[…\]` and `$$…$$`, all inline: a label is one line. A `$…$` must hug its formula (no space inside either dollar, no digit after the closing one), so "$5 and $10" stays money; `\$` is a literal dollar. Pandoc's rule for `tex_math_dollars` |
| type | KaTeX's HTML and MathML (a screen reader reads the MathML), at 1.05em of the label against KaTeX's own 1.21em, which is set for a serif's x-height and stands too tall beside SF Pro. The label's ink and weight carry into the formula |
| errors | KaTeX's `throwOnError: false`: a formula it cannot read shows its TeX in the error ink, and the label still renders |
| plain words | `mathPlain` for an attribute that takes text only (`aria-label`, a tooltip): the formula's symbols as characters ("σ-algebras", "f: ℝ→ℝ"), a fraction as a/b, other commands by name |
| truncation | the caller's: a formula is inline, so a `truncate` label still ends in "…" |

A label with no formula renders as plain text, with no KaTeX call.

Sources: KaTeX options (`throwOnError`, `strict`, `output`), katex.org/docs/options; Pandoc's `tex_math_dollars` extension, pandoc.org/MANUAL.html.
