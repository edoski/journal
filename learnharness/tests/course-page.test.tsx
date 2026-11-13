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
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ChatListItem, CourseMapTopic, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { courseFacts, courseGroups, courseNext, courseRead, GROUP_IDS, type CourseGroup as Group } from "../components/course-page/course-model.ts";
import { CourseHeader, CourseLessonError } from "../components/course-page/course-header.tsx";
import { CourseHeaderSkeleton } from "../components/course-page/course-header-skeleton.tsx";
import { CourseTopicRow } from "../components/course-page/course-topic-row.tsx";
import { CourseGroup } from "../components/course-page/course-group.tsx";
import { TopicMap } from "../components/course-map/topic-map/topic-map.tsx";
import { courseHref, unitHref, workspaceOf } from "../components/unit-inbox/unit-href.ts";
import { buildInbox } from "../components/unit-inbox/units.ts";
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
	topic("kernel", { title: "Kernel", level: "attempted", introduced: "2026-10-20", weak: true, review: due(1), signals: { ...QUIET, confidentErrors: 1 } }),
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
			tasks: [{ key: "sheet-4", title: "Problem sheet 4", step: "Part (c): show dim ker A = 2" }],
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
	compacting: false,
	course: { workspace: WS, title: "Linear Algebra" },
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

describe("every topic once, in the group he would act on it from", () => {
	const groups = courseGroups(course());

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

	it("puts every topic the map gives a reason in Needs you: slips first, a sure wrong answer on top, then the longest overdue review", () => {
		assert.deepEqual(handles(groupOf(groups, "needs-you")), ["kernel", "independence", "span"]);
		assert.deepEqual(
			groupOf(groups, "needs-you").topics.map((t) => t.fact?.words),
			["Sure, but wrong", "A mistake to fix", "1w overdue"],
		);
	});

	it("keeps the sidebar's Learning shelf less those in Learning, says where he is, and where an open task was left", () => {
		const learning = groupOf(groups, "learning");
		assert.deepEqual(handles(learning).sort(), ["cramer", "determinant", "rank"]);
		const fact = (handle: string) => learning.topics.find((t) => t.topic.handle === handle)!.fact;
		assert.deepEqual(fact("cramer"), { kind: "here", words: "You are here" });
		assert.deepEqual(fact("rank"), { kind: "task", words: "At part (c): show dim ker A = 2" });
		assert.equal(fact("determinant"), null, "a topic still being learned never says its review is due");
	});

	it("lists what is not started in the engine's path order, and the solid topics resting, the soonest back first, with the day", () => {
		assert.deepEqual(handles(groupOf(groups, "not-started")), ["invertible", "eigen"]);
		const own = groupOf(groups, "on-your-own");
		assert.deepEqual(handles(own), ["vectors", "basis"]);
		assert.deepEqual(own.topics[0]!.fact, { kind: "back", words: "Back Fri 13 Nov" });
	});

	it("agrees with the sidebar: Needs you and Learning together are its listed topics outside Known, Not started is what it leaves out", () => {
		const inbox = buildInbox([course()], [], WS);
		const sidebar = new Set([...inbox.active, ...inbox.working].map((u) => u.topic.handle));
		const page = new Set([...handles(groupOf(groups, "learning")), ...handles(groupOf(groups, "needs-you")).filter((h) => sidebar.has(h))]);
		assert.deepEqual([...page].sort(), [...sidebar].sort());
		assert.deepEqual(handles(groupOf(groups, "on-your-own")), inbox.known.map((u) => u.topic.handle));
	});

	it("puts a turn that waits on him first in Learning and says so, the accent fact on any group", () => {
		const waiting = chat("c1", { pendingQuestion: true, topics: [h("determinant")], updatedAt: "2026-11-08T08:00:00.000Z" });
		const withChat = courseGroups(course(), [waiting]);
		const learning = groupOf(withChat, "learning");
		assert.equal(learning.topics[0]!.topic.handle, "determinant");
		assert.deepEqual(learning.topics[0]!.fact, { kind: "your-turn", words: "Your turn" });
	});

	it("links each topic to its page", () => {
		assert.equal(groups[0]!.topics[0]!.href, unitHref(WS, "kernel"));
	});
});

describe("the header's facts and next lesson", () => {
	it("counts what Home's pie counts, names the exam once and when he last studied", () => {
		assert.deepEqual(courseFacts(course()), { progress: "3 of 10 on your own", exam: "Exam in 21 days", studied: "Studied 2 days ago" });
	});

	it("leaves out an exam that is not set and a count for a course with no topics", () => {
		const facts = courseFacts(course({ exam: null, topics: [] }, { lastActiveDaysAgo: null }));
		assert.deepEqual(facts, { progress: null, exam: null, studied: "Not studied yet" });
	});

	it("takes up Home's next step for the course: today's reviews first, in Today's words", () => {
		const next = courseNext(course(), []);
		assert.equal(next.action, "Review");
		assert.equal(next.lesson.title, "Review Span");
		assert.deepEqual(next.lesson.open, { kind: "course", workspace: WS });
		assert.equal(next.why?.short, "1w overdue");
	});

	it("resumes a session in this course that has waited on him since yesterday, and ignores one in another course", () => {
		const mine = chat("c1", { title: "Rank practice", pendingQuestion: true, updatedAt: "2026-11-08T08:00:00.000Z" });
		const other = chat("c2", { pendingQuestion: true, course: { workspace: "/study/prob", title: "Probability" }, updatedAt: "2026-11-08T09:00:00.000Z" });
		const next = courseNext(course(), [other, mine]);
		assert.equal(next.action, "Resume");
		assert.equal(next.lesson.title, "Rank practice");
		assert.deepEqual(next.lesson.open, { kind: "session", href: "/chat/c1" });
	});

	it("starts a lesson in a course with nothing to review, no task and no current topic", () => {
		const next = courseNext(course({ topics: [], tasks: [], current: null, focus: null }, { due: [] }), []);
		assert.equal(next.action, "Start");
		assert.equal(next.lesson.title, "Start a lesson");
	});
});

describe("the course page's read", () => {
	const ready = { status: "ready" as const, courses: [course()], failed: ["/study/broken"], open: [], chats: [] };

	it("says why a course cannot show: still reading, the engine not answering, the read failing, a record it could not read, a course not his", () => {
		assert.equal(courseRead({ status: "loading" }, WS).status, "loading");
		assert.equal(courseRead({ status: "unavailable", reason: "engine not found" }, WS).status, "unavailable");
		assert.equal(courseRead({ status: "failed" }, WS).status, "failed");
		assert.equal(courseRead(ready, "/study/broken").status, "unreadable");
		assert.equal(courseRead(ready, "/study/elsewhere").status, "missing");
	});

	it("ties a session to a topic by the engine's records, as the sidebar does", () => {
		const started = chat("c9", { pendingQuestion: true, topics: ["eigen"] });
		const read = courseRead({ ...ready, chats: [started] }, WS);
		assert.equal(read.status, "ready");
		if (read.status !== "ready") return;
		const eigen = read.view.groups.flatMap((g) => g.topics).find((t) => t.topic.handle === "eigen")!;
		assert.equal(eigen.group, "learning");
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

describe("the course header", () => {
	it("draws the name, one button with the step's word, the facts and the next step with why", () => {
		const document = render(<CourseHeader view={viewOf(course())} busy={false} onContinue={() => {}} />);
		assert.equal(document.querySelector('[data-slot="course-title"]')!.textContent, "Linear Algebra");
		assert.equal(document.querySelector('[data-slot="course-action"]')!.textContent, "Review");
		assert.deepEqual(
			[...document.querySelectorAll('[data-slot="course-fact"]')].map((f) => f.textContent),
			["3 of 10 on your own", "Exam in 21 days", "Studied 2 days ago"],
		);
		assert.equal(document.querySelector('[data-slot="course-next"]')!.textContent, "Review Span1w overdue");
		assert.equal(document.querySelectorAll("button, a").length, 1, "one control: the button");
	});

	it("leaves the exam out when there is none, and its skeleton keeps the header's three rows", () => {
		const document = render(<CourseHeader view={viewOf(course({ exam: null }))} busy={false} onContinue={() => {}} />);
		assert.equal(document.querySelectorAll('[data-slot="course-fact"]').length, 2);
		const skeleton = render(<CourseHeaderSkeleton />);
		assert.equal(skeleton.querySelector('[role="status"]')!.children.length, 3);
	});

	it("says a lesson that could not start inside the header, under the button he pressed, and nothing otherwise", () => {
		const header = (error: string | null) =>
			render(
				<CourseLessonError value={error}>
					<CourseHeader view={viewOf(course())} busy={false} onContinue={() => {}} />
				</CourseLessonError>,
			);
		assert.equal(header(null).querySelector('[role="alert"]'), null);
		const alert = header("Couldn’t open the session. Try again.").querySelector('[data-slot="course-header"] [role="alert"]');
		assert.equal(alert?.textContent, "Couldn’t open the session. Try again.");
	});
});

describe("the course topic row and group", () => {
	const groups = courseGroups(course());

	it("draws a topic as one link to its page: the pie, the title, its standing for a screen reader, and one fact", () => {
		const kernel = groups[0]!.topics[0]!;
		const document = render(<ul><CourseTopicRow row={kernel} /></ul>);
		const link = document.querySelector('[data-slot="course-topic-row"]')!;
		assert.equal(link.getAttribute("href"), unitHref(WS, "kernel"));
		assert.ok(document.querySelector('[data-slot="topic-glyph"]'));
		assert.equal(document.querySelector('[data-slot="course-topic-title"]')!.textContent, "Kernel, Learning");
		assert.equal(document.querySelector('[data-slot="course-topic-fact"]')!.textContent, "Sure, but wrong");
	});

	it("keeps a compact row's words for a screen reader and marks where he is", () => {
		const cramer = groupOf(groups, "learning").topics.find((t) => t.topic.handle === "cramer")!;
		const document = render(<ul><CourseTopicRow row={cramer} compact /></ul>);
		assert.equal(document.querySelector('[data-slot="course-topic-row"]')!.getAttribute("aria-current"), "location");
		assert.equal(document.querySelector('[data-slot="course-topic-fact"] .sr-only')!.textContent, "You are here");
	});

	it("heads a group with its name and no count, folds it, and shows the first rows then Show N more", () => {
		const items = ["a", "b", "c", "d", "e"];
		const draw = (props: Partial<React.ComponentProps<typeof CourseGroup<string>>>) =>
			render(<CourseGroup title="Not started" items={items} renderItem={(i) => <li key={i}>{i}</li>} {...props} />);
		const open = draw({ limit: 3 });
		assert.equal(open.querySelector('[data-slot="course-group-header"]')!.textContent, "Not started");
		assert.equal(open.querySelectorAll("li").length, 3);
		assert.equal(open.querySelector('[data-slot="course-group-more"]')!.textContent, "Show 2 more");
		const folded = draw({ foldable: true, defaultFolded: true });
		assert.equal(folded.querySelector('[data-slot="course-group-header"]')!.getAttribute("aria-expanded"), "false");
		assert.equal(folded.querySelectorAll("li").length, 0);
	});
});

describe("the topic map's highlight", () => {
	const map = course().map;
	const dimmed = (document: Document) =>
		[...document.querySelectorAll('[data-slot="course-map-node"]')].filter((n) => n.parentElement!.className.includes("opacity-35")).map((n) => n.getAttribute("data-testid"));

	it("dims nothing by default, as Home draws it", () => {
		assert.deepEqual(dimmed(render(<TopicMap map={map} />) as unknown as Document), []);
	});

	it("lights the topics it is given and dims the rest", () => {
		const document = render(<TopicMap map={map} highlight={new Set([h("span"), h("independence")])} />) as unknown as Document;
		const lit = TOPICS.filter((t) => !["span", "independence"].includes(t.handle)).map((t) => `map-node-${t.handle}`);
		assert.deepEqual(dimmed(document).sort(), lit.sort());
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
});
