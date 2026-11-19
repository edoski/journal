/**
 * An exam with several sessions, on the screens (Edo, 19 Nov 2026). Once
 * the session he aimed at has gone by, the engine aims at the next one and
 * Home asks how it went, once, saying what moved the plan; Passed and Not
 * this time are saved to the record. The course head and the calendar show
 * the day he aims at with the next session as a plain second line.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { LEARNING_ENGINE } from "../config.ts";
import { createCourseRecords } from "../src/store/course-records.ts";
import { sessionPatch } from "../src/server/courses.ts";
import { EXAM_SESSION_WORDS, nextSessionWords, pastSessionWords } from "../components/study-words.ts";
import { sessionAsks } from "../components/study-home/day-record.ts";
import { Today } from "../components/study-home/today.tsx";
import { calendarEntries } from "../components/calendar/calendar-facts.ts";
import type { CourseExam, StudyCourse } from "../src/core";
import { realEngineMissing } from "./helpers/real-engine.ts";

const SESSIONS = ["2026-12-21", "2027-01-19", "2027-02-03"];
const AIMED: CourseExam = { date: SESSIONS[1]!, daysLeft: 28, sessions: SESSIONS, past: SESSIONS[0]! };
const ASK = "Your Artificial Intelligence exam on Monday 21 December has gone by, so the plan now aims at the next session, Tuesday 19 January. How did it go?";

const course = (exam: CourseExam | null): StudyCourse => ({
	map: { workspace: "/ai", title: "Artificial Intelligence", today: "2026-12-22", revision: 1, exam, current: null, focus: null, tasks: [], topics: [], edges: [] },
	unready: null,
	due: [],
	lastActiveDaysAgo: null,
	newToday: [],
});

describe("an exam with several sessions, on the screens", () => {
	it("says what moved the plan and asks how the session gone by went, in plain words with no count", () => {
		assert.equal(pastSessionWords("Artificial Intelligence", AIMED), ASK);
		assert.equal(pastSessionWords("Artificial Intelligence", { ...AIMED, past: undefined }), null, "nothing to ask once he answered");
		assert.deepEqual(sessionAsks([course(AIMED), course(null), course({ ...AIMED, past: undefined })]), [{ workspace: "/ai", words: ASK }]);
		assert.doesNotMatch(ASK, /\d+ days?|tonight/);
	});

	it("puts the ask under Home's heading with Passed and Not this time", () => {
		const doc = parseHTML(`<html><body>${renderToStaticMarkup(<Today rows={[]} done={[]} asks={sessionAsks([course(AIMED)])} busy={false} onContinue={() => {}} />)}</body></html>`).document;
		const ask = doc.querySelector("[data-slot=today-exam-session]");
		assert.ok(ask, "the ask shows");
		assert.match(ask.textContent ?? "", /has gone by, so the plan now aims at the next session/);
		assert.deepEqual(
			[...ask.querySelectorAll("button")].map((b) => b.textContent),
			[EXAM_SESSION_WORDS.passed, EXAM_SESSION_WORDS.notThisTime],
		);
		const none = parseHTML(`<html><body>${renderToStaticMarkup(<Today rows={[]} done={[]} busy={false} onContinue={() => {}} />)}</body></html>`).document;
		assert.ok(none.querySelector("[data-slot=today-exam-session]") === null, "no ask without a session gone by");
	});

	it("saves Passed as the session gone by with no later one, and Not this time as the session aimed at", () => {
		assert.deepEqual(sessionPatch(AIMED, "passed"), { exam: { date: SESSIONS[0], sessions: SESSIONS.slice(0, 1) } });
		assert.deepEqual(sessionPatch(AIMED, "not-this-time"), { exam: { date: SESSIONS[1] } });
		assert.equal(sessionPatch({ ...AIMED, past: undefined }, "passed"), null, "nothing to answer");
	});

	it("names the next session beside the day aimed at, on the course head and the calendar", () => {
		assert.equal(nextSessionWords(AIMED), "Next session: Wednesday 3 February");
		assert.equal(nextSessionWords({ date: SESSIONS[2]!, sessions: SESSIONS }), null, "the last session has none after it");
		assert.equal(nextSessionWords({ date: SESSIONS[0]! }), null, "an exam held once");
		const [exam] = calendarEntries({ courses: [{ ...course(AIMED), planned: [], doesNotFit: [], finalReview: null }], chats: [], scope: null }).filter((e) => e.kind === "exam");
		assert.equal(exam?.kind === "exam" && exam.nextSession, "Next session: Wednesday 3 February");
	});
});

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lh-exam-sessions-"));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

describe("an exam with several sessions, on the real engine", { skip: realEngineMissing(LEARNING_ENGINE.python) }, () => {
	const home = path.join(TMP, "home");
	fs.mkdirSync(home, { recursive: true });
	const env = (today: string) => ({ ...process.env, HOME: home, LEARNING_TODAY: today });
	const engine = (today: string, args: string[], input?: unknown) =>
		JSON.parse(execFileSync(LEARNING_ENGINE.python, ["-m", "learning", ...args], { cwd: LEARNING_ENGINE.root, env: { ...env(today), PYTHONPATH: LEARNING_ENGINE.root }, input: input === undefined ? undefined : JSON.stringify(input) }).toString());

	it("reads the session gone by from the map, and his answer clears it", async () => {
		const dir = path.join(TMP, "ai");
		fs.mkdirSync(dir, { recursive: true });
		engine("2026-11-19", ["--workspace", dir, "init"]);
		engine("2026-11-19", ["--workspace", dir, "save"], { title: "Artificial Intelligence", topics: { search: { title: "Search" } }, exam: { date: SESSIONS[0], sessions: SESSIONS } });
		const records = createCourseRecords({ ...LEARNING_ENGINE, env: env("2026-12-22") });
		const read = await records.map(dir);
		assert.ok(read.ok);
		assert.deepEqual({ date: read.map.exam?.date, sessions: read.map.exam?.sessions, past: read.map.exam?.past }, { date: SESSIONS[1], sessions: SESSIONS, past: SESSIONS[0] });
		const saved = await records.run(dir, { verb: "save", changes: sessionPatch(read.map.exam, "not-this-time")! });
		assert.ok(saved.ok);
		const again = await records.map(dir);
		assert.ok(again.ok);
		assert.equal(again.map.exam?.past, undefined, "answered, so Home asks no more");
		assert.equal(again.map.exam?.date, SESSIONS[1]);
	});
});
