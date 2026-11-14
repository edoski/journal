"use client";

/**
 * The page's arrows (Edo's keyboard reach, 13 Nov 2026). Tab is dead
 * (owner, 17 Sep 2026), so bare ↑ ↓ ← → move focus between the rows and
 * links of the main pane and the sidebar's rows, by where they sit on
 * screen (src/core/spatial-nav.ts). Enter and Space open them, as links
 * and buttons already do.
 *
 * Window level, bubble phase: every surface that owns its arrows (Radix
 * tabs and menus, the sidebar tree, the maps, the question dock, the
 * confidence toggle) claims them first with preventDefault, and this
 * listener takes only what they leave.
 *
 * The main pane is the app shell's own <main>, the first in the document:
 * pages nest their own <main> inside it, and the sidebar holds none.
 */

import { useEffect } from "react";
import {
	directionOfKey,
	firstInReadingOrder,
	isTypingSurface,
	isVertical,
	lastInReadingOrder,
	pickInDirection,
	type Direction,
} from "@/src/core";

const TARGETS = 'a[href], button, [role="link"], [role="button"], [tabindex="0"]';
const SIDEBAR_ROWS = "[data-sidebar-row]";
const FIELDS = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
const OVERLAYS = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]';

/** True while a dialog, popover or menu is open: their keys are theirs. */
export function overlayOpen(): boolean {
	return document.querySelector(OVERLAYS) !== null;
}

const mainPane = () => document.querySelector<HTMLElement>("main");

function reachable(el: HTMLElement): boolean {
	if (el.matches(FIELDS) || el.getAttribute("tabindex") === "-1" || el.matches(":disabled")) return false;
	if (el.closest('[inert], [aria-hidden="true"]')) return false;
	const box = el.getBoundingClientRect();
	if (box.width === 0 || box.height === 0) return false;
	// Hover-only controls (the transcript's copy buttons) sit at opacity 0 and stay out.
	return el.checkVisibility({ visibilityProperty: true, opacityProperty: true });
}

/** The targets of one region: the main pane, or the sidebar's rows. */
function regionTargets(region: "main" | "sidebar", main: HTMLElement): HTMLElement[] {
	const found =
		region === "main"
			? Array.from(main.querySelectorAll<HTMLElement>(TARGETS))
			: Array.from(document.querySelectorAll<HTMLElement>(SIDEBAR_ROWS)).filter((row) => !main.contains(row));
	return found.filter(reachable);
}

function regionOf(el: Element, main: HTMLElement): "main" | "sidebar" | null {
	if (main.contains(el)) return "main";
	return el.closest(SIDEBAR_ROWS) ? "sidebar" : null;
}

/** The nearest box the last click landed in that scrolls on this axis:
 *  with nothing focused the browser scrolls it on ↑ ↓, as the lesson's
 *  transcript does, and that stays the arrows' job there. */
function scrollsUnderPointer(from: Element | null, main: HTMLElement): boolean {
	for (let el = from; el && main.contains(el); el = el.parentElement) {
		const { overflowY } = getComputedStyle(el);
		if ((overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight) return true;
	}
	return false;
}

function move(target: HTMLElement) {
	target.focus({ preventScroll: true });
	target.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function pick(direction: Direction, main: HTMLElement, lastPointer: Element | null): HTMLElement | null {
	const active = document.activeElement;
	if (!active || active === document.body) {
		if (!isVertical(direction) || scrollsUnderPointer(lastPointer, main)) return null;
		const targets = regionTargets("main", main);
		const boxes = targets.map((t) => t.getBoundingClientRect());
		return targets[direction === "down" ? firstInReadingOrder(boxes) : lastInReadingOrder(boxes)] ?? null;
	}
	const region = regionOf(active, main);
	if (!region) return null;
	// ↑ ↓ stay in the focused region; ← → cross between the sidebar and the page.
	const targets = (isVertical(direction) ? regionTargets(region, main) : [...regionTargets("sidebar", main), ...regionTargets("main", main)]).filter(
		(t) => !t.contains(active) && !active.contains(t),
	);
	const index = pickInDirection(
		active.getBoundingClientRect(),
		direction,
		targets.map((t) => t.getBoundingClientRect()),
	);
	return targets[index] ?? null;
}

/** Mounted once by KeyboardShortcuts. */
export function useSpatialArrows() {
	useEffect(() => {
		let lastPointer: Element | null = null;
		const onPointerDown = (e: PointerEvent) => {
			lastPointer = e.target instanceof Element ? e.target : null;
		};
		const onKeyDown = (e: KeyboardEvent) => {
			const direction = directionOfKey(e.key);
			if (!direction || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
			if (isTypingSurface(e) || overlayOpen()) return;
			const main = mainPane();
			if (!main) return;
			const target = pick(direction, main, lastPointer);
			if (!target) return;
			e.preventDefault();
			move(target);
		};
		window.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });
		window.addEventListener("keydown", onKeyDown);
		return () => {
			window.removeEventListener("pointerdown", onPointerDown, { capture: true });
			window.removeEventListener("keydown", onKeyDown);
		};
	}, []);
}
