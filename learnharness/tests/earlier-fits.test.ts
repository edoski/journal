/**
 * A topic page's Earlier list ends inside the window (round 11, 1 visual,
 * shot 41): the Eigen page's history ran off the bottom edge, its last row
 * cut by the window. Earlier shows the days that fit whole, then "Show the
 * rest" for the older ones.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { daysThatFit } from "../components/unit-inbox/topic-page/pickup/earlier-fit.ts";

describe("the Earlier days that fit (1, shot 41)", () => {
	it("keeps each day whose last row ends inside the pane, with room left for the Show the rest row", () => {
		// Days end at 600, 780 and 1010 px down a pane 760 tall: the second day would sit under the Show the rest row.
		assert.equal(daysThatFit([600, 780, 1010], 760, 36), 1);
		assert.equal(daysThatFit([600, 700, 1010], 760, 36), 2);
	});

	it("shows every day when all fit, and always the newest day", () => {
		assert.equal(daysThatFit([300, 500], 760, 36), 2, "nothing folds when the last day fits");
		assert.equal(daysThatFit([900, 1200], 760, 36), 1, "the newest day stays even when it runs on");
	});
});
