# SectionBreak

`<SectionBreak label="Teaching" />`: the lesson column's section break under the Proposed design. `data-slot="section-break"`, `role="separator"`.

| Slot | Notes |
|---|---|
| label | optional; 13/18 (`text-row`), `muted-foreground`, sentence case, flush with the column's left edge |
| rule | 1px in `border` (white 8%), filling the rest of the line, 12px after the label |

8px of margin, so with the column's 16px gap it sits 24px from its neighbours. Without a label it is a bare hairline (the compaction seam).

Replaces the dotted rules with an uppercase pill (phase dividers, "History compacted · 21k tok"): structure felt rather than drawn (plan.md), sentence case everywhere (findings 1), token counts out of the lesson (the owner's "agent chrome out").
