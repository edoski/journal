/**
 * The course page's foundation: its address, the model every candidate
 * draws (each topic once, in the group he would act on it from, with the
 * words the sidebar and the map use), the header, the row and the group,
 * the map's highlight, and the sidebar's search for courses. Same tsx
 * classic-JSX shim as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "./helpers/app-render.tsx";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ChatListItem, CourseMapTopic, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { courseFacts, courseGroups, courseNext, courseRead, GROUP_IDS, type CourseGroup as Group } from "../components/course-page/course-model.ts";
import { CourseTopicRow } from "../components/course-page/course-topic-row.tsx";
import { standingOf } from "../components/course-map/topic-map/topic-standing.ts";
import { CourseGroup } from "../components/course-page/course-group.tsx";
import { TopicMap } from "../components/course-map/topic-map/topic-map.tsx";
import { courseHref, unitHref, workspaceOf } from "../components/unit-inbox/unit-href.ts";
import { buildInbox, unitStatus, type Unit } from "../components/unit-inbox/units.ts";
import { nowFor, plannedKeys, restTopics, shelfStatus } from "../components/unit-inbox/now-inbox.ts";
import { claimedKeys, todayTop } from "../components/unit-inbox/today/today-top.ts";
import { cardLine } from "../components/course-map/topic-map/topic-standing.ts";
import { sidebarSays } from "../components/unit-inbox/sidebar-says.ts";
import { headMarks } from "../components/unit-inbox/topic-page/topic-facts.ts";
import { searchInbox } from "../components/unit-inbox/unit-sidebar.tsx";

const h = (handle: string) => handle as TopicHandle;
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const due = (overdue: number) => ({ kind: "due" as const, date: "2026-11-01", overdue });
const later = (date: string) => ({ kind: "scheduled" as const, date });

function topic(handle: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic {
	return { handle: h(handle), title: handle, level: "new", introduced: null, review: null, weak: false, signals: QUIET, tasks: [], ...over };
}

const WS = "/study/linalg";
const TOPICS = [
	topic("vectors", { title: "Vectors", level: "transferred", introduced: "2026-09-01", review: later("2026-11-13") }),
	topic("span", { title: "Span", level: "retained", introduced: "2026-09-05", review: due(10) }),
	topic("independence", { title: "Linear independence", level: "assisted", introduced: "2026-09-10", weak: true, review: due(16), signals: { ...QUIET, gap: "Treats pairwise non-parallel vectors as independent" } }),
	topic("basis", { title: "Basis and dimension", level: "independent", introduced: "2026-09-12", review: later("2026-11-20") }),
	topic("kernel", { title: "Kernel", level: "attempted", introduced: "2026-10-20", weak: true, review: due(1), signals: { ...QUIET, confidentErrors: 1, mistake: true } }),
	topic("determinant", { title: "Determinants", level: "assisted", introduced: "2026-10-01", review: due(4) }),
	topic("rank", { title: "Rank", level: "introduced", introduced: "2026-10-25", review: due(2), tasks: ["sheet-4"] }),
	topic("cramer", { title: "Cramer's rule", level: "introduced", introduced: "2026-10-28", review: due(2) }),
	topic("invertible", { title: "Invertible matrices" }),
	topic("eigen", { title: "Eigenvalues" }),
];

function course(over: Partial<StudyCourse["map"]> = {}, rest: Partial<Omit<StudyCourse, "map">> = {}): StudyCourse {
	return {
		map: {
			workspace: WS,
			title: "Linear Algebra",
			today: "2026-11-08",
			revision: 1,
			exam: { date: "2026-11-29", daysLeft: 21 },
			current: h("cramer"),
			focus: "sheet-4",
			tasks: [{ key: "sheet-4", title: "Problem sheet 4", step: "Pending question, not yet answered: part (c)", updated: "2026-11-01" }],
			topics: TOPICS,
			edges: [
				{ kind: "needs", prerequisite: h("vectors"), topic: h("span") },
				{ kind: "needs", prerequisite: h("span"), topic: h("independence") },
				{ kind: "needs", prerequisite: h("independence"), topic: h("basis") },
			],
			...over,
		},
		unready: null,
		due: [h("span")],
		lastActiveDaysAgo: 2,
		newToday: [],
		...rest,
	};
}

const chat = (id: string, over: Partial<ChatListItem> = {}): ChatListItem => ({
	id,
	title: id,
	kind: "teach",
	createdAt: "2026-11-07T08:00:00.000Z",
	updatedAt: "2026-11-07T09:00:00.000Z",
	messageCount: 4,
	phase: "teach",
	pendingQuestion: false,
	pendingProblem: false,
	busy: false,
	course: { workspace: WS, title: "Linear Algebra" },
	ownTopics: over.topics ?? [],
	...over,
});

const handles = (group: Group) => group.topics.map((t) => t.topic.handle);
const groupOf = (groups: readonly Group[], id: Group["id"]) => groups.find((g) => g.id === id)!;

describe("the course page's address", () => {
	it("is the parent of each of its topics' addresses, and reads back to the course", () => {
		const href = courseHref(WS);
		assert.ok(unitHref(WS, "rank").startsWith(`${href}/`));
		assert.equal(workspaceOf(href.slice("/unit/".length)), WS);
	});
});

describe("every topic once, in the group the sidebar puts it in, with the sidebar's words", () => {
	const groups = courseGroups(course());
	/** What the sidebar shows for each topic: Today's card (on top) with its reason, else its shelf row's fact. */
	const sidebar = (c: StudyCourse, chats: readonly ChatListItem[] = []) => {
		const inbox = buildInbox([c], chats, null);
		const top = todayTop(nowFor([c], chats, null, c.map.today), inbox, chats);
		const said = new Map<string, string>();
		for (const item of top) for (const key of claimedKeys(item)) if (!said.has(key)) said.set(key, `Today: ${item.line.slot}`);
		const shelves = restTopics(inbox, new Set(said.keys()));
		const words = (u: Unit) => {
			const status = shelfStatus(u, c.map.today, plannedKeys([c]));
			return status.kind === "your-turn" ? "Your turn" : status.kind === "working" ? "Working" : "words" in status ? status.words : "";
		};
		for (const u of [...shelves.working, ...shelves.learning]) said.set(u.key, `Learning: ${words(u)}`);
		for (const u of shelves.known) said.set(u.key, `On your own: ${words(u)}`);
		return said;
	};
	/** What the page shows for each topic it lists in a group the sidebar has. */
	const page = (gs: readonly Group[]) =>
		new Map(
			gs
				.filter((g) => g.id !== "not-started")
				.flatMap((g) => g.topics.map((t) => [`${WS}#${t.topic.handle}`, `${g.id === "needs-you" ? "Today" : g.title}: ${t.fact?.kind === "here" ? "" : (t.fact?.words ?? "")}`] as const)),
		);

	it("always gives the four groups in order, an empty one included, and each topic exactly once", () => {
		assert.deepEqual(
			groups.map((g) => g.title),
			["Needs you", "Learning", "Not started", "On your own"],
		);
		const all = groups.flatMap(handles).sort();
		assert.deepEqual(all, TOPICS.map((t) => t.handle).sort());
		const empty = courseGroups(course({ topics: [] }));
		assert.deepEqual(
			empty.map((g) => g.topics.length),
			[0, 0, 0, 0],
		);
		assert.deepEqual(
			empty.map((g) => g.id),
			[...GROUP_IDS],
		);
	});

	it("says for every topic what the sidebar says: Today's reason for what Today takes up, else its shelf and its row's fact", () => {
		const said = sidebar(course());
		for (const [key, words] of page(groups)) assert.equal(words.replace(/: $/, ": " + (said.get(key)?.split(": ")[1] ?? "")), said.get(key), key);
		assert.deepEqual([...page(groups).keys()].sort(), [...said.keys()].filter((k) => k.startsWith(WS)).sort(), "the page lists what the sidebar lists, nothing more");
	});

	it("puts what Home's Today takes up in Needs you, with Today's reason", () => {
		assert.deepEqual(handles(groupOf(groups, "needs-you")), ["span"]);
		assert.deepEqual(groupOf(groups, "needs-you").topics[0]!.fact, { kind: "review", words: "Due 29 Oct" });
	});

	it("keeps a weak topic Today does not take up in Learning, as the sidebar's Learning shelf does, saying why it is weak", () => {
		const learning = groupOf(groups, "learning");
		const kernel = learning.topics.find((t) => t.topic.handle === "kernel")!;
		assert.deepEqual(kernel.fact, { kind: "slip", words: "Sure, but wrong", slip: "confident" });
		assert.equal(groupOf(groups, "needs-you").topics.some((t) => t.topic.weak), false, "a slip alone does not need him today");
	});

	it("says where he is on the current topic, unless something more pressing holds it", () => {
		const fact = (handle: string) => groups.flatMap((g) => g.topics).find((t) => t.topic.handle === handle)!.fact;
		assert.deepEqual(fact("cramer"), { kind: "here", words: "You are here" });
		const elsewhere = courseGroups(course({ current: h("rank") }));
		assert.deepEqual(elsewhere.flatMap((g) => g.topics).find((t) => t.topic.handle === "rank")!.fact, { kind: "task", words: "Left off 1 Nov" });
	});

	it("puts unfinished work before a review the plan dates later, on the page and the sidebar; the map's card keeps the topic's standing (round 15, m8)", () => {
		const held = { kind: "scheduled" as const, date: "2026-12-08", held: { exam: null, since: "2026-10-21" } };
		const map = course({ topics: TOPICS.map((t) => (t.handle === "basis" ? { ...t, review: held, tasks: ["sheet-4"] } : t)) });
		const row = groupOf(courseGroups(map), "on-your-own").topics.find((t) => t.topic.handle === "basis")!;
		assert.deepEqual(row.fact, { kind: "task", words: "Left off 1 Nov" });
		assert.equal(sidebar(map).get(`${WS}#basis`), "On your own: Left off 1 Nov");
		assert.equal(cardLine(sidebarSays([map], [], WS).get(h("basis"))), null);
	});

	it("says since when a review held past its day was due, in the words the sidebar and the topic page use", () => {
		const held = { kind: "scheduled" as const, date: "2026-12-08", held: { exam: null, since: "2026-10-21" } };
		const map = course({ topics: TOPICS.map((t) => (t.handle === "basis" ? { ...t, review: held } : t)) });
		const row = groupOf(courseGroups(map), "on-your-own").topics.find((t) => t.topic.handle === "basis")!;
		assert.deepEqual(row.fact, { kind: "review", words: "Due 21 Oct, back 8 Dec" }, "a late review needs him, so the map's card says it too, with the day it comes back (round 8)");
		const unit = buildInbox([map], [], WS).known.find((u) => u.topic.handle === "basis")!;
		assert.deepEqual(unitStatus(unit, "2026-11-08"), { kind: "review", words: row.fact!.words }, "the sidebar's row says the same");
		assert.deepEqual(
			headMarks(unit.topic, (handle) => handle, "2026-11-08").map((m) => m.words),
			[row.fact!.words],
			"the topic page's head says the same",
		);
	});

	it("puts a topic whose session waits on him in Needs you with Your turn, as Today's card for it", () => {
		const waiting = chat("c1", { pendingQuestion: true, topics: [h("determinant")], updatedAt: "2026-11-08T08:00:00.000Z" });
		const withChat = courseGroups(course(), [waiting]);
		const needs = groupOf(withChat, "needs-you");
		const det = needs.topics.find((t) => t.topic.handle === "determinant");
		assert.deepEqual(det?.fact, { kind: "your-turn", words: "Your turn" });
		assert.equal(sidebar(course(), [waiting]).get(`${WS}#determinant`), "Today: Your turn");
	});

	it("lists what is not started in the order the plan starts it, those it has no day for last in path order", () => {
		assert.deepEqual(handles(groupOf(groups, "not-started")), ["invertible", "eigen"], "no planned day: the engine's path order");
		const planned = course({
			topics: [...TOPICS, topic("diag", { title: "Diagonalization" }), topic("change", { title: "Change of basis" })].map((t) =>
				t.handle === "eigen" ? { ...t, starts: "2026-11-10" } : t.handle === "change" ? { ...t, starts: "2026-11-12" } : t,
			),
		});
		assert.deepEqual(handles(groupOf(courseGroups(planned), "not-started")), ["eigen", "change", "invertible", "diag"]);
	});

	it("links each topic to its page", () => {
		assert.equal(groupOf(groups, "learning").topics[0]!.href, unitHref(WS, "cramer"));
	});
});

describe("the header's facts and next lesson", () => {
	it("counts what Home's pie counts, names the exam once and when he last studied", () => {
		assert.deepEqual(courseFacts(course()), { progress: "Some topics on your own", exam: "Exam 29 Nov", studied: "Studied 6 Nov", lastSession: null });
	});

	it("leaves out an exam that is not set and a count for a course with no topics", () => {
		const facts = courseFacts(course({ exam: null, topics: [] }, { lastActiveDaysAgo: null }));
		assert.deepEqual(facts, { progress: null, exam: null, studied: "Not studied yet", lastSession: null });
	});

	it("says when a course not studied yet gives its first lesson and why then, and offers Start, never Continue", () => {
		const fresh = [topic("ode-intro", { starts: "2026-11-19", startsAfter: ["Probability", "Linear Algebra"] }), topic("ode-sep", { starts: "2026-11-20" })];
		const odes = course({ exam: { date: "2026-12-18", daysLeft: 40 }, current: null, focus: null, tasks: [], topics: fresh, edges: [] }, { lastActiveDaysAgo: null, due: [] });
		assert.equal(courseFacts(odes).studied, "First lesson Thu 19 Nov, after Probability's and Linear Algebra's new topics");
		const today = course({ exam: null, current: null, focus: null, tasks: [], topics: [topic("ode-intro", { starts: "2026-11-08" })], edges: [] }, { lastActiveDaysAgo: null, due: [] });
		assert.equal(courseFacts(today).studied, "First lesson today");
		assert.equal(courseNext(today, []).lesson.action, "Start");
	});

	it("gives each topic not started the day the plan starts it, not the group's own words", () => {
		const groups = courseGroups(course({ topics: [...TOPICS, topic("diag", { starts: "2026-11-11" })] }));
		const diag = groupOf(groups, "not-started").topics.find((t) => t.topic.handle === "diag")!;
		assert.deepEqual(diag.fact, { kind: "next", words: "Planned Wed 11 Nov" });
	});

	it("takes up Home's next step for the course: today's reviews first, in Today's words", () => {
		const next = courseNext(course(), []);
		assert.equal(next.lesson.action, "Review");
		assert.equal(next.lesson.title, "Review Span");
		assert.deepEqual(next.lesson.open, { kind: "course", workspace: WS });
		assert.equal(next.why?.short, "Due 29 Oct");
	});

	it("resumes a session in this course that has waited on him since yesterday, once nothing is planned before it, and ignores one in another course", () => {
		const mine = chat("c1", { title: "Rank practice", pendingQuestion: true, updatedAt: "2026-11-08T08:00:00.000Z" });
		const other = chat("c2", { pendingQuestion: true, course: { workspace: "/study/prob", title: "Probability" }, updatedAt: "2026-11-08T09:00:00.000Z" });
		assert.equal(courseNext(course(), [other, mine]).lesson.action, "Review", "today's review comes first, as on Home (round 10, 1 m2)");
		const next = courseNext(course({}, { due: [] }), [other, mine]);
		assert.equal(next.lesson.action, "Resume");
		assert.equal(next.lesson.title, "Rank practice");
		assert.deepEqual(next.lesson.open, { kind: "session", href: "/chat/c1" });
	});

	it("still takes up the course's next step once he ended today's review on it with Done for today, its answer saved, which Home leaves off Today", () => {
		const left = chat("c1", { title: "Review Span", topics: [h("span")], ended: "left", updatedAt: "2026-11-08T12:00:00.000Z", answeredOn: { span: "2026-11-08" } });
		const next = courseNext(course({ tasks: [], focus: null }), [left]);
		assert.equal(next.lesson.action, "Review");
		assert.equal(next.lesson.title, "Review Span");
		assert.deepEqual(next.lesson.open, { kind: "course", workspace: WS });
		assert.equal(courseNext(course(), [left]).lesson.title, `Continue ${course().map.tasks[0]!.title}`, "with an open task, the line Home still has for the course");
		// Round 17, M4: left with no answer on Span today, the review is still today's, on Home and here.
		assert.equal(courseNext(course(), [{ ...left, answeredOn: undefined }]).lesson.title, "Review Span");
	});

	it("starts a lesson in a course with nothing to review, no task and no current topic", () => {
		const next = courseNext(course({ topics: [], tasks: [], current: null, focus: null }, { due: [] }), []);
		assert.equal(next.lesson.action, "Start");
		assert.equal(next.lesson.title, "Start a lesson");
	});
});

describe("the course page's read", () => {
	const broken = { workspace: "/study/broken", title: "Broken", problem: "damaged" as const };
	const ready = { status: "ready" as const, courses: [course()], failed: [broken], open: [], chats: [] };

	it("says why a course cannot show: still reading, the engine not answering, the read failing, a record it could not read, a course not his", () => {
		assert.equal(courseRead({ status: "loading" }, WS).status, "loading");
		assert.equal(courseRead({ status: "unavailable", reason: "engine not found" }, WS).status, "unavailable");
		assert.equal(courseRead({ status: "failed" }, WS).status, "failed");
		assert.deepEqual(courseRead(ready, "/study/broken"), { status: "unreadable", course: broken });
		assert.equal(courseRead(ready, "/study/elsewhere").status, "missing");
	});

	it("ties a session to a topic by the engine's records, as the sidebar does", () => {
		const started = chat("c9", { pendingQuestion: true, topics: ["eigen"] });
		const read = courseRead({ ...ready, chats: [started] }, WS);
		assert.equal(read.status, "ready");
		if (read.status !== "ready") return;
		const eigen = read.view.groups.flatMap((g) => g.topics).find((t) => t.topic.handle === "eigen")!;
		assert.equal(eigen.group, "needs-you", "Today takes it up, as the sidebar's card for the session");
		assert.equal(eigen.fact?.kind, "your-turn");
	});
});

const router = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
const render = (node: React.ReactNode) =>
	parseHTML(`<html><body>${renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>)}</body></html>`).document;

function viewOf(c: StudyCourse) {
	const read = courseRead({ status: "ready", courses: [c], failed: [], open: [], chats: [] }, c.map.workspace);
	assert.equal(read.status, "ready");
	return (read as Extract<typeof read, { status: "ready" }>).view;
}

describe("the course topic row and group", () => {
	const groups = courseGroups(course());

	it("draws a topic as one link to its page: the pie, the title, its standing for a screen reader, and one fact", () => {
		const kernel = groups.flatMap((g) => g.topics).find((t) => t.topic.handle === "kernel")!;
		const document = render(<ul><CourseTopicRow row={kernel} /></ul>);
		const link = document.querySelector('[data-slot="course-topic-row"]')!;
		assert.equal(link.getAttribute("href"), unitHref(WS, "kernel"));
		assert.ok(document.querySelector('[data-slot="topic-glyph"]'));
		assert.equal(document.querySelector('[data-slot="course-topic-title"]')!.textContent, "Kernel, Tried, not right yet");
		assert.equal(document.querySelector('[data-slot="course-topic-fact"]')!.textContent, "Sure, but wrong");
	});

	it("shows a compact row's words and marks where he is (round 11, 1 N8)", () => {
		const cramer = groupOf(groups, "learning").topics.find((t) => t.topic.handle === "cramer")!;
		const document = render(<ul><CourseTopicRow row={cramer} compact /></ul>);
		assert.equal(document.querySelector('[data-slot="course-topic-row"]')!.getAttribute("aria-current"), "location");
		assert.equal(document.querySelector('[data-slot="course-topic-fact"] [data-slot="status-words"]')!.textContent, "You are here");
	});

	it("heads a group with its name and no count, folds it, and shows the first rows then Show the rest", () => {
		const items = ["a", "b", "c", "d", "e"];
		const draw = (props: Partial<React.ComponentProps<typeof CourseGroup<string>>>) =>
			render(<CourseGroup title="Not started" items={items} renderItem={(i) => <li key={i}>{i}</li>} {...props} />);
		const open = draw({ limit: 3 });
		assert.equal(open.querySelector('[data-slot="course-group-header"]')!.textContent, "Not started");
		assert.equal(open.querySelectorAll("li").length, 3);
		assert.equal(open.querySelector('[data-slot="course-group-more"]')!.textContent, "Show the rest");
		const folded = draw({ foldable: true, defaultFolded: true });
		assert.equal(folded.querySelector('[data-slot="course-group-header"]')!.getAttribute("aria-expanded"), "false");
		assert.equal(folded.querySelectorAll("li").length, 0);
	});
});

describe("the topic map's highlight", () => {
	const map = course().map;
	const dimmed = (document: Document) =>
		[...document.querySelectorAll('[data-slot="course-map-node"]')].filter((n) => /opacity:\s*0?\.\d/.test(n.parentElement!.parentElement!.getAttribute("style") ?? "")).map((n) => n.getAttribute("data-testid"));

	it("dims nothing by default, as Home draws it", () => {
		assert.deepEqual(dimmed(render(<TopicMap map={map} said={new Map()} />) as unknown as Document), []);
	});

	it("lights the topics it is given, You are here and the topics it leads to, and dims the rest", () => {
		const document = render(<TopicMap map={map} said={new Map()} highlight={new Set([h("span"), h("independence")])} />) as unknown as Document;
		const next = map.edges.flatMap((e) => (e.kind === "needs" && e.prerequisite === map.current ? [e.topic as string] : []));
		const shown = new Set(["span", "independence", map.current as string, ...next]);
		const rest = TOPICS.filter((t) => !shown.has(t.handle)).map((t) => `map-node-${t.handle}`);
		assert.deepEqual(dimmed(document).sort(), rest.sort());
	});
});

describe("the sidebar's search", () => {
	it("finds courses by name only when it is given them, before topics and sessions", () => {
		const inbox = buildInbox([course()], [], null);
		const found = searchInbox(inbox, [], "lin", [course()]);
		assert.deepEqual(
			found.courses.map((c) => c.map.title),
			["Linear Algebra"],
		);
		assert.deepEqual(searchInbox(inbox, [], "lin").courses, []);
	});

	it("finds a topic not started yet on a course's map, which the inbox does not list (round 4: Poisson, Geometric, Variance)", () => {
		const inbox = buildInbox([course()], [], null);
		assert.ok(![...inbox.active, ...inbox.working, ...inbox.known].some((u) => u.topic.handle === "eigen"), "the inbox lists only started topics");
		assert.deepEqual(
			searchInbox(inbox, [], "eigen", [course()]).units.map((u) => u.topic.title),
			["Eigenvalues"],
		);
		const scoped = buildInbox([course()], [], "/elsewhere");
		assert.deepEqual(searchInbox(scoped, [], "eigen", [course()]).units, [], "under the course filter, only that course's topics");
	});

	it("says a topic it finds that he has not started is Not started, instead of a blank status (round 4)", () => {
		const inbox = buildInbox([course()], [], null);
		const [eigen] = searchInbox(inbox, [], "eigen", [course()]).units;
		assert.equal(eigen!.topic.level, "new");
		assert.deepEqual(unitStatus(eigen!, "2026-11-08"), { kind: "none", words: "Not started" });
	});
});

describe("a topic row's status in words, whole (round 11, 1 N8 and 2 n9)", () => {
	// Shots 42, 61b: rows showed a bare arrow, bookmark or check-circle beside rows with words, and "Cramer's rule · Due 6 Nov" read as overdue while the map said "back 20 Nov".
	const held = topic("matmul", { title: "Matrix multiplication as composition", level: "assisted", introduced: "2026-10-01", review: { kind: "scheduled", date: "2026-11-20", held: { exam: null, since: "2026-11-06" } } });
	const rowOf = (handle: string, c: StudyCourse) => courseGroups(c).flatMap((g) => g.topics).find((t) => t.topic.handle === handle)!;

	it("cuts the title before the status, whose words always show", () => {
		const row = rowOf("matmul", course({ topics: [...TOPICS, held] }));
		const document = render(<ul><CourseTopicRow row={row} className="h-8" /></ul>);
		const title = document.querySelector('[data-slot="course-topic-title"]')!.parentElement!;
		const fact = document.querySelector('[data-slot="course-topic-fact"]')!;
		const words = fact.querySelector('[data-slot="status-words"]')!;
		assert.match(title.className, /\bmin-w-0\b/);
		assert.match(title.className, /\bflex-1\b/, "the title takes what the status leaves");
		assert.doesNotMatch(title.className, /\bshrink-0\b/);
		assert.match(fact.className, /\bshrink-0\b/, "the status keeps its width");
		assert.doesNotMatch(fact.className, /\b(flex-wrap|overflow-hidden)\b/, "no slot hides its words");
		assert.doesNotMatch(words.className, /\b(sr-only|truncate)\b/);
		assert.match(words.className, /\bwhitespace-nowrap\b/);
		assert.equal(fact.getAttribute("data-state"), "closed", "the slot is the trigger of its hint, which says the whole sentence");
	});

	it("says a review in the sidebar's and the map card's words, and a planned start by its date (round 15, m10)", () => {
		const row = rowOf("matmul", course({ topics: [...TOPICS, held] }));
		assert.deepEqual(row.fact, { kind: "review", words: "Due 6 Nov, back 20 Nov" });
		assert.equal(row.factWords, "Due 6 Nov, back 20 Nov");
		const span = rowOf("span", course());
		assert.deepEqual([span.fact?.words, span.factWords], ["Due 29 Oct", "Due 29 Oct"]);
		const fresh = rowOf("eigen", course({ topics: TOPICS.map((t) => (t.handle === "eigen" ? { ...t, starts: "2026-11-18" } : t)) }));
		assert.equal(fresh.factWords, "Planned 18 Nov");
	});

	it("shows the words on every row, the compact one included", () => {
		const row = rowOf("matmul", course({ topics: [...TOPICS, held] }));
		const document = render(<ul><CourseTopicRow row={row} compact /></ul>);
		assert.doesNotMatch(document.querySelector('[data-slot="course-topic-fact"] [data-slot="status-words"]')!.className, /\bsr-only\b/);
	});
});
