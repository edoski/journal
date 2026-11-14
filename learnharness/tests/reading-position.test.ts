import { test } from "node:test";
import assert from "node:assert/strict";
import { followTarget, readPastAnchor, REPLY_TOP_GAP, scrollCueOf, seenThrough, type ScrollGeometry } from "../components/lesson/reading-position.ts";

// A 930px lesson with a 200px dock over its end.
const at = (scrollTop: number, scrollHeight: number): ScrollGeometry => ({ scrollTop, scrollHeight, clientHeight: 930, reserve: 200 });

test("a short reply is followed to the lesson's end", () => {
	// He acted with the transcript ending at 1500; the reply took it to 1800.
	assert.equal(followTarget(1800 + 200 - 930, 1500), 1070);
});

test("a reply taller than the lesson stops following at its own first line", () => {
	// The 1268px reply of round 2: following to the end would push its start
	// 1268px out of view; the view holds the reply's start under the top bar.
	const bottom = 1500 + 1268 + 200 - 930;
	assert.equal(followTarget(bottom, 1500), 1500 - REPLY_TOP_GAP);
	assert.equal(followTarget(bottom, null), bottom);
});

test("a reply that lands below what he can see shows the New reply cue", () => {
	// He read to the end (1500), then stayed put while 1268px arrived below.
	const before = at(1500 + 200 - 930, 1500 + 200);
	const seen = seenThrough(before, -Infinity);
	assert.equal(scrollCueOf(before, seen), null);
	const after = at(before.scrollTop, 1500 + 1268 + 200);
	assert.equal(scrollCueOf(after, seenThrough(after, seen)), "new-reply");
});

test("the cue goes once he has read to the end, and a plain arrow shows when he scrolls back up", () => {
	let seen = 1500;
	const end = at(1500 + 1268 + 200 - 930, 1500 + 1268 + 200);
	seen = seenThrough(end, seen);
	assert.equal(scrollCueOf(end, seen), null);
	const up = at(400, end.scrollHeight);
	assert.equal(scrollCueOf(up, seenThrough(up, seen)), "down");
});

test("layout settling by a few pixels is not a new reply", () => {
	const g = at(1500 + 200 - 930, 1500 + 200);
	const seen = seenThrough(g, -Infinity);
	const settled = at(g.scrollTop, g.scrollHeight + 12);
	assert.equal(scrollCueOf(settled, seenThrough(settled, seen)), null);
});

test("the hold on the reply's start lets go only once he reads to the very end", () => {
	const height = 1500 + 1268 + 200;
	assert.equal(readPastAnchor(at(1500 - REPLY_TOP_GAP, height), 1500), false);
	assert.equal(readPastAnchor(at(height - 930, height), 1500), true);
	assert.equal(readPastAnchor(at(height - 930, height), null), false);
});
