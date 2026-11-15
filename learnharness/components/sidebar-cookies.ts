/**
 * The sidebar's open state and width as cookies, which the root layout reads
 * on the server so the page's first frame is the settled layout (round 8:
 * the sidebar started folded and slid open after mount, shifting the page).
 * No "use client": the server calls these. Pure.
 */

/** T3 Code's default sidebar width (`threadSidebarWidth.ts`), 16rem. */
export const SIDEBAR_DEFAULT_WIDTH = 256;

/** "1" open, "0" folded. */
export const SIDEBAR_OPEN_COOKIE = "lh-sidebar-open";

/** The width he dragged the sidebar to, in px. */
export const SIDEBAR_WIDTH_COOKIE = "lh-sidebar-width";

/** A cookie for a sidebar preference: the whole app, a year, never sent
 *  across sites. */
export function sidebarCookie(name: string, value: string): string {
	return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

/** What the server read from the cookies: the open state (null before the
 *  first load that wrote it) and the width. */
export function sidebarFirstFrame(open: string | undefined, width: string | undefined): { open: boolean | null; width: number } {
	const w = width === undefined ? NaN : Number(width);
	return { open: open === undefined ? null : open === "1", width: Number.isFinite(w) ? w : SIDEBAR_DEFAULT_WIDTH };
}
