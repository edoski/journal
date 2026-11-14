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

	it("gives every session to pick up since yesterday its own line, the newest first, before every course; a course keeps its line when no session shown works on its step", () => {
		const { lines, also } = needsYouNow(COURSES, CHATS, TODAY);
		assert.deepEqual(lines.map((l) => label(l.row)), ["session chat_eigen", "session chat_rank", "Probability", "Linear Algebra"]);
		assert.deepEqual(also.map((l) => label(l.row)), ["Real Analysis", "Calculus I"]);
		assert.ok(!lines.some((l) => l.key === "chat_old"), "a session waiting from before yesterday gets no line");
	});

	it("orders the courses after the sessions by urgency: the exam run-up, the nearest exam, then the most recent study", () => {
		const { lines } = needsYouNow([CALCULUS, ANALYSIS, PROB], [], TODAY);
		assert.deepEqual(lines.map((l) => label(l.row)), ["Probability", "Real Analysis", "Calculus I"]);
	});

	it("draws each line as the topic it leads with; a course with nothing to take up leads with none", () => {
		const { lines, also } = needsYouNow(COURSES, CHATS, TODAY);
		assert.deepEqual(
			[...lines, ...also].map((l) => l.lead?.title),
			["Eigenvalues and eigenvectors", "Rank and the column space", "Random variables and distributions", "Linear independence", "Convergent sequences", "Chain rule"],
		);
		const empty: StudyCourse = { ...PROB, due: [], map: { ...PROB.map, current: null, topics: [] } };
		const [line] = needsYouNow([empty], [], TODAY).lines;
		assert.deepEqual([line!.topics, line!.lead], [[], null]);
	});

	it("words the status slot as Today does, a lapse on the lead itself as Missed last time and a task up to its colon", () => {
		const { lines, also } = needsYouNow(COURSES, CHATS, TODAY);
		assert.deepEqual(
			[...lines, ...also].map((l) => l.slot),
			["Your turn", "Your turn", "3d overdue", "4d overdue", "1w overdue", "Missed last time"],
		);
		const task: StudyCourse = {
			...LINALG,
			due: [],
			map: { ...LINALG.map, focus: "sheet", tasks: [{ key: "sheet", title: "Problem sheet 4", step: "At first, the owed rank retest: he needs the matrix", updated: "2026-11-07" }] },
		};
		const [taskLine] = needsYouNow([task], [], TODAY).lines;
		assert.equal(taskLine!.why?.short, "Left off yesterday");
		assert.equal(taskLine!.slot, "Left off yesterday");
		const today: StudyCourse = { ...ANALYSIS, map: { ...ANALYSIS.map, topics: [topic("conv", "Convergent sequences", "independent", { review: due(0) })] }, due: ["conv"] as TopicHandle[] };
		assert.equal(needsYouNow([today], [], TODAY).lines[0]!.slot, "Due today");
		assert.equal(slotWords(null, null), null);
	});

	it("leads a lapse with the lapsed topic, so the card's title and its reason name the same topic", () => {
		const other: StudyCourse = { ...CALCULUS, due: ["riemann", "chain"] as TopicHandle[] };
		const [line] = needsYouNow([other], [], TODAY).lines;
		assert.equal(line!.why?.short, "Missed Chain rule");
		assert.deepEqual(
			[line!.lead?.title, line!.slot, line!.topics.map((t) => t.title)],
			["Chain rule", "Missed last time", ["Chain rule", "Riemann sums"]],
		);
	});

	it("leads an open task with the course's current topic when the task holds it, else its first held topic", () => {
		const sheet = { key: "sheet", title: "Problem sheet 4: rank and nullity", step: "Part (c): show dim ker A = 2", updated: null };
		const holds = (handles: string[]) => LINALG.map.topics.map((t) => (handles.includes(t.handle) ? { ...t, tasks: ["sheet"] } : t));
		const task = (handles: string[]): StudyCourse => ({ ...LINALG, due: [], map: { ...LINALG.map, focus: "sheet", tasks: [sheet], topics: holds(handles) } });
		const [atRank] = needsYouNow([task(["independence", "rank"])], [], TODAY).lines;
		assert.deepEqual([atRank!.lead?.title, atRank!.slot, atRank!.topics.map((t) => t.handle)], ["Rank and the column space", "Unfinished", ["rank", "independence"]]);
		const [atFirst] = needsYouNow([task(["independence", "det"])], [], TODAY).lines;
		assert.equal(atFirst!.lead?.title, "Linear independence");
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
		const next: StudyCourse = { ...PROB, due: [], map: { ...PROB.map, topics: PROB.map.topics.map((t) => (t.handle === "bayes" ? { ...t, level: "assisted" as const } : t)) } };
		assert.deepEqual(lineTopics(todayRows([next], [], TODAY)[0]!), ["bayes"]);
		const none: StudyCourse = { ...PROB, due: [], map: map({ workspace: "/s/none", title: "None" }) };
		assert.deepEqual(lineTopics(todayRows([none], [], TODAY)[0]!), []);
	});
});
