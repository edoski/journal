/**
 * Round 15, m10 (1 m4, 2 step 18): course-page words with no object, or
 * that disagree:
 *   - "Check it" as an arc's press, which said neither what to do nor how;
 *   - "Due 6 Nov" in the arc list beside "Due since 6 Nov" in the Now row;
 *   - "On your own · Back 23 Dec" in the arc list against "Due since 13 Nov,
 *     back 23 Dec" on the map's card;
 *   - the head's "Not ready yet", with no object.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CourseMapTopic, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { courseGroups } from "../components/course-page/course-model.ts";
import { sidebarSays } from "../components/unit-inbox/sidebar-says.ts";
import { READY_FACT_WORDS } from "../components/study-words.ts";
import { CHECK_HINT, CHECK_WORDS } from "../components/course-page/road/road-arc.tsx";

const h = (s: string) => s as TopicHandle;
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const topic = (handle: string, title: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic => ({ handle: h(handle), title, level: "independent", introduced: "2026-10-01", review: null, weak: false, signals: QUIET, tasks: [], ...over });
const course: StudyCourse = {
	map: {
		workspace: "/s/pr",
		title: "Probability",
		today: "2026-11-17",
		revision: 1,
		exam: null,
		current: h("bayes"),
		focus: null,
		tasks: [],
		topics: [
			topic("binomial", "Binomial distribution", { review: { kind: "due", date: "2026-11-17", overdue: 11 } }),
			topic("bayes", "Bayes' rule", { review: { kind: "scheduled", date: "2026-12-23", held: { exam: null, since: "2026-11-13" } } }),
		],
		edges: [],
	},
	unready: null,
	due: [],
	newToday: [],
	lastActiveDaysAgo: 0,
};

describe("the course page's words (round 15, m10)", () => {
	const rows = courseGroups(course).flatMap((g) => g.topics);
	const said = sidebarSays([course], [], course.map.workspace);

	it("says a review one way, as the sidebar and the map's card say it", () => {
		for (const [handle, words] of [
			["binomial", "Due 6 Nov"],
			["bayes", "Back Wed 23 Dec"],
		] as const) {
			const row = rows.find((r) => r.topic.handle === handle)!;
			assert.equal(row.factWords, words, handle);
			assert.equal(said.get(h(handle))?.fact?.words, words, `${handle}: the sidebar's, which the map's card reads`);
		}
	});

	it("says what not ready is for", () => {
		assert.equal(READY_FACT_WORDS.notYet, "Not ready for the exam yet");
	});

	it("names an arc's check by what he does, its hint saying what it holds", () => {
		assert.equal(CHECK_WORDS, "Test this arc");
		assert.match(CHECK_HINT, /each of its topics/);
	});
});
