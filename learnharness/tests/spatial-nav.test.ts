/**
 * The page's arrows (Edo's keyboard reach, 13 Nov 2026): with Tab dead,
 * ↑ ↓ ← → move to what lies that way on screen.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { firstInReadingOrder, lastInReadingOrder, pickInDirection, type Box } from "../src/core/index.ts";

const box = (left: number, top: number, width: number, height: number): Box => ({ left, top, right: left + width, bottom: top + height });

// Home at Edo's window: the sidebar's rows on the left, the map's tabs and
// enlarge button on top, the Today rows stacked under them.
const sidebarRow = box(8, 560, 240, 60);
const tabs = box(436, 52, 350, 32);
const enlarge = box(1316, 56, 24, 24);
const today = [0, 1, 2, 3].map((i) => box(424, 559 + 64 * i, 920, 64));
const home = [sidebarRow, tabs, enlarge, ...today];

describe("the arrows move to what lies that way", () => {
	it("↓ and ↑ walk rows that share a hairline, one at a time", () => {
		assert.equal(pickInDirection(today[0]!, "down", home), home.indexOf(today[1]!));
		assert.equal(pickInDirection(today[2]!, "up", home), home.indexOf(today[1]!));
	});

	it("↓ past the last row finds nothing, so the key is left alone", () => {
		assert.equal(pickInDirection(today[3]!, "down", home), -1);
	});

	it("prefers what lines up across the axis over something nearer on a diagonal", () => {
		const above = box(424, 400, 100, 30);
		const diagonalNearer = box(1400, 520, 60, 30);
		const candidates = [above, diagonalNearer];
		assert.equal(pickInDirection(today[0]!, "up", candidates), 0);
	});

	it("→ from a sidebar row lands on the page row beside it, and ← comes back", () => {
		assert.equal(pickInDirection(sidebarRow, "right", home), home.indexOf(today[0]!));
		assert.equal(pickInDirection(today[0]!, "left", home), home.indexOf(sidebarRow));
	});

	it("a button inside a row's band is not below or above it", () => {
		const row = box(400, 200, 600, 64);
		const inner = box(900, 216, 24, 24);
		assert.equal(pickInDirection(row, "down", [inner]), -1);
		assert.equal(pickInDirection(inner, "up", [row]), -1);
	});

	it("with nothing focused, ↓ enters at the top row's leftmost target and ↑ at the bottom row's rightmost", () => {
		const page = [tabs, enlarge, ...today];
		assert.equal(firstInReadingOrder(page), 0);
		assert.equal(lastInReadingOrder(page), page.length - 1);
		assert.equal(firstInReadingOrder([]), -1);
	});
});
