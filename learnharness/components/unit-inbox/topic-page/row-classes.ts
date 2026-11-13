/** The topic page's rows, Home's Hybrid row restated (Home keeps its
 *  classes private): no surface, radius as Home's, bleeding 12px past the
 *  column so the hover fill reaches past the text, the icon column then
 *  the text then a trailing fact flush right. */
const ROW_GRID =
	"-mx-3 grid w-[calc(100%+1.5rem)] grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-4 rounded-lg px-3 text-left font-normal whitespace-normal";

/** A 64px row of two lines. */
export const TWO_LINE_ROW = `${ROW_GRID} h-16 grid-rows-[auto_auto] content-center gap-y-1`;

/** A 40px row of one line. */
export const ONE_LINE_ROW = `${ROW_GRID} h-10`;

/** A hairline above every row but the first, the column's width. */
export const HAIRLINE = "relative not-first:before:absolute not-first:before:inset-x-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-border/50";

/** A hairline above a row that is never the first. */
export const RULE = "relative before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-border/50";
