"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import { SIDEBAR_DEFAULT_WIDTH, SIDEBAR_WIDTH_COOKIE, sidebarCookie } from "@/components/sidebar-cookies";

/** T3 Code's numbers (`threadSidebarWidth.ts`): 16rem by default, 13rem at
 *  least, and the page beside it keeps 40rem. */
export { SIDEBAR_DEFAULT_WIDTH };
export const SIDEBAR_MIN_WIDTH = 208;
export const MAIN_MIN_WIDTH = 640;
/** One arrow press on the handle moves the edge this far. */
export const SIDEBAR_KEY_STEP = 16;

const STORAGE_KEY = "lh:sidebar-width";

/** The width the server drew the page with (the cookie's), which
 *  hydration must draw too. */
export const ServerSidebarWidth = createContext(SIDEBAR_DEFAULT_WIDTH);

/** The widest the sidebar may be in a window this wide: the page keeps
 *  640px, and the sidebar never goes under its minimum. Pure. */
export function maxSidebarWidth(windowWidth: number): number {
	return Math.max(SIDEBAR_MIN_WIDTH, Math.floor(windowWidth) - MAIN_MIN_WIDTH);
}

/** A width inside the sidebar's bounds for this window. Pure. */
export function clampSidebarWidth(width: number, windowWidth: number): number {
	return Math.round(Math.min(maxSidebarWidth(windowWidth), Math.max(SIDEBAR_MIN_WIDTH, width)));
}

/** A stored width as a number, or the default when none is stored or it
 *  does not read as one. Pure. */
export function parseSidebarWidth(stored: string | null): number {
	const width = stored === null ? NaN : Number(stored);
	return Number.isFinite(width) ? width : SIDEBAR_DEFAULT_WIDTH;
}

const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
	listeners.add(onChange);
	window.addEventListener("resize", onChange);
	window.addEventListener("storage", onChange);
	return () => {
		listeners.delete(onChange);
		window.removeEventListener("resize", onChange);
		window.removeEventListener("storage", onChange);
	};
}

function readWidth(): number {
	let stored: string | null = null;
	try {
		stored = localStorage.getItem(STORAGE_KEY);
	} catch {}
	return clampSidebarWidth(parseSidebarWidth(stored), window.innerWidth);
}

/** Keeps a width the learner chose (null forgets it, back to the default). */
export function storeSidebarWidth(width: number | null): void {
	try {
		if (width === null) localStorage.removeItem(STORAGE_KEY);
		else localStorage.setItem(STORAGE_KEY, String(Math.round(width)));
		document.cookie = width === null ? `${SIDEBAR_WIDTH_COOKIE}=; Path=/; Max-Age=0` : sidebarCookie(SIDEBAR_WIDTH_COOKIE, String(Math.round(width)));
	} catch {}
	for (const onChange of listeners) onChange();
}

/** The Proposed sidebar's width: the one the learner dragged to, kept
 *  across reloads, inside the bounds of the window as it is now. Hydration
 *  draws the server's (the cookie's) width, so nothing moves on load. */
export function useSidebarWidth(): number {
	const server = useContext(ServerSidebarWidth);
	return useSyncExternalStore(subscribe, readWidth, () => server);
}
