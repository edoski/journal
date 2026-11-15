/** Every history row's leading gutter: the Now rule's 2px, then the 16px
 *  the rows put between their columns. Every row has it, ruled or not, so
 *  the icons share one x down the pane, no row moves when it gains the
 *  rule, and the rule starts where the section labels' text starts
 *  (Edo, 14 Nov 2026). */
export const GUTTER = "pl-[1.125rem] has-[>svg]:pl-[1.125rem]";

/** A row whose hover fill bleeds 12px past the column on each side, then
 *  the gutter: its icon on the gutter's x like every other row. The
 *  `has-[>svg]` pair outweighs shadcn Button's own icon padding. */
export const BLEED = "-mx-3 w-[calc(100%+1.5rem)] pr-3 pl-[1.875rem] has-[>svg]:pr-3 has-[>svg]:pl-[1.875rem]";

/** Now's accent rule, in the gutter of a bleeding row: 12px in from the
 *  fill's edge, on the section labels' x. */
export const NOW_RULE = "before:absolute before:inset-y-3 before:left-3 before:w-0.5 before:rounded-full before:bg-link";

/** The topic page's rows, Home's Hybrid row restated (Home keeps its
 *  classes private): no surface, radius as Home's, bleeding past the
 *  column so the hover fill reaches past the text, the gutter, the icon
 *  column then the text then a trailing fact flush right. */
const ROW_GRID = `${BLEED} grid grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-4 rounded-lg text-left font-normal system-current:font-normal whitespace-normal`;

/** A 64px row of two lines. */
export const TWO_LINE_ROW = `${ROW_GRID} h-16 grid-rows-[auto_auto] content-center gap-y-1`;

/** A 40px row of one line. */
export const ONE_LINE_ROW = `${ROW_GRID} h-10`;

/** A row whose title wraps to a second line rather than being cut: 40px
 *  while it fits one (round 10, 3 m9: "Random variables and dis…" in
 *  Builds on). */
export const WRAPPING_ROW = `${ROW_GRID} min-h-10 py-2`;

/** A hairline above every row but the first, the column's width. */
export const HAIRLINE = "relative not-first:before:absolute not-first:before:inset-x-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-border/50";

/** A hairline above a row that is never the first. */
export const RULE = "relative before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-border/50";
