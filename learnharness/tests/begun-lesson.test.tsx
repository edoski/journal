/**
 * A lesson he began on a topic not yet taught reads as a lesson that goes
 * on, on every surface that dates it, never as a start (round 12, 1 D3:
 * after two Poisson lessons whose answers were all predictions, its page
 * said "First lesson Sat 14 Nov", the course page "Not started" and the
 * calendar "New topic"). The map is the engine's own, on the evaluation's
 * records at the end of 10 Nov (`fixtures/plan`).
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "./helpers/app-render.tsx";
import type { CalendarEntry } from "../components/calendar/calendar-facts.ts";
import { lookWords } from "../components/calendar/calendar-facts.ts";
import { standingOf } from "../components/course-map/topic-map/topic-standing.ts";
import { pickupSections } from "../components/unit-inbox/topic-page/pickup/pickup-facts.ts";
import { ScheduledEntry } from "../components/unit-inbox/topic-page/pickup/pickup-parts.tsx";
import { topicFacts } from "../components/unit-inbox/topic-page/topic-facts.ts";
import { courseMapOf } from "../src/store/course-records.ts";
import { stepWords, todayRows, todaySteps } from "../components/study-home/study-facts.ts";
import { chat } from "./fixtures/now-demo.ts";
import type { StudyCourse } from "../src/core/contracts/study.ts";

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "plan", "probability-lesson-begun.map.json");
const MAP = courseMapOf("/study/probability", JSON.parse(fs.readFileSync(FIXTURE, "utf-8")))!;
const POISSON = MAP.topics.find((t) => t.handle === "poisson")!;
const COURSE: StudyCourse = { map: MAP, unready: null, due: null, newToday: [], lastActiveDaysAgo: 0 };

describe("a lesson he began", () => {
	it("reads the engine's begun start", () => {
		assert.deepEqual(POISSON.startsWhy, { kind: "begun" });
		assert.equal(POISSON.starts, "2026-11-11");
	});

	it("stands as a lesson in progress, never Not started", () => {
		assert.equal(standingOf(POISSON).words, "Lesson in progress");
	});

	it("is scheduled as the day the lesson continues, never a first lesson", () => {
		const { scheduled } = pickupSections(topicFacts({ course: COURSE, topic: POISSON, chats: [], read: null }));
		assert.equal(scheduled?.kind, "lesson");
		assert.equal(scheduled?.day, "Wed 11 Nov");
		const html = renderToStaticMarkup(<ScheduledEntry kind="lesson" day="Wed 11 Nov" waits={null} />);
		assert.ok(html.includes("Lesson continues"), html);
		assert.ok(!html.includes("First lesson"), html);
	});

	it("goes on today on Home as Continue, never Start", () => {
		const steps = todaySteps({ ...COURSE, newToday: ["poisson" as never] });
		const words = steps.map(stepWords);
		assert.ok(words.includes("Continue Poisson distribution"), words.join(" | "));
		assert.ok(!words.some((w) => w.startsWith("Start Poisson")), words.join(" | "));
	});

	it("goes on above the day's new starts on Home, as the plan lists it (round 13, 1 n3)", () => {
		const lesson = chat("poisson", { title: "Poisson distribution", ended: "left", tasks: ["poisson-lesson"], topics: ["poisson"], updatedAt: "2026-11-10T10:00:00.000Z", course: { workspace: "/study/probability", title: "Probability" } });
		const course = { ...COURSE, map: { ...MAP, today: "2026-11-11" }, newToday: ["poisson", "geometric"] as never[] };
		const rows = todayRows([course], [lesson], "2026-11-11");
		assert.deepEqual(
			rows.map((row) => (row.kind === "session" ? `session ${row.chat.id}` : `course ${row.step.kind} ${"topics" in row.step ? row.step.topics.join(",") : ""}`)),
			["session poisson", "course topic geometric"],
		);
	});

	it("is a lesson on the calendar, never a new topic", () => {
		const entry = { kind: "new", id: "new:poisson", day: "2026-11-11", title: POISSON.title, topic: POISSON } as unknown as CalendarEntry;
		assert.equal(lookWords(entry, MAP.today), "Lesson");
	});
});
