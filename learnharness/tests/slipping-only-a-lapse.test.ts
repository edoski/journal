/**
 * "Slipping" says he is losing something he had (round 11, 3 N1 and 2 n6):
 * Invertible and Poisson read "Slipping · Check again another day" twenty
 * minutes after their first lesson, and Random variables read it after a
 * review whose last answer was right on his own. A topic slips only when
 * he could do it on his own and his newest counted answer is not right;
 * any other topic the engine calls weak says how he answered it, the
 * warning ink and Slipping left out.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CourseMapTopic, TopicHandle, TopicSignals } from "../src/core/index.ts";
import { slipBeside, standingOf } from "../components/course-map/topic-map/topic-standing.ts";

const QUIET: TopicSignals = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const topic = (over: Partial<CourseMapTopic>): CourseMapTopic => ({ handle: "t" as TopicHandle, title: "T", level: "assisted", introduced: "2026-11-08", review: null, weak: true, signals: QUIET, tasks: [], ...over });
const said = (t: CourseMapTopic) => ({ ...standingOf(t), slip: slipBeside(t, (h) => h)?.words ?? null });

describe("Slipping", () => {
	it("never heads a topic first taught today, after a confident miss answered right since", () => {
		const invertible = topic({ right: "unaided", signals: { ...QUIET, confidentErrors: 1, repaired: true } });
		// The engine still calls it weak: its check is to come, never "Right on your own" (round 20, m4).
		assert.deepEqual(said(invertible), { fill: 0.75, slipping: false, words: "Check again another day", short: "Check again another day", slip: null });
	});

	it("never heads a review whose miss he answered right on his own since", () => {
		const rv = topic({ level: "independent", signals: { ...QUIET, lapsed: true, repaired: true } });
		assert.deepEqual(said(rv), { fill: 0.75, slipping: false, words: "Check again another day", short: "Check again another day", slip: null });
		const helped = topic({ level: "retained", signals: { ...QUIET, lapsed: true, repaired: true, repairedWithHelp: true } });
		assert.equal(said(helped).words, "Right with help");
	});

	it("never heads a topic still being learned, a mistake open or not", () => {
		const eigen = topic({ right: "unaided", signals: { ...QUIET, gap: "Kernel of A − λI", repaired: true } });
		assert.equal(said(eigen).slipping, false);
		const open = topic({ signals: { ...QUIET, gap: "Counts rows", mistake: true } });
		assert.deepEqual(said(open), { fill: 0.75, slipping: false, words: "Not right last time", short: "Not right last time", slip: "Mistake to fix" });
	});

	it("heads a topic he could do on his own whose newest counted answer is not right", () => {
		const lapse = topic({ level: "retained", signals: { ...QUIET, lapsed: true, mistake: true } });
		assert.deepEqual(said(lapse), { fill: 0.75, slipping: true, words: "Slipping", short: "Slipping", slip: "Not right last time" });
	});
});
