/**
 * The Proposed sidebar's width: T3 Code's bounds (16rem by default, 13rem
 * at least, the page beside it keeps 40rem) and how a stored width reads.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	clampSidebarWidth,
	maxSidebarWidth,
	parseSidebarWidth,
	SIDEBAR_DEFAULT_WIDTH,
	SIDEBAR_MIN_WIDTH,
} from "../components/unit-inbox/sidebar-width.ts";

describe("the sidebar's width", () => {
	it("starts at the default when nothing usable is stored", () => {
		assert.equal(parseSidebarWidth(null), SIDEBAR_DEFAULT_WIDTH);
		assert.equal(parseSidebarWidth("wide"), SIDEBAR_DEFAULT_WIDTH);
		assert.equal(parseSidebarWidth("312"), 312);
	});

	it("leaves the page beside it at least 640px, and never goes under its minimum", () => {
		assert.equal(maxSidebarWidth(1280), 640);
		assert.equal(maxSidebarWidth(800), SIDEBAR_MIN_WIDTH);
		assert.equal(clampSidebarWidth(900, 1280), 640);
		assert.equal(clampSidebarWidth(120, 1280), SIDEBAR_MIN_WIDTH);
		assert.equal(clampSidebarWidth(300.4, 1280), 300);
	});

	it("narrows a stored width to fit a smaller window", () => {
		assert.equal(clampSidebarWidth(500, 1000), 360);
	});
});
