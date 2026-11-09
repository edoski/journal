import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import { dom } from "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { byPriority, examText, topicList, waitingOf } from "../components/start/course-facts.ts";
import { nextStep } from "../components/start/today-a/next-step-facts.ts";
import { courseLines } from "../components/start/today-b/course-lines-facts.ts";
import { suggestions } from "../components/start/today-c/suggestions-facts.ts";
import { TodayWaiting } from "../components/start/today-waiting.tsx";
import type { CourseState } from "../components/course-picker.tsx";
import type { TodayVariant } from "../components/design-variant.ts";
import type { CourseSummary } from "../src/core/index.ts";

// Today's waiting-work candidates (A one next step, B course lines, C
// suggestions): what each says for every state of the engine's plan, and
// where a click goes.

function course(over: Partial<CourseSummary>): CourseSummary {
	return {
		workspace: "/study/linalg",
		title: "Linear Algebra",
		due: 0,
		reviews: [],
		current: null,
		currentTitle: null,
		task: null,
		step: null,
		exam: null,
		lastActiveDaysAgo: null,
		...over,
	};
}

const GAP = "Treats pairwise non-parallel vectors as independent";
const DUE = course({
	due: 6,
	reviews: [
		{ title: "Span", overdue: 10, gap: null },
		{ title: "Linear independence", overdue: 16, gap: GAP },
		{ title: "Determinants as volume scaling", overdue: 4, gap: null },
	],
	exam: { date: "2026-11-29", daysLeft: 21 },
	task: "Problem sheet 4",
	step: "Part (c): show dim ker A = 2",
	current: "rank",
	currentTitle: "Rank and the column space",
	lastActiveDaysAgo: 2,
});
const TASK_ONLY = course({ task: "Problem sheet 4", step: "Part (c)", current: "rank", currentTitle: "Rank and the column space" });
const TOPIC_ONLY = course({ current: "rank", currentTitle: "Rank and the column space" });
const NOTHING = course({});
const PROBABILITY = course({
	workspace: "/study/prob",
	title: "Probability",
	due: 1,
	reviews: [{ title: "Conditional probability", overdue: 13, gap: null }],
	current: "bayes",
	currentTitle: "Bayes' rule",
	lastActiveDaysAgo: 4,
});

const ready = (...courses: CourseSummary[]): CourseState => ({ status: "ready", courses, roots: [] });
const STATES: Record<string, CourseState> = {
	"something due": ready(DUE, PROBABILITY),
	"only an open task": ready(TASK_ONLY),
	"only a current topic": ready(TOPIC_ONLY),
	"nothing waiting": ready(NOTHING),
	"no courses": ready(),
	"engine unavailable": { status: "unavailable", reason: "python not found" },
};

describe("course facts", () => {
	it("takes reviews first, most overdue first, then the open task, else the current topic", () => {
		assert.deepEqual(waitingOf(DUE).steps, [
			{ kind: "review", topics: ["Linear independence", "Span", "Determinants as volume scaling"], due: 6, gap: GAP },
			{ kind: "task", title: "Problem sheet 4", step: "Part (c): show dim ker A = 2" },
		]);
		assert.deepEqual(waitingOf(TOPIC_ONLY).steps, [{ kind: "topic", title: "Rank and the column space" }]);
		assert.deepEqual(waitingOf(NOTHING).steps, []);
	});

	it("orders courses by the nearest exam, then the most recent activity, then the engine's order", () => {
		const late = course({ workspace: "/late", exam: { date: "d", daysLeft: 40 } });
		const soon = course({ workspace: "/soon", exam: { date: "d", daysLeft: 3 } });
		const past = course({ workspace: "/past", exam: { date: "d", daysLeft: -1 }, lastActiveDaysAgo: 0 });
		const idle = course({ workspace: "/idle", lastActiveDaysAgo: 9 });
		const fresh = course({ workspace: "/fresh", lastActiveDaysAgo: 1 });
		const never = course({ workspace: "/never" });
		assert.deepEqual(
			byPriority([never, idle, late, past, fresh, soon]).map((c) => c.workspace),
			["/soon", "/late", "/past", "/fresh", "/idle", "/never"],
		);
	});

	it("names at most two topics and never counts them", () => {
		assert.equal(topicList(["Span"], 1), "Span");
		assert.equal(topicList(["Span", "Rank"], 2), "Span and Rank");
		assert.equal(topicList(["Span", "Rank"], 6), "Span, Rank and more");
		assert.equal(topicList(["Span", "Rank", "Basis"], 3), "Span, Rank and more");
	});

	it("words the exam day and the day before, and drops a past exam", () => {
		assert.equal(examText({ date: "d", daysLeft: 21 }), "Exam in 21 days");
		assert.equal(examText({ date: "d", daysLeft: 0 }), "Exam today");
		assert.equal(examText({ date: "d", daysLeft: 1 }), "Exam tomorrow");
		assert.equal(examText({ date: "d", daysLeft: -2 }), null);
		assert.equal(examText(null), null);
	});
});

describe("A, one next step: facts", () => {
	it("leads with the most overdue review and its gap, the other courses one line each", () => {
		assert.deepEqual(nextStep([PROBABILITY, DUE]), {
			lead: {
				workspace: "/study/linalg",
				caption: "Linear Algebra · Exam in 21 days",
				title: "Linear independence",
				detail: `Due for review, with Span and more. ${GAP}.`,
			},
			others: [{ workspace: "/study/prob", course: "Probability", line: "Review Conditional probability" }],
		});
	});

	it("skips a course with nothing waiting for the lead, and leads with nothing when none has anything", () => {
		const examSoonIdle = course({ workspace: "/idle", title: "Idle", exam: { date: "d", daysLeft: 2 } });
		const { lead, others } = nextStep([examSoonIdle, PROBABILITY]);
		assert.equal(lead?.workspace, "/study/prob");
		assert.equal(lead?.detail, "Due for review.");
		assert.deepEqual(others, [{ workspace: "/idle", course: "Idle", line: "Nothing waiting" }]);
		assert.deepEqual(nextStep([NOTHING]), { lead: null, others: [] });
	});
});

describe("B, course lines: facts", () => {
	it("says what is next in one sentence per course, in priority order", () => {
		assert.deepEqual(courseLines([PROBABILITY, DUE, NOTHING]), [
			{ workspace: "/study/linalg", course: "Linear Algebra", exam: "Exam in 21 days", next: "Review Linear independence, Span and more, then continue Problem sheet 4." },
			{ workspace: "/study/prob", course: "Probability", exam: null, next: "Review Conditional probability, then continue Bayes' rule." },
			{ workspace: "/study/linalg", course: "Linear Algebra", exam: null, next: "Nothing waiting." },
		]);
	});
});

describe("C, suggestions: facts", () => {
	it("offers each course's first step, then the second ones, at most three, naming courses only when they differ", () => {
		assert.deepEqual(suggestions([PROBABILITY, DUE]), [
			{ workspace: "/study/linalg", request: "Review Linear independence, Span and more", course: "Linear Algebra" },
			{ workspace: "/study/prob", request: "Review Conditional probability", course: "Probability" },
			{ workspace: "/study/linalg", request: "Continue Problem sheet 4", course: "Linear Algebra" },
		]);
		assert.deepEqual(suggestions([TOPIC_ONLY]), [{ workspace: "/study/linalg", request: "Continue Rank and the column space", course: null }]);
		assert.deepEqual(suggestions([NOTHING]), []);
	});
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
	await act(async () => {
		root?.unmount();
	});
	root = null;
	host?.remove();
	host = null;
});

interface Calls {
	started: string[];
	suggested: [string, string][];
	newCourse: number;
}

async function mount(variant: TodayVariant, state: CourseState): Promise<Calls> {
	const calls: Calls = { started: [], suggested: [], newCourse: 0 };
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	await act(async () => {
		root!.render(
			<TodayWaiting
				variant={variant}
				state={state}
				busy={false}
				onStart={(w) => calls.started.push(w)}
				onSuggest={(r, w) => calls.suggested.push([r, w])}
				onNewCourse={() => (calls.newCourse += 1)}
			/>,
		);
	});
	return calls;
}

const text = () => (host?.textContent ?? "").replace(/ /g, " ");
const all = (selector: string) => [...(host?.querySelectorAll<HTMLElement>(selector) ?? [])];

async function click(target: Element) {
	await act(async () => {
		const event = new dom.window.Event("click", { bubbles: true, cancelable: true });
		Object.assign(event, { button: 0, detail: 1 });
		target.dispatchEvent(event);
	});
}

/** What every candidate shows for every state: [variant, state, expected text or null for nothing]. */
const EXPECTED: [TodayVariant, string, RegExp | null][] = [
	["a", "something due", /^Linear Algebra · Exam in 21 daysLinear independenceDue for review, with Span and more\. Treats pairwise non-parallel vectors as independent\.ContinueOther courses$/],
	["a", "only an open task", /^Linear AlgebraProblem sheet 4Part \(c\)\.Continue$/],
	["a", "only a current topic", /^Linear AlgebraRank and the column spaceNext on your path\.Continue$/],
	["a", "nothing waiting", /^Nothing is waiting today\.$/],
	["b", "something due", /^Linear AlgebraExam in 21 daysReview Linear independence, Span and more, then continue Problem sheet 4\.ProbabilityReview Conditional probability, then continue Bayes' rule\.$/],
	["b", "only an open task", /^Linear AlgebraContinue Problem sheet 4\.$/],
	["b", "only a current topic", /^Linear AlgebraContinue Rank and the column space\.$/],
	["b", "nothing waiting", /^Linear AlgebraNothing waiting\.$/],
	["c", "something due", /^Review Linear independence, Span and moreLinear AlgebraReview Conditional probabilityProbabilityContinue Problem sheet 4Linear Algebra$/],
	["c", "only an open task", /^Continue Problem sheet 4$/],
	["c", "only a current topic", /^Continue Rank and the column space$/],
	["c", "nothing waiting", null],
];

describe("Today's waiting work, rendered", () => {
	for (const [variant, state, expected] of EXPECTED) {
		it(`${variant.toUpperCase()}: ${state}`, async () => {
			await mount(variant, STATES[state]!);
			if (expected === null) assert.equal(host?.innerHTML, "");
			else assert.match(text(), expected);
			assert.doesNotMatch(text(), /\d+ (due|reviews?)\b|%|streak|\bXP\b|level/i);
		});
	}

	for (const variant of ["a", "b", "c"] as const) {
		it(`${variant.toUpperCase()}: no courses offers the first one`, async () => {
			const calls = await mount(variant, STATES["no courses"]!);
			assert.equal(text(), "Add your first course");
			await click(all("button")[0]!);
			assert.equal(calls.newCourse, 1);
		});

		it(`${variant.toUpperCase()}: engine unavailable shows nothing (the screen says why)`, async () => {
			await mount(variant, STATES["engine unavailable"]!);
			assert.equal(host?.innerHTML, "");
		});
	}

	it("A: Continue starts the lead's course; Other courses opens the rest, each starting its own", async () => {
		const calls = await mount("a", STATES["something due"]!);
		await click(all('[data-slot="today-continue"]')[0]!);
		assert.deepEqual(calls.started, ["/study/linalg"]);
		assert.equal(all('[data-slot="today-other"]').length, 0, "the other courses wait behind the disclosure");
		await click(all("button").find((b) => b.textContent === "Other courses")!);
		const [other] = all('[data-slot="today-other"]');
		assert.equal(other?.textContent?.replace(/ /g, " "), "Probability · Review Conditional probability");
		await click(other!);
		assert.deepEqual(calls.started, ["/study/linalg", "/study/prob"]);
	});

	it("B: a row starts its course", async () => {
		const calls = await mount("b", STATES["something due"]!);
		await click(all('[data-slot="today-line"]')[1]!);
		assert.deepEqual(calls.started, ["/study/prob"]);
	});

	it("C: a suggestion goes to the composer with its course, and starts nothing", async () => {
		const calls = await mount("c", STATES["something due"]!);
		await click(all('[data-slot="today-suggestion"]')[1]!);
		assert.deepEqual(calls.suggested, [["Review Conditional probability", "/study/prob"]]);
		assert.deepEqual(calls.started, []);
	});
});
