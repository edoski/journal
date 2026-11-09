/** The menu anatomy (spec: menu.md): every dropdown, context menu and
 *  picker under the Proposed design draws these, inside MenuShell (which
 *  owns placement, focus and the arrow-key walk). */

/** The menu's surface: popover fill, 1px edge, radius 12, padding 4, 13px. */
export const MENU_SURFACE = "flex flex-col rounded-xl border bg-popover p-1 text-row text-popover-foreground shadow-lg";

/** One item: 32px, radius 8, padding 0 8, a 16px leading icon, hover and
 *  keyboard focus on the same fill step. */
export const MENU_ITEM =
	"flex h-8 w-full min-w-0 shrink-0 items-center gap-2 rounded-md px-2 text-left outline-none transition-colors hover:bg-fill-hover focus-visible:bg-fill-hover disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none [&>svg]:size-4 [&>svg]:shrink-0";

/** The chosen item (the current model, level or font). */
export const MENU_ITEM_SELECTED = "bg-fill-selected hover:bg-fill-selected";

/** The item the search's arrow keys walk to. */
export const MENU_ITEM_WALKED = "bg-fill-hover";

/** A two-line item (name over its details): the same row, grown to fit. */
export const MENU_ITEM_TALL = "h-auto flex-col items-stretch gap-0.5 py-1.5";

/** The search field at the top of a picker: a borderless 32px line over a hairline. */
export const MENU_SEARCH =
	"mb-1 h-8 w-full shrink-0 border-b bg-transparent px-2 text-row text-foreground outline-none placeholder:text-muted-foreground";

/** The secondary text inside an item (provider, price, context size). */
export const MENU_DETAIL = "text-label text-muted-foreground tabular-nums";

/** A hairline between groups of items. */
export const MENU_SEPARATOR = "-mx-1 my-1 h-px shrink-0 bg-border";

/** A quiet line under the items (a note about the list, an empty state). */
export const MENU_NOTE = "px-2 py-1.5 text-label text-muted-foreground";
