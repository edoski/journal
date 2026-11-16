/**
 * One check across every surface, on the Logbook's demo world (round 13,
 * N6). Each round brought back an earlier fix because the suite checked
 * each surface alone, so this one plays ../scenarios.md's days on the
 * seeded world, in the whole app in one process (helpers/demo-app.tsx),
 * with no tutor turn: each scripted save is written as the tutor's
 * course_save writes it. At each day and after each save it reads what
 * every surface draws, and holds the invariants the evaluations kept
 * finding broken:
 *
 * 1. a topic has one day: its topic page, its course page, the calendar,
 *    Home's Today and the tutor's course brief name the same next day;
 * 2. a session has one status on Home, the sidebar and the calendar;
 * 3. Continue on an open task opens the session that holds it, from Home,
 *    the sidebar, its topic page and the calendar, and the sidebar files
 *    that session under the task, never under a topic the task lacks;
 * 4. the lesson he is in is on Today as soon as the session list has it,
 *    even while the course reads are still under way;
 * 5. a topic the exam's plan leaves out says so on its own page exactly
 *    when the course head and the calendar's exam panel name it.
 *
 * It seeds its own copy of the world each run (about a minute) and reads
 * the real engine, so it runs where the seed and the engine are installed.
 */
import { demoWorldMissing, NEW_SESSION, openDemoApp, text, type DemoApp } from "./helpers/demo-app.tsx";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { CalendarEntry } from "../components/calendar/calendar-facts.ts";
import type { CalendarCourse, ChatListItem, CourseMapTask, CourseMapTopic } from "../src/core/index.ts";

const missing = demoWorldMissing();
// CI sets LH_REQUIRE_REAL_ENGINE, so a moved seed or venv fails the gate instead of skipping this.
const skip = missing && !process.env.LH_REQUIRE_REAL_ENGINE ? missing : false;

// ─── days in words ──────────────────────────────────────────────────────────

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAY_WORDS = /\b(today|tomorrow|(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,? (\d{1,2}) (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)\b/gi;

function addDays(day: string, n: number): string {
	return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Every day `words` names, in order, as ISO days ("today", "tomorrow", "Tue 10 Nov", "Tuesday 10 November"). */
function daysIn(words: string, today: string): string[] {
	return [...words.matchAll(DAY_WORDS)].map((m) => {
		const word = m[1]!.toLowerCase();
		if (word === "today") return today;
		if (word === "tomorrow") return addDays(today, 1);
		const month = MONTHS.indexOf(m[3]!.toLowerCase());
		return `2026-${String(month + 1).padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
	});
}

const short = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(",", "");

/** Whether `title` stands whole in `words`, not as a part of a longer title. */
function names(words: string, title: string): boolean {
	const at = words.indexOf(title);
	if (at < 0) return false;
	return /^\s*($|[,;.:()]|and )/.test(words.slice(at + title.length)) || names(words.slice(at + title.length), title);
}

// ─── the survey: what each surface draws ───────────────────────────────────

type Claims = Map<string, Map<string, string>>; // topic key → surface → day

interface TopicPage {
	now: string;
	note: string;
	press: string;
	scheduled: string;
	text: string;
	opens: string | null;
}

interface Survey {
	label: string;
	today: string;
	courses: readonly CalendarCourse[];
	chats: readonly ChatListItem[];
	home: ReturnType<DemoApp["homeLines"]>;
	sidebar: ReturnType<DemoApp["sidebarCards"]>;
	calendar: Awaited<ReturnType<DemoApp["calendar"]>>["drawn"];
	pages: Map<string, TopicPage>;
	heads: Map<string, string>;
	rows: Map<string, string>;
	briefs: Map<string, string>;
}

const keyOf = (workspace: string, handle: string) => `${workspace}#${handle}`;

/** The topics worth a visit to their page: what is due, the next three days' plan, the exam's gaps, the open tasks'. */
function topicsToVisit(courses: readonly CalendarCourse[], today: string): Array<{ course: CalendarCourse; topic: CourseMapTopic }> {
	const week = addDays(today, 3);
	return courses.flatMap((course) => {
		const exam = course.map.exam;
		const gaps = new Set([...(exam?.doesNotFit ?? []), ...(exam?.unreviewed ?? []), ...(exam?.leavesOut ?? [])]);
		const tasks = new Set(course.map.tasks.flatMap((t) => t.topics ?? []));
		const soon = new Set(course.planned.filter((d) => d.date >= today && d.date <= week).flatMap((d) => [...d.reviews, ...d.new]));
		return course.map.topics.filter((t) => gaps.has(t.handle) || tasks.has(t.handle) || soon.has(t.handle) || t.review?.kind === "due").map((topic) => ({ course, topic }));
	});
}

/** What every surface draws now, each read once (`reading`). */
async function survey(app: DemoApp, label: string): Promise<Survey> {
	return app.reading(() => surveyNow(app, label));
}

async function surveyNow(app: DemoApp, label: string): Promise<Survey> {
	const { unitHref, courseHref } = await import("../components/unit-inbox/unit-href.ts");
	const { fetchCourseBrief } = await import("../src/server/course-brief.ts");
	const { stores } = await import("../src/server/stores.ts");

	await app.visit("/", { fresh: true, ready: () => app.homeLines().length > 0 || !!document.querySelector('[data-slot="day-heading"]') });
	const home = app.homeLines();
	const sidebar = app.sidebarCards();

	const { today, courses, chats, drawn: calendar } = await app.calendar((e, day) => e.kind !== "session" || e.day === day || e.status !== null);

	const pages = new Map<string, TopicPage>();
	const visits = topicsToVisit(courses, today);
	await app.visitEach(
		visits.map(({ course, topic }) => unitHref(course.map.workspace, topic.handle)),
		(page) => !!page.querySelector('[data-slot="pickup-now"]'),
		async (page, pathname) => {
			const { course, topic } = visits.find((v) => unitHref(v.course.map.workspace, v.topic.handle) === pathname)!;
			const press = page.querySelector('[data-slot="pickup-now-press"]');
			pages.set(keyOf(course.map.workspace, topic.handle), {
				now: text(page.querySelector('[data-slot="pickup-now-words"]')),
				note: text(page.querySelector('[data-slot="pickup-now-note"]')),
				press: text(press),
				scheduled: text(page.querySelector('[data-slot="pickup-scheduled"]')),
				text: `${text(page.querySelector('[data-slot="page-head"]'))} ${text(page.querySelector('[data-slot="topic-panes"]'))}`,
				opens: press ? await app.lookAt(press) : null,
			});
		},
	);

	const heads = new Map<string, string>();
	const rows = new Map<string, string>();
	await app.visitEach(
		courses.map((course) => courseHref(course.map.workspace)),
		(page) => !!page.querySelector('[data-slot="course-topic-row"]'),
		(page, pathname) => {
			const course = courses.find((c) => courseHref(c.map.workspace) === pathname)!;
			heads.set(course.map.workspace, text(page.querySelector('[data-slot="page-head"]')));
			for (const row of page.querySelectorAll('[data-slot="course-topic-row"]')) {
				const title = text(row.querySelector('[data-slot="course-topic-title"]')).replace(/, [^,]*$/, "");
				const topic = course.map.topics.find((t) => t.title === title);
				if (topic) rows.set(keyOf(course.map.workspace, topic.handle), text(row.querySelector('[data-slot="course-topic-fact"]')));
			}
		},
	);

	// The brief the tutor reads at the start of a turn in each course: one of its sessions, its latest.
	const briefs = new Map<string, string>();
	await Promise.all(
		courses.map(async (course) => {
			const latest = chats.filter((c) => c.course?.workspace === course.map.workspace).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
			const record = latest && stores.chatStore.getChat(latest.id);
			const brief = record && (await fetchCourseBrief(record));
			if (brief) briefs.set(course.map.workspace, brief.text);
		}),
	);
	return { label, today, courses, chats, home, sidebar, calendar, pages, heads, rows, briefs };
}

// ─── 1. one day per topic ──────────────────────────────────────────────────

function dayClaims(s: Survey): Claims {
	const claims: Claims = new Map();
	const claim = (key: string, surface: string, day: string | undefined) => {
		if (!day) return;
		const by = claims.get(key) ?? new Map<string, string>();
		claims.set(key, by);
		if (!by.has(surface)) by.set(surface, day);
	};
	for (const course of s.courses) {
		const ws = course.map.workspace;
		const titled = [...course.map.topics].sort((a, b) => b.title.length - a.title.length);
		// The calendar: the first day on or after today it draws the topic's review or first lesson on.
		for (const { entry } of s.calendar) {
			if ((entry.kind === "review" || entry.kind === "new") && entry.course.workspace === ws && entry.day >= s.today) {
				const by = claims.get(keyOf(ws, entry.topic.handle));
				const had = by?.get("calendar");
				if (!had || entry.day < had) {
					claims.set(keyOf(ws, entry.topic.handle), new Map([...(by ?? []), ["calendar", entry.day]]));
				}
			}
		}
		// Home's Today: a course line's topics are planned today.
		for (const line of s.home) {
			if (line.course !== course.map.title || !/^(Review|Start) /.test(line.title)) continue;
			for (const topic of titled) if (names(line.title, topic.title)) claim(keyOf(ws, topic.handle), "Home", s.today);
		}
		// The topic page: a review it starts now is today's; else its Now note's day, else Scheduled's.
		for (const topic of course.map.topics) {
			const page = s.pages.get(keyOf(ws, topic.handle));
			if (!page) continue;
			// Now names a day by starting a review, by "Due today" or "Planned today", or in a "Planned …" note
			// ("Left off today" is when he last worked, not the plan); Scheduled by its own day.
			const now = page.press === "Review" || /^(Due|Planned) today/.test(page.now) ? s.today : /^Planned/.test(page.note) ? daysIn(page.note, s.today)[0] : undefined;
			claim(keyOf(ws, topic.handle), "its topic page's Now", now);
			claim(keyOf(ws, topic.handle), "its topic page's Scheduled", daysIn(page.scheduled, s.today)[0]);
			const fact = s.rows.get(keyOf(ws, topic.handle));
			if (fact && /^(Planned|Review|Due today)/.test(fact)) claim(keyOf(ws, topic.handle), "course page", daysIn(fact, s.today)[0]);
		}
		// The brief: the first plan line on or after today that reviews or starts it, under its course's name.
		const brief = s.briefs.get(ws);
		if (brief) {
			const titles = new Set(s.courses.map((c) => c.map.title));
			let under: string | null = null;
			for (const line of brief.split("\n")) {
				const head = line.split(" · ")[0]!.replace(/ \(this course\)$/, "");
				if (titles.has(head)) under = head;
				if (under !== course.map.title || !line.startsWith("- ")) continue;
				const [day] = daysIn(line.slice(2, line.indexOf(":")), s.today);
				if (!day || day < s.today) continue;
				const body = line.slice(line.indexOf(":") + 1).replace(/\([^)]*\)/g, "");
				for (const topic of titled) if (names(body, topic.title)) claim(keyOf(ws, topic.handle), "course brief", day);
			}
		}
	}
	return claims;
}

function assertOneDay(s: Survey) {
	const title = (key: string) => {
		const [ws, handle] = key.split("#");
		return s.courses.find((c) => c.map.workspace === ws)?.map.topics.find((t) => t.handle === handle)?.title ?? key;
	};
	const split = [...dayClaims(s)].filter(([, by]) => new Set(by.values()).size > 1);
	assert.ok(
		split.length === 0,
		`${s.label}: a topic is given two days:\n${split.map(([key, by]) => `  ${title(key)}: ${[...by].map(([surface, day]) => `${surface} ${short(day)}`).join(", ")}`).join("\n")}`,
	);
}

// ─── 2. one status per session ─────────────────────────────────────────────

function assertOneStatus(s: Survey) {
	const problems: string[] = [];
	for (const line of s.home) {
		const href = line.el.closest("a[href]")?.getAttribute("href") ?? line.el.getAttribute("href");
		const card = s.sidebar.find((c) => c.title === line.title);
		// The card names the topic in its title, so its slip says it without the topic ("Not right last time"
		// for Home's "Not right last time: Matrix multiplication as composition"): the same status.
		const same = (a: string, b: string) => a === b || (b.startsWith(`${a}: `) && line.title.includes(b.slice(a.length + 2)));
		if (card && !same(card.status, line.status)) problems.push(`"${line.title}": Home says "${line.status}", the sidebar "${card.status}"`);
		const id = href?.startsWith("/chat/") ? href.slice(6) : null;
		const task = /^Continue (.*)$/.exec(line.title)?.[1];
		const entry = s.calendar.find(
			({ entry }) => (id && entry.kind === "session" && entry.chat.id === id && entry.status !== null) || (task && (entry.kind === "task" || entry.kind === "session") && "task" in entry && entry.task?.title === task),
		);
		if (entry && !entry.face.includes(line.status)) problems.push(`"${line.title}": Home says "${line.status}", the calendar "${entry.face}"`);
	}
	assert.ok(problems.length === 0, `${s.label}: one session, two statuses:\n  ${problems.join("\n  ")}`);
}

// ─── 3. Continue opens the task's session ──────────────────────────────────

/** Whether session `id`'s own saves opened task `key` and never closed it, read from its record, not
 *  from the app's session list, so a list that credits a session with another's task is caught. */
function savedOpen(app: DemoApp, id: string, key: string): boolean {
	let open = false;
	for (const m of app.record(id).messages as Array<{ role: string; content?: unknown }>) {
		if (m.role !== "assistant" || !Array.isArray(m.content)) continue;
		for (const block of m.content as Array<{ type: string; name?: string; arguments?: { changes?: unknown } }>) {
			if (block.type !== "toolCall" || block.name !== "course_save") continue;
			const raw = block.arguments?.changes;
			const changes = (typeof raw === "string" ? JSON.parse(raw) : raw) as { tasks?: Record<string, unknown> } | undefined;
			if (changes?.tasks && key in changes.tasks) open = changes.tasks[key] !== null;
		}
	}
	return open;
}

function openTasks(app: DemoApp, s: Survey): Array<{ course: CalendarCourse; task: CourseMapTask; holder: ChatListItem | null }> {
	return s.courses.flatMap((course) =>
		course.map.tasks.map((task) => {
			const holders = s.chats.filter((c) => c.course?.workspace === course.map.workspace && savedOpen(app, c.id, task.key)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
			return { course, task, holder: holders[0] ?? null };
		}),
	);
}

/** Whether a link opens a session's chat, however it asks the chat to open. */
const opensChat = (href: string | null | undefined, id: string) => href?.split("?")[0] === `/chat/${id}`;

async function assertContinueOpensTask(app: DemoApp, s: Survey) {
	const { continueHref } = await import("../components/nav/session-state.ts");
	const problems: string[] = [];
	// The session list credits a session with a task only when its own saves opened it (round 12, 1 D1: a
	// close that moved the course's focus to the sheet made the Eigen lesson hold it, and Continue opened it).
	for (const course of s.courses) {
		for (const task of course.map.tasks) {
			for (const chat of s.chats.filter((c) => c.course?.workspace === course.map.workspace && (c.tasks ?? []).includes(task.key) && !savedOpen(app, c.id, task.key))) {
				const resumed = (app.record(chat.id).messages as Array<{ role: string; customType?: string; details?: { tasks?: unknown } }>).some(
					(m) => m.role === "custom" && m.customType === "session-resume" && Array.isArray(m.details?.tasks) && m.details.tasks.includes(task.key),
				);
				if (!resumed) problems.push(`the session list says "${chat.title}" holds ${task.title}, which none of its saves opened`);
			}
		}
	}
	for (const { course, task, holder } of openTasks(app, s)) {
		// Its session, asked to take the task up when it can (`continueHref`, round 13, 2 M1: Continue on sheet 4 opened the
		// chat and the tutor never went on to part (c)).
		const want = holder ? continueHref(holder) : NEW_SESSION;
		const went = (surface: string, to: string | null) => {
			if (to !== want) problems.push(`Continue ${task.title} on ${surface} opens ${to ?? "nothing"}, not ${holder ? `its session, ${want}` : "a new session"}`);
		};
		let offered = false;
		// Home and the sidebar.
		if (!document.querySelector('[data-slot="study-home"]')) await app.visit("/", { fresh: true, ready: () => app.homeLines().length > 0 });
		const line = app.homeLines().find((l) => l.title === `Continue ${task.title}` || (holder && opensChat(l.el.getAttribute("href"), holder.id)));
		if (line) {
			offered = true;
			went("Home", await app.lookAt(line.el));
		}
		const card = app.sidebarCards().find(
			(c) => c.title === `Continue ${task.title}` || c.title === task.title || (holder && opensChat(c.el.querySelector('[data-slot="row-action"]')?.getAttribute("href"), holder.id)),
		);
		const action = card?.el.querySelector('[data-slot="row-action"]');
		if (action) {
			offered = true;
			went("the sidebar", await app.lookAt(action));
		}
		// A sidebar card that opens the task's session is filed under the task or one of its topics.
		if (holder) {
			const titles = new Set([task.title, `Continue ${task.title}`, ...(task.topics ?? []).map((h) => course.map.topics.find((t) => t.handle === h)?.title ?? h)]);
			for (const c of app.sidebarCards()) {
				const a = c.el.querySelector('[data-slot="row-action"]');
				if (opensChat(a?.getAttribute("href"), holder.id) && !titles.has(c.title)) problems.push(`the sidebar files ${task.title}'s session under "${c.title}"${c.shelf ? ` (${c.shelf})` : ""}, a topic the task does not hold`);
			}
		}
		// Its topic pages.
		for (const handle of task.topics ?? []) {
			const page = s.pages.get(keyOf(course.map.workspace, handle));
			if (page && page.now === task.title) {
				offered = true;
				went(`its topic page (${handle})`, page.opens);
			}
		}
		// The calendar.
		for (const { entry, opens } of s.calendar) {
			if (entry.kind === "task" && entry.task.key === task.key && entry.course.workspace === course.map.workspace) {
				offered = true;
				went("the calendar", opens);
			}
		}
		if (!offered) problems.push(`no surface offers to continue ${task.title}, an open task`);
		if (holder && !line && !action) problems.push(`neither Home's Today nor the sidebar reaches ${task.title}, open in its session ${holder.id}`);
	}
	await app.unmount();
	assert.ok(problems.length === 0, `${s.label}:\n  ${problems.join("\n  ")}`);
}

// ─── 5. exam warnings agree ────────────────────────────────────────────────

/** The words a topic page warns with, and the ones the head and the panel say a topic is left out with. */
const EXAM_WARNING = /not on the exam|after the exam|before the exam|too close to the exam/i;

function assertExamWarnings(s: Survey) {
	const problems: string[] = [];
	for (const course of s.courses) {
		const exam = course.map.exam;
		if (!exam || exam.daysLeft < 0) continue;
		const head = s.heads.get(course.map.workspace) ?? "";
		const panel = s.calendar.find(({ entry }) => entry.kind === "exam" && entry.course.workspace === course.map.workspace)?.detail ?? "";
		for (const topic of course.map.topics) {
			const page = s.pages.get(keyOf(course.map.workspace, topic.handle));
			if (!page) continue;
			const leftOut = exam.leavesOut?.includes(topic.handle) ?? false;
			const noRoom = exam.doesNotFit?.includes(topic.handle) ?? false;
			const said = [["the course head", head], ["the exam panel", panel]].filter(([, words]) => /no room before the exam/i.test(words!) && names(words!, topic.title)).map(([where]) => where);
			const warned = EXAM_WARNING.test(page.text);
			if (leftOut && !warned) problems.push(`${topic.title}: the exam leaves it out, its page says nothing of the exam ("${page.note || page.scheduled || page.now}")`);
			if (noRoom && said.length > 0 && !warned) problems.push(`${topic.title}: ${said.join(" and ")} say there is no room before the exam to start it, its page says nothing of the exam ("${page.note || page.scheduled || page.now}")`);
			if (warned && !leftOut && !noRoom && !(exam.unreviewed ?? []).includes(topic.handle)) problems.push(`${topic.title}: its page warns of the exam ("${page.text.match(EXAM_WARNING)?.[0]}"), the plan leaves nothing of it out`);
		}
	}
	assert.ok(problems.length === 0, `${s.label}:\n  ${problems.join("\n  ")}`);
}

// ─── the journey ───────────────────────────────────────────────────────────

describe("the demo world across surfaces (scenarios.md, no tutor turns)", { skip, concurrency: false, timeout: 900_000 }, () => {
	let app: DemoApp;
	before(async () => {
		app = await openDemoApp("2026-11-08");
	});
	after(() => app?.close());

	/** Every invariant but the live lesson's, on what the surfaces draw now. */
	async function holds(label: string) {
		const s = await survey(app, label);
		const failures: string[] = [];
		for (const check of [() => assertOneDay(s), () => assertOneStatus(s), () => assertExamWarnings(s)]) {
			try {
				check();
			} catch (err) {
				failures.push((err as Error).message);
			}
		}
		try {
			await assertContinueOpensTask(app, s);
		} catch (err) {
			failures.push((err as Error).message);
		}
		assert.ok(failures.length === 0, failures.join("\n\n"));
		return s;
	}

	const sessionOf = (title: string) => app.chats().find((c) => c.title === title);

	it("Sun 8 Nov, as seeded", async () => {
		await holds("Sun 8 Nov, as seeded");
	});

	it("a lesson started from its topic page is on Today while the course reads are still under way (round 12 n5, round 13 3 N3)", async () => {
		const { unitHref } = await import("../components/unit-inbox/unit-href.ts");
		const la = app.chats().find((c) => c.course?.title === "Linear Algebra")!.course!.workspace;
		// Home is read once, as the window had it before the lesson; the window stays open from here on.
		await app.visit("/", { ready: () => app.homeLines().length > 0 && app.sidebarCards().length > 0 });
		await app.navigate(unitHref(la, "invertibility"), { ready: () => !!document.querySelector('[data-slot="pickup-now-press"]') });
		const opened = await app.press(document.querySelector('[data-slot="pickup-now-press"]')!);
		assert.ok(opened?.startsWith("/chat/"), `Start opens a session (${opened})`);
		const id = opened!.slice(6);
		await app.navigate(opened!);
		app.pose(id, "Which inputs does $A$ send to zero?");
		const title = app.record(id).title;
		await app.settle(() => app.sidebarCards().some((c) => c.title === title), 20_000);
		// Back on Home while the engine's course reads are slow (round 13: 6.5 s and more under load).
		const problems: string[] = [];
		const release = app.hold("/api/study");
		try {
			await app.navigate("/");
			await app.settle();
			assert.ok(app.sidebarCards().some((c) => c.title === title), `the sidebar lists the live lesson "${title}"`);
			if (!app.homeLines().some((l) => l.title === title)) problems.push(`while the course reads are under way, the sidebar lists the live lesson "${title}" and Home's Today does not: ${app.homeLines().map((l) => l.title).join(" | ")}`);
		} finally {
			release();
		}
		// Once read, Today has a line of its own for it, never folded into "Also today" (round 11, 3 n5).
		await app.settle();
		if (!app.homeLines().some((l) => l.title === title)) problems.push(`once read, Home's Today has no line for the live lesson "${title}": ${app.homeLines().map((l) => l.title).join(" | ")}`);
		await app.unmount();
		assert.ok(problems.length === 0, problems.join("\n"));
	});

	it("Sun 8 Nov, after Problem sheet 4 is continued and left for next time (lens 2, steps 30 to 32)", async () => {
		const sheet = sessionOf("Problem sheet 4")!;
		app.say(sheet.id, "ok, let us continue the sheet");
		await app.save(sheet.id, {
			observations: [
				{ topics: ["vectors"], text: "Wrote $(2,1)$ as a combination of $(1,0)$ and $(1,1)$", result: "correct", help: "none" },
				{ topics: ["kernel"], text: "Showed $\\dim \\ker A = 2$ for the $3 \\times 5$ matrix of rank $3$", result: "correct", help: "none", sure: "confident" },
			],
			tasks: { "sheet-4": { step: "Part (d): a basis for $\\ker A$" } },
		});
		app.pose(sheet.id, "Part (d): find a basis for $\\ker A$.");
		app.doneForToday(sheet.id, "Next time you pick up the sheet at part (d).");
		await holds("Sun 8 Nov, after sheet 4 is left for next time");
	});

	it("Sun 8 Nov, after the Eigen lesson's answers and Done for today (lens 1, steps 4 to 6)", async () => {
		await app.save("chat_demo_eigen", {
			observations: [
				{ topics: ["eigen"], text: "Predicted the eigenvalues of a non-triangular matrix straight off its diagonal", result: "incorrect", help: "none", sure: "guess", predicted: true },
				{ topics: ["eigen"], text: "Found the eigenvalues of $B$ from its trace and determinant", result: "correct", help: "none", sure: "confident" },
				{ topics: ["eigen", "kernel"], text: "Gave $(1,-1)$ for the eigenspace with a sign slip", result: "partial", help: "none" },
			],
			// The close hands the course's focus back to the open sheet, as round 12's did (1 D1).
			focus: "sheet-4",
		});
		app.pose("chat_demo_eigen", "Find an eigenvector for $\\lambda = 3$.");
		app.doneForToday("chat_demo_eigen", "Next time you pick up the eigenvalue lesson at the eigenvector question you left open.");
		await holds("Sun 8 Nov, after the Eigen lesson");
	});

	it("Sun 8 Nov, after the Probability review from Home (lens 1, step 9)", async () => {
		await app.visit("/", { fresh: true, ready: () => app.homeLines().length > 0 });
		const line = app.homeLines().find((l) => l.course === "Probability" && l.title.startsWith("Review "));
		assert.ok(line, "Home offers the Probability review");
		const opened = await app.press(line.el);
		assert.ok(opened?.startsWith("/chat/"), `the review opens a session (${opened})`);
		const id = opened!.slice(6);
		await app.save(id, {
			observations: [
				{ topics: ["binomial"], text: "The PMF of the maximum of two dice", result: "correct", help: "none" },
				{ topics: ["binomial"], text: "At least 2 right on a quiz, missing $P(X = 1)$", result: "partial", help: "none", sure: "guess" },
			],
		});
		app.doneForToday(id, "Binomial distribution comes back for review another day.");
		await holds("Sun 8 Nov, after the Probability review");
	});

	it("Mon 9 Nov, overnight", async () => {
		app.day("2026-11-09");
		await holds("Mon 9 Nov, overnight");
	});

	it("Mon 9 Nov, after the Linear Algebra review from Home (lens 1, step 15)", async () => {
		await app.visit("/", { fresh: true, ready: () => app.homeLines().length > 0 });
		const line = app.homeLines().find((l) => l.course === "Linear Algebra" && l.title.startsWith("Review "));
		assert.ok(line, `Home offers a Linear Algebra review: ${app.homeLines().map((l) => l.title).join(" | ")}`);
		const opened = await app.press(line.el);
		assert.ok(opened?.startsWith("/chat/"), `the review opens a session (${opened})`);
		const id = opened!.slice(6);
		const topics = app.record(id).topics ?? [];
		await app.save(id, {
			observations: topics.map((topic, i) => ({ topics: [topic], text: `Review question ${i + 1}`, result: i === 0 ? "correct" : "partial", help: "none", sure: i === 0 ? "guess" : "confident" })),
		});
		app.doneForToday(id);
		await holds("Mon 9 Nov, after the Linear Algebra review");
	});

	it("Tue 10 Nov, overnight", async () => {
		app.day("2026-11-10");
		await holds("Tue 10 Nov, overnight");
	});

	it("Tue 17 Nov, two days before the Probability exam", async () => {
		app.day("2026-11-17");
		await holds("Tue 17 Nov");
	});
});
