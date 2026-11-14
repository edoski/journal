/**
 * A review the plan holds past the day memory asked for reads the same on
 * the course page's list and on the map's card (round 6, visual polish:
 * Cramer's rule said "Due since 6 Nov" in the lists and "Taught, not
 * tried" on the map, which hid a late review as if it were a date ahead).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sidebarSays } from "../components/unit-inbox/sidebar-says.ts";
import { cardLine } from "../components/course-map/topic-map/topic-standing.ts";
import type { StudyCourse, TopicHandle } from "../src/core/index.ts";
import { LINALG, map, topic, TODAY } from "./fixtures/now-demo.ts";

const course = (review: Parameters<typeof topic>[3]["review"]): StudyCourse => ({
	...LINALG,
	map: map({ ...LINALG.map, today: TODAY, topics: [topic("cramer", "Cramer's rule", "introduced", { review })] }),
	unready: [],
	due: [],
});

describe("a late review", () => {
	it("is the card's line, in the list's words", () => {
		const c = course({ kind: "scheduled", date: "2026-11-20", held: { since: "2026-11-06", exam: null } });
		const said = sidebarSays([c], [], c.map.workspace).get("cramer" as TopicHandle);
		assert.equal(said?.fact?.words, "Due since 6 Nov");
		assert.equal(cardLine(said)?.words, "Due since 6 Nov", "the map says what the list says");
	});

	it("leaves a review dated ahead off the card, which says where he stands", () => {
		const c = course({ kind: "scheduled", date: "2026-11-20" });
		const said = sidebarSays([c], [], c.map.workspace).get("cramer" as TopicHandle);
		assert.match(said?.fact?.words ?? "", /^Back in/);
		assert.equal(cardLine(said), null);
	});
});
