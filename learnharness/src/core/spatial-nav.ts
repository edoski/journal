/**
 * Spatial arrows (Edo's keyboard reach, 13 Nov 2026): which target an
 * arrow key moves to, read from where things sit on screen. Tab is dead
 * (owner, 17 Sep 2026), so the arrows walk the page's rows and links the
 * way they look, not the way the DOM orders them. Pure: boxes in, an index
 * out; the DOM side lives in components/spatial-arrows.ts.
 */

export type Direction = "up" | "down" | "left" | "right";

/** A screen box, the subset of DOMRect the picker reads. */
export interface Box {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

const DIRECTION_OF_KEY: Record<string, Direction> = {
	ArrowUp: "up",
	ArrowDown: "down",
	ArrowLeft: "left",
	ArrowRight: "right",
};

export function directionOfKey(key: string): Direction | null {
	return DIRECTION_OF_KEY[key] ?? null;
}

export const isVertical = (direction: Direction) => direction === "up" || direction === "down";

/** Each direction turned into "down", so one rule measures all four:
 *  up mirrors the vertical axis, right swaps the axes, left does both. */
const AS_DOWN: Record<Direction, (box: Box) => Box> = {
	down: (b) => b,
	up: (b) => ({ top: -b.bottom, bottom: -b.top, left: b.left, right: b.right }),
	right: (b) => ({ top: b.left, bottom: b.right, left: b.top, right: b.bottom }),
	left: (b) => ({ top: -b.right, bottom: -b.left, left: b.top, right: b.bottom }),
};

const midY = (b: Box) => (b.top + b.bottom) / 2;
const midX = (b: Box) => (b.left + b.right) / 2;

/**
 * The candidate an arrow moves to from `from`, or -1 when nothing lies that
 * way. A candidate lies that way when it starts past the middle of `from`
 * and ends past its far edge, so a button inside the same row never counts
 * as "below" it while a row that shares a hairline does. Candidates that
 * overlap `from` across the axis win over any that do not; among them the
 * nearest along the axis, then the best lined up. Without overlap, the
 * nearest by the gap along the axis plus the gap across it.
 */
export function pickInDirection(from: Box, direction: Direction, candidates: readonly Box[]): number {
	const turn = AS_DOWN[direction];
	const f = turn(from);
	let best = -1;
	let bestKey: [number, number, number] | null = null;
	candidates.forEach((candidate, index) => {
		const c = turn(candidate);
		if (c.top < midY(f) || c.bottom <= f.bottom) return;
		const along = Math.max(0, c.top - f.bottom);
		const overlap = Math.min(f.right, c.right) - Math.max(f.left, c.left);
		const across = Math.max(0, -overlap);
		const offset = Math.abs(midX(c) - midX(f));
		const key: [number, number, number] = overlap > 0 ? [0, along, offset] : [1, along + across, offset];
		if (!bestKey || compare(key, bestKey) < 0) {
			best = index;
			bestKey = key;
		}
	});
	return best;
}

function compare(a: readonly number[], b: readonly number[]): number {
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
	return 0;
}

/** Where ↓ lands with nothing focused: the top row's leftmost target. The
 *  top row is every target that starts above the topmost one's middle. */
export function firstInReadingOrder(candidates: readonly Box[]): number {
	if (candidates.length === 0) return -1;
	const top = candidates.reduce((a, b) => (b.top < a.top ? b : a));
	return indexOfBest(candidates, (c) => c.top < midY(top), (a, b) => a.left < b.left);
}

/** Where ↑ lands with nothing focused: the bottom row's rightmost target. */
export function lastInReadingOrder(candidates: readonly Box[]): number {
	if (candidates.length === 0) return -1;
	const bottom = candidates.reduce((a, b) => (b.bottom > a.bottom ? b : a));
	return indexOfBest(candidates, (c) => c.bottom > midY(bottom), (a, b) => a.right > b.right);
}

function indexOfBest(candidates: readonly Box[], inRow: (c: Box) => boolean, better: (a: Box, b: Box) => boolean): number {
	let best = -1;
	candidates.forEach((c, i) => {
		if (inRow(c) && (best === -1 || better(c, candidates[best]!))) best = i;
	});
	return best;
}
