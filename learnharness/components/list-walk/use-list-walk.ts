"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { isTypingSurface } from "@/src/core";
import { overlayOpen } from "@/components/spatial-arrows";

/** Where a key walks a list of `count` stops from stop `at`: Down and Up
 *  step (stopping at the ends), Home and End jump. `at` null is no stop
 *  focused yet: Down and Home enter at the first, Up and End at the last.
 *  Null for any other key, or nowhere to go. Pure. */
export function walkTo(key: string, at: number | null, count: number): number | null {
	if (count === 0) return null;
	switch (key) {
		case "ArrowDown":
			return at === null ? 0 : at + 1 < count ? at + 1 : null;
		case "ArrowUp":
			return at === null ? count - 1 : at > 0 ? at - 1 : null;
		case "Home":
			return at === 0 ? null : 0;
		case "End":
			return at === count - 1 ? null : count - 1;
		default:
			return null;
	}
}

const WALK_KEYS = new Set(["ArrowDown", "ArrowUp", "Home", "End"]);

const bare = (e: { metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }) => !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey;

function land(el: HTMLElement | null | undefined) {
	if (!el) return;
	el.focus({ preventScroll: true });
	el.scrollIntoView({ block: "nearest" });
}

/** What a page wires its list and its head with. */
export interface ListWalk {
	/** On the list: the keys every stop shares. A stop's own keys (a
	 *  header's ← →) claim theirs first with preventDefault. */
	onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
	/** On the head the list leaves for: ↓ and Home on its control step
	 *  back onto the first stop, End jumps to the last, Esc leaves it. */
	onHeadKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
}

/**
 * A page's list walk (spec: list-walk.md), one way on Home's Today, the
 * course page's road and the topic page's sections: ↑ ↓ step and stop at
 * the ends, Home and End jump to the ends, ↑ on the first stop steps onto
 * the head's control above the list (`head`; a list with none keeps
 * focus), Esc leaves the walk. With nothing focused, ↓ or Home enters at
 * the first stop and ↑ or End at the last, window-wide in the capture
 * phase, so the page's arrows (`spatial-arrows.ts`) never take it first;
 * not while he types or has a dialog, menu or popover open. `stops` are
 * the list's stops top to bottom, read at each key.
 */
export function useListWalk({ stops, head }: { stops: () => readonly HTMLElement[]; head?: () => HTMLElement | null }): ListWalk {
	const latest = useRef({ stops, head });
	latest.current = { stops, head };

	useEffect(() => {
		const onKeyDown = (e: globalThis.KeyboardEvent) => {
			if (e.defaultPrevented || !bare(e) || isTypingSurface(e) || overlayOpen()) return;
			const active = document.activeElement;
			if (active && active !== document.body) return;
			const list = latest.current.stops();
			const to = walkTo(e.key, null, list.length);
			if (to === null) return;
			e.preventDefault();
			land(list[to]);
		};
		window.addEventListener("keydown", onKeyDown, { capture: true });
		return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
	}, []);

	return {
		onKeyDown: (e) => {
			if (e.defaultPrevented || !bare(e)) return;
			const list = latest.current.stops();
			const at = list.indexOf(e.target as HTMLElement);
			if (at < 0) return;
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				list[at]!.blur();
				return;
			}
			if (!WALK_KEYS.has(e.key)) return;
			e.preventDefault();
			if (e.key === "ArrowUp" && at === 0) return land(latest.current.head?.());
			const to = walkTo(e.key, at, list.length);
			if (to !== null) land(list[to]);
		},
		onHeadKeyDown: (e) => {
			const control = latest.current.head?.();
			if (!control || e.target !== control || !bare(e)) return;
			if (e.key === "ArrowDown" || e.key === "Home" || e.key === "End") {
				// ↓ and Home step onto the first stop, End jumps to the last, as from nothing focused.
				e.preventDefault();
				const list = latest.current.stops();
				land(e.key === "End" ? list.at(-1) : list[0]);
			} else if (e.key === "Escape") {
				e.preventDefault();
				control.blur();
			}
		},
	};
}
