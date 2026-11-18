/**
 * The course-record bridge, below the turn: the engine adapter (against a
 * fake engine with the CLI's argv and JSON shapes, and against the real
 * engine on a throwaway course when it is installed), the course tools, and
 * their composition into every agent kind.
 */

import { fakeEngine as fakeSdkEngine } from "./helpers/fake-sdk.ts";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { LEARNING_ENGINE } from "../config.ts";
import { courseMapOf, createCourseRecords } from "../src/store/course-records.ts";
import { currentArc, examCovers, type CourseMapArc } from "../src/core/contracts/course-arcs.ts";
import type { CourseMap, TopicHandle } from "../src/core/contracts/course-map.ts";
import { LINALG_ARCS } from "./fixtures/now-demo.ts";
import { todaySteps } from "../components/study-home/study-facts.ts";
import { lessonPlaceOf } from "../src/core/lesson-place.ts";
import { calendarEntries } from "../components/calendar/calendar-facts.ts";
import { subscribe } from "../src/core/events.ts";
import { courseTools } from "../src/agent/tools/course.ts";
import { createPracticeAgent, createProberAgent, createTeacherAgent } from "../src/agent/teacher-agent.ts";
import { createFauxCore } from "@earendil-works/pi-ai";
import type { CourseRecords } from "../src/core/ports.ts";
import type { CourseVerb } from "../src/core/contracts/course.ts";
import type { ChatStore, JobStore } from "../src/core/ports.ts";
import { realEngineMissing } from "./helpers/real-engine.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lh-course-records-"));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

/** A `python` that runs the fake engine, plus the log of its calls. */
function fakeEngine(plan?: unknown) {
	const dir = fs.mkdtempSync(path.join(TMP, "engine-"));
	const python = path.join(dir, "python");
	fs.writeFileSync(python, `#!/bin/sh\nexec "${process.execPath}" "${path.join(HERE, "fixtures", "fake-learning-engine.mjs")}" "$@"\n`, { mode: 0o755 });
	const log = path.join(dir, "calls.jsonl");
	const env = { ...process.env, FAKE_ENGINE_LOG: log, ...(plan ? { FAKE_ENGINE_PLAN: JSON.stringify(plan) } : {}) };
	const calls = () =>
		fs.existsSync(log)
			? fs.readFileSync(log, "utf-8").trim().split("\n").map((l) => JSON.parse(l) as { args: string[]; stdin: string })
			: [];
	return { engine: { python, root: dir, env }, calls };
}

describe("course records adapter (fake engine)", () => {
	it("lists registered courses from plan --all, with due counts including due_more, and keeps those it could not read", async () => {
		const { engine, calls } = fakeEngine({
			today: "2026-11-07",
			courses: [
				{ workspace: "/s/smm", title: "SMM", due: [{ topic: "a" }, { topic: "b" }], due_more: 3, current: "rank", current_title: "Rank", task: { key: "t", title: "Exercise 5" }, last_activity: { date: "2026-11-07", days_ago: 0 }, last_studied: { date: "2026-11-05", days_ago: 2 } },
				{ workspace: "/s/bare", last_activity: { date: "2026-11-07", days_ago: 0 } },
				{ title: "no workspace, skipped" },
				{ workspace: "/s/broken", error: "course.json is not valid JSON", problem: "damaged" },
				{ workspace: "/s/closed", error: "Permission denied", problem: "denied" },
				{ workspace: "/s/odd", error: "an engine before problems" },
			],
		});
		const { plan, ...listing } = (await createCourseRecords(engine).list()) as { plan?: unknown };
		assert.equal((plan as { today?: string }).today, "2026-11-07", "the plan the list came from comes with it");
		assert.deepEqual(listing, {
			available: true,
			courses: [
				{
					workspace: "/s/smm",
					title: "SMM",
					due: 5,
					reviews: [
						{ title: "a", overdue: 0, gap: null },
						{ title: "b", overdue: 0, gap: null },
					],
					current: "rank",
					currentTitle: "Rank",
					task: "Exercise 5",
					step: null,
					exam: null,
					lastActiveDaysAgo: 2,
				},
				{ workspace: "/s/bare", title: null, due: 0, reviews: [], current: null, currentTitle: null, task: null, step: null, exam: null, lastActiveDaysAgo: null },
			],
			unreadable: [
				{ workspace: "/s/broken", title: "broken", problem: "damaged" },
				{ workspace: "/s/closed", title: "closed", problem: "denied" },
				{ workspace: "/s/odd", title: "odd", problem: "unreadable" },
			],
		});
		assert.deepEqual(calls()[0]!.args, ["plan", "--all", "--days", "1"]);
	});

	it("carries the exam countdown, the open task's step and the due topics by title with their gaps for Today", async () => {
		const { engine } = fakeEngine({
			today: "2026-11-08",
			courses: [
				{
					workspace: "/s/linalg",
					title: "Linear Algebra",
					exam: { date: "2026-11-29", days_left: 21 },
					due: [
						{ topic: "span", title: "Span", overdue: 10 },
						{ topic: "independence", title: "Linear independence", overdue: 16, gap: "Treats pairwise non-parallel vectors as independent" },
						{ topic: "rank", title: "Rank", overdue: 16 },
					],
					due_more: 1,
					task: { key: "sheet-4", title: "Problem sheet 4", step: "Part (c)" },
					current: "rank",
				},
				{ workspace: "/s/prob", title: "Probability", exam: null, due: [], task: null },
			],
		});
		const listing = await createCourseRecords(engine).list();
		assert.ok(listing.available);
		const [linalg, prob] = listing.courses;
		assert.deepEqual(
			{ due: linalg!.due, exam: linalg!.exam, reviews: linalg!.reviews, task: linalg!.task, step: linalg!.step },
			{
				due: 4,
				exam: { date: "2026-11-29", daysLeft: 21 },
				reviews: [
					{ title: "Span", overdue: 10, gap: null },
					{ title: "Linear independence", overdue: 16, gap: "Treats pairwise non-parallel vectors as independent" },
					{ title: "Rank", overdue: 16, gap: null },
				],
				task: "Problem sheet 4",
				step: "Part (c)",
			},
		);
		assert.deepEqual({ exam: prob!.exam, reviews: prob!.reviews, step: prob!.step }, { exam: null, reviews: [], step: null });
	});

	it("a save sends the patch on stdin to the selected workspace and returns the receipt", async () => {
		const { engine, calls } = fakeEngine();
		const changes = { observations: [{ topics: ["rank"], text: "Rank of [[1,2],[2,4]]?", response: "1", help: "none", result: "correct" }] };
		const result = await createCourseRecords(engine).run("/s/linalg", { verb: "save", changes });
		assert.deepEqual(result, { ok: true, json: { revision: 1, changed: true, observations: ["o1"] } });
		const call = calls()[0]!;
		assert.deepEqual(call.args, ["--workspace", "/s/linalg", "save"]);
		assert.deepEqual(JSON.parse(call.stdin), changes);
	});

	it("a check runs the patch through save --check and announces no write", async () => {
		const { engine, calls } = fakeEngine();
		const changes = { topics: { pivots: { title: "Pivots" } } };
		const seen: string[] = [];
		const stop = subscribe((e) => void seen.push(e.type));
		const result = await createCourseRecords(engine).run("/s/linalg", { verb: "check", changes });
		stop();
		assert.equal(result.ok, true);
		const call = calls()[0]!;
		assert.deepEqual(call.args, ["--workspace", "/s/linalg", "save", "--check"]);
		assert.deepEqual(JSON.parse(call.stdin), changes);
		assert.equal(seen.includes("course-changed"), false);
	});

	it("operands follow -- so a query or handle that looks like a flag stays an operand", async () => {
		const { engine, calls } = fakeEngine();
		const records = createCourseRecords(engine);
		await records.run("/w", { verb: "search", query: "--all eigen" });
		await records.run("/w", { verb: "show", handles: ["rank", "o3"] });
		await records.run("/w", { verb: "show", handles: "all" });
		await records.run("/w", { verb: "resume", task: "ex-5" });
		assert.deepEqual(calls().map((c) => c.args.slice(2)), [
			["search", "--", "--all eigen"],
			["show", "--", "rank", "o3"],
			["show", "--all"],
			["resume", "--task", "ex-5"],
		]);
	});

	it("asks plan for one day unless the caller names a horizon", async () => {
		const { engine, calls } = fakeEngine();
		const records = createCourseRecords(engine);
		await records.run("/w", { verb: "plan" });
		await records.run("/w", { verb: "plan", days: 42 });
		assert.deepEqual(calls().map((c) => c.args.slice(2)), [
			["plan", "--days", "1"],
			["plan", "--days", "42"],
		]);
	});

	it("maps the engine's validation error, non-JSON output, a timeout and a missing interpreter", async () => {
		const { engine } = fakeEngine();
		const records = createCourseRecords({ ...engine, timeoutMs: 1_000 });
		const refused = await records.run("/w", { verb: "save", changes: { observations: [{ topics: ["unknown"], text: "x" }] } });
		assert.equal(refused.ok, false);
		assert.equal(!refused.ok && refused.kind, "validation");
		assert.match(!refused.ok ? refused.message : "", /unknown topic "unknown"/);
		const garbled = await records.run("/w", { verb: "show", handles: ["garbled"] });
		assert.deepEqual(garbled, { ok: false, kind: "io", message: "show printed output that is not JSON" });
		const slow = await records.run("/w", { verb: "show", handles: ["slow"] });
		assert.equal(!slow.ok && slow.kind, "io");
		assert.match(!slow.ok ? slow.message : "", /did not finish in time/);
		const moved = await records.run("/study/missing-course", { verb: "resume" });
		assert.equal(!moved.ok && moved.kind, "unavailable", "a moved workspace is not a repairable validation error");
		const missing = createCourseRecords({ python: path.join(TMP, "no-such-python"), root: TMP });
		assert.equal((await missing.run("/w", { verb: "resume" })).ok, false);
		const listing = await missing.list();
		assert.equal(listing.available, false);
	});

	it("reads the course map from the engine's map verb and flattens needs and contrasts into edges", async () => {
		const { engine, calls } = fakeEngine();
		const output = {
			today: "2026-11-08",
			revision: 12,
			title: "Linear Algebra",
			exam: { date: "2026-11-29", days_left: 21, final_review: "2026-11-23", unreviewed: ["basis", "gone"], does_not_fit: ["cramer"], reasons: { basis: "full", gone: "full", cramer: "not_ready", rank: "busy" } },
			current: "rank",
			focus: "sheet-4",
			tasks: [{ key: "sheet-4", title: "Problem sheet 4", step: "Part (c)", updated: "2026-11-06" }],
			topics: [
				{ topic: "vectors", title: "Vectors", needs: [], contrasts: [], level: "transferred", introduced: "2026-10-16", review: "2026-11-23", weak: false, tasks: [] },
				{ topic: "basis", title: "Basis", needs: [], contrasts: [], level: "retained", introduced: "2026-10-16", review: "2026-12-04", held: true, held_for: "Probability", due: "2026-11-02", weak: false, tasks: [] },
				{ topic: "elimination", title: "Gaussian elimination", needs: ["vectors"], contrasts: ["cramer"], level: "assisted", right: "partial", review: "2026-11-06", overdue: 2, weak: true, choice_errors: { cramer: 1 }, tasks: [] },
				{ topic: "rank", title: "Rank", needs: ["elimination", "gone"], contrasts: [], level: "assisted", right: "sideways", review: "2026-11-05", overdue: 3, weak: true, gap: "Counts nonzero entries", stale: true, repaired: true, tasks: ["sheet-4"] },
				{ topic: "cramer", needs: ["vectors"], contrasts: ["elimination"], level: "introduced", weak: false, tasks: [] },
				{ topic: "det", title: "Determinants", needs: [], contrasts: [], level: "new", starts: "2026-11-19", starts_after: ["Probability"], moved: { from: "2026-11-12", by: "study", courses: ["Probability"], day: "today" }, weak: false, tasks: [] },
				{ topic: "inverse", title: "Inverse matrices", needs: [], contrasts: [], level: "new", starts: "2026-11-20", moved: { from: "2026-11-12", by: "study", courses: ["Linear Algebra"], day: "today", waits_on: ["elimination"] }, weak: false, tasks: [] },
				{ topic: "span", title: "Span", needs: [], contrasts: [], level: "assisted", review: "2026-11-10", moved: { from: "2026-11-25", by: "answered" }, weak: false, tasks: [] },
				{ topic: "solve", title: "Solving systems", needs: [], contrasts: [], level: "new", starts: "2026-11-21", moved: { from: "2026-11-12", by: "study", courses: ["Linear Algebra"], day: "today", waits_on: ["elimination"], another_day: true }, weak: false, tasks: [] },
				{ topic: "lu", title: "LU factorisation", needs: [], contrasts: [], level: "new", starts: "2026-11-10", moved: { from: "2026-11-12", by: "study", courses: ["Linear Algebra"], day: "today", ready: ["elimination"] }, weak: false, tasks: [] },
				{ topic: "odd", level: "mastered", needs: [], contrasts: [], weak: false, tasks: [] },
			],
		};
		const records = createCourseRecords({ ...engine, env: { ...engine.env, FAKE_ENGINE_MAP: JSON.stringify(output) } });
		const result = await records.map("/s/linalg");
		assert.deepEqual(calls()[0]!.args, ["--workspace", "/s/linalg", "map"]);
		await records.map("/s/linalg", "eigen");
		assert.deepEqual(calls()[1]!.args, ["--workspace", "/s/linalg", "map", "--here", "eigen"], "the lesson in progress goes to the engine as --here");
		assert.ok(result.ok);
		const { map } = result;
		assert.equal(map.workspace, "/s/linalg");
		assert.deepEqual(map.exam, { date: "2026-11-29", daysLeft: 21, finalReview: "2026-11-23", doesNotFit: ["cramer"], unreviewed: ["basis"], reasons: { basis: "full", cramer: "not_ready" } }, "the run-up, with topics the map lists and the reasons the engine knows");
		assert.equal(map.current, "rank");
		assert.deepEqual(map.tasks, [{ key: "sheet-4", title: "Problem sheet 4", step: "Part (c)", updated: "2026-11-06" }]);
		assert.deepEqual(
			map.topics.map((t) => t.handle),
			["vectors", "basis", "elimination", "rank", "cramer", "det", "inverse", "span", "solve", "lu"],
			"a topic with a level the engine does not have is not drawn",
		);
		const [vectors, basis, elimination, rank, cramer] = map.topics;
		assert.deepEqual(vectors!.review, { kind: "scheduled", date: "2026-11-23" });
		assert.deepEqual(map.topics.find((t) => t.handle === "det")?.startsAfter, ["Probability"], "a start says which courses' new topics come first");
		assert.deepEqual(map.topics.find((t) => t.handle === "det")?.moved, { from: "2026-11-12", by: "study", courses: ["Probability"], day: "today" }, "a day he was told that moved says from which day and why");
		assert.deepEqual(map.topics.find((t) => t.handle === "inverse")?.moved, { from: "2026-11-12", by: "study", courses: ["Linear Algebra"], day: "today", waitsOn: ["Gaussian elimination"] }, "round 14, m3: a start that moved because a topic it needs slipped names that topic");
		assert.deepEqual(map.topics.find((t) => t.handle === "solve")?.moved, { from: "2026-11-12", by: "study", courses: ["Linear Algebra"], day: "today", waitsOn: ["Gaussian elimination"], anotherDay: true }, "round 17, 1 M1: a topic right on his own today waits only for its check on another day");
		assert.deepEqual(map.topics.find((t) => t.handle === "lu")?.moved, { from: "2026-11-12", by: "study", courses: ["Linear Algebra"], day: "today", ready: ["Gaussian elimination"] }, "round 17, 2 m3: a day brought forward names what made it ready");
		assert.deepEqual(map.topics.find((t) => t.handle === "span")?.moved, { from: "2026-11-25", by: "answered" }, "round 14, m3: his own answer today moved a day he was told");
		assert.equal("moved" in basis!, false);
		assert.deepEqual(basis!.review, { kind: "scheduled", date: "2026-12-04", held: { exam: "Probability", since: "2026-11-02" } }, "a review a final review holds back says which, and since when");
		assert.deepEqual(rank!.review, { kind: "due", date: "2026-11-05", overdue: 3 });
		assert.deepEqual(rank!.signals, { gap: "Counts nonzero entries", lapsed: false, stale: true, choiceErrors: {}, confidentErrors: 0, repaired: true });
		assert.equal(elimination!.signals.repaired, false);
		assert.equal(elimination!.right, "partial", "how a topic not yet solid was best answered");
		assert.equal("right" in rank!, false, "a word the engine does not have is dropped");
		assert.deepEqual(elimination!.signals.choiceErrors, { cramer: 1 });
		assert.equal(cramer!.title, "cramer", "a topic without a title shows its handle");
		assert.deepEqual(map.edges, [
			{ kind: "needs", prerequisite: "vectors", topic: "elimination" },
			{ kind: "contrasts", pair: ["elimination", "cramer"] },
			{ kind: "needs", prerequisite: "elimination", topic: "rank" },
			{ kind: "needs", prerequisite: "vectors", topic: "cramer" },
		]);
	});

	it("reports a failed or malformed map as an io failure", async () => {
		const { engine } = fakeEngine();
		const failed = await createCourseRecords({ ...engine, env: { ...engine.env, FAKE_ENGINE_FAIL: "map" } }).map("/s/linalg");
		assert.deepEqual(failed, { ok: false, kind: "io", message: "map could not write the record" });
		const odd = await createCourseRecords({ ...engine, env: { ...engine.env, FAKE_ENGINE_MAP: JSON.stringify({ topics: "none" }) } }).map("/s/linalg");
		assert.deepEqual(odd, { ok: false, kind: "io", message: "map printed an unexpected shape" });
		const missing = await createCourseRecords(engine).map("/s/missing");
		assert.equal(missing.ok ? "ok" : missing.kind, "unavailable");
	});
});

/** E2's map goldens (tests/learning/golden), the demo Linear Algebra on
 *  8 Nov: without arcs, and hand cut into five arcs by chapter with "You
 *  are here" in arc 4 while arc 3 still holds an untaught topic. */
const GOLDEN = path.resolve(HERE, "..", "..", "tests", "learning", "golden");
const goldenMap = (name: string) => JSON.parse(fs.readFileSync(path.join(GOLDEN, `${name}.map.json`), "utf-8")) as Record<string, unknown>;
const parsed = (json: unknown): CourseMap => {
	const map = courseMapOf("/s/linalg", json);
	assert.ok(map);
	return map;
};
const topicOf = (map: CourseMap, handle: string) => map.topics.find((t) => t.handle === handle)!;

describe("a task's topics (round 9, 2 m8)", () => {
	it("keep the task's own order, so a session it starts is placed under its first topic, never the path's first", () => {
		const map = parsed(goldenMap("linear-algebra"));
		assert.deepEqual(map.tasks.find((t) => t.key === "sheet-4")?.topics, ["rank", "basis", "kernel"]);
		const course = { map, unready: null, due: [], lastActiveDaysAgo: 0, newToday: [] };
		const step = todaySteps(course).find((s) => s.kind === "task");
		assert.ok(step?.kind === "task");
		assert.deepEqual(step.topics, ["rank", "basis", "kernel"], "the topics Continue Problem sheet 4 starts its session on");
		assert.equal(lessonPlaceOf(map, step.topics).topic?.title, "Rank and the column space", "the lesson's crumb");
		const entry = calendarEntries({ courses: [{ ...course, planned: [], doesNotFit: [], finalReview: null }], chats: [], scope: null }).find((e) => e.kind === "task");
		assert.equal(entry?.kind === "task" ? entry.topic?.handle : null, "rank", "the calendar's row for the sheet");
	});
});

describe("course map arcs (E2's goldens)", () => {
	it("a course without arcs has no arc fields, and each planned start says why it comes then", () => {
		const map = parsed(goldenMap("linear-algebra"));
		assert.equal("arcs" in map, false);
		assert.equal("currentArc" in map, false);
		assert.equal(map.topics.some((t) => "arc" in t), false, "no topic names an arc");
		assert.equal(currentArc(map), null);
		assert.deepEqual(topicOf(map, "invertibility").startsWhy, { kind: "after", needs: ["rank"], partners: [] });
		assert.deepEqual(topicOf(map, "inner-product").startsWhy, { kind: "early", waitingOn: [], exam: false });
		assert.deepEqual(
			map.topics.filter((t) => t.startsWhy).map((t) => t.handle),
			map.topics.filter((t) => t.starts).map((t) => t.handle),
			"a reason exactly where a start is",
		);
	});

	it("a course with arcs lists them in study order with their states and entry, each topic in its arc", () => {
		const map = parsed(goldenMap("linear-algebra-arcs"));
		assert.deepEqual(
			map.arcs!.map((a) => [a.handle, a.title, a.state]),
			[
				["spaces", "Vector spaces", "ready"],
				["systems", "Linear systems", "learning"],
				["determinants", "Determinants", "learning"],
				["eigenvalues", "Eigenvalues and diagonalization", "learning"],
				["orthogonality", "Orthogonality", "new"],
			],
		);
		assert.deepEqual(map.arcs!.find((a) => a.handle === "orthogonality")!.entry, ["vectors", "basis"], "what its first lesson recalls from earlier arcs");
		assert.deepEqual(
			Object.fromEntries(map.arcs!.map((a) => [a.handle, map.topics.filter((t) => t.arc === a.handle).length])),
			{ spaces: 5, systems: 3, determinants: 3, eigenvalues: 3, orthogonality: 2 },
			"every topic in one arc",
		);
		assert.equal(map.currentArc, "eigenvalues");
		assert.deepEqual(topicOf(map, "inner-product").startsWhy, { kind: "early", arc: "orthogonality", waitingOn: [], exam: false });
		assert.deepEqual(topicOf(map, "change-basis").startsWhy, { kind: "after", arc: "eigenvalues", needs: ["invertibility"], partners: [] });
	});

	it("an arc block it cannot read whole shows the course without arcs, never a partial list", () => {
		const golden = goldenMap("linear-algebra-arcs");
		const arcs = golden.arcs as Record<string, unknown>[];
		const topics = golden.topics as Record<string, unknown>[];
		const broken = {
			"an arc without a title": { ...golden, arcs: arcs.map((a, i) => (i === 2 ? { ...a, title: "" } : a)) },
			"a state the engine does not have": { ...golden, arcs: arcs.map((a, i) => (i === 0 ? { ...a, state: "mastered" } : a)) },
			"a topic naming an arc not listed": { ...golden, topics: topics.map((t, i) => (i === 0 ? { ...t, arc: "gone" } : t)) },
			"a topic with no arc": { ...golden, topics: topics.map((t, i) => (i === 0 ? { ...t, arc: undefined } : t)) },
			"an arc listed twice": { ...golden, arcs: [...arcs, arcs[0]] },
		};
		for (const [why, json] of Object.entries(broken)) {
			const map = parsed(json);
			assert.equal("arcs" in map, false, why);
			assert.equal("currentArc" in map, false, why);
			assert.equal(map.topics.length, 16, `${why}: no topic vanishes`);
			assert.equal(map.topics.some((t) => "arc" in t || (t.startsWhy && "arc" in t.startsWhy)), false, `${why}: nothing names an arc`);
		}
	});

	it("an arc whose every topic the course leaves out is shown nowhere, and its topics name no arc", () => {
		const golden = goldenMap("linear-algebra-arcs");
		const json = {
			...golden,
			arcs: (golden.arcs as Record<string, unknown>[]).map((a) => (a.arc === "orthogonality" ? { ...a, hidden: true } : a)),
			topics: (golden.topics as Record<string, unknown>[]).map((t) => (t.arc === "orthogonality" ? { ...t, excluded: "Not on this course's exam", starts: undefined, starts_why: undefined } : t)),
		};
		const map = parsed(json);
		assert.deepEqual(map.arcs!.map((a) => a.handle), ["spaces", "systems", "determinants", "eigenvalues"]);
		assert.equal(topicOf(map, "projection").arc, undefined);
		assert.equal(topicOf(map, "projection").excluded, "Not on this course's exam");
	});

	it("the exam's scope of arcs and the topics it leaves out, as far as the map shows them", () => {
		const golden = goldenMap("linear-algebra-arcs");
		const exam = { ...(golden.exam as object), arcs: ["spaces", "systems", "gone"], leaves_out: ["kernel", "nope"] };
		assert.deepEqual(parsed({ ...golden, exam }).exam, { date: "2026-12-03", daysLeft: 25, finalReview: "2026-11-16", arcs: ["spaces", "systems"], leavesOut: ["kernel"] });
		assert.deepEqual(parsed({ ...golden, exam: { ...exam, arcs: null } }).exam, { date: "2026-12-03", daysLeft: 25, finalReview: "2026-11-16", leavesOut: ["kernel"] }, "null is the whole course, less what it leaves out");
	});

	it("the topics an exam leaves out in a course without arcs", () => {
		const golden = goldenMap("linear-algebra");
		const exam = { ...(golden.exam as object), leaves_out: ["kernel", "nope"] };
		assert.deepEqual(parsed({ ...golden, exam }).exam?.leavesOut, ["kernel"]);
	});
});

describe("the current arc (design 1.4, T-current)", () => {
	const map = parsed(goldenMap("linear-algebra-arcs"));
	it("is the arc of the topic \"You are here\" names, even with an earlier arc unfinished", () => {
		assert.equal(map.current, "eigen");
		assert.equal(currentArc(map), "eigenvalues");
	});
	it("reads the same in the demo fixture the surfaces build on", () => {
		assert.equal(currentArc(LINALG_ARCS.map), "systems");
	});
	it("follows the lesson in progress once Home moves \"You are here\" to it", () => {
		assert.equal(currentArc({ ...map, current: "projection" as TopicHandle }), "orthogonality");
	});
	it("falls back to the engine's answer with no topic, or one the course leaves out", () => {
		assert.equal(currentArc({ ...map, current: null, currentArc: "systems" as CourseMapArc["handle"] }), "systems");
		const out = map.topics.map((t) => (t.handle === "eigen" ? { ...t, excluded: "dropped" } : t));
		assert.equal(currentArc({ ...map, topics: out, currentArc: "determinants" as CourseMapArc["handle"] }), "determinants");
	});
});

describe("how much of an arc the exam covers", () => {
	const map = parsed(goldenMap("linear-algebra-arcs"));
	const arc = (handle: string) => map.arcs!.find((a) => a.handle === handle)!;
	const exam = map.exam!;
	it("says nothing with no exam, and all of every arc for an exam over the whole course", () => {
		assert.equal(examCovers(null, arc("spaces"), map.topics), null);
		assert.equal(examCovers(exam, arc("orthogonality"), map.topics), "all");
	});
	it("reads all, part or none against the exam's arcs and the topics it leaves out", () => {
		const scoped = { ...exam, arcs: [arc("spaces").handle, arc("systems").handle], leavesOut: ["kernel" as TopicHandle] };
		assert.equal(examCovers(scoped, arc("spaces"), map.topics), "all");
		assert.equal(examCovers(scoped, arc("systems"), map.topics), "part");
		assert.equal(examCovers(scoped, arc("eigenvalues"), map.topics), "none");
		const emptied = { ...scoped, leavesOut: ["elimination", "rank", "kernel"] as TopicHandle[] };
		assert.equal(examCovers(emptied, arc("systems"), map.topics), "none", "an arc whose every topic it leaves out");
		const whole = { ...exam, leavesOut: ["kernel" as TopicHandle] };
		assert.equal(examCovers(whole, arc("systems"), map.topics), "part", "an exam over the whole course that leaves a topic out");
		assert.equal(examCovers(whole, arc("spaces"), map.topics), "all");
	});
});

describe("course records adapter: create (fake engine)", () => {
	it("runs init in the directory, then saves the title and exam day to the workspace init reports", async () => {
		const { engine, calls } = fakeEngine();
		const created = await createCourseRecords(engine).create("/s/new", { title: "New Course", exam: "2026-12-14" });
		assert.deepEqual(created, { ok: true, workspace: "/s/new" });
		assert.deepEqual(calls().map((c) => [c.args, c.stdin]), [
			[["--workspace", "/s/new", "init"], ""],
			[["--workspace", "/s/new", "save"], JSON.stringify({ title: "New Course", exam: { date: "2026-12-14" } })],
		]);
	});

	it("a failed init stops before the save and returns the engine's message", async () => {
		const { engine, calls } = fakeEngine();
		const created = await createCourseRecords({ ...engine, env: { ...engine.env, FAKE_ENGINE_FAIL: "init" } }).create("/s/new", { title: "New Course", exam: null });
		assert.deepEqual(created, { ok: false, kind: "io", message: "init could not write the record" });
		assert.deepEqual(calls().map((c) => c.args[2]), ["init"]);
	});
});

/** An in-memory CourseRecords that records every verb. */
function memoryRecords(answer: (verb: CourseVerb) => Awaited<ReturnType<CourseRecords["run"]>>) {
	const seen: Array<{ workspace: string; verb: CourseVerb }> = [];
	const records: CourseRecords = {
		list: async () => ({ available: true, courses: [], unreadable: [] }),
		run: async (workspace, verb) => {
			seen.push({ workspace, verb });
			return answer(verb);
		},
		map: async () => {
			throw new Error("unused");
		},
		create: async () => {
			throw new Error("unused");
		},
	};
	return { records, seen };
}

const COURSE = { workspace: "/s/linalg", title: "Linear Algebra" };

describe("course tools", () => {
	it("are bound to the session's course and return the engine JSON verbatim", async () => {
		const { records, seen } = memoryRecords(() => ({ ok: true, json: { revision: 2, observations: ["o4"] } }));
		const tools = courseTools({ course: COURSE, records, arcs: false });
		assert.deepEqual(Object.keys(tools).sort(), ["course_resume", "course_save", "course_search", "course_show"]);
		assert.match(tools.course_save!.description, /Linear Algebra/);
		const changes = { observations: [{ kind: "self_report", topics: ["rank"], text: "Says he worked through the rank exercises" }] };
		const result = await tools.course_save!.execute("call-1", { changes }, undefined);
		assert.deepEqual(JSON.parse((result.content[0] as { text: string }).text), { revision: 2, observations: ["o4"] });
		assert.deepEqual(seen, [{ workspace: "/s/linalg", verb: { verb: "save", changes } }]);
	});

	it("a refused save fails the call with the engine's repair message", async () => {
		const { records } = memoryRecords(() => ({ ok: false, kind: "validation", message: 'unknown topic "nope"; create it in the same patch' }));
		const tools = courseTools({ course: COURSE, records, arcs: false });
		await assert.rejects(
			() => tools.course_save!.execute("call-2", { changes: { observations: [] } }, undefined) as Promise<unknown>,
			/Nothing was saved or read\. unknown topic "nope"/,
		);
	});

	it("a save into a deleted course is refused before the engine runs, so the course never comes back (round 3)", async () => {
		const { records, seen } = memoryRecords(() => ({ ok: true, json: {} }));
		const tools = courseTools({ course: COURSE, records: { ...records, forgotten: () => true }, arcs: false });
		await assert.rejects(
			() => tools.course_save!.execute("call-3", { changes: { observations: [] } }, undefined) as Promise<unknown>,
			/course was deleted, so nothing was saved/,
		);
		assert.deepEqual(seen, []);
	});

	it("show needs handles or all", async () => {
		const { records, seen } = memoryRecords(() => ({ ok: true, json: {} }));
		const tools = courseTools({ course: COURSE, records, arcs: false });
		await assert.rejects(() => tools.course_show!.execute("c", {}, undefined) as Promise<unknown>, /Pass handles, or all: true/);
		await tools.course_show!.execute("c", { all: true }, undefined);
		assert.deepEqual(seen.map((s) => s.verb), [{ verb: "show", handles: "all" }]);
	});
});

describe("course composition into the agents", () => {
	const chatStore = { getChat: () => ({ messages: [] }) } as unknown as ChatStore;
	const jobStore = {} as JobStore;
	const { records } = memoryRecords(() => ({ ok: true, json: {} }));
	const faux = createFauxCore({});
	const engine = fakeSdkEngine({ model: faux.getModel(), streamFn: faux.streamSimple });
	const builds = {
		prober: (course?: { course: typeof COURSE; records: CourseRecords; arcs: boolean }) =>
			createProberAgent({ chatId: "c1", chatStore, deliver: () => {}, jobStore, spawn: () => {} }, course ? { course, engine } : { engine }),
		teacher: (course?: { course: typeof COURSE; records: CourseRecords; arcs: boolean }) =>
			createTeacherAgent({ chatId: "c1", chatStore, jobStore, spawn: () => {} }, course ? { course, engine } : { engine }),
		practice: (course?: { course: typeof COURSE; records: CourseRecords; arcs: boolean }) =>
			createPracticeAgent({ chatId: "c1", chatStore }, course ? { course, engine } : { engine }),
	};
	for (const [kind, build] of Object.entries(builds)) {
		it(`${kind}: a linked session gets the course tools and doctrine; an unlinked one gets neither`, () => {
			const linked = build({ course: COURSE, records, arcs: false });
			const names = linked.state.tools.map((t) => t.name);
			for (const name of ["course_resume", "course_show", "course_search", "course_save"]) assert.ok(names.includes(name), name);
			assert.match(linked.state.systemPrompt, /## The course record/);
			const plain = build();
			assert.ok(!plain.state.tools.some((t) => t.name.startsWith("course_")));
			assert.doesNotMatch(plain.state.systemPrompt, /## The course record/);
		});

		it(`${kind}: the arcs doctrine joins the prompt only in a course with arcs (round 4)`, () => {
			const grouped = build({ course: COURSE, records, arcs: true }).state.systemPrompt;
			const flat = build({ course: COURSE, records, arcs: false }).state.systemPrompt;
			for (const heading of ["\n# Arcs\n", "\n## What an arc is\n", "\n## Placing a new topic\n", "\n## Changing arcs\n"]) {
				assert.ok(grouped.includes(heading), `a course with arcs: ${heading.trim()}`);
				assert.ok(!flat.includes(heading), `a course without arcs: no ${heading.trim()}`);
			}
			assert.doesNotMatch(flat, /exam\.arcs|arc_change|path\.arcs/, "no arc field to write in a course without arcs");
		});
	}
});

const { root: ENGINE_ROOT, python: ENGINE_PYTHON } = LEARNING_ENGINE;

describe("course records adapter (the real engine, throwaway course)", { skip: realEngineMissing(ENGINE_PYTHON) }, () => {
	it("a save lands under the engine's own rules and a fresh resume reflects it", async () => {
		const home = fs.mkdtempSync(path.join(TMP, "home-"));
		const workspace = fs.mkdtempSync(path.join(TMP, "course-"));
		const env = { ...process.env, HOME: home, LEARNING_TODAY: "2026-11-07" };
		execFileSync(ENGINE_PYTHON, ["-m", "learning", "--workspace", workspace, "init"], { cwd: ENGINE_ROOT, env: { ...env, PYTHONPATH: ENGINE_ROOT } });
		const records = createCourseRecords({ python: ENGINE_PYTHON, root: ENGINE_ROOT, env });

		const saved = await records.run(workspace, {
			verb: "save",
			changes: {
				title: "Scratch algebra",
				topics: { rank: { title: "Rank of a matrix", introduced: true } },
				observations: [
					{ topics: ["rank"], text: "Rank of [[1,2],[2,4]]?", response: "2", help: "none", result: "incorrect" },
					{ topics: ["rank"], text: "Rank of [[1,2],[2,4]]?", response: "1", help: "Pointed at the dependent row", result: "correct" },
				],
			},
		});
		assert.ok(saved.ok, !saved.ok ? saved.message : "");
		const receipt = saved.json as { observations: string[]; levels: Record<string, { to: string }> };
		assert.deepEqual(receipt.observations, ["o1", "o2"]);
		assert.equal(receipt.levels.rank?.to, "assisted");

		const listing = await records.list();
		assert.ok(listing.available);
		assert.deepEqual(
			listing.courses.map((c) => [fs.realpathSync(c.workspace), c.title]),
			[[fs.realpathSync(workspace), "Scratch algebra"]],
			"the temp home's registry lists only the throwaway course",
		);

		const refused = await records.run(workspace, { verb: "save", changes: { observations: [{ topics: ["nope"], text: "x", help: "none", result: "correct" }] } });
		assert.equal(!refused.ok && refused.kind, "validation");

		const resumed = await records.run(workspace, { verb: "resume" });
		assert.ok(resumed.ok);
		const text = JSON.stringify(resumed.json);
		assert.match(text, /Scratch algebra/);
		assert.match(text, /"rank"/);

		const planned = await records.run(workspace, { verb: "plan" });
		assert.ok(planned.ok, !planned.ok ? planned.message : "");
		const courses = (planned.json as { courses: Array<{ workspace: string; title: string }> }).courses;
		assert.deepEqual(courses.map((c) => [fs.realpathSync(c.workspace), c.title]), [[fs.realpathSync(workspace), "Scratch algebra"]], "plan reads this course alone");

		const mapped = await records.map(workspace);
		assert.ok(mapped.ok, !mapped.ok ? mapped.message : "");
		assert.equal(mapped.map.title, "Scratch algebra");
		assert.deepEqual(
			mapped.map.topics.map((t) => [t.handle, t.title, t.level]),
			[["rank", "Rank of a matrix", "assisted"]],
		);
	});

	it("the golden course with arcs reads its arcs from the real engine, and --here moves the current arc to the lesson's topic", async () => {
		const home = fs.mkdtempSync(path.join(TMP, "home-"));
		const workspace = fs.mkdtempSync(path.join(TMP, "course-"));
		const env = { ...process.env, HOME: home, LEARNING_TODAY: "2026-11-08" };
		execFileSync(ENGINE_PYTHON, ["-m", "learning", "--workspace", workspace, "init"], { cwd: ENGINE_ROOT, env: { ...env, PYTHONPATH: ENGINE_ROOT } });
		fs.copyFileSync(path.join(GOLDEN, "linear-algebra-arcs.course.json"), path.join(workspace, ".study", "course.json"));
		const records = createCourseRecords({ python: ENGINE_PYTHON, root: ENGINE_ROOT, env });

		const mapped = await records.map(workspace);
		assert.ok(mapped.ok, !mapped.ok ? mapped.message : "");
		assert.deepEqual(mapped.map, { ...parsed(goldenMap("linear-algebra-arcs")), workspace }, "the engine's map today is its golden, parsed");
		assert.equal(currentArc(mapped.map), "eigenvalues");

		const here = await records.map(workspace, "projection");
		assert.ok(here.ok, !here.ok ? here.message : "");
		assert.equal(here.map.current, "eigen", "path.current stays");
		assert.equal(here.map.currentArc, "orthogonality", "the engine counts the lesson in progress");
	});

	it("create makes a new folder a course with its exam day and material; rename and delete go through the engine", async () => {
		const home = fs.mkdtempSync(path.join(TMP, "home-"));
		const directory = path.join(fs.mkdtempSync(path.join(TMP, "root-")), "measure-theory");
		fs.mkdirSync(path.join(directory, "material"), { recursive: true });
		fs.writeFileSync(path.join(directory, "material", "Syllabus.md"), "# Syllabus");
		const env = { ...process.env, HOME: home, LEARNING_TODAY: "2026-11-07" };
		const records = createCourseRecords({ python: ENGINE_PYTHON, root: ENGINE_ROOT, env });
		const created = await records.create(directory, { title: "Measure Theory", exam: "2026-12-14" });
		assert.ok(created.ok, !created.ok ? created.message : "");
		assert.equal(fs.realpathSync(created.workspace), fs.realpathSync(directory));
		const added = await records.run(created.workspace, { verb: "sources", add: ["material/Syllabus.md"] });
		assert.ok(added.ok, !added.ok ? added.message : "");
		const shown = await records.run(created.workspace, { verb: "show", handles: "all" });
		assert.ok(shown.ok);
		assert.match(JSON.stringify(shown.json), /material\/Syllabus\.md/);

		const listing = await records.list();
		assert.ok(listing.available);
		assert.deepEqual(listing.courses.map((c) => [c.workspace, c.title, c.exam?.date]), [[created.workspace, "Measure Theory", "2026-12-14"]]);

		const renamed = await records.run(created.workspace, { verb: "save", changes: { title: "Measure and Integration" } });
		assert.ok(renamed.ok);
		const after = await records.list();
		assert.deepEqual(after.available && after.courses.map((c) => c.title), ["Measure and Integration"]);

		const forgotten = await records.run(created.workspace, { verb: "forget-course" });
		assert.ok(forgotten.ok, !forgotten.ok ? forgotten.message : "");
		const gone = await records.list();
		assert.deepEqual(gone.available && gone.courses, [], "a deleted course leaves the listing");
		assert.ok(fs.existsSync(path.join(directory, "material", "Syllabus.md")), "its files stay");
	});
});
