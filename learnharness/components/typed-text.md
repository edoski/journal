# TypedText

What he typed, as he typed it: his answer to a check, his choice's own words, his thinking (the ThinkingBlock's text). `typed-text.tsx`, `data-slot="typed-text"`.

His lines and spaces stay (`white-space: pre-wrap`), a `*` stays a star (he writes 0.5*0.10 for a product; round 3 found it eaten into italics), and only his LaTeX is typeset, by MathText (ui/math-text.md), whose `$…$` must hug its formula, so "$5 and $10" stays money. Never markdown: his words are not a page to lay out. Set in the lesson's prose type (`lh-prose`); the caller adds its ink and style.

His messages in the transcript keep the lesson's markdown, as the tutor's do.

Tested in `tests/line-text.test.tsx`.
