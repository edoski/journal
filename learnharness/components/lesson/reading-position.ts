/**
 * The lesson's scroll model (round 2, 14 Nov 2026), decided once:
 *
 * - What follows a reply. His action (an answer, a message, a dock button,
 *   Next problem) brings the lesson to its end, so his own card and the
 *   working line are in view. The tutor's reply then follows until its
 *   first line reaches the top of the lesson, and stops there: he reads a
 *   long reply from its start instead of chasing its end. The reply's start
 *   is the ANCHOR, the end of what the transcript held when he acted.
 * - What shows that a reply arrived below. While any of the reply sits
 *   below what he can see, the cue above the dock reads "New reply". Once
 *   he has seen the end, it is a plain down arrow while he is above the
 *   bottom, and nothing at the bottom.
 *
 * Pure geometry, in the scroller's coordinates: `reserve` is the height the
 * dock takes over the transcript's end.
 */

/** The transcript's last element when he acted: the reply to his action
 *  starts below it. An element, not a position, so a card that enters
 *  above (a concluded problem joining the transcript) moves it too. Null
 *  when nothing holds the view (the lesson follows its plain end). */
export type ReplyAnchor = HTMLElement | null;

/** The reply's start in the scroller's coordinates, or null once the
 *  anchor has left the page. */
export function replyStart(anchor: ReplyAnchor, scroller: HTMLElement): number | null {
	if (!anchor?.isConnected) return null;
	return anchor.getBoundingClientRect().bottom - scroller.getBoundingClientRect().top + scroller.scrollTop;
}

/** The gap kept above the reply's first line when the view stops on it. */
export const REPLY_TOP_GAP = 24;

/** Content past what he has seen, in pixels, that counts as a new reply
 *  rather than layout settling (a formula typesetting, a card measuring). */
const UNREAD_MIN = 32;

/** Distance from the bottom past which the plain down arrow shows. */
const AWAY_MIN = 70;

/** Where following may take the view: the plain bottom, or the reply's
 *  start once the reply is taller than the view. */
export function followTarget(bottom: number, start: number | null): number {
	if (start === null) return bottom;
	return Math.max(0, Math.min(bottom, start - REPLY_TOP_GAP));
}

export interface ScrollGeometry {
	scrollTop: number;
	scrollHeight: number;
	clientHeight: number;
	reserve: number;
}

/** The end of the transcript's own content, the dock's reserved tail left out. */
export function contentEnd(g: ScrollGeometry): number {
	return g.scrollHeight - g.reserve;
}

/** The furthest line he has had in view, given what he saw before. */
export function seenThrough(g: ScrollGeometry, seenBefore: number): number {
	const visibleEnd = g.scrollTop + g.clientHeight - g.reserve;
	return Math.max(seenBefore, Math.min(visibleEnd, contentEnd(g)));
}

/** What the cue above the dock shows. */
export type ScrollCue = "new-reply" | "down" | null;

export function scrollCueOf(g: ScrollGeometry, seen: number): ScrollCue {
	if (contentEnd(g) - seen > UNREAD_MIN) return "new-reply";
	return g.scrollHeight - g.clientHeight - g.scrollTop > AWAY_MIN ? "down" : null;
}

/** Whether he has read past the reply's start to the very end, so the
 *  hold on the reply's start can let go and the lesson follow its end. */
export function readPastAnchor(g: ScrollGeometry, start: number | null): boolean {
	if (start === null) return false;
	const atEnd = g.scrollHeight - g.clientHeight - g.scrollTop < 8;
	return atEnd && g.scrollTop > start - REPLY_TOP_GAP;
}
