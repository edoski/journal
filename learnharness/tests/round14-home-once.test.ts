/**
 * Round 14, M7 (1 M3): on the exam eve Home listed the begun Poisson
 * lesson twice, "Continue Poisson distribution lesson · Left off 10 Nov"
 * (its task) and "Continue Poisson distribution · Planned today" (its
 * topic), both opening one chat. The map is the engine's own, on the
 * evaluation's records at the end of 10 Nov (`fixtures/plan`).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { courseMapOf } from "../src/store/course-records.ts";
import { todayRows, todaySteps } from "../components/study-home/study-facts.ts";
import { chat } from "./fixtures/now-demo.ts";
import type { StudyCourse } from "../src/core/contracts/study.ts";

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "plan", "probability-lesson-begun.map.json");
const MAP = courseMapOf("/study/probability", JSON.parse(fs.readFileSync(FIXTURE, "utf-8")))!;
const EVE: StudyCourse = { map: { ...MAP, today: "2026-11-17" }, unready: null, due: null, newToday: ["poisson" as never], lastActiveDaysAgo: 7 };

const words = (rows: ReturnType<typeof todayRows>) =>
	rows.map((row) => (row.kind === "session" ? `session ${row.chat.id}` : `course ${row.step.kind} ${"topics" in row.step ? row.step.topics.join(",") : ""}`));

describe("a begun lesson its open task holds (round 14, M7)", () => {
	it("is one step of the day: the task's Continue", () => {
		const steps = todaySteps(EVE);
		assert.deepEqual(steps.map((s) => s.kind), ["task"], "the begun topic is the task's lesson, not a second step");
	});

	it("is one line on Home whatever the session's state, even one Home cannot place", () => {
		const lesson = chat("poisson", { title: "Poisson distribution", ended: "cut", pendingQuestion: true, tasks: ["poisson-lesson"], topics: ["poisson"], updatedAt: "2026-11-10T10:00:00.000Z", course: { workspace: "/study/probability", title: "Probability" } });
		for (const open of [[], [lesson], [{ ...lesson, ended: "left" as const, pendingQuestion: false }]]) {
			const rows = words(todayRows([EVE], open, "2026-11-17"));
			assert.equal(rows.filter((r) => r.includes("poisson")).length, 1, rows.join(" | "));
		}
	});
});
