/**
 * Round 21, open decision 1, ruled by Edo on 23 Nov 2026: no new-topic
 * start on the Journal day off; reviews stay on it, as settled.
 *
 * On lens 2's world the plan started two new topics on Sat 14 Nov, the day
 * the Journal's schedule rests (`WEEKDAY:SAT OFF`, `2` `58`). The engine
 * now starts none there: the calendar, read as the app reads it, holds the
 * day's reviews and no start, and labels it a day off in the Journal.
 */
import { demoWorldMissing, hasDemoSeed, openDemoApp, type DemoApp } from "./helpers/demo-app.tsx";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { CalendarListing } from "../src/core/index.ts";

const missing = demoWorldMissing();
const skip = missing && (!process.env.LH_REQUIRE_REAL_ENGINE || !hasDemoSeed()) ? missing : false;

const SATURDAY = "2026-11-14";

describe("round 21: the Journal day off starts no new topic", { skip, concurrency: false, timeout: 600_000 }, () => {
	let app: DemoApp;
	before(async () => {
		app = await openDemoApp("2026-11-08");
	});
	after(() => app?.close());

	it("Sat 14 Nov holds its reviews and no start, in the plan and on the calendar", async () => {
		const { calendarEntries } = await import("../components/calendar/calendar-facts.ts");
		const listing = (await (await fetch("/api/calendar")).json()) as CalendarListing;
		assert.ok(listing.available, "the calendar read the courses");
		const day = listing.schedule?.find((d) => d.date === SATURDAY);
		assert.ok(day?.journalOff, `the Journal rests on ${SATURDAY}: ${JSON.stringify(day)}`);
		const planned = listing.courses.flatMap((c) => c.planned.filter((d) => d.date === SATURDAY).map((d) => ({ course: c.map.title, ...d })));
		const starts = planned.flatMap((d) => d.new.map((t) => `${d.course}: ${t}`));
		assert.deepEqual(starts, [], `no start on the day off`);
		assert.ok(planned.some((d) => d.reviews.length > 0), "its reviews stay");
		const { chats } = (await (await fetch("/api/chats")).json()) as { chats: Parameters<typeof calendarEntries>[0]["chats"] };
		const drawn = calendarEntries({ courses: listing.courses, chats, scope: null }).filter((e) => e.day === SATURDAY);
		assert.deepEqual(drawn.filter((e) => e.kind === "new").map((e) => e.title), [], "the calendar draws no start on it");
		assert.ok(drawn.some((e) => e.kind === "review"), "the calendar keeps its reviews");
	});
});
