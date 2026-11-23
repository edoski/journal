/**
 * Round 21, M1 (1 M1): the exam line names a start that its own controls
 * don't offer, and after study it names tomorrow's start as today's advice.
 *
 * On the exam eve (Tue 17 Nov, two days before the Probability exam) Home's
 * line said "Start with Expectation and linearity." and the row under it
 * started it, but the course head's popover offered only "Review Uniform
 * distribution today" and the calendar's exam panel a review of five
 * topics. Once Expectation was started, the line read "Start with Joint
 * distributions and independent random variables.", which the plan starts
 * tomorrow and Home's Today does not hold.
 *
 * On the seeded world served on 17 Nov: the head popover's first press and
 * the panel's Next step start the topic the line names; after that topic is
 * started and left, the line names no topic Home's Today does not start
 * without saying its day.
 */
import { demoWorldMissing, hasDemoSeed, NEW_SESSION, openDemoApp, text, type DemoApp } from "./helpers/demo-app.tsx";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { CalendarCourse } from "../src/core/index.ts";

const missing = demoWorldMissing();
const skip = missing && (!process.env.LH_REQUIRE_REAL_ENGINE || !hasDemoSeed()) ? missing : false;

/** The exam line's named start: "Start with X." for today's. */
const TODAY_START = /Start with (.+?)\.$/;

describe("round 21, M1: the exam line's start is its first action, and a later start says its day", { skip, concurrency: false, timeout: 900_000 }, () => {
	let app: DemoApp;
	before(async () => {
		app = await openDemoApp("2026-11-17");
	});
	after(() => app?.close());

	const probability = async () => {
		const { courses } = (await (await fetch("/api/calendar")).json()) as { courses: CalendarCourse[] };
		return courses.find((c) => c.map.title === "Probability")!;
	};

	const homeLine = async () => {
		await app.visit("/", { fresh: true, ready: () => app.homeLines().length > 0 });
		// The sentence alone, not the Ask the tutor press beside it.
		return text(document.querySelector('[data-slot="today-exam-misfit"]')).replace(/Ask the tutor$/, "").trim();
	};

	it("Tue 17 Nov: the head popover's first press and the exam panel's Next step start the topic the line names", async () => {
		const course = await probability();
		const line = await homeLine();
		const named = line.match(TODAY_START)?.[1];
		assert.ok(named, `Home's exam line names a start for today: "${line}"`);
		const topic = course.map.topics.find((t) => t.title === named)!;
		assert.equal(topic.starts, course.map.today, `the plan starts ${named} today`);

		const { courseHref } = await import("../components/unit-inbox/unit-href.ts");
		await app.visit(courseHref(course.map.workspace), { ready: () => !!document.querySelector('[data-slot="course-ready-fact"]') });
		const fact = document.querySelector('[data-slot="course-ready-fact"]')!;
		assert.ok(text(fact).endsWith(`Start with ${named}.`), `the head says the line: "${text(fact)}"`);
		await app.click(fact);
		await app.settle(() => !!document.querySelector('[data-slot="exam-gaps-pick"]'));
		const pick = document.querySelector('[data-slot="exam-gaps-pick"]')!;
		assert.equal(text(pick), `Start ${named} today`, "the popover's first press starts the named topic");
		const starts = app.started.length;
		assert.equal(await app.lookAt(pick), NEW_SESSION, "it starts a session");
		assert.deepEqual(app.started.slice(starts).map((s) => s.topics), [[topic.handle]], `it starts ${named}`);

		const { drawn } = await app.calendar((e) => e.kind === "exam" && e.course.workspace === course.map.workspace);
		const panel = drawn[0]!;
		assert.ok(panel.detail.includes(`Start with ${named}.`), `the panel says the line: "${panel.detail}"`);
		assert.ok(panel.detail.includes(`Next step${named}`), `the panel's Next step is the named start: "${panel.detail}"`);
		const next = panel.entry.kind === "exam" ? panel.entry.next : null;
		assert.equal(next?.verb, "Start");
		assert.deepEqual(next?.move.kind === "start" ? next.move.topics : null, [topic.handle], `the Next step's press starts ${named}`);
	});

	it("Tue 17 Nov, once the named start is begun and left: the line names no start Home's Today does not hold without its day", async () => {
		const course = await probability();
		const named = (await homeLine()).match(TODAY_START)?.[1];
		assert.ok(named);
		const row = app.homeLines().find((l) => l.title === `Start ${named}`);
		assert.ok(row, `Home starts ${named}: ${app.homeLines().map((l) => l.title).join(" | ")}`);
		const opened = await app.press(row.el);
		assert.ok(opened?.startsWith("/chat/"), `the row opens a session (${opened})`);
		const id = opened!.slice(6).split("?")[0]!;
		const handle = course.map.topics.find((t) => t.title === named)!.handle;
		await app.save(id, { observations: [{ topics: [handle], text: `Probe question on ${named}`, result: "correct", help: "none", sure: "confident" }] });
		app.pose(id, "Where does linearity come from?");
		app.doneForToday(id, "Good place to stop for today.");

		const line = await homeLine();
		const starts = app.homeLines().filter((l) => l.title.startsWith("Start ")).map((l) => l.title.slice("Start ".length));
		const today = line.match(TODAY_START)?.[1];
		if (today) assert.ok(starts.some((s) => s.includes(today)), `the line says to start with ${today} today, and Home's Today does not start it: "${line}" | ${app.homeLines().map((l) => l.title).join(" | ")}`);
		const later = (await probability()).map.topics.filter((t) => t.level === "new" && t.starts && t.starts > course.map.today && line.includes(t.title));
		assert.ok(today || later.length > 0, `the line names the next start: "${line}"`);
		for (const t of later) assert.match(line, new RegExp(`${t.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} (tomorrow|on \\w+day)`), `the line names ${t.title}, planned ${t.starts}, with its day: "${line}"`);
	});
});
