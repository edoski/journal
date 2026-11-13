/**
 * The course page's List candidate: how it draws the groups (empty ones
 * left out, the next three not started, On your own folded unless it needs
 * him or stands alone), the sentence for a course with no topics, and the
 * arrow-key walk for a page where Tab is dead. Same tsx classic-JSX shim as
 * the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { CourseMapTopic, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { courseGroups, courseNext, type CourseGroup as Group } from "../components/course-page/course-model.ts";
import { ListGroups } from "../components/course-page/list/list-groups.tsx";
import { listPlan, listWhere, NOT_STARTED_SHOWN } from "../components/course-page/list/list-plan.ts";
import { entryOf, listStops, onListKeyDown, scrollToShow } from "../components/course-page/list/list-keys.ts";
import { ListWhere } from "../components/course-page/list/list-where.tsx";
import { todaysReview } from "../components/study-home/study-facts.ts";

const h = (handle: string) => handle as TopicHandle;
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const WS = "/study/linalg";

function topic(handle: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic {
	return { handle: h(handle), title: handle, level: "new", introduced: null, review: null, weak: false, signals: QUIET, tasks: [], ...over };
}

const known = (handle: string, date: string) => topic(handle, { level: "retained", introduced: "2026-09-01", review: { kind: "scheduled", date } });

function course(topics: CourseMapTopic[], current: string | null = null, over: Partial<StudyCourse> = {}, map: Partial<StudyCourse["map"]> = {}): StudyCourse {
	return {
		map: { workspace: WS, title: "Linear Algebra", today: "2026-11-08", revision: 1, exam: null, current: current ? h(current) : null, focus: null, tasks: [], topics, edges: [], ...map },
		unready: null,
		due: [],
		lastActiveDaysAgo: 2,
		newToday: [],
		...over,
	};
}

const FULL = [
	topic("independence", { title: "Linear independence", level: "assisted", introduced: "2026-09-10", weak: true, review: { kind: "due", date: "2026-11-01", overdue: 7 } }),
	topic("cramer", { title: "Determinants", level: "introduced", introduced: "2026-10-28" }),
	known("vectors", "2026-11-13"),
	...["a", "b", "c", "d", "e", "f"].map((x) => topic(`new-${x}`)),
];

const planOf = (c: StudyCourse, groups: readonly Group[] = courseGroups(c)) => listPlan({ course: c, groups });
const ids = (plan: ReturnType<typeof listPlan>) => plan.map((p) => p.id);
const groupOf = (c: StudyCourse, id: string, groups?: readonly Group[]) => planOf(c, groups).find((p) => p.id === id)!;
/** Sessions on the given topics: the tutor waits on him in each. */
const waiting = (c: StudyCourse, handles: string[]): Group[] =>
	courseGroups(c).map((g) => ({ ...g, topics: g.topics.map((t) => (handles.includes(t.topic.handle) ? { ...t, now: "your-turn" as const, fact: { kind: "your-turn" as const, words: "Your turn" } } : t)) }));

describe("the list's plan", () => {
	it("keeps the order he would act in and leaves empty groups out", () => {
		assert.deepEqual(ids(planOf(course(FULL))), ["needs-you", "learning", "not-started", "on-your-own"]);
		assert.deepEqual(ids(planOf(course([topic("x"), topic("y")]))), ["not-started"]);
		assert.deepEqual(planOf(course([])), []);
	});

	it("names the topics he can do on his own that need nothing Known, as the sidebar does", () => {
		assert.deepEqual(
			planOf(course(FULL)).map((p) => p.title),
			["Needs you", "Learning", "Not started", "Known"],
		);
	});

	it("shows the next three topics not started, then Show more", () => {
		const notStarted = groupOf(course(FULL), "not-started");
		assert.equal(notStarted.rows.length, 6);
		assert.equal(notStarted.limit, NOT_STARTED_SHOWN);
	});

	it("never offers Show 1 more: four topics not started show whole", () => {
		const four = ["a", "b", "c", "d"].map((x) => topic(`new-${x}`));
		assert.equal(groupOf(course(four), "not-started").limit, undefined);
		assert.equal(groupOf(course([...four, topic("new-e")]), "not-started").limit, NOT_STARTED_SHOWN);
	});

	it("never hides the topic he is at, or one a session holds, behind Show more", () => {
		const path = ["a", "b", "c", "d", "e", "f", "g"].map((x) => topic(`new-${x}`));
		const here = groupOf(course(path, "new-e"), "not-started");
		assert.equal(here.limit, 5);
		assert.ok(here.rows.slice(0, here.limit).some((r) => r.row.current));
		const c = course(path);
		const held = groupOf(c, "not-started", waiting(c, ["new-f"]));
		assert.equal(held.limit, undefined, "six of seven would leave Show 1 more, so all seven show");
	});

	it("puts a topic not started under Not started, in path order, even with a session on it", () => {
		const c = course([topic("new-a"), topic("eigen", { title: "Eigenvalues" }), topic("new-b"), known("vectors", "2026-11-13")]);
		const groups = courseGroups(c).map((g) => (g.id === "not-started" ? { ...g, topics: g.topics.filter((t) => t.topic.handle !== "eigen") } : g));
		const eigen = { ...courseGroups(c).flatMap((g) => g.topics).find((t) => t.topic.handle === "eigen")!, group: "learning" as const, now: "your-turn" as const, fact: { kind: "your-turn" as const, words: "Your turn" } };
		const moved = groups.map((g) => (g.id === "learning" ? { ...g, topics: [eigen] } : g));
		const plan = planOf(c, moved);
		assert.deepEqual(ids(plan), ["not-started", "on-your-own"]);
		const rows = plan[0]!.rows;
		assert.deepEqual(rows.map((r) => r.row.topic.handle), ["new-a", "eigen", "new-b"]);
		assert.equal(rows[1]!.row.fact?.words, "Your turn");
		assert.equal(rows[1]!.row.group, "not-started");
	});

	it("folds Known, as the sidebar's shelf", () => {
		const own = groupOf(course(FULL), "on-your-own");
		assert.equal(own.foldable, true);
		assert.equal(own.folded, true);
	});

	it("opens Known when nothing waits under Needs you or Not started, so a finished course shows whole", () => {
		assert.equal(groupOf(course([known("vectors", "2026-11-13"), known("span", "2026-11-20")]), "on-your-own").folded, false);
		const learnt = course([topic("cramer", { level: "assisted", introduced: "2026-10-28" }), known("vectors", "2026-11-13")]);
		assert.deepEqual(ids(planOf(learnt)), ["learning", "on-your-own"]);
		assert.equal(groupOf(learnt, "on-your-own").folded, false);
	});

	it("opens Known when a session on one of its topics waits on him or is being written", () => {
		const c = course(FULL);
		assert.equal(groupOf(c, "on-your-own", waiting(c, ["vectors"])).folded, false);
	});
});

describe("the list's rows", () => {
	const learning = (over: Partial<CourseMapTopic> = {}) => topic("determinant", { title: "Determinants", level: "assisted", introduced: "2026-10-01", review: { kind: "due", date: "2026-11-04", overdue: 4 }, ...over });

	it("says a topic still being learned is due when today's review takes it up", () => {
		const c = course([learning()], null, { due: [h("determinant")] });
		assert.deepEqual(groupOf(c, "learning").rows[0]!.row.fact, { kind: "review", words: "4d overdue" });
		const notToday = course([learning()]);
		assert.equal(groupOf(notToday, "learning").rows[0]!.row.fact, null, "a due date alone, as nearly every learning topic has, says nothing");
	});

	it("names on its rows every topic the header's Review takes up", () => {
		const topics = [learning(), FULL[0]!, topic("span", { level: "retained", introduced: "2026-09-01", review: { kind: "due", date: "2026-10-29", overdue: 10 } }), ...FULL.slice(1)];
		const c = course(topics, null, { due: [h("independence"), h("span"), h("determinant")] });
		const rows = planOf(c).flatMap((p) => p.rows.map((r) => ({ id: p.id, ...r })));
		for (const t of todaysReview(c)) {
			const row = rows.find((r) => r.row.topic.handle === t.handle)!;
			assert.ok(row.id === "needs-you" || row.row.fact?.kind === "review", `${t.handle} is under Needs you or says its review`);
		}
	});

	it("shows the engine's sentence for a diagnosed mistake under the title", () => {
		const gap = "Counts nonzero entries instead of pivots";
		const c = course([topic("rank", { level: "assisted", introduced: "2026-10-01", weak: true, signals: { ...QUIET, gap } })]);
		const row = groupOf(c, "needs-you").rows[0]!;
		assert.equal(row.row.fact?.words, "A mistake to fix");
		assert.equal(row.detail, gap);
	});

	it("keeps why a topic needs him in view when a session's Your turn takes its row's end", () => {
		const c = course([topic("kernel", { level: "attempted", introduced: "2026-10-01", weak: true, signals: { ...QUIET, confidentErrors: 1 } })]);
		const row = groupOf(c, "needs-you", waiting(c, ["kernel"])).rows[0]!;
		assert.equal(row.row.fact?.words, "Your turn");
		assert.equal(row.detail, "Sure, but wrong");
	});

	it("adds no second line to a row with nothing more to say", () => {
		assert.ok(planOf(course(FULL)).flatMap((p) => p.rows).filter((r) => r.row.topic.handle !== "independence").every((r) => r.detail === null));
	});
});

describe("where he was", () => {
	const sheet = { key: "sheet-4", title: "Problem sheet 4", step: "Part (c): show dim ker A = 2" };
	const topics = [topic("rank", { title: "Rank", level: "assisted", introduced: "2026-10-01", tasks: ["sheet-4"], review: { kind: "due", date: "2026-11-05", overdue: 3 } }), topic("eigen")];
	const view = (c: StudyCourse) => ({ course: c, next: courseNext(c, []) });

	it("names the topic he is at and the open task at its step when the header's next line is about something else", () => {
		const c = course(topics, "rank", { due: [h("rank")] }, { tasks: [sheet as never], focus: "sheet-4" as never });
		const where = listWhere(view(c));
		assert.equal(where.here?.title, "Rank");
		assert.deepEqual(where.task, { title: "Problem sheet 4", step: "At part (c): show dim ker A = 2" });
	});

	it("leaves out what the header's next line already names", () => {
		const task = listWhere(view(course(topics, "rank", {}, { tasks: [sheet as never], focus: "sheet-4" as never })));
		assert.equal(task.task, null, "the header continues the task");
		assert.equal(task.here?.title, "Rank");
		const start = listWhere(view(course(topics, "rank")));
		assert.equal(start.here, null, "the header starts the topic he is at");
		assert.equal(start.task, null);
	});

	it("draws one line each, the map's tag after the topic", () => {
		const c = course(topics, "rank", { due: [h("rank")] }, { tasks: [sheet as never], focus: "sheet-4" as never });
		const doc = render(<ListWhere view={{ ...view(c), groups: courseGroups(c), facts: { progress: null, exam: null, studied: null } }} />);
		assert.equal(doc.querySelector("[data-slot=course-list-here]")!.textContent, "RankYou are here");
		assert.equal(doc.querySelector("[data-slot=course-list-task]")!.textContent, "Problem sheet 4At part (c): show dim ker A = 2");
	});
});

const router = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };
function render(node: React.ReactNode) {
	return parseHTML(`<html><body>${renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>)}</body></html>`).document;
}

describe("the list's body", () => {
	const draw = (c: StudyCourse) => render(<ListGroups view={{ course: c, groups: courseGroups(c) }} />);

	it("draws each group's topics, Show N more for the rest, and Known folded", () => {
		const doc = draw(course(FULL));
		const titles = [...doc.querySelectorAll("[data-slot=course-topic-title]")].map((n) => n.firstChild?.textContent);
		assert.deepEqual(titles, ["Linear independence", "Determinants", "new-a", "new-b", "new-c"]);
		assert.match(doc.querySelector("[data-slot=course-group-more]")!.textContent!, /Show 3 more/);
		const own = doc.querySelector("[data-group=on-your-own] button[data-slot=course-group-header]")!;
		assert.equal(own.getAttribute("aria-expanded"), "false");
		assert.match(own.textContent!, /^Known/);
		assert.equal(own.textContent, "Known", "a name and no bare count");
	});

	it("draws a diagnosed mistake's sentence under its title", () => {
		const gap = "Treats pairwise non-parallel vectors as independent";
		const doc = draw(course([topic("independence", { title: "Linear independence", level: "assisted", introduced: "2026-09-10", weak: true, signals: { ...QUIET, gap } })]));
		assert.match(doc.querySelector("[data-slot=course-topic-row]")!.textContent!, new RegExp(gap));
	});

	it("says so in the map's words when the course has no topics yet", () => {
		const doc = draw(course([]));
		assert.equal(doc.querySelectorAll("[data-slot=course-group]").length, 0);
		assert.equal(doc.querySelector("[data-slot=course-list-empty]")!.textContent, "No topics yet. They appear as you study this course.");
	});

	it("lets a very long title truncate on its one line", () => {
		const long = "Span, linear combinations and the geometry of the column space in higher dimensions, with worked examples";
		const doc = draw(course([topic("span", { title: long })]));
		const title = doc.querySelector("[data-slot=course-topic-title]")!;
		assert.ok(title.getAttribute("class")!.split(" ").includes("truncate"));
	});
});

describe("bringing an opened group into view", () => {
	const view = { top: 52, bottom: 900 };

	it("scrolls nothing when the group already shows whole", () => {
		assert.equal(scrollToShow({ top: 500, bottom: 800 }, view), 0);
	});

	it("scrolls just enough to show its end, with room for a ring", () => {
		assert.equal(scrollToShow({ top: 700, bottom: 950 }, view), 74);
	});

	it("never scrolls its header out of view, however long it is", () => {
		assert.equal(scrollToShow({ top: 400, bottom: 1600 }, view), 324);
	});
});

/** A page of stops to walk: the header's button, a header that folds, rows and Show more. */
function walkPage() {
	const { document } = parseHTML(`<html><body><div id="root">
		<button data-slot="course-action">Resume</button>
		<section data-slot="course-group"><span data-slot="course-group-header">Needs you</span>
			<ul><li><a data-slot="course-topic-row" href="/a" id="a">A</a></li><li><a data-slot="course-topic-row" href="/b" id="b">B</a></li></ul>
			<button data-slot="course-group-more" id="more">Show 2 more</button>
		</section>
		<section data-slot="course-group"><button data-slot="course-group-header" aria-expanded="true" id="own">On your own</button>
			<ul><li><a data-slot="course-topic-row" href="/c" id="c">C</a></li></ul>
		</section>
	</div></body></html>`);
	const root = document.getElementById("root") as unknown as HTMLElement;
	const focused: string[] = [];
	const clicked: string[] = [];
	for (const el of listStops(root)) {
		Object.assign(el, { focus: () => focused.push(el.id || el.dataset.slot!), scrollIntoView: () => {}, click: () => clicked.push(el.id) });
	}
	const press = (key: string, on: string) => {
		const target = root.querySelector(on) as HTMLElement;
		let prevented = false;
		onListKeyDown({
			key,
			target,
			currentTarget: root,
			metaKey: false,
			ctrlKey: false,
			altKey: false,
			shiftKey: false,
			preventDefault: () => (prevented = true),
			stopPropagation: () => {},
		} as unknown as React.KeyboardEvent<HTMLElement>);
		return prevented;
	};
	return { root, focused, clicked, press };
}

describe("the list's keyboard walk", () => {
	it("stops at the button, a header that folds, every topic and Show more, in order", () => {
		const { root } = walkPage();
		assert.deepEqual(
			listStops(root).map((el) => el.id || el.dataset.slot),
			["course-action", "a", "b", "more", "own", "c"],
		);
	});

	it("steps with Up and Down and jumps with Home and End", () => {
		const { focused, press } = walkPage();
		assert.equal(press("ArrowDown", "#a"), true);
		press("ArrowUp", "#a");
		press("End", "#a");
		press("Home", "#c");
		assert.deepEqual(focused, ["b", "course-action", "c", "course-action"]);
	});

	it("goes nowhere past either end", () => {
		const { focused, press } = walkPage();
		assert.equal(press("ArrowDown", "#c"), false);
		assert.deepEqual(focused, []);
	});

	it("folds an open header with Left, steps into it with Right, and goes back to it from a row", () => {
		const { focused, clicked, press } = walkPage();
		press("ArrowLeft", "#own");
		assert.deepEqual(clicked, ["own"]);
		press("ArrowRight", "#own");
		press("ArrowLeft", "#c");
		assert.deepEqual(focused, ["c", "own"]);
	});

	it("opens a topic with Space, as Enter does", () => {
		const { clicked, press } = walkPage();
		assert.equal(press(" ", "#a"), true);
		assert.deepEqual(clicked, ["a"]);
	});

	it("steps in from nothing focused: Down and Home to the first stop, Up and End to the last", () => {
		const key = (k: string, over = {}) => entryOf({ key: k, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, defaultPrevented: false, ...over });
		assert.equal(key("ArrowDown"), "first");
		assert.equal(key("Home"), "first");
		assert.equal(key("ArrowUp"), "last");
		assert.equal(key("End"), "last");
		assert.equal(key("Enter"), null);
		assert.equal(key("ArrowDown", { metaKey: true }), null);
		assert.equal(key("ArrowDown", { defaultPrevented: true }), null);
	});
});
