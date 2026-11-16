/**
 * The course brief: a field projection of the engine's resume, re-sent only
 * when its key changes, and injected by the turn handler after the input.
 */

import { onFake } from "./helpers/fake-sdk.ts";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createFauxCore, fauxAssistantMessage, fauxText } from "@earendil-works/pi-ai";
import { signInTestClaude, TEST_MODEL } from "./claude-fixture.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lh-course-brief-"));
const PYTHON = path.join(TMP, "python");
fs.writeFileSync(PYTHON, `#!/bin/sh\nexec "${process.execPath}" "${path.join(HERE, "fixtures", "fake-learning-engine.mjs")}" "$@"\n`, { mode: 0o755 });
process.env.LH_DATA_DIR = path.join(TMP, "data");
process.env.LH_LEARNING_ENGINE = TMP;
process.env.LH_LEARNING_PYTHON = PYTHON;
await signInTestClaude();

const { projectCourseBrief } = await import("../src/core/course-brief.ts");
type CourseMap = import("../src/core/contracts/course-map.ts").CourseMap;
type CourseMapTopic = import("../src/core/contracts/course-map.ts").CourseMapTopic;
type TopicHandle = import("../src/core/contracts/course-map.ts").TopicHandle;
const { visibleCourseBriefKey, newCourseContextMessage, newUserMessage } = await import("../src/core/native-messages.ts");
const { buildModeHandoffSteer } = await import("../src/core/contracts/jobs.ts");
const { handleChatInput, handleChatRequest } = await import("../src/server/chat-handler.ts");
const { runningTurn } = await import("../src/server/turn-runs.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { emit } = await import("../src/core/events.ts");
/** The fake engine's records changed, as a save announces it: the brief's
 *  kept reads are read again. */
const recordsChanged = () => emit("courses-changed", {});
const { createPracticeAgent, createProberAgent } = await import("../src/agent/teacher-agent.ts");

after(() => fs.rmSync(TMP, { recursive: true, force: true }));

// The real engine's resume on a throwaway course: no focus among two open
// tasks, the current topic's gap and review keys written once under
// `topics`, and a run-up that pushes the most overdue review past the five.
const ENGINE_ROOT = path.resolve(HERE, "..", "..");
const ENGINE_PYTHON = path.join(ENGINE_ROOT, ".venv", "bin", "python");
const realEngine = fs.existsSync(ENGINE_PYTHON);

type Resume = Record<string, unknown>;

/** `resume` with no task in focus, then with ex-5 in focus, and the day's
 *  `plan` for the course (10 days before its exam: in the run-up). */
function realResumes(): { open: Resume; focused: Resume; plan: Resume } {
	const home = fs.mkdtempSync(path.join(TMP, "home-"));
	const workspace = fs.mkdtempSync(path.join(TMP, "course-"));
	const engine = (day: string, args: string[], input?: unknown) =>
		execFileSync(ENGINE_PYTHON, ["-m", "learning", "--workspace", workspace, ...args], {
			cwd: ENGINE_ROOT,
			env: { ...process.env, HOME: home, LEARNING_TODAY: day, PYTHONPATH: ENGINE_ROOT },
			input: input === undefined ? undefined : JSON.stringify(input),
		}).toString();
	engine("2026-11-04", ["init"]);
	engine("2026-11-04", ["save"], {
		title: "Linear Algebra",
		exam: { date: "2026-11-17" },
		topics: {
			systems: { title: "Linear systems", introduced: "2026-11-03" },
			pivots: {},
			rank: { title: "Rank", needs: ["systems"], gap: "counts vectors, not independent ones" },
			eigen: { gap: "confuses eigenvalue with eigenvector" },
			t1: { introduced: "2026-11-04" }, t2: { introduced: "2026-11-04" }, t3: { introduced: "2026-11-04" }, t4: { introduced: "2026-11-04" },
		},
		path: { current: "rank", order: ["systems", "pivots", "rank", "eigen", "t1", "t2", "t3", "t4"] },
		tasks: {
			"ex-5": { title: "Exercise 5", goal: "justify uniqueness", step: "eliminate the second row", help: "long help text" },
			"ex-6": { title: "Exercise 6", step: "check the base case" },
		},
		knowledge: { notation: { text: "rows first", pinned: true }, other: { text: "unpinned fact" } },
		preferences: { explanation_length: "short" },
		observations: [
			{ topics: ["systems"], text: "Solve a 2x2 system", help: "none", result: "correct" },
			{ topics: ["rank"], text: "Rank of [[1,2],[2,4]]?", response: "2", help: "none", result: "incorrect", sure: "confident", chose: "pivots" },
		],
	});
	const due = { due: "2026-11-07" };
	engine("2026-11-07", ["save"], {
		topics: {
			systems: { review: { due: "2026-10-29" } },
			rank: { review: { ...due, prompt: "Why is rank the dimension of the column space?", points: ["span", "independence"] } },
			t1: { review: due }, t2: { review: due }, t3: { review: due }, t4: { review: due },
		},
	});
	const open = JSON.parse(engine("2026-11-07", ["resume"])) as Resume;
	const plan = JSON.parse(engine("2026-11-07", ["plan", "--days", "1"])) as Resume;
	engine("2026-11-07", ["save"], { focus: "ex-5" });
	return { open, focused: JSON.parse(engine("2026-11-07", ["resume"])) as Resume, plan };
}

// CI sets LH_REQUIRE_REAL_ENGINE, so a moved venv fails the gate instead of skipping these.
describe("course brief projection of the real engine's resume", { skip: !realEngine && !process.env.LH_REQUIRE_REAL_ENGINE && "learning engine not installed" }, () => {
	let RESUME: Resume = {};
	let FOCUSED: Resume = {};
	let PLAN: Resume = {};
	before(() => {
		({ open: RESUME, focused: FOCUSED, plan: PLAN } = realResumes());
	});

	it("teach: the weekday, levels, due topics without review keys, every weak gap, every open task's step, preferences and pinned knowledge", () => {
		const { text } = projectCourseBrief(RESUME, "teach");
		assert.match(text, /^\[Course record\] Linear Algebra · today 2026-11-07 \(Saturday\) · exam in 10 days/);
		assert.match(text, /Path, current rank: systems \(independent\), pivots \(new\), rank \(attempted\)/);
		assert.match(text, /^Not started yet \(never taught, whatever their planned day\): pivots, eigen$/m, "round 8 (1 D10): the tutor misread which topics are started; eigen has a gap but was never taught");
		assert.match(text, /- rank \(attempted\)\n/);
		assert.doesNotMatch(text, /prompt:|points:/, "the teacher fetches review keys on demand");
		assert.match(text, /- rank \(attempted\): counts vectors, not independent ones; sure but wrong ×1/, "the current topic keeps its gap");
		assert.match(text, /- eigen \(new\): confuses eigenvalue with eigenvector/);
		assert.match(text, /Open tasks, none in focus:\n- ex-6: Exercise 6\n {2}next step: check the base case\n- ex-5: Exercise 5\n {2}next step: eliminate the second row/);
		assert.match(text, /- explanation_length: short/);
		assert.match(text, /- notation: rows first/);
		assert.doesNotMatch(text, /unpinned fact|long help text/);
	});

	it("a half-built path shows its gaps, from the real engine's path_health", () => {
		const { text } = projectCourseBrief(RESUME, "teach");
		assert.match(text, /^Path gaps \(fix them in a save when you next touch these topics\): no title: [^;]*\bpivots\b/m);
		assert.match(text, /no reference to its material: systems, pivots, rank/);
		const built = projectCourseBrief({ ...RESUME, path_health: undefined }, "teach");
		assert.doesNotMatch(built.text, /Path gaps/);
		assert.notEqual(built.key, projectCourseBrief(RESUME, "teach").key, "a gap closing re-sends the brief");
	});

	it("topics left out of the course are named, so the tutor does not teach them", () => {
		const resume = { ...RESUME, path: { ...(RESUME.path as object), excluded: ["lasso", "ridge"] } };
		assert.match(projectCourseBrief(resume, "teach").text, /^Left out of the course: lasso, ridge$/m);
	});

	it("the due backlog shows its total and the most overdue review past the five", () => {
		const { text } = projectCourseBrief(RESUME, "teach");
		assert.match(
			text,
			/Due: 6 topics; today's review is the 5 below, 1 more wait, the most overdue among them systems \(9 days overdue\):/,
			"in the run-up the unready topics come before the overdue solid one",
		);
		const shown = projectCourseBrief({ ...RESUME, due_oldest: undefined }, "teach").text;
		assert.match(shown, /Due: 6 topics; today's review is the 5 below, 1 more wait:/);
	});

	it("practice adds the current topic's review prompt, points and gap, and its wrongly chosen method", () => {
		const { text } = projectCourseBrief(RESUME, "practice");
		assert.match(text, /- rank \(attempted\)\n {2}prompt: Why is rank the dimension of the column space\?\n {2}points: span; independence\n {2}gap: counts vectors/);
		assert.match(text, /wrongly chose pivots ×1/);
	});

	it("practice reads the run-up the real engine's plan reports for the course", () => {
		const workspace = String((PLAN.courses as Resume[])[0]!.workspace);
		const { text } = projectCourseBrief(RESUME, "practice", { runup: { plan: PLAN, workspace } });
		assert.match(text, /\nExam run-up: 10 days left; not_introduced: [^;\n]*eigen[^;\n]*; unready: [^;\n]*rank/);
	});

	it("practice carries the exam run-up's figures from the engine's plan; teaching does not", () => {
		const plan = {
			today: "2026-11-07",
			courses: [
				{ workspace: "/study/other", runup: { days_left: 3, not_introduced: ["x"] } },
				{ workspace: "/study/linalg", runup: { days_left: 12, not_introduced: ["eigen"], unready: ["rank", "systems"], study_days: 6, pace: 0.17 } },
			],
		};
		const runup = { plan, workspace: "/study/linalg" };
		const practice = projectCourseBrief(RESUME, "practice", { runup }).text;
		assert.match(practice, /\nExam run-up: 12 days left; not_introduced: eigen; unready: rank, systems; study_days: 6; pace: 0\.17 new topics a study day\n/);
		assert.doesNotMatch(projectCourseBrief(RESUME, "teach", { runup }).text, /Exam run-up/);
		const outside = { plan: { courses: [{ workspace: "/study/linalg" }] }, workspace: "/study/linalg" };
		assert.doesNotMatch(projectCourseBrief(RESUME, "practice", { runup: outside }).text, /Exam run-up/, "outside the run-up the engine reports none");
	});

	it("a focused task shows its goal and step and names the other open tasks", () => {
		const { text } = projectCourseBrief(FOCUSED, "teach");
		assert.match(text, /Open task ex-5: Exercise 5\n {2}goal: justify uniqueness\n {2}next step: eliminate the second row\nOther open tasks: ex-6/);
	});

	it("the key moves with what the brief shows: the day, the due set and backlog, the tasks' steps; not with levels or task order", () => {
		const base = projectCourseBrief(RESUME, "teach").key;
		const tasks = RESUME.tasks as Resume[];
		assert.equal(projectCourseBrief({ ...RESUME, path: { ...(RESUME.path as object), topics: [["rank", "independent"]] } }, "teach").key, base);
		assert.notEqual(projectCourseBrief({ ...RESUME, today: "2026-11-08" }, "teach").key, base);
		assert.notEqual(projectCourseBrief({ ...RESUME, due: [] }, "teach").key, base);
		assert.notEqual(projectCourseBrief({ ...RESUME, tasks: [{ ...tasks[0], step: "next" }, tasks[1]] }, "teach").key, base);
		assert.notEqual(projectCourseBrief({ ...RESUME, due_more: undefined, due_oldest: undefined }, "teach").key, base, "clearing the hidden oldest review re-sends the brief");
		assert.equal(projectCourseBrief({ ...RESUME, tasks: [tasks[1], tasks[0]] }, "teach").key, base);
		const focusedKey = projectCourseBrief(FOCUSED, "teach").key;
		const others = FOCUSED.tasks as Resume[];
		assert.equal(projectCourseBrief({ ...FOCUSED, tasks: others.map((t) => ({ ...t, step: "unseen" })) }, "teach").key, focusedKey, "a step the brief does not print leaves the key");
	});
});

describe("course brief markers", () => {
	it("a compaction hides earlier briefs", () => {
		const brief = newCourseContextMessage("b", "k1");
		const compaction = { ...newCourseContextMessage("", "x"), customType: "compaction" as const, details: {} };
		assert.equal(visibleCourseBriefKey([brief as never]), "k1");
		assert.equal(visibleCourseBriefKey([brief as never, compaction as never]), null);
	});
});

describe("course brief injection", () => {
	it("a linked session's learner turn carries one brief; the next turn with the same key adds none", async () => {
		const chat = chatStore.createChat("rank", { workspace: "/study/linalg", title: "Linear Algebra" });
		const faux = createFauxCore({});
		faux.setResponses([fauxAssistantMessage([fauxText("Where shall we start?")]), fauxAssistantMessage([fauxText("Go on.")])]);
		const engine = { model: faux.getModel(), streamFn: faux.streamSimple };
		const factory = (opts: never) =>
			createProberAgent({ chatId: chat.id, chatStore, deliver: () => {}, jobStore: {} as never, spawn: () => {} }, { ...(opts as object), ...onFake(engine, opts as never) });
		for (const text of ["teach me rank", "ok"]) {
			const ack = await handleChatRequest(new Request("http://t/api/chat", { method: "POST", body: JSON.stringify({ chatId: chat.id, input: { type: "text", text } }) }), factory as never);
			assert.equal(ack.status, 200);
			const handle = runningTurn(chat.id);
			if (handle) await new Response(handle.subscribe()).text();
		}
		const messages = chatStore.getChat(chat.id)!.messages;
		const briefs = messages.filter((m) => (m as { customType?: string }).customType === "course-context");
		assert.equal(briefs.length, 1);
		const firstUser = messages.findIndex((m) => m.role === "user");
		assert.equal(messages.indexOf(briefs[0]!), firstUser - 1, "the brief precedes the learner's words");
		assert.match((briefs[0] as { content: string }).content, /Due today:\n- rank \(assisted\)/);
	});

	it("a handoff to practice re-sends the brief for practice, with the run-up", async () => {
		const workspace = "/study/linalg";
		process.env.FAKE_ENGINE_PLAN = JSON.stringify({ today: "2026-11-07", courses: [{ workspace, runup: { days_left: 12, unready: ["rank"] } }] });
		recordsChanged();
		const chat = chatStore.createChat("practise rank", { workspace, title: "Linear Algebra" });
		const handoff = { id: "h1", role: "assistant", content: [{ type: "toolCall", id: "call-h1", name: "practice", arguments: { scope: "rank", reason: "asked" } }], api: "faux", provider: "t", model: "t", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "toolUse", timestamp: 1 };
		const result = { id: "r1", role: "toolResult", toolCallId: "call-h1", toolName: "practice", content: [{ type: "text", text: "ok" }], details: { ok: true, mode: "practice" }, isError: false, timestamp: 2 };
		chatStore.saveMessages(chat.id, [newUserMessage("give me problems on rank"), handoff as never, result as never]);
		const faux = createFauxCore({});
		faux.setResponses([fauxAssistantMessage([fauxText("Rank first: it is due.")])]);
		const engine = { model: faux.getModel(), streamFn: faux.streamSimple };
		const factory = (opts: { agent: string }) => {
			assert.equal(opts.agent, "practice");
			return createPracticeAgent({ chatId: chat.id, chatStore }, { ...(opts as object), ...onFake(engine, opts as never) });
		};
		const steer = buildModeHandoffSteer(chat.id, "call-h1", "practice");
		const ack = await handleChatInput(chat.id, { type: "steers", steers: [steer] }, factory as never);
		assert.equal(ack.status, 200);
		const handle = runningTurn(chat.id);
		if (handle) await new Response(handle.subscribe()).text();
		delete process.env.FAKE_ENGINE_PLAN;
		recordsChanged();
		const messages = chatStore.getChat(chat.id)!.messages;
		const brief = messages.find((m) => (m as { customType?: string }).customType === "course-context") as { content: string; details: { key: string } } | undefined;
		assert.ok(brief, "the wake carries a brief");
		assert.equal(JSON.parse(brief.details.key).at(-1), "practice", "the brief is practice's");
		assert.match(brief.content, /Exam run-up: 12 days left; unready: rank/);
		assert.ok(messages.indexOf(brief as never) < messages.findIndex((m) => m.id === steer.id), "the brief precedes the wake");
	});

	it("an unlinked session gets no brief", async () => {
		const chat = chatStore.createChat("plain");
		const { fetchCourseBrief } = await import("../src/server/course-brief.ts");
		assert.equal(await fetchCourseBrief(chatStore.getChat(chat.id)!), null);
	});
});

// The daily plan of every course, as each course's map gives it (the demo
// world of 8 Nov 2026): the tutor of a Probability lesson was asked "when
// does Calculus Monotonicity come back?" and "does every topic get a review
// in the final days?" and could answer neither.
const signals: CourseMapTopic["signals"] = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const topic = (handle: string, title: string, extra: Partial<CourseMapTopic> = {}): CourseMapTopic => ({
	handle: handle as TopicHandle,
	title,
	level: "retained",
	introduced: "2026-10-01",
	review: null,
	weak: false,
	signals,
	tasks: [],
	...extra,
});
const scheduled = (date: string, held?: { exam: string | null; since: string }): CourseMapTopic["review"] => ({ kind: "scheduled", date, ...(held ? { held } : {}) });
const untaught = (starts: string, startsWhy: CourseMapTopic["startsWhy"]): Partial<CourseMapTopic> => ({ level: "new", introduced: null, starts, startsWhy });
const courseMap = (workspace: string, title: string, exam: CourseMap["exam"], topics: CourseMapTopic[]): CourseMap => ({
	workspace,
	title,
	today: "2026-11-08",
	revision: 1,
	exam,
	current: null,
	focus: null,
	tasks: [],
	topics,
	edges: [],
});

const PROBABILITY = courseMap("/study/probability", "Probability", { date: "2026-11-19", daysLeft: 11, finalReview: "2026-11-14" }, [
	topic("random-variables", "Random variables and distributions", { review: { kind: "due", date: "2026-11-08", overdue: 0 } }),
	topic("binomial", "Binomial distribution", { review: { kind: "due", date: "2026-11-08", overdue: 2 } }),
	topic("total-probability", "Law of total probability", { review: scheduled("2026-11-14", { exam: null, since: "2026-11-07" }) }),
	topic("bayes", "Bayes' rule", { review: scheduled("2026-11-16") }),
	topic("poisson", "Poisson distribution", untaught("2026-11-09", { kind: "next" })),
	topic("expectation", "Expectation and linearity", untaught("2026-11-13", { kind: "next" })),
	topic("variance", "Variance", untaught("2026-11-14", { kind: "after", needs: ["expectation" as TopicHandle], partners: [] })),
	topic("covariance", "Covariance and correlation", { level: "new", introduced: null, excluded: "off the exam" }),
]);
const CALCULUS = courseMap("/study/calculus", "Calculus I", null, [
	topic("chain-rule", "Chain rule", { review: scheduled("2026-11-11", { exam: null, since: "2026-11-06" }) }),
	topic("monotonicity", "Monotonicity", { review: scheduled("2026-11-19", { exam: "Probability", since: "2026-10-02" }) }),
]);
const LINEAR_ALGEBRA = courseMap(
	"/study/linalg",
	"Linear Algebra",
	{ date: "2026-12-03", daysLeft: 25, finalReview: "2026-11-25", unreviewed: ["kernel" as TopicHandle], doesNotFit: ["projection" as TopicHandle] },
	[
		topic("kernel", "Kernel and rank-nullity", { review: scheduled("2026-11-12") }),
		topic("change-basis", "Change of basis", untaught("2026-11-15", { kind: "next" })),
		topic("inner-product", "Inner products", untaught("2026-11-17", { kind: "early", waitingOn: ["change-basis" as TopicHandle], exam: false })),
		topic("projection", "Orthogonal projection", { level: "new", introduced: null }),
	],
);
const TODAY = { today: "2026-11-08", due: [{ topic: "binomial", overdue: 2, level: "assisted" }] };
type PlannedDay = import("../src/core/contracts/calendar.ts").PlannedDay;
const day = (date: string, reviews: string[], starts: string[] = []): PlannedDay => ({ date, reviews: reviews as TopicHandle[], new: starts as TopicHandle[] });
// The engine's `plan` days for each course, as the calendar reads them:
// every review of every topic, the reviews of topics not taught yet inside
// the final review included.
const DAYS: Record<string, PlannedDay[]> = {
	"/study/probability": [
		day("2026-11-08", ["binomial", "random-variables"]),
		day("2026-11-09", [], ["poisson"]),
		day("2026-11-13", [], ["expectation"]),
		day("2026-11-14", ["total-probability", "poisson", "expectation"], ["variance"]),
		day("2026-11-15", ["binomial"]),
		day("2026-11-16", ["variance", "bayes"]),
	],
	"/study/calculus": [day("2026-11-11", ["chain-rule"]), day("2026-11-19", ["monotonicity"]), day("2026-12-03", ["chain-rule"])],
	"/study/linalg": [day("2026-11-12", ["kernel"]), day("2026-11-15", [], ["change-basis"]), day("2026-11-17", [], ["inner-product"])],
};
const plan = (maps: CourseMap[], unread: string[] = []) => ({ plan: { workspace: "/study/probability", courses: maps.map((map) => ({ map, days: DAYS[map.workspace] ?? [] })), unread } });

describe("the daily plan of every course", () => {
	it("names each course's planned days, its own course first, so a plan question about any course has an answer", () => {
		const { text } = projectCourseBrief(TODAY, "teach", plan([CALCULUS, LINEAR_ALGEBRA, PROBABILITY]));
		const section = text.slice(text.indexOf("Daily plan"));
		assert.match(section, /^Daily plan of every course, as the calendar shows it[^\n]*every review of every topic/, "the heading says the plan is whole");
		assert.ok(section.indexOf("Probability (this course)") < section.indexOf("Calculus I"), "the open course comes first");
		assert.match(section, /\nCalculus I\nOverdue: 2 reviews: Monotonicity \(37 days, planned Thu 19 Nov\), Chain rule \(2 days, planned Wed 11 Nov\)\n- Wed 11 Nov: review Chain rule \(due since Fri 6 Nov, earlier days are full\)\n- Thu 19 Nov: review Monotonicity \(due since Fri 2 Oct, waits for your Probability exam\)\n- Thu 3 Dec: review Chain rule\n/);
	});

	it("gives a topic every review the plan holds, those of topics not taught yet inside the final review included", () => {
		const { text } = projectCourseBrief(TODAY, "teach", plan([PROBABILITY]));
		assert.match(text, /\n- Sat 14 Nov: review Law of total probability \(due since Sat 7 Nov, earlier days are full\), Poisson distribution, Expectation and linearity; start Variance \(after Expectation and linearity\)\n/);
		assert.match(text, /\n- Sun 15 Nov: review Binomial distribution\n- Mon 16 Nov: review Variance, Bayes' rule\n/, "a topic's later review and a new topic's first one have their days");
	});

	it("gives the final review's days and what it has no room for, and what cannot start before the exam", () => {
		const { text } = projectCourseBrief(TODAY, "teach", plan([PROBABILITY, LINEAR_ALGEBRA]));
		assert.match(text, /\nProbability \(this course\) · exam Thu 19 Nov · final review from Sat 14 Nov to the exam, with room for every taught topic\n/);
		assert.match(text, /\nLinear Algebra · exam Thu 3 Dec · final review from Wed 25 Nov to the exam, no room for Kernel and rank-nullity · no room before the exam to start Orthogonal projection\n/);
	});

	it("lists each day's reviews and new topics by title, with why each new topic starts then", () => {
		const { text } = projectCourseBrief(TODAY, "teach", plan([PROBABILITY, LINEAR_ALGEBRA]));
		assert.match(text, /\n- Sun 8 Nov: review Binomial distribution \(2 days overdue\), Random variables and distributions\n- Mon 9 Nov: start Poisson distribution \(next in the course\)\n/);
		assert.match(text, /\n- Tue 17 Nov: start Inner products \(ahead of its place, while the topics before it wait on Change of basis\)/);
		assert.doesNotMatch(text, /Covariance/, "a topic left out of the course has no day");
	});

	it("counts each course's overdue reviews for him, so the tutor never counts them itself", () => {
		const late = courseMap("/study/linalg", "Linear Algebra", null, [
			topic("matmul", "Matrix multiplication", { review: { kind: "due", date: "2026-11-08", overdue: 12 } }),
			topic("rank", "Rank", { review: scheduled("2026-11-21", { exam: null, since: "2026-11-06" }) }),
			topic("eigen", "Eigenvalues", { review: scheduled("2026-11-26", { exam: "Probability", since: "2026-10-28" }) }),
			topic("basis", "Basis", { review: scheduled("2026-11-09", { exam: null, since: "2026-11-09" }) }),
			topic("span", "Span", { review: { kind: "due", date: "2026-11-08", overdue: 0 } }),
		]);
		const days = { "/study/linalg": [day("2026-11-08", ["matmul", "span"]), day("2026-11-09", ["basis"]), day("2026-11-21", ["rank"]), day("2026-11-26", ["eigen"])] };
		const { text } = projectCourseBrief(TODAY, "teach", { plan: { workspace: "/study/probability", courses: [{ map: late, days: days["/study/linalg"] }], unread: [] } });
		assert.match(text, /\nLinear Algebra\nOverdue: 3 reviews: Matrix multiplication \(12 days, planned today\), Eigenvalues \(11 days, planned Thu 26 Nov\), Rank \(2 days, planned Sat 21 Nov\)\n/);
		assert.match(text, /- Sat 21 Nov: review Rank \(due since Fri 6 Nov, earlier days are full\)/);
		assert.match(text, /- Mon 9 Nov: review Basis \(earlier days are full\)/, "a review held from today or later is not overdue, and names no day he was never told (round 8)");
	});

	it("says a day he was told moved, from which day and what of his study moved it, so the tutor never names it in silence", () => {
		const moved = courseMap("/study/linalg", "Linear Algebra", null, [
			topic("eigen", "Eigenvalues", { review: scheduled("2026-11-11", { exam: null, since: "2026-11-09" }), moved: { from: "2026-11-10", by: "study", courses: ["Probability"], day: "today" as const } }),
			topic("projection", "Projection", { level: "new", starts: "2026-11-12", moved: { from: "2026-11-11", by: "missed" } }),
		]);
		const days = [day("2026-11-11", ["eigen"]), { date: "2026-11-12", reviews: [], new: ["projection" as TopicHandle] }];
		const { text } = projectCourseBrief(TODAY, "teach", { plan: { workspace: "/study/linalg", courses: [{ map: moved, days }], unread: [] } });
		assert.match(text, /- Wed 11 Nov: review Eigenvalues \(moved from Tue 10 Nov after your Probability study today\)/);
		assert.match(text, /- Thu 12 Nov: start Projection \(moved from Wed 11 Nov, no study yesterday\)/);
		const quiet = courseMap("/study/linalg", "Linear Algebra", null, [topic("eigen", "Eigenvalues", { review: scheduled("2026-11-11", { exam: null, since: "2026-11-09" }), moved: { from: "2026-11-09", by: "missed", on: "2026-11-05" } })]);
		const after = projectCourseBrief(TODAY, "teach", { plan: { workspace: "/study/linalg", courses: [{ map: quiet, days: [day("2026-11-11", ["eigen"])] }], unread: [] } }).text;
		assert.match(after, /- Wed 11 Nov: review Eigenvalues \(moved from Mon 9 Nov, no study since Thu 5 Nov\)/, "round 10 (1 M3): the tutor reads the true cause, so it never guesses one");
		assert.match(after, /Say a day moved only where its note says “moved from”, with that note's cause; otherwise name the day alone/, "round 10 (1 M3): a close blamed a missed review he had done");
		const calm = projectCourseBrief(TODAY, "teach", plan([LINEAR_ALGEBRA])).text;
		assert.match(calm, /\nLinear Algebra · [^\n]*\nOverdue: none\n/);
		assert.match(projectCourseBrief(TODAY, "teach", plan([PROBABILITY])).text, /\nOverdue: 2 reviews: Binomial distribution \(2 days, planned today\), Law of total probability \(1 day, planned Sat 14 Nov\)\n/);
	});

	it("names a course it could not read, so part of the plan never stands for all of it", () => {
		const { text } = projectCourseBrief(TODAY, "teach", plan([PROBABILITY], ["Real Analysis"]));
		assert.match(text, /\nNot in this plan, its record could not be read: Real Analysis\n/);
	});

	it("re-sends the brief when another course's plan moves, not when only a level changes", () => {
		const { key } = projectCourseBrief(TODAY, "teach", plan([PROBABILITY, CALCULUS]));
		const moved = courseMap("/study/calculus", "Calculus I", null, [CALCULUS.topics[0]!, { ...CALCULUS.topics[1]!, review: scheduled("2026-11-20", { exam: "Probability", since: "2026-10-02" }) }]);
		assert.notEqual(projectCourseBrief(TODAY, "teach", plan([PROBABILITY, moved])).key, key);
		const leveled = courseMap("/study/calculus", "Calculus I", null, CALCULUS.topics.map((t) => ({ ...t, level: "transferred" as const })));
		assert.equal(projectCourseBrief(TODAY, "teach", plan([PROBABILITY, leveled])).key, key);
	});

	it("without the plan the brief still carries the day's due topics", () => {
		const { text } = projectCourseBrief(TODAY, "teach");
		assert.match(text, /Due today:\n- binomial \(assisted, 2 days overdue\)/);
		assert.doesNotMatch(text, /Daily plan/);
	});
});

describe("the brief fetch reads every course's plan", () => {
	const MAP = {
		today: "2026-11-08",
		revision: 1,
		title: "Calculus I",
		topics: [{ topic: "monotonicity", title: "Monotonicity", level: "retained", review: "2026-11-19", held: true, held_for: "Probability", due: "2026-10-02" }],
	};
	const linked = (workspace: string) => chatStore.getChat(chatStore.createChat("plan", { workspace, title: "Probability" }).id)!;

	it("maps every listed course beside the open one", async () => {
		const { fetchCourseBrief } = await import("../src/server/course-brief.ts");
		process.env.FAKE_ENGINE_PLAN = JSON.stringify({
			today: "2026-11-08",
			courses: [
				{ workspace: "/study/calculus", title: "Calculus I", plan: { days: [{ date: "2026-11-19", reviews: ["monotonicity"], new: [] }] } },
				{ workspace: "/study/probability", title: "Probability" },
			],
		});
		process.env.FAKE_ENGINE_MAP = JSON.stringify(MAP);
		recordsChanged();
		const log = path.join(TMP, "plan-log.jsonl");
		process.env.FAKE_ENGINE_LOG = log;
		try {
			const brief = await fetchCourseBrief(linked("/study/probability"));
			assert.match(brief!.text, /- Thu 19 Nov: review Monotonicity \(due since Fri 2 Oct, waits for your Probability exam\)/);
			const mapped = fs.readFileSync(log, "utf-8").trim().split("\n").map((l) => JSON.parse(l).args as string[]).filter((a) => a.includes("map")).map((a) => a[1]);
			assert.deepEqual(mapped.sort(), ["/study/calculus", "/study/probability"]);
		} finally {
			delete process.env.FAKE_ENGINE_PLAN;
			delete process.env.FAKE_ENGINE_MAP;
			delete process.env.FAKE_ENGINE_LOG;
			recordsChanged();
		}
	});

	it("a failed map costs the turn nothing: the brief comes without the plan", async () => {
		const { fetchCourseBrief } = await import("../src/server/course-brief.ts");
		process.env.FAKE_ENGINE_FAIL = "map";
		recordsChanged();
		try {
			const brief = await fetchCourseBrief(linked("/study/probability"));
			assert.match(brief!.text, /Due today:/);
			assert.doesNotMatch(brief!.text, /Daily plan/);
		} finally {
			delete process.env.FAKE_ENGINE_FAIL;
			recordsChanged();
		}
	});
});
