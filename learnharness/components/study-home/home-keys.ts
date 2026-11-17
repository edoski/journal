"use client";

import { useEffect, useRef } from "react";
import { isTypingSurface } from "@/src/core";
import { overlayOpen } from "@/components/spatial-arrows";

/** What Home does on its own keys (spec: study-home.md, "Keys"). */
export interface HomeKeyHandlers {
	/** Show the map of the course `step` places left (-1) or right (1) of
	 *  the chosen one; false at the end of the tabs, so the page's arrows
	 *  take the key and ← still reaches the sidebar. */
	moveCourse: (step: -1 | 1) => boolean;
	/** Press the map's enlarge button. */
	enlarge: () => void;
	/** Open the course page of the Today line with this key (`lineKey`). */
	openCoursePage: (line: string) => void;
	/** Open the course page of the course whose map shows. */
	openShownCoursePage: () => void;
}

/** Today's lines on the page, top to bottom: each full row, then each
 *  lesson the last row folds in ("Also today"). */
const LINES = '[data-slot="study-home"] [data-line]';

/** The course `step` tabs from `workspace`, or null past either end. Pure. */
export function neighbourCourse(workspaces: readonly string[], workspace: string, step: -1 | 1): string | null {
	const at = workspaces.indexOf(workspace);
	return at < 0 ? null : (workspaces[at + step] ?? null);
}

/** Whether focus sits where ← → are another surface's: the map's cards,
 *  its tabs and its arc list own theirs, and the sidebar's rows are the
 *  page's arrows' to walk. Home takes them only from its own page outside
 *  the map, or with nothing focused. */
function arrowsBelongElsewhere(): boolean {
	const active = document.activeElement;
	if (!active || active === document.body) return false;
	const home = active.closest('[data-slot="study-home"]');
	return !home || active.closest('[data-slot="home-map"]') !== null;
}

/** The focused Today line, if focus is on one. */
function focusedLine(): HTMLElement | null {
	const active = document.activeElement;
	return active instanceof HTMLElement && active.matches(LINES) ? active : null;
}

/**
 * Home's own keys, window-wide while Home is mounted: ← → move the map to
 * the neighbouring course, f presses its enlarge button (Edo's notes, 15
 * Nov 2026, N2); o opens the focused Today line as a click does and c
 * opens its course page (N3), or with no line focused the page of the
 * course whose map shows (N4). ↑ ↓ Home End are Today's list walk, every
 * page's (`useListWalk`). Capture phase, so they run before the page's
 * arrows (`useSpatialArrows`); no key fires while he types in a field,
 * holds a modifier or has a dialog, menu or popover open.
 */
export function useHomeKeys(handlers: HomeKeyHandlers) {
	const latest = useRef(handlers);
	latest.current = handlers;
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
			if (isTypingSurface(e) || overlayOpen()) return;
			const on = latest.current;
			if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
				if (arrowsBelongElsewhere()) return;
				if (on.moveCourse(e.key === "ArrowLeft" ? -1 : 1)) e.preventDefault();
				return;
			}
			if (e.key === "f") {
				e.preventDefault();
				on.enlarge();
				return;
			}
			const line = focusedLine();
			if (e.key === "o" && line) {
				e.preventDefault();
				line.click();
			} else if (e.key === "c") {
				e.preventDefault();
				if (line) on.openCoursePage(line.dataset.line!);
				else on.openShownCoursePage();
			}
		};
		window.addEventListener("keydown", onKeyDown, { capture: true });
		return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
	}, []);
}
