import type * as React from "react";

/** Every control the list's keyboard walk stops at, in the page's order:
 *  the header's button, a group header that folds, each topic, Show more. */
export const LIST_STOPS = [
	"[data-slot=course-action]",
	"button[data-slot=course-group-header]",
	"[data-slot=course-topic-row]",
	"[data-slot=course-group-more]",
].join(", ");

/** The stops inside `root`, in document order. */
export function listStops(root: ParentNode): HTMLElement[] {
	return Array.from(root.querySelectorAll<HTMLElement>(LIST_STOPS));
}

/** Room kept between a stop the walk lands on and the page's edge, so its
 *  focus ring never runs under the window's edge: the column's foot. */
const REVEAL_MARGIN = 24;

/** Focuses a stop and scrolls the page just enough to show it whole, with
 *  room for its ring. */
export function reveal(stop: HTMLElement): void {
	stop.focus({ preventScroll: true });
	const viewport = stop.closest<HTMLElement>("[data-slot=scroll-area-viewport]");
	if (!viewport) return stop.scrollIntoView({ block: "nearest" });
	const box = stop.getBoundingClientRect();
	const view = viewport.getBoundingClientRect();
	const below = box.bottom + REVEAL_MARGIN - view.bottom;
	const above = view.top - (box.top - REVEAL_MARGIN);
	if (below > 0) viewport.scrollTop += below;
	else if (above > 0) viewport.scrollTop -= above;
}

/** How far the page should scroll so a group he just opened shows as much
 *  of itself as fits, its header kept in view: 0 when it already shows
 *  whole. `box` and `view` are the group's and the page's top and bottom. */
export function scrollToShow(box: { top: number; bottom: number }, view: { top: number; bottom: number }): number {
	const below = box.bottom + REVEAL_MARGIN - view.bottom;
	const room = box.top - REVEAL_MARGIN - view.top;
	return below > 0 ? Math.max(0, Math.min(below, room)) : 0;
}

/** Scrolls the page to show a group just opened (Known unfolded, or Show
 *  more pressed), so what the press brought out is in view, without moving
 *  focus. Smooth unless he asks for less motion. */
function showGroup(group: Element): void {
	const viewport = group.closest<HTMLElement>("[data-slot=scroll-area-viewport]");
	if (!viewport) return;
	const by = scrollToShow(group.getBoundingClientRect(), viewport.getBoundingClientRect());
	if (by > 0) viewport.scrollBy({ top: by, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

const headerOf = (el: HTMLElement) => el.closest("[data-slot=course-group]")?.querySelector<HTMLElement>("button[data-slot=course-group-header]") ?? null;

/**
 * Arrow keys over the course list, the sidebar's walk (`sidebar-tree.ts`)
 * for a page where Tab is dead (owner, 17 Sep 2026): Up and Down step
 * through the stops, Home and End jump to the ends; on a group header that
 * folds, Right opens it (or steps into it) and Left folds it; on one of its
 * rows Left goes back to its header. Enter opens, as a link or button does,
 * and Space too on a topic. Show more hands focus to the first row it
 * shows. Escape leaves the walk, as a click on empty space would.
 */
export function onListKeyDown(e: React.KeyboardEvent<HTMLElement>): void {
	if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
	const current = (e.target as HTMLElement).closest<HTMLElement>(LIST_STOPS);
	if (!current || !e.currentTarget.contains(current)) return;
	const stops = listStops(e.currentTarget);
	const at = stops.indexOf(current);
	const go = (stop: HTMLElement | null | undefined) => {
		if (!stop) return;
		e.preventDefault();
		reveal(stop);
	};
	const expanded = current.getAttribute("aria-expanded");
	switch (e.key) {
		case "ArrowDown":
			return go(stops[at + 1]);
		case "ArrowUp":
			return go(stops[at - 1]);
		case "Home":
			return go(stops[0]);
		case "End":
			return go(stops[stops.length - 1]);
		case "ArrowRight":
			if (expanded === "false") {
				e.preventDefault();
				current.click();
				return;
			}
			if (expanded === "true") return go(stops[at + 1]?.closest("[data-slot=course-group]") === current.closest("[data-slot=course-group]") ? stops[at + 1] : null);
			return;
		case "ArrowLeft":
			if (expanded === "true") {
				e.preventDefault();
				current.click();
				return;
			}
			if (current.dataset.slot === "course-topic-row") return go(headerOf(current));
			return;
		case "Enter":
		case " ": {
			if (current.dataset.slot === "course-group-more") {
				// The button gives way to the rows it shows; the first of them takes its place.
				const root = e.currentTarget;
				e.preventDefault();
				current.click();
				requestAnimationFrame(() => {
					const shown = listStops(root)[at];
					if (shown) reveal(shown);
				});
				return;
			}
			if (e.key === " " && current.tagName === "A") {
				e.preventDefault();
				current.click();
			}
			return;
		}
		case "Escape":
			e.preventDefault();
			e.stopPropagation();
			current.blur();
			return;
	}
}

/** Whether a key pressed with nothing focused should step into the list:
 *  Down or Home into its first stop, Up or End into its last. */
export function entryOf(e: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "defaultPrevented">): "first" | "last" | null {
	if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return null;
	if (e.key === "ArrowDown" || e.key === "Home") return "first";
	if (e.key === "ArrowUp" || e.key === "End") return "last";
	return null;
}

/** A press that opens a group (a folded header, or Show more) brings what
 *  it opened into view once drawn. A group header pressed with the pointer
 *  then gives its focus back, as the rows do (`blurAfterPointerClick`): the
 *  next Enter must not fold it again. A key's click (no `detail`) keeps it. */
export function onListClick(e: React.MouseEvent<HTMLElement>): void {
	const target = e.target as HTMLElement;
	const header = target.closest<HTMLElement>("button[data-slot=course-group-header]");
	const opener = target.closest<HTMLElement>("[data-slot=course-group-more]") ?? (header?.getAttribute("aria-expanded") === "false" ? header : null);
	const group = opener?.closest("[data-slot=course-group]");
	if (group) requestAnimationFrame(() => showGroup(group));
	if (e.detail !== 0) header?.blur();
}
