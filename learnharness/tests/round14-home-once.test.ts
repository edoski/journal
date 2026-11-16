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
import { nowLine } from "../components/study-home/needs-you.ts";
import { courseGroups } from "../components/course-page/course-model.ts";
import { lessonTitle } from "../components/study-home/agenda-rows/row-facts.ts";
import { doneToday } from "../components/study-home/day-record.ts";
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

/**
 * Round 14, m28 (1 n5, 2 free): one session read differently by surface.
 * Home's line for Poisson's open task said "Left off 10 Nov" (the task's
 * own words), while the calendar and the Poisson page read the session
 * holding it, "Your turn"; and the course page's Needs you listed Random
 * variables, a topic the Poisson lesson only touched, which no Today line
 * asks.
 */
describe("one session, one status on every surface (round 14, m28)", () => {
	const lesson = chat("poisson", { title: "Poisson distribution", ended: "mid-lesson", pendingQuestion: true, tasks: ["poisson-lesson"], topics: ["poisson", "random-variables"], ownTopics: ["poisson"], updatedAt: "2026-11-10T10:00:00.000Z", course: { workspace: "/study/probability", title: "Probability" } });

	it("Home's line for an open task is the session holding it, with that session's status", () => {
		const rows = todayRows([EVE], [lesson], "2026-11-17");
		const row = rows.find((r) => r.kind === "session" && r.chat.id === "poisson");
		assert.ok(row, words(rows).join(" | "));
		assert.equal(nowLine(row).slot, "Your turn", "as the calendar and the topic page read it");
	});

	it("the course page's Needs you holds only the topics Today asks", () => {
		assert.ok(MAP.topics.some((t) => t.handle === "random-variables"), "the fixture holds Random variables");
		const groups = courseGroups(EVE, [lesson], [EVE]);
		const needs = groups.find((g) => g.id === "needs-you")!.topics.map((t) => t.topic.handle);
		assert.deepEqual(needs, ["poisson"], "the lesson's own topic; one it only touched stays in its own group");
		const all = groups.flatMap((g) => g.topics.map((t) => t.topic.handle));
		assert.ok(all.includes("random-variables" as never), "and is still listed once");
	});
});

/**
 * Round 14, m29 (1 n8, round-13 n9): one session, two names. Problem sheet
 * 4's session read "Problem sheet 4" on its line while it waited, and
 * "Problem sheet 4: rank and nullity" once left and in Studied today.
 */
describe("one session, one name (round 14, m29)", () => {
	const course: StudyCourse = { map: { ...MAP, workspace: "/s/la", tasks: [{ key: "sheet-4", title: "Problem sheet 4: rank and nullity", step: null, updated: "2026-11-08", topics: [] }] } as never, unready: null, due: null, newToday: [], lastActiveDaysAgo: 0 };
	const sheet = (over: Partial<Parameters<typeof chat>[1]>) => chat("s4", { title: "Problem sheet 4", studied: true, tasks: ["sheet-4"], updatedAt: new Date().toISOString(), course: { workspace: "/s/la", title: "Linear Algebra" }, ...over });

	it("is the open task's title on its line in every state, and in Studied today", () => {
		const waiting = lessonTitle({ kind: "session", chat: sheet({ ended: "mid-lesson", pendingQuestion: true }), course });
		const left = lessonTitle({ kind: "session", chat: sheet({ ended: "left" }), course });
		const studied = doneToday([sheet({ ended: "left" })], new Date(), [course]);
		assert.equal(waiting, "Problem sheet 4: rank and nullity");
		assert.equal(left, "Continue Problem sheet 4: rank and nullity", "the line he picks up says Continue, with the same name");
		assert.deepEqual(studied, ["Problem sheet 4: rank and nullity"]);
	});
});
