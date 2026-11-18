/**
 * What needs the learner now (components/study-home/needs-you.ts): exactly
 * Home's Today lines, in Today's order and with Today's reasons, each with
 * the topics it takes up and the words the sidebar's status slot shows.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { foldLines, lineKey, whyOf } from "../components/study-home/agenda-rows/row-facts.ts";
import { lineTopics, needsYouNow, slotWords } from "../components/study-home/needs-you.ts";
import { openSessions, todayRows, type TodayRow } from "../components/study-home/study-facts.ts";
import type { StudyCourse, TopicHandle } from "../src/core/index.ts";
import { ANALYSIS, CALCULUS, CHATS, chat, COURSES, LINALG, PROB, TODAY, due, map, topic } from "./fixtures/now-demo.ts";

const label = (r: TodayRow) => (r.kind === "session" ? `session ${r.chat.id}` : r.course.map.title);

describe("needsYouNow", () => {
	it("is Home's Today: the same lines in the same order, each with Home's reason", () => {
		const needs = needsYouNow(COURSES, CHATS, TODAY);
		const home = foldLines(todayRows(COURSES, openSessions(CHATS), TODAY));
		assert.deepEqual(
			needs.lines.map((l) => l.key),
			home.shown.map(lineKey),
		);
		assert.deepEqual(needs.rows, todayRows(COURSES, openSessions(CHATS), TODAY));
		for (const line of needs.lines) assert.deepEqual(line.why, whyOf(line.row));
	});

	it("gives every session to pick up since yesterday its own line, the newest first, after the plan's reviews (round 10, 1 m2); a course keeps its line when no session shown works on its step", () => {
		const { lines, also } = needsYouNow(COURSES, CHATS, TODAY);
		assert.deepEqual(lines.map((l) => label(l.row)), ["Probability", "Linear Algebra", "Real Analysis", "Calculus I", "session chat_eigen"]);
		assert.deepEqual(also.map((l) => label(l.row)), ["session chat_rank"], "the lesson he is in today keeps a line (round 11, 3 n5)");
		assert.ok(!lines.some((l) => l.key === "chat_old"), "a session waiting from before yesterday gets no line");
	});

	it("gives a lesson ended with Done for today no line until tomorrow", () => {
		const la = CHATS.find((c) => c.id === "chat_eigen")!.course;
		const left = (updatedAt: string) => chat("chat_left", { title: "Eigenvalues lesson", course: la, topics: ["eigen"], ended: "left", updatedAt });
		const today = needsYouNow(COURSES, [left("2026-11-08T09:20:00")], TODAY).rows.map(label);
		assert.ok(!today.includes("session chat_left"), "the lesson he ended today waits for tomorrow");
		const tomorrow = needsYouNow(COURSES, [left("2026-11-08T09:20:00")], "2026-11-09").rows.map(label);
		assert.ok(tomorrow.includes("session chat_left"), "the next day it is back as Left for next time");
		assert.ok(tomorrow.indexOf("session chat_left") > tomorrow.indexOf("Probability"), "after the plan, which leads (round 9, 1 D1)");
		const earlier = needsYouNow(COURSES, [left("2026-10-30T09:20:00")], TODAY).rows.map(label);
		assert.ok(earlier.includes("session chat_left"), "one left on an earlier day keeps its line however long ago");
	});

	it("gives a lesson whose course was deleted no line: it is history", () => {
		const gone = chat("chat_gone", { title: "Series tests", course: { workspace: "/s/graphs", title: "Graph Algorithms" }, ended: "left", courseDeleted: true, updatedAt: "2026-11-07T09:00:00" });
		assert.ok(!needsYouNow(COURSES, [gone], TODAY).rows.some((r) => r.kind === "session"));
		assert.ok(needsYouNow(COURSES, [{ ...gone, courseDeleted: false }], TODAY).rows.some((r) => r.kind === "session"), "the same lesson in a course still there keeps its line");
	});

	it("orders the courses by urgency: the exam run-up, the nearest exam, then the most recent study", () => {
		const { lines } = needsYouNow([CALCULUS, ANALYSIS, PROB], [], TODAY);
		assert.deepEqual(lines.map((l) => label(l.row)), ["Probability", "Real Analysis", "Calculus I"]);
	});

	it("draws each line as the topic it leads with; a course with nothing to take up leads with none", () => {
		const { lines, also } = needsYouNow(COURSES, CHATS, TODAY);
		assert.deepEqual(
			[...lines, ...also].map((l) => l.lead?.title),
			["Random variables and distributions", "Linear independence", "Convergent sequences", "Chain rule", "Eigenvalues and eigenvectors", "Rank and the column space"],
		);
		const empty: StudyCourse = { ...PROB, due: [], map: { ...PROB.map, current: null, topics: [] } };
		assert.deepEqual(needsYouNow([empty], [], TODAY).lines, [], "a course with nothing to take up has no line");
	});

	it("words the status slot as Today does, a lapse on the lead itself as Not right last time and a task up to its colon", () => {
		const { lines, also } = needsYouNow(COURSES, CHATS, TODAY);
		assert.deepEqual(
			[...lines, ...also].map((l) => l.slot),
			["Due 5 Nov", "Due 4 Nov", "Due 1 Nov", "Not right last time", "Your turn", "Your turn"],
		);
		const task: StudyCourse = {
			...LINALG,
			due: [],
			map: { ...LINALG.map, focus: "sheet", tasks: [{ key: "sheet", title: "Problem sheet 4", step: "At first, the owed rank retest: he needs the matrix", updated: "2026-11-07" }] },
		};
		const [taskLine] = needsYouNow([task], [], TODAY).lines;
		assert.equal(taskLine!.why?.short, "Left off 7 Nov");
		assert.equal(taskLine!.slot, "Left off 7 Nov");
		const today: StudyCourse = { ...ANALYSIS, map: { ...ANALYSIS.map, topics: [topic("conv", "Convergent sequences", "independent", { review: due(0) })] }, due: ["conv"] as TopicHandle[] };
		assert.equal(needsYouNow([today], [], TODAY).lines[0]!.slot, "Due today");
		assert.equal(slotWords(null, null), null);
	});

	it("leads a lapse with the lapsed topic, so the card's title and its reason name the same topic", () => {
		const other: StudyCourse = { ...CALCULUS, due: ["riemann", "chain"] as TopicHandle[] };
		const [line] = needsYouNow([other], [], TODAY).lines;
		assert.equal(line!.why?.short, "Not right last time: Chain rule");
		assert.deepEqual(
			[line!.lead?.title, line!.slot, line!.topics.map((t) => t.title)],
			["Chain rule", "Not right last time", ["Chain rule", "Riemann sums"]],
		);
	});

	it("leads an open task with the course's current topic when the task holds it, else with none, since the record does not say which topic the task is at", () => {
		const sheet = { key: "sheet", title: "Problem sheet 4: rank and nullity", step: "Part (c): show dim ker A = 2", updated: null };
		const holds = (handles: string[]) => LINALG.map.topics.map((t) => (handles.includes(t.handle) ? { ...t, tasks: ["sheet"] } : t));
		const task = (handles: string[]): StudyCourse => ({ ...LINALG, due: [], map: { ...LINALG.map, focus: "sheet", tasks: [sheet], topics: holds(handles) } });
		const [atRank] = needsYouNow([task(["independence", "rank"])], [], TODAY).lines;
		assert.deepEqual([atRank!.lead?.title, atRank!.slot, atRank!.topics.map((t) => t.handle)], ["Rank and the column space", "Unfinished", ["rank", "independence"]]);
		const [atFirst] = needsYouNow([task(["independence", "det"])], [], TODAY).lines;
		assert.equal(atFirst!.lead, null, "never its first held topic, whose page is not the sheet");
		assert.equal(atFirst!.title, "Continue Problem sheet 4: rank and nullity");
	});

	it("shows at most five lines, folding the rest into also as Today does", () => {
		const six = Array.from({ length: 6 }, (_, i) => chat(`w${i}`, { pendingQuestion: true, updatedAt: `2026-11-08T0${i}:00:00.000Z` }));
		const needs = needsYouNow([], six, TODAY);
		assert.equal(needs.lines.length, 4);
		assert.equal(needs.also.length, 2);
		for (let n = 0; n <= 8; n++) {
			const many = Array.from({ length: n }, (_, i) => chat(`m${i}`, { pendingQuestion: true, updatedAt: "2026-11-08T08:00:00.000Z" }));
			assert.ok(needsYouNow(COURSES, many, TODAY).lines.length <= 5);
		}
	});

	it("still lists the waiting sessions, with no course, while the engine is down", () => {
		const needs = needsYouNow([], CHATS, TODAY);
		assert.deepEqual(needs.lines.map((l) => [l.key, l.row.course, l.lead]), [
			["chat_eigen", null, null],
			["chat_rank", null, null],
		]);
	});
});

describe("lineTopics", () => {
	it("takes a session's topics that are on its course's map, in map order", () => {
		const rank = CHATS.find((c) => c.id === "chat_rank")!;
		const both = { ...rank, topics: ["eigen", "not-on-map", "rank"] };
		assert.deepEqual(lineTopics({ kind: "session", chat: both, course: LINALG }), ["rank", "eigen"]);
		assert.deepEqual(lineTopics({ kind: "session", chat: both, course: null }), []);
	});

	it("takes a course's step topics: the plan's review order, a task's held topics else the current one, the topic step, none", () => {
		const review = todayRows([CALCULUS], [], TODAY)[0]!;
		assert.deepEqual(lineTopics(review), ["chain", "riemann", "improper"]);
		const held: StudyCourse = {
			...LINALG,
			due: [],
			map: {
				...LINALG.map,
				focus: "sheet",
				tasks: [{ key: "sheet", title: "Sheet", step: null, updated: null }],
				topics: LINALG.map.topics.map((t) => (t.handle === "det" || t.handle === "independence" ? { ...t, tasks: ["sheet"] } : t)),
			},
		};
		assert.deepEqual(lineTopics(todayRows([held], [], TODAY)[0]!), ["independence", "det"]);
		const unheld: StudyCourse = { ...held, map: { ...held.map, topics: LINALG.map.topics } };
		assert.deepEqual(lineTopics(todayRows([unheld], [], TODAY)[0]!), ["rank"]);
		const next: StudyCourse = { ...PROB, due: [], map: { ...PROB.map, topics: PROB.map.topics.map((t) => (t.handle === "bayes" ? { ...t, level: "assisted" as const, review: null } : t)) } };
		assert.deepEqual(lineTopics(todayRows([next], [], TODAY)[0]!), ["bayes"]);
		const none: StudyCourse = { ...PROB, due: [], map: map({ workspace: "/s/none", title: "None" }) };
		assert.deepEqual(lineTopics(todayRows([none], [], TODAY)[0]!), []);
	});
});
