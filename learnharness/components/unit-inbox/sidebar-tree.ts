import type * as React from "react";

/**
 * Arrow keys over the sidebar's rows, T3 Code's list (`lib/sidebarTree.ts`):
 * every row stays a Tab stop, and the arrows move focus without opening.
 * Up and Down step through the visible rows, Home and End jump to the ends;
 * on a shelf header Right opens it (or steps into it) and Left folds it; on
 * a shelf's row Left goes back to its header. Enter opens, as a link or
 * button does.
 */
export function onSidebarTreeKeyDown(e: React.KeyboardEvent<HTMLElement>): void {
	const current = (e.target as HTMLElement).closest<HTMLElement>("[data-sidebar-row]");
	if (!current || !e.currentTarget.contains(current) || e.metaKey || e.ctrlKey || e.altKey) return;
	const rows = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-sidebar-row]"));
	const at = rows.indexOf(current);
	const go = (row: HTMLElement | undefined) => {
		if (!row) return;
		e.preventDefault();
		row.focus();
	};
	const expanded = current.getAttribute("aria-expanded");
	switch (e.key) {
		case "ArrowDown":
			return go(rows[at + 1]);
		case "ArrowUp":
			return go(rows[at - 1]);
		case "Home":
			return go(rows[0]);
		case "End":
			return go(rows[rows.length - 1]);
		case "ArrowRight":
			if (expanded === "false") {
				e.preventDefault();
				current.click();
				return;
			}
			if (expanded === "true") return go(rows.find((r) => r.dataset.sidebarParent === current.dataset.sidebarRow));
			return;
		case "ArrowLeft":
			if (expanded === "true") {
				e.preventDefault();
				current.click();
				return;
			}
			return go(rows.find((r) => r.dataset.sidebarRow === current.dataset.sidebarParent));
		case " ":
			if (current.tagName === "A") {
				e.preventDefault();
				current.click();
			}
			return;
	}
}
