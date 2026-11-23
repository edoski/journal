/**
 * Round 21, m6 (2 n1; carry-in (c), 1 step 28): the calendar's left work
 * is Home's.
 *   - Lens 2: Rank practice, answered until its Model solution and Next
 *     problem showed, then ⌘⇧D. Its close named no continuation, yet
 *     Sessions read "Left off today" and Mon 9 "Continue Rank practice ·
 *     Left off 8 Nov". A practice round he closes between problems is
 *     finished: the engine's reviews carry its topics.
 *   - Lens 1, 17 Nov: Home listed "Continue Eigenvalues and eigenvectors
 *     lesson" and "Continue Rank practice", each left on an earlier day; the
 *     calendar's Tue 17 listed neither.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";
import type { CalendarCourse } from "../src/core/contracts/calendar.ts";
import type { CourseMap, TopicHandle } from "../src/core/contracts/course-map.ts";
import { newSessionModeMessage, type LhMessage } from "../src/core/native-messages.ts";
import { inputAppends } from "../src/core/input-events.ts";
import { sessionState } from "../components/nav/session-state.ts";
import { calendarEntries, lookWords } from "../components/calendar/calendar-facts.ts";
import { needsYouNow } from "../components/study-home/needs-you.ts";
import { chat, topic } from "./fixtures/round8-home.ts";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-left-work-"));
process.env.LH_DATA_DIR = path.join(scratch, "data");
const { chatStore } = await import("../src/store/chats.ts");
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const SUN = "2026-11-08";
const MON = "2026-11-09";

function la(today: string, over: Partial<CourseMap> = {}): CalendarCourse {
	const map: CourseMap = {
		workspace: "/s/la",
		title: "Linear Algebra",
		today,
		revision: 1,
		exam: null,
		current: "eigen" as TopicHandle,
		focus: null,
		tasks: [],
		topics: [topic("eigen", "Eigenvalues and eigenvectors"), topic("rank", "Rank and the column space"), topic("kernel", "Kernel and rank-nullity")],
		edges: [],
		...over,
	};
	return { map, unready: null, due: [], newToday: [], lastActiveDaysAgo: 0, planned: [{ date: addDay(today), reviews: ["rank" as TopicHandle, "kernel" as TopicHandle], new: [] }] as never, doesNotFit: [], finalReview: null };
}

function addDay(day: string): string {
	const d = new Date(`${day}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + 1);
	return d.toISOString().slice(0, 10);
}

describe("Rank practice closed between problems (round 21, m6; 2 n1)", () => {
	// Lens 2's Rank practice (round 15's record): answered, marked, Model solution and Next problem showing.
	const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "round15", "rank-after-dispute.json");
	const record = JSON.parse(fs.readFileSync(fixture, "utf-8")) as { kind: "practice"; topics: string[]; messages: LhMessage[] };
	const closed: LhMessage[] = [
		newSessionModeMessage("practice") as LhMessage,
		...record.messages,
		...inputAppends(record, { type: "tonight" }),
		{ id: "a_close", role: "assistant", content: [{ type: "text", text: "Your Rank and the column space, Kernel and rank-nullity reviews come back tomorrow, Monday 9 November." }], stopReason: "stop", timestamp: Date.parse(`${SUN}T12:00:00Z`) } as unknown as LhMessage,
	];
	// Opened on its topic, as the topic page's Practice opens it; the store's listing is what every surface reads.
	const created = chatStore.createChat("Rank practice", { workspace: "/s/la", title: "Linear Algebra" }, record.topics);
	chatStore.saveMessages(created.id, closed);
	const rank = { ...chatStore.listChats().find((c) => c.id === created.id)!, busy: false, updatedAt: `${SUN}T12:00:00.000Z` };

	it("is finished, so Sessions reads it as studied today, never Left off", () => {
		assert.equal(sessionState(rank), "finished");
	});

	it("has no Continue on Mon 9, nor a status on Sun 8", () => {
		const entries = calendarEntries({ courses: [la(SUN)], chats: [rank], scope: null });
		assert.deepEqual(entries.filter((e) => e.day === MON && e.kind === "task").map((e) => e.title), []);
		const sunday = entries.find((e) => e.id === `session:${rank.id}`)!;
		assert.equal(lookWords(sunday, SUN), "Practice");
	});
});

describe("17 Nov: the calendar's today lists Home's Continue rows (round 21, m6; carry-in (c))", () => {
	const TODAY = "2026-11-17";
	const eigen = chat({ id: "chat_eigen", title: "Eigenvalues and eigenvectors lesson", ended: "left", topics: ["eigen"], ownTopics: ["eigen"], updatedAt: "2026-11-10T11:00:00.000Z" });
	const rank = chat({ id: "chat_demo_rank", title: "Rank practice", kind: "practice", ended: "left", pendingProblem: true, topics: ["rank"], ownTopics: ["rank"], updatedAt: "2026-11-08T08:54:30.000Z" });
	const courses = [la(TODAY)];
	const chats = [eigen, rank];

	it("each of Home's session lines is an entry of today, in Home's title and status", () => {
		const home = needsYouNow(courses, chats, TODAY);
		const lines = [...home.lines, ...home.also].filter((l) => l.row.kind === "session");
		assert.deepEqual(lines.map((l) => l.title).sort(), ["Continue Eigenvalues and eigenvectors lesson", "Continue Rank practice"]);
		const today = calendarEntries({ courses, chats, scope: null }).filter((e) => e.day === TODAY);
		for (const line of lines) {
			const entry = today.find((e) => e.title === line.title);
			assert.ok(entry, `Tue 17 lists ${line.title}: ${JSON.stringify(today.map((e) => e.title))}`);
			assert.equal(lookWords(entry, TODAY), line.slot);
			assert.ok(entry.kind === "task" && entry.move.kind === "open" && entry.move.chat.id === (line.row.kind === "session" ? line.row.chat.id : ""), "Continue opens the session Home's row opens");
		}
	});

	it("once each, and its own day's entry says what he did", () => {
		const entries = calendarEntries({ courses, chats, scope: null });
		assert.equal(entries.filter((e) => e.day === TODAY && e.title === "Continue Rank practice").length, 1);
		const sunday = entries.find((e) => e.id === "session:chat_demo_rank")!;
		assert.equal(lookWords(sunday, TODAY), "Practice");
	});

	it("a session Home holds no line for today is not listed today", () => {
		const done = { ...eigen, ended: "closed" as const };
		const today = calendarEntries({ courses, chats: [done], scope: null }).filter((e) => e.day === TODAY);
		assert.deepEqual(today.map((e) => e.title), []);
	});
});
