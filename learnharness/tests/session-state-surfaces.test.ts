/**
 * Every surface agrees on what waits, and every button does what it says.
 * Sessions are real stored records (the chat store and the create route,
 * under an isolated data folder and the fake engine); Home, the topic page,
 * the calendar and the sidebar's data all read them through the one session
 * model. The demo world's shape: Linear Algebra with Rank due for review,
 * an older rank lesson the tutor signed off, a lesson on Eigenvalues whose
 * plan has a step named like a course topic, and an open problem sheet.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { useFakeEngine } from "./fixtures/fake-engine-env.ts";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-session-surfaces-"));
process.env.LH_DATA_DIR = TMP_DATA;
const WS = "/study/linalg";
useFakeEngine(TMP_DATA, [{ workspace: WS, title: "Linear Algebra" }]);

const { POST } = await import("../app/api/chats/route.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { newUserMessage } = await import("../src/core/native-messages.ts");
const { sessionState } = await import("../components/nav/session-state.ts");
const { topicAction } = await import("../components/unit-inbox/topic-page/topic-facts.ts");
const { courseMove, openSessions, todayRows } = await import("../components/study-home/study-facts.ts");
const { whyOf } = await import("../components/study-home/agenda-rows/row-facts.ts");
const { buildInbox } = await import("../components/unit-inbox/units.ts");
const { calendarEntries } = await import("../components/calendar/calendar-facts.ts");

import type { ChatListItem } from "../src/core/contracts/chat.ts";
import type { CourseMap, CourseMapTopic, TopicHandle } from "../src/core/contracts/course-map.ts";
import type { CalendarCourse } from "../src/core/contracts/calendar.ts";
import type { LhMessage } from "../src/core/native-messages.ts";

after(() => fs.rmSync(TMP_DATA, { recursive: true, force: true }));

const TODAY = "2026-11-08";
const QUIET = { repaired: false, gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0 };
const topic = (handle: string, title: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic => ({
	handle: handle as TopicHandle,
	title,
	level: "retained",
	introduced: "2026-10-01",
	review: { kind: "scheduled", date: "2026-11-20" },
	weak: false,
	signals: QUIET,
	tasks: [],
	...over,
});
const RANK = topic("rank", "Rank and the column space", { level: "assisted", review: { kind: "due", date: TODAY, overdue: 0 } });
const EIGEN = topic("eigen", "Eigenvalues and eigenvectors", { level: "assisted" });
const DIAG = topic("diagonalization", "Diagonalization", { level: "new", introduced: null, review: null });
const BASIS = topic("basis", "Basis and dimension", { tasks: ["sheet-4"] });
const SHEET = { key: "sheet-4", title: "Problem sheet 4", step: "Part (c)" };
const MAP: CourseMap = { workspace: WS, title: "Linear Algebra", today: TODAY, revision: 1, exam: null, current: EIGEN.handle, focus: null, tasks: [SHEET], topics: [RANK, BASIS, EIGEN, DIAG], edges: [] };
const COURSE: CalendarCourse = { map: MAP, unready: null, due: [RANK.handle], lastActiveDaysAgo: 0, newToday: [], planned: [], doesNotFit: [], finalReview: null };

// ─── stored sessions ────────────────────────────────────────────────────────

const USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
let n = 0;
const assistant = (content: unknown[], stopReason: "stop" | "toolUse" = "toolUse") =>
	({ id: `a${++n}`, role: "assistant", content, api: "faux", provider: "test", model: "test", usage: USAGE, stopReason, timestamp: n }) as unknown as LhMessage;
const result = (toolCallId: string, toolName: string, details: unknown = { ok: true }) =>
	({ id: `r${++n}`, role: "toolResult", toolCallId, toolName, content: [{ type: "text", text: "ok" }], details, isError: false, timestamp: n }) as unknown as LhMessage;
const call = (id: string, name: string, args: unknown) => ({ type: "toolCall", id: `${id}${n}`, name, arguments: args });
const text = (t: string) => ({ type: "text", text: t });

/** A lesson: probe, plan, the steps checked so far with an observation on
 *  `observed` saved (as JSON text when `asText`), then `last`. */
function lesson(steps: string[], observed: string[], last: LhMessage[], { asText = false } = {}): LhMessage[] {
	const tree = { nodes: steps.map((id) => ({ id, title: id })), edges: steps.slice(1).map((to, i) => ({ from: steps[i]!, to })), version: 1 };
	const changes = { observations: [{ topics: observed, text: "worked", result: "correct", help: "none" }] };
	const pd = call("pd", "probe_done", { strands: [], summary: "ready" });
	const plan = call("plan", "plan_init", { mermaid: "graph TD" });
	const q = call("q", "explain", { type: "check", nodeId: steps[0], question: "?", correctAnswer: "!" });
	const save = call("save", "course_save", { changes: asText ? JSON.stringify(changes) : changes });
	return [
		newUserMessage("Teach me."),
		assistant([pd]),
		result(pd.id, "probe_done"),
		assistant([text("Plan."), plan]),
		result(plan.id, "plan_init", { ok: true, tree }),
		assistant([text("Say go.")], "stop"),
		newUserMessage("Go."),
		assistant([q]),
		result(q.id, "explain", { kind: "explain", text: "!", confidence: "confident" }),
		assistant([save]),
		result(save.id, "course_save"),
		...last,
	];
}

function seed(title: string, messages: LhMessage[], steps: string[], updatedAt: string): string {
	const chat = chatStore.createChat(title, { workspace: WS, title: "Linear Algebra" });
	chatStore.saveTree(chat.id, { nodes: steps.map((id) => ({ id, title: id })), edges: steps.slice(1).map((to, i) => ({ from: steps[i]!, to })), version: 1 });
	chatStore.saveMessages(chat.id, messages);
	const file = path.join(TMP_DATA, "chats", `${chat.id}.json`);
	fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, "utf-8")), updatedAt }));
	return chat.id;
}

const RANK_STEPS = ["rank-picture", "rank-rule", "rank-own"];
const EIGEN_STEPS = ["equation", "compute", "diagonalization"];
/** Rank, a week ago: the tutor signed off with steps still ahead. */
const signedOff = seed("Rank, first pass", lesson(RANK_STEPS, ["rank"], [assistant([text("Good place to stop. Practice comes next, in a day or two.")], "stop")]), RANK_STEPS, "2026-11-01T19:00:00.000Z");
/** Eigenvalues, today: a check question waits on him; its plan has a step named like the Diagonalization topic. */
const waiting = seed(
	"Eigenvalues and eigenvectors",
	lesson(EIGEN_STEPS, ["eigen"], [assistant([call("q2", "explain", { type: "check", nodeId: "compute", question: "Eigenvalues of [[2,1],[1,2]]?", correctAnswer: "1 and 3" })])], { asText: true }),
	EIGEN_STEPS,
	"2026-11-08T09:00:00.000Z",
);
chatStore.nameSession(waiting, { title: "Eigenvalues and eigenvectors", topic: "eigen" });
/** The sheet, yesterday: it holds the task, which covers Basis, and the tutor signed off. */
const sheetMessages = lesson(["sheet-a", "sheet-b"], ["rank"], [assistant([text("Part (c) next time.")], "stop")]);
const focus = call("focus", "course_save", { changes: { focus: "sheet-4", tasks: { "sheet-4": { step: "Part (c)" } } } });
sheetMessages.splice(-1, 0, assistant([focus]), result(focus.id, "course_save"));
const sheet = seed("Problem sheet 4", sheetMessages, ["sheet-a", "sheet-b"], "2026-11-07T19:00:00.000Z");

const listed = (busy: string[] = []): ChatListItem[] => chatStore.listChats().map((c) => ({ ...c, busy: busy.includes(c.id), compacting: false }));
const sidebarRow = (chats: ChatListItem[], handle: string) => {
	const inbox = buildInbox([COURSE], chats, null);
	return [...inbox.active, ...inbox.working, ...inbox.known].find((u) => u.topic.handle === handle) ?? null;
};
const calendarReview = (chats: ChatListItem[]) => calendarEntries({ courses: [COURSE], chats, scope: null }).find((e) => e.kind === "review" && e.topic.handle === "rank");

// ─── the states ─────────────────────────────────────────────────────────────

describe("a lesson the tutor signed off", () => {
	it("is finished everywhere: no Your turn, and nothing resumes it", () => {
		const chats = listed();
		assert.equal(sessionState(chats.find((c) => c.id === signedOff)!), "finished");
		assert.equal(sessionState(chats.find((c) => c.id === sheet)!), "finished");
		assert.equal(sidebarRow(chats, "rank")?.now, null, "the sidebar row does not say your turn");
		assert.ok(!openSessions(chats).some((c) => c.id === signedOff || c.id === sheet), "Home gives it no line");
	});
});

describe("a due review", () => {
	it("starts a review of its topics from Home, the topic page and the calendar, never an older lesson", () => {
		const chats = listed();
		const rows = todayRows([COURSE], openSessions(chats), TODAY);
		const reviewRow = rows.find((r) => r.kind === "course");
		assert.ok(reviewRow?.kind === "course" && reviewRow.step.kind === "review", "Home keeps the review's line beside the waiting lesson");
		assert.deepEqual(courseMove(COURSE, chats), { kind: "start", opening: "Review Rank and the column space", topics: ["rank"] });
		assert.deepEqual(topicAction(RANK, MAP, chats), { kind: "review", opening: "Review Rank and the column space" });
		const entry = calendarReview(chats);
		assert.deepEqual(entry?.kind === "review" && entry.action, { kind: "review", opening: "Review Rank and the column space" });
	});

	it("once started, is on its topic from its first turn, named for what it is, and every surface opens it", async () => {
		const res = await POST(new Request("http://test/api/chats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Review Rank and the column space", course: { workspace: WS }, topics: ["rank"] }) }));
		const { id, title } = (await res.json()) as { id: string; title: string };
		assert.equal(title, "Review Rank and the column space");
		const q = call("rq", "recall", { question: "What does rank count?", correctAnswer: "Pivots." });
		chatStore.saveMessages(id, [newUserMessage(title), assistant([q])]);
		const chats = listed();
		const review = chats.find((c) => c.id === id)!;
		assert.deepEqual(review.topics, ["rank"], "the topic it was started on");
		assert.equal(sessionState(review), "your-turn");
		assert.deepEqual(courseMove(COURSE, chats), { kind: "open", chat: review }, "Home's review line opens it");
		assert.deepEqual(topicAction(RANK, MAP, chats), { kind: "resume", chat: review });
		assert.equal(sidebarRow(chats, "rank")?.now, "your-turn");
		assert.ok(!buildInbox([COURSE], chats, null).other.some((c) => c.id === id), "not under Other sessions");
		const rows = todayRows([COURSE], openSessions(chats), TODAY);
		assert.ok(!rows.some((r) => r.kind === "course" && r.step.kind === "review"), "it stands for the review's line on Home");
		chatStore.deleteChat(id);
	});
});

describe("a lesson waiting on his answer", () => {
	it("says Your turn only on the topic it belongs to, never on a topic named like a plan step", () => {
		const chats = listed();
		const eigen = chats.find((c) => c.id === waiting)!;
		assert.deepEqual(eigen.topics, ["eigen"], "read from a save sent as JSON text; no plan step");
		assert.equal(sidebarRow(chats, "eigen")?.now, "your-turn");
		assert.equal(sidebarRow(chats, "diagonalization"), null, "a topic never started is not listed");
		assert.deepEqual(topicAction(DIAG, MAP, chats), { kind: "start", opening: "Diagonalization" });
		assert.deepEqual(topicAction(EIGEN, MAP, chats), { kind: "resume", chat: eigen });
		const [first] = todayRows([COURSE], openSessions(chats), TODAY);
		assert.ok(first?.kind === "session" && first.chat.id === waiting);
		assert.deepEqual(whyOf(first!), { kind: "reply", short: "Your turn" });
	});

	it("keeps its line on Home while the tutor writes, saying so", () => {
		const chats = listed([waiting]);
		const [first] = todayRows([COURSE], openSessions(chats), TODAY);
		assert.ok(first?.kind === "session" && first.chat.id === waiting, "the lesson stays first, not swapped for another");
		assert.deepEqual(whyOf(first!), { kind: "working", short: "Tutor writing" });
		assert.deepEqual(topicAction(EIGEN, MAP, chats).kind, "open");
	});
});

describe("an open task", () => {
	it("is continued from the topics it covers, without making them Your turn", () => {
		const chats = listed();
		assert.equal(sidebarRow(chats, "basis")?.now, null);
		const action = topicAction(BASIS, MAP, chats);
		assert.ok(action.kind === "continue" && "chat" in action && action.chat.id === sheet, "Continue reopens the sheet's lesson");
	});
});
