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
 *    when the course head and the calendar's exam panel name it;
 * 6. every surface that opens a session (Home, the sidebar, the calendar,
 *    its topic page) gives it the one status, and Home and the sidebar's
 *    top give each session one line (round 14, 1 M3: the begun Poisson
 *    lesson twice, as its task and as its topic; 1 n5: the calendar's
 *    "Your turn" beside Home's "Left off 10 Nov");
 * 7. the course page's Needs you holds only what Home's Today asks
 *    (round 14, 1 n5, 2: "Random variables · Your turn", asked nowhere);
 * 8. a lesson he left with Done for today reads "Left off today" on every
 *    surface and leaves Today, however the close's record ends, and its
 *    page holds the left question once, posed again with Hint, Show me and
 *    his confidence as before (round 14, M1: 1 M1, 2 D2, 3 M1, 4 minor 5);
 * 9. a topic's page resumes a session only when the session's own record
 *    did work on the topic: a press opened it there, it saved an answer or
 *    a task on it, or its plan teaches it, never because his question named
 *    the topic (round 16, M3: 1 M2; M4: 3 N1).
 *
 * It seeds its own copy of the world each run (about a minute) and reads
 * the real engine, so it runs where the seed and the engine are installed.
 */
import { demoWorldMissing, hasDemoSeed, NEW_SESSION, openDemoApp, text, type DemoApp } from "./helpers/demo-app.tsx";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { sessionState } from "../components/nav/session-state.ts";
import type { CalendarEntry } from "../components/calendar/calendar-facts.ts";
import type { CalendarCourse, ChatListItem, CourseMapTask, CourseMapTopic } from "../src/core/index.ts";
import type { HomeLine, SidebarCard } from "./helpers/demo-app.tsx";
import { addDays, briefDays, daysIn, names, scheduledDay, short } from "./helpers/day-claims.ts";

const missing = demoWorldMissing();
// CI sets LH_REQUIRE_REAL_ENGINE, so a missing engine fails the gate instead of skipping this. The seed is the
// Logbook's, outside this repository, so CI never has it and skips.
const skip = missing && (!process.env.LH_REQUIRE_REAL_ENGINE || !hasDemoSeed()) ? missing : false;

// ─── the survey: what each surface draws ───────────────────────────────────

type Claims = Map<string, Map<string, string>>; // topic key → surface → day

interface TopicPage {
	now: string;
	note: string;
	press: string;
	scheduled: string;
	/** The day Scheduled draws, read from its row. */
	scheduledOn: string | undefined;
	text: string;
	opens: string | null;
}

interface Survey {
	label: string;
	today: string;
	courses: readonly CalendarCourse[];
	chats: readonly ChatListItem[];
	home: Array<HomeLine & { opens: string | null }>;
	sidebar: Array<SidebarCard & { opens: string | null }>;
	calendar: Awaited<ReturnType<DemoApp["calendar"]>>["drawn"];
	pages: Map<string, TopicPage>;
	heads: Map<string, string>;
	rows: Map<string, string>;
	/** Each course page's Needs you: its rows' topics and words. */
	needsYou: Map<string, Array<{ handle: string; text: string }>>;
	briefs: Map<string, string>;
}

const keyOf = (workspace: string, handle: string) => `${workspace}#${handle}`;

/** The topics worth a visit to their page: what is due, the next three days' plan, the exam's gaps, the open
 *  tasks', and the own topics of each session not finished. */
function topicsToVisit(courses: readonly CalendarCourse[], today: string, chats: readonly ChatListItem[]): Array<{ course: CalendarCourse; topic: CourseMapTopic }> {
	const week = addDays(today, 3);
	const open = chats.filter((c) => sessionState(c) !== "finished");
	return courses.flatMap((course) => {
		const exam = course.map.exam;
		const gaps = new Set([...(exam?.doesNotFit ?? []), ...(exam?.unreviewed ?? []), ...(exam?.leavesOut ?? [])]);
		const tasks = new Set(course.map.tasks.flatMap((t) => t.topics ?? []));
		const soon = new Set(course.planned.filter((d) => d.date >= today && d.date <= week).flatMap((d) => [...d.reviews, ...d.new]));
		const sessions = new Set(open.filter((c) => c.course?.workspace === course.map.workspace).flatMap((c) => c.ownTopics ?? []));
		return course.map.topics.filter((t) => gaps.has(t.handle) || tasks.has(t.handle) || soon.has(t.handle) || sessions.has(t.handle) || t.review?.kind === "due").map((topic) => ({ course, topic }));
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
	// Where each line and card goes, read where it is drawn.
	const home: Survey["home"] = [];
	for (const line of app.homeLines()) home.push({ ...line, opens: await app.lookAt(line.el) });
	const sidebar: Survey["sidebar"] = [];
	for (const card of app.sidebarCards()) {
		// A Sessions row is itself the press that opens its session (since the shelves went, 16 Nov 2026).
		const action = card.el.matches('[data-testid="session-row"]') ? card.el : card.el.querySelector('[data-slot="row-action"]');
		sidebar.push({ ...card, opens: action ? await app.lookAt(action) : null });
	}

	const { today, courses, chats, drawn: calendar } = await app.calendar((e, day) => e.kind !== "session" || e.day === day || e.status !== null);

	const pages = new Map<string, TopicPage>();
	const visits = topicsToVisit(courses, today, chats);
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
				scheduledOn: scheduledDay(page.querySelector('[data-slot="pickup-scheduled"]'), today),
				text: `${text(page.querySelector('[data-slot="page-head"]'))} ${text(page.querySelector('[data-slot="topic-panes"]'))}`,
				opens: press ? await app.lookAt(press) : null,
			});
		},
	);

	const heads = new Map<string, string>();
	const rows = new Map<string, string>();
	const needsYou = new Map<string, Array<{ handle: string; text: string }>>();
	await app.visitEach(
		courses.map((course) => courseHref(course.map.workspace)),
		(page) => !!page.querySelector('[data-slot="course-topic-row"]'),
		(page, pathname) => {
			const course = courses.find((c) => courseHref(c.map.workspace) === pathname)!;
			// Each of the head's facts on its own, so a title that ends one is not run into the next ("…variablesStudied yesterday").
			const facts = [...page.querySelectorAll('[data-slot="page-head"] [data-slot]')].filter((el) => !el.querySelector("[data-slot]"));
			heads.set(course.map.workspace, facts.map((el) => text(el)).filter(Boolean).join("; "));
			needsYou.set(
				course.map.workspace,
				[...page.querySelectorAll('[data-slot="course-topic-row"][data-group="needs-you"]')].map((row) => ({ handle: row.getAttribute("data-topic") ?? "", text: text(row) })),
			);
			for (const row of page.querySelectorAll('[data-slot="course-topic-row"]')) {
				// By its handle: a title with a comma ("Permutations, $k$-permutations and factorials") lost its tail to the
				// strip of the row's spoken standing.
				const topic = course.map.topics.find((t) => t.handle === row.getAttribute("data-topic"));
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
	return { label, today, courses, chats, home, sidebar, calendar, pages, heads, rows, needsYou, briefs };
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
		// A lesson he began goes on as its task's entry (the engine's `begun`), so that entry is its day too, and so is
		// the entry of today's session that holds the task in its place (one piece of work, one entry): a lesson he
		// worked on today stays today's (round 14, m2).
		const begun = new Set(course.map.topics.filter((t) => t.startsWhy?.kind === "begun").map((t) => t.handle));
		// A lesson started today on a topic the plan starts today is that start, drawn as the session alone (round 15, m6).
		const startsToday = new Set<string>(course.planned.find((d) => d.date === s.today)?.new ?? []);
		for (const { entry } of s.calendar) {
			const goesOn = (entry.kind === "task" || (entry.kind === "session" && entry.task !== null)) && entry.topic && begun.has(entry.topic.handle);
			const starts = entry.kind === "session" && entry.type === "lesson" && entry.day === s.today && entry.topic && startsToday.has(entry.topic.handle) && (entry.chat.ownTopics ?? []).includes(entry.topic.handle);
			const day = entry.kind === "review" || entry.kind === "new" ? entry.topic : goesOn || starts ? entry.topic : null;
			if (day && entry.course?.workspace === ws && entry.day >= s.today) {
				const by = claims.get(keyOf(ws, day.handle));
				const had = by?.get("calendar");
				if (!had || entry.day < had) {
					claims.set(keyOf(ws, day.handle), new Map([...(by ?? []), ["calendar", entry.day]]));
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
			claim(keyOf(ws, topic.handle), "its topic page's Scheduled", page.scheduledOn);
			const fact = s.rows.get(keyOf(ws, topic.handle));
			if (fact && /^(Planned|Review|Due today)/.test(fact)) claim(keyOf(ws, topic.handle), "course page", daysIn(fact, s.today)[0]);
		}
		// The brief: the first plan line on or after today that reviews or starts it, under its course's name.
		const brief = s.briefs.get(ws);
		if (brief) {
			const days = briefDays(brief, new Set(s.courses.map((c) => c.map.title)), course.map.title, titled.map((t) => t.title), s.today);
			for (const topic of titled) claim(keyOf(ws, topic.handle), "course brief", days.get(topic.title));
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
		// A planned start says "Planned today" on both, never an arc's name on Home (round 15, m1: "Back to Linear maps and
		// matrices" on Home beside the card's "Planned today").
		const same = (a: string, b: string) => a === b || (b.startsWith(`${a}: `) && line.title.includes(b.slice(a.length + 2)));
		if (card && !same(card.status, line.status)) problems.push(`"${line.title}": Home says "${line.status}", the sidebar "${card.status}"`);
		const id = href?.startsWith("/chat/") ? href.slice(6) : null;
		const task = /^Continue (.*)$/.exec(line.title)?.[1];
		const entry = s.calendar.find(
			({ entry }) => (id && entry.kind === "session" && entry.chat.id === id && entry.status !== null) || (task && (entry.kind === "task" || entry.kind === "session") && "task" in entry && entry.task?.title === task),
		);
		if (entry && !entry.face.includes(line.status)) problems.push(`"${line.title}": Home says "${line.status}", the calendar "${entry.face}"`);
	}
	// Every line Home draws has its card on the sidebar's top, under the same name (round 15, m7: on 10 Nov the
	// sidebar left out the Linear maps lesson Home listed).
	const top = s.sidebar.filter((c) => c.shelf === "" && !c.el.matches('[data-testid="session-row"]'));
	for (const line of s.home) if (!top.some((c) => c.title === line.title)) problems.push(`"${line.title}": on Home's Today, with no card on the sidebar's top (${top.map((c) => `"${c.title}"`).join(", ")})`);
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
		// Since the shelves went (16 Nov 2026), the sidebar reaches a task off Today through its session's row under Sessions, which opens it to read.
		const row = holder ? app.sidebarCards().find((c) => c.el.matches('[data-testid="session-row"]') && c.title.startsWith(holder.title)) : undefined;
		const reached = holder && row ? opensChat(await app.lookAt(row.el), holder.id) : false;
		if (holder && !line && !action && !reached) problems.push(`neither Home's Today nor the sidebar reaches ${task.title}, open in its session ${holder.id}`);
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
		// The course page says each loss in the topic page's own words, an exam topic with no room apart from one the
		// exam leaves out, and its head names every exam topic with no room (round 15, M7: all three read "After the
		// exam", the loss behind "Not all of it fits").
		for (const topic of course.map.topics) {
			const row = s.rows.get(keyOf(course.map.workspace, topic.handle));
			if (!row || !topic.starts || topic.starts <= exam.date) continue;
			const want = exam.leavesOut?.includes(topic.handle) ? "Not on the exam" : exam.doesNotFit?.includes(topic.handle) ? "Not before the exam" : null;
			if (want && row !== want) problems.push(`${topic.title}: its course page row says "${row}", not "${want}"`);
		}
		for (const handle of exam.doesNotFit ?? []) {
			const title = course.map.topics.find((t) => t.handle === handle)?.title ?? handle;
			if (!names(head, title)) problems.push(`${title}: the exam has no room for it, the course head does not name it ("${head}")`);
		}
	}
	assert.ok(problems.length === 0, `${s.label}:\n  ${problems.join("\n  ")}`);
}

// ─── 6. one status and one line per session ────────────────────────────────

/** The words that say where a session stands (session-state.md), as every surface draws them. */
const SESSION_STATUS = /^(Your turn|Left off .+|Tutor writing|Reply cut off|Stopped by you)$/;
/** A status without the topic a card's slip adds ("Not right last time: …"). */
const statusWords = (words: string) => words.replace(/:\s.*$/, "").trim();
/** The session a link opens, never a new one (`/chat/new`). */
const chatOf = (href: string | null | undefined) => {
	const id = href?.startsWith("/chat/") ? href.slice(6).split("?")[0]! : null;
	return id === "new" ? null : id;
};

/** What each surface that opens a session says of where it stands, by session. */
async function sessionStatuses(s: Survey): Promise<Map<string, Array<[string, string]>>> {
	const { lookWords } = await import("../components/calendar/calendar-facts.ts");
	const said = new Map<string, Array<[string, string]>>();
	const say = (id: string | null, surface: string, words: string) => {
		if (!id || !SESSION_STATUS.test(statusWords(words))) return;
		said.set(id, [...(said.get(id) ?? []), [surface, statusWords(words)]]);
	};
	for (const line of s.home) say(chatOf(line.opens), `Home ("${line.title}")`, line.status);
	for (const card of s.sidebar) say(chatOf(card.opens), `the sidebar ("${card.title}"${card.shelf ? `, ${card.shelf}` : ""})`, card.status);
	for (const { entry, opens } of s.calendar) {
		const id = entry.kind === "session" ? entry.chat.id : entry.kind === "task" ? chatOf(opens) : null;
		say(id, `the calendar (${entry.kind} "${entry.title}", ${short(entry.day)})`, lookWords(entry, s.today));
	}
	for (const [key, page] of s.pages) say(chatOf(page.opens), `its topic page (${key.split("#")[1]})`, page.note);
	return said;
}

async function assertOneStatusEverywhere(s: Survey) {
	const problems: string[] = [];
	for (const [id, said] of await sessionStatuses(s)) {
		if (new Set(said.map(([, words]) => words)).size < 2) continue;
		const title = s.chats.find((c) => c.id === id)?.title ?? id;
		problems.push(`"${title}": ${said.map(([surface, words]) => `${surface} "${words}"`).join(", ")}`);
	}
	// One line per session: Home's Today and the sidebar's top each open a session from one line (round 14, 1 M3).
	for (const [where, lines] of [
		["Home's Today", s.home],
		["the sidebar's top", s.sidebar.filter((c) => c.shelf === "" && !c.el.matches('[data-testid="session-row"]'))],
	] as const) {
		const by = Map.groupBy(lines as ReadonlyArray<{ title: string; status: string; opens: string | null }>, (l) => chatOf(l.opens));
		for (const [id, same] of by) {
			if (id && same.length > 1) problems.push(`${where} opens "${s.chats.find((c) => c.id === id)?.title ?? id}" from ${same.length} lines: ${same.map((l) => `"${l.title} · ${l.status}"`).join(", ")}`);
		}
	}
	assert.ok(problems.length === 0, `${s.label}: one session, two statuses or two lines:\n  ${problems.join("\n  ")}`);
}

// ─── 7. Needs you is what Today asks ───────────────────────────────────────

function assertNeedsYouOnToday(s: Survey) {
	const problems: string[] = [];
	for (const course of s.courses) {
		const ws = course.map.workspace;
		for (const row of s.needsYou.get(ws) ?? []) {
			const topic = course.map.topics.find((t) => t.handle === row.handle);
			if (!topic) continue;
			const asked = s.home.some((line) => {
				if (line.course !== course.map.title) return false;
				if (names(line.title, topic.title)) return true;
				const chat = s.chats.find((c) => c.id === chatOf(line.opens));
				if (chat && [...(chat.ownTopics ?? []), ...(chat.topics ?? [])].includes(topic.handle)) return true;
				const task = course.map.tasks.find((t) => line.title === `Continue ${t.title}`);
				return !!task?.topics?.includes(topic.handle);
			});
			if (!asked) problems.push(`${course.map.title}'s Needs you lists "${row.text}", which no line of Home's Today asks: ${s.home.map((l) => `${l.title} · ${l.status}`).join(" | ") || "(Today is empty)"}`);
		}
	}
	assert.ok(problems.length === 0, `${s.label}:\n  ${problems.join("\n  ")}`);
}

// ─── 8. a lesson left for today stays left ──────────────────────────────────

/** What a lesson's page offers on its open question: how often its words and "Your turn" are drawn, and
 *  whether the box gives Hint, Show me and his confidence. */
interface LessonView {
	asked: number;
	yourTurn: number;
	hint: boolean;
	showMe: boolean;
	sure: boolean;
	tail: string;
}

/** Reads a lesson's page; `words` is a stretch of the question's own words, past any maths. */
function lessonView(page: Element, words: string): LessonView {
	const transcript = text(page.querySelector("main") ?? page);
	return {
		asked: transcript.split(words).length - 1,
		yourTurn: page.querySelectorAll('[data-slot="your-turn"]').length,
		hint: !!page.querySelector('[data-testid="question-hint"]'),
		showMe: !!page.querySelector('[data-testid="question-show"]'),
		sure: !!page.querySelector('[data-testid="confidence-choice"]'),
		tail: transcript.slice(-240),
	};
}

/** The left lesson `id`, the day he pressed Done for today on it with its question (`words`) open: it is
 *  left (session-state.md), leaves Today, reads "Left off today" wherever it is drawn, and its page, opened
 *  again, holds the question once and serves it as `before` did (round 14, M1). */
async function assertLeftToday(app: DemoApp, s: Survey, id: string, words: string, before: LessonView) {
	const { continueHref } = await import("../components/nav/session-state.ts");
	const { unitHref } = await import("../components/unit-inbox/unit-href.ts");
	const problems: string[] = [];
	const chat = s.chats.find((c) => c.id === id)!;
	const state = sessionState(chat);
	if (state !== "left") problems.push(`it reads ${state}, not left (ended ${chat.ended}, pendingQuestion ${chat.pendingQuestion})`);
	for (const line of s.home) if (chatOf(line.opens) === id) problems.push(`Home's Today still asks it: "${line.title} · ${line.status}"`);
	const said = (await sessionStatuses(s)).get(id) ?? [];
	for (const [surface, status] of said) if (status !== "Left off today") problems.push(`${surface} says "${status}", not "Left off today"`);
	if (!said.some(([surface]) => surface.startsWith("the sidebar"))) problems.push(`no sidebar card opens it with "Left off today": ${s.sidebar.filter((c) => c.title === chat.title).map((c) => `"${c.title} · ${c.status}"`).join(", ") || "none has its title"}`);
	// Its topic page's Now picks it up as left.
	for (const handle of chat.ownTopics ?? []) {
		const page = s.pages.get(keyOf(chat.course!.workspace, handle));
		if (!page) problems.push(`its topic page (${unitHref(chat.course!.workspace, handle)}) was not read`);
		else if (chatOf(page.opens) === id && page.note !== "Left off today") problems.push(`its topic page's Now says "${page.now} · ${page.note}", not "Left off today"`);
	}
	// Opened again (its Continue, Resume or Home's line all go here), the question is there once, his to answer.
	const again = await app.lesson(continueHref(chat), (page) => lessonView(page, words));
	if (again.asked !== 1) problems.push(`opened again, its page draws the left question ${again.asked} times (before Done: ${before.asked}): …${again.tail}`);
	if (again.yourTurn !== 1) problems.push(`opened again, its page says "Your turn" ${again.yourTurn} times: …${again.tail}`);
	for (const control of ["hint", "showMe", "sure"] as const) {
		if (again[control] !== before[control]) problems.push(`opened again, the box ${again[control] ? "offers" : "lacks"} ${control === "sure" ? "his confidence" : control === "hint" ? "Hint" : "Show me"}, which it ${before[control] ? "offered" : "lacked"} before Done for today`);
	}
	assert.ok(problems.length === 0, `${s.label}: ${chat.title}, left for today:\n  ${problems.join("\n  ")}`);
}

// ─── 9. a finished lesson asks nothing ──────────────────────────────────────

/** The lesson `id`, finished: its own save closed its task, then he picked the tutor's "Stop here for today".
 *  On a later day nothing offers it again: no line of Home's Today, no sidebar card with a status, no row of
 *  its course page's Needs you, and no Resume on its topic page (round 15, M1: 1 D1, "Continue Linear maps
 *  and their matrices lesson · Left off 10 Nov" on the exam eve). */
async function assertFinishedLesson(app: DemoApp, s: Survey, id: string) {
	const { unitHref } = await import("../components/unit-inbox/unit-href.ts");
	const problems: string[] = [];
	const chat = s.chats.find((c) => c.id === id)!;
	const state = sessionState(chat);
	if (state !== "finished") problems.push(`it reads ${state}, not finished (ended ${chat.ended}, tasks ${JSON.stringify(chat.tasks)})`);
	for (const line of s.home) if (chatOf(line.opens) === id) problems.push(`Home's Today offers it: "${line.title} · ${line.status}"`);
	for (const [surface, status] of (await sessionStatuses(s)).get(id) ?? []) problems.push(`${surface} says "${status}"`);
	const ws = chat.course!.workspace;
	const own = new Set(chat.ownTopics ?? []);
	for (const row of s.needsYou.get(ws) ?? []) if (own.has(row.handle) && /Left off|Your turn/.test(row.text)) problems.push(`its course page's Needs you lists "${row.text}"`);
	for (const handle of own) {
		await app.visit(unitHref(ws, handle), { fresh: true, ready: () => !!document.querySelector('[data-slot="pickup-now"]') });
		const press = document.querySelector('[data-slot="pickup-now-press"]');
		const opens = press ? await app.lookAt(press) : null;
		if (chatOf(opens) === id) problems.push(`its topic page (${handle}) offers "${text(press)}" on it: "${text(document.querySelector('[data-slot="pickup-now"]'))}"`);
	}
	await app.unmount();
	assert.ok(problems.length === 0, `${s.label}: ${chat.title}, finished:\n  ${problems.join("\n  ")}`);
}

// ─── 9. a session is filed by what it did ──────────────────────────────────

/** The topics session `id`'s own record did work on, read from the record, not from the app's session
 *  list: those a press opened it on or it was named after, each answer, task and problem its calls that went
 *  through gave a topic, and the topic its plan teaches. */
function workedOn(app: DemoApp, id: string): Set<string> {
	const record = app.record(id) as { appOpening?: true; named?: true; topics?: readonly string[]; messages: Array<{ role: string; content?: unknown; toolCallId?: string; isError?: boolean }> };
	const done = new Set<string>(record.appOpening || record.named ? (record.topics ?? []) : []);
	const failed = new Set(record.messages.filter((m) => m.role === "toolResult" && m.isError).map((m) => m.toolCallId));
	const list = (v: unknown) => (Array.isArray(v) ? v.filter((t): t is string => typeof t === "string") : []);
	for (const m of record.messages) {
		if (m.role !== "assistant" || !Array.isArray(m.content)) continue;
		for (const block of m.content as Array<{ type: string; id?: string; name?: string; arguments?: Record<string, unknown> }>) {
			if (block.type !== "toolCall" || failed.has(block.id)) continue;
			const args = block.arguments ?? {};
			if (block.name === "plan_init") {
				const topic = (args.goal as { topic?: unknown } | undefined)?.topic;
				if (typeof topic === "string") done.add(topic);
			}
			if (block.name === "problem") for (const t of list(args.topics)) done.add(t);
			if (block.name !== "course_save") continue;
			const raw = args.changes;
			const changes = (typeof raw === "string" ? JSON.parse(raw) : raw) as { observations?: Array<{ topics?: unknown }>; tasks?: Record<string, { topics?: unknown } | null> } | undefined;
			for (const o of changes?.observations ?? []) for (const t of list(o.topics)) done.add(t);
			for (const task of Object.values(changes?.tasks ?? {})) for (const t of list(task?.topics)) done.add(t);
		}
	}
	return done;
}

function assertFiledByWork(app: DemoApp, s: Survey) {
	const problems: string[] = [];
	for (const [key, page] of s.pages) {
		const id = page.opens?.startsWith("/chat/") ? page.opens.slice(6).split("?")[0]! : null;
		if (!id || page.press === "Review") continue;
		const handle = key.split("#")[1]!;
		if (!workedOn(app, id).has(handle)) problems.push(`${handle}: its page's Now "${page.now} · ${page.press} · ${page.note}" resumes "${app.record(id).title}", which did no work on it (${[...workedOn(app, id)].join(", ") || "none"})`);
	}
	assert.ok(problems.length === 0, `${s.label}: a session filed under a topic it never worked on:\n  ${problems.join("\n  ")}`);
}

// ─── the journey ───────────────────────────────────────────────────────────

describe("the demo world across surfaces (scenarios.md, no tutor turns)", { skip, concurrency: false, timeout: 1_800_000 }, () => {
	let app: DemoApp;
	before(async () => {
		app = await openDemoApp("2026-11-08");
	});
	after(() => app?.close());

	/** Every invariant but the live lesson's, on what the surfaces draw now, and `also`'s. */
	async function holds(label: string, also: (s: Survey) => Promise<void> | void = () => {}) {
		const s = await survey(app, label);
		const failures: string[] = [];
		for (const check of [() => assertOneDay(s), () => assertOneStatus(s), () => assertExamWarnings(s), () => assertNeedsYouOnToday(s), () => assertOneStatusEverywhere(s), () => also(s), () => assertContinueOpensTask(app, s), () => assertFiledByWork(app, s)]) {
			try {
				await check();
			} catch (err) {
				failures.push((err as Error).message);
			}
		}
		assert.ok(failures.length === 0, failures.join("\n\n"));
		return s;
	}

	/** What the lesson's page offers on its open question now (`lessonView`). */
	const viewOf = (id: string, words: string) => app.lesson(`/chat/${id}`, (page) => lessonView(page, words));

	/** The Invertible lesson started from its topic page (the live-lesson step), its question still open. */
	let invertible: { id: string; call: { tool: string; input: unknown } } | null = null;

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
		invertible = { id, call: app.pose(id, "Which inputs does $A$ send to zero?") };
		// Home's line and its card name the lesson after its verb (round 16, m4).
		const title = `Continue ${app.record(id).title}`;
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

	it("Sun 8 Nov, Done for today on the Invertible lesson, its close followed by the app's re-pose of the left question (round 14, M1: 3 M1, 4 minor 5)", async () => {
		assert.ok(invertible, "the live-lesson step started the Invertible lesson");
		const { id, call } = invertible;
		const words = "send to zero";
		const before = await viewOf(id, words);
		app.leave(id);
		app.closes(id, "We'll stop here for today. Next time you pick up the lesson at the question on what $A$ sends to $0$, which is still open.", { repose: [call] });
		await holds("Sun 8 Nov, after Done for today on the Invertible lesson", (s) => assertLeftToday(app, s, id, words, before));
	});

	it("Sun 8 Nov, after Problem sheet 4 is continued and left for next time (lens 2, steps 30 to 32)", async () => {
		// The sheet's session, by the task it holds: it is named after the task (round 15, m5).
		const sheet = app.chats().find((c) => (c.tasks ?? []).includes("sheet-4"))!;
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
		// His Done for today, then the close lens 1 and lens 2 recorded (round 14, M1: 1 M1, 2 D2): the tutor's
		// closing words, then the left question posed again as its own last call, against the marker.
		const words = "Find an eigenvector for";
		const left = app.pose("chat_demo_eigen", "Find an eigenvector for $\\lambda = 3$.");
		const before = await viewOf("chat_demo_eigen", words);
		app.leave("chat_demo_eigen");
		app.closes("chat_demo_eigen", "We'll stop here for today. Next time you pick up the eigenvalue lesson at the eigenvector question you left open.", left);
		await holds("Sun 8 Nov, after the Eigen lesson", (s) => assertLeftToday(app, s, "chat_demo_eigen", words, before));
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
		// Eigen's review is due today, and the Eigen lesson left yesterday is open on it, so the review is that lesson's
		// line, where his answers count as it (round 15, m6).
		const line = app.homeLines().find((l) => l.course === "Linear Algebra" && (l.title.startsWith("Review ") || l.title.startsWith("Continue Eigenvalues and eigenvectors")));
		assert.ok(line, `Home offers a Linear Algebra review: ${app.homeLines().map((l) => l.title).join(" | ")}`);
		assert.ok(app.homeLines().filter((l) => /Eigenvalues and eigenvectors/.test(l.title)).length === 1, `one line for Eigen: ${app.homeLines().map((l) => `${l.title} · ${l.status}`).join(" | ")}`);
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

	it("Mon 9 Nov, a lesson started from its topic page and closed with its first question open, its reply never finished (round 14, m28: 1 n5, 2)", async () => {
		const { unitHref } = await import("../components/unit-inbox/unit-href.ts");
		// Sunday's planned Linear Algebra start, so the session is not the Poisson lesson the Tue 10 step begins.
		const { courses } = (await (await fetch("/api/calendar")).json()) as { courses: CalendarCourse[] };
		const course = courses.find((c) => c.map.title === "Linear Algebra")!.map;
		const handle = course.topics.find((t) => t.title === "Linear maps and their matrices")!.handle;
		await app.visit(unitHref(course.workspace, handle), { ready: () => !!document.querySelector('[data-slot="pickup-now-press"]') });
		const opened = await app.press(document.querySelector('[data-slot="pickup-now-press"]')!);
		assert.ok(opened?.startsWith("/chat/"), `its page starts a lesson (${opened})`);
		// The tutor's first question, its turn never settled: the record ends on its call (\`cut\`, \`pendingQuestion\`).
		app.pose(opened!.slice(6), "What do you expect this to look like, before we start?");
		await app.unmount();
		await holds("Mon 9 Nov, after a lesson left mid-question");
	});

	it("Tue 10 Nov, overnight", async () => {
		app.day("2026-11-10");
		await holds("Tue 10 Nov, overnight");
	});

	it("Tue 10 Nov, the Poisson lesson begun from its page, its task saved, then Done for today and the tutor's re-ask (round 14, M7: 1 M3)", async () => {
		const { unitHref } = await import("../components/unit-inbox/unit-href.ts");
		const { courses } = (await (await fetch("/api/calendar")).json()) as { courses: CalendarCourse[] };
		const course = courses.find((c) => c.map.title === "Probability")!.map;
		const poisson = course.topics.find((t) => t.title === "Poisson distribution")!.handle;
		await app.visit(unitHref(course.workspace, poisson), { ready: () => !!document.querySelector('[data-slot="pickup-now-press"]') });
		const opened = await app.press(document.querySelector('[data-slot="pickup-now-press"]')!);
		assert.ok(opened?.startsWith("/chat/"), `its page starts a lesson (${opened})`);
		const id = opened!.slice(6);
		await app.unmount();
		// What the lesson leaves, as lens 1's 10 Nov record has it: predictions only, and the lesson's task.
		await app.save(id, {
			observations: [{ topics: [poisson], text: "Predicted that rare events in a fixed window are spread evenly", result: "incorrect", help: "none", sure: "guess", predicted: true }],
			tasks: { "poisson-lesson": { title: "Poisson distribution lesson", topics: [poisson], goal: "Learn the Poisson distribution as the limit of binomials", step: "The bookshop question: the chance of no customers in an hour" } },
		});
		const left = app.pose(id, "A bookshop gets 3 customers an hour on average. What is the chance of none in the next hour?");
		app.leave(id);
		app.closes(id, "We'll stop here for today. Next time you pick up the Poisson lesson at the bookshop question.", left);
		await holds("Tue 10 Nov, after the Poisson lesson's Done for today");
	});

	/** The Linear maps lesson begun on Mon 9 Nov, finished on Tue 10 Nov. */
	let finishedLesson: string | null = null;

	it("Tue 10 Nov, the Linear maps lesson taught through, its task closed, then the tutor's Stop here for today (round 15, M1: 1 D1)", async () => {
		const lesson = app.chats().find((c) => c.course?.title === "Linear Algebra" && (c.ownTopics ?? []).includes("linear-maps") && !c.review);
		assert.ok(lesson, "Monday's Linear maps lesson");
		const { id } = lesson;
		app.answer(id, { words: "A matrix whose columns are the images of the basis vectors" });
		await app.save(id, {
			observations: [{ topics: ["linear-maps"], text: "Found the matrix of a map from the images of a basis", result: "correct", help: "none", sure: "confident" }],
			tasks: { "linear-maps-lesson": { title: "Linear maps and their matrices lesson", topics: ["linear-maps"], step: "The matrix of a map on polynomials" } },
		});
		// Lens 1's 10 Nov record: the lesson's last save removes its task, then the tutor offers practice or a stop.
		await app.save(id, { tasks: { "linear-maps-lesson": null } });
		app.offerStop(id, "That finishes the Linear maps and their matrices lesson. Do you want some practice problems now?");
		app.answer(id, { pick: 2 });
		app.closes(id, "Tomorrow, Wednesday 11 November, brings your reviews.");
		finishedLesson = id;
		await holds("Tue 10 Nov, after the Linear maps lesson finished");
	});

	it("Tue 17 Nov, two days before the Probability exam", async () => {
		app.day("2026-11-17");
		await holds("Tue 17 Nov", (s) => (finishedLesson ? assertFinishedLesson(app, s, finishedLesson) : assert.fail("the Tue 10 step finished the Linear maps lesson")));
	});

	it("Tue 17 Nov, Ask the tutor from the Probability head, two review answers, then Done for today (round 16, M3: 1 M2)", async () => {
		const { examGapAskCreation } = await import("../components/unit-inbox/start-unit.ts");
		const { courses } = (await (await fetch("/api/calendar")).json()) as { courses: CalendarCourse[] };
		const course = courses.find((c) => c.map.title === "Probability")!.map;
		// His question names topics never started, as the head's gaps are (lens 1: Geometric, Poisson, Variance).
		const gaps = course.topics.filter((t) => t.level === "new" && !app.chats().some((c) => (c.topics ?? []).includes(t.handle))).slice(0, 3);
		assert.ok(gaps.length > 0, "Probability has topics not started");
		const creation = examGapAskCreation(course.workspace, gaps.map((t) => t.title));
		const res = await fetch("/api/chats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(creation) });
		const { id } = (await res.json()) as { id: string };
		app.say(id, creation.title);
		const due = course.topics.filter((t) => t.review?.kind === "due").map((t) => t.handle);
		assert.ok(due.length > 0, "a Probability review is due on the exam eve");
		await app.save(id, { observations: due.map((topic, i) => ({ topics: [topic], text: `Exam-eve review question ${i + 1}`, result: "correct", help: "none", sure: "confident" })) });
		app.pose(id, "What is $P(\\max = 5)$ for three rolls of a die?");
		app.doneForToday(id, "The question you left open will still be waiting.");
		await holds("Tue 17 Nov, after the Ask session", (s) => {
			for (const gap of gaps) {
				const row = s.rows.get(keyOf(course.workspace, gap.handle)) ?? "";
				assert.ok(!/Left off/.test(row), `${gap.title}'s course row reads "${row}", though the Ask session did no work on it`);
			}
		});
	});

	it("Tue 17 Nov, a review that takes up a lesson on another topic, left for next time (round 16, M4: 3 N1)", async () => {
		// A review opened on a taught topic, as Home, its page or a sidebar card opens it; his first message names
		// a topic not started (lens 3: "Poisson" sent into "Review Binomial distribution").
		const { courses } = (await (await fetch("/api/calendar")).json()) as { courses: CalendarCourse[] };
		const course = courses.find((c) => c.map.title === "Probability")!.map;
		const taught = course.topics.find((t) => t.level !== "new")!;
		const res = await fetch("/api/chats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: `Review ${taught.title}`, course: { workspace: course.workspace }, topics: [taught.handle] }) });
		const { id } = (await res.json()) as { id: string };
		const reviewed = app.record(id).topics ?? [];
		const other = course.topics.find((t) => t.level === "new" && !app.chats().some((c) => (c.topics ?? []).includes(t.handle)))!;
		assert.ok(other, "Probability has a topic no session touched");
		app.say(id, other.title);
		await app.save(id, { observations: reviewed.map((topic, i) => ({ topics: [topic], text: `Review question ${i + 1}`, result: "correct", help: "none", sure: "confident" })) });
		// The probe's answer on the topic he asked for, which starts it (lens 3: two Poisson probe answers).
		await app.save(id, { observations: [{ topics: [other.handle], text: `Probe question on ${other.title}`, result: "partial", help: "none", sure: "guess" }] });
		await app.plan(id, "graph TD\n  first[Where the counts come from] --> second[Putting the pieces together]", { title: other.title, topic: other.handle });
		const left = app.pose(id, "Which count comes first?");
		app.leave(id);
		app.closes(id, "We'll stop here for today.", left);
		const listed = app.chats().find((c) => c.id === id)!;
		assert.equal(listed.title, `${other.title} lesson`, "the session is named after the lesson it took up");
		assert.ok(!listed.review, "it is no longer the review it opened as");
		await holds("Tue 17 Nov, after the review that took up a lesson", (s) => {
			const page = s.pages.get(keyOf(course.workspace, other.handle));
			assert.ok(page?.opens?.split("?")[0] === `/chat/${id}`, `${other.title}'s page resumes its lesson: "${page?.now} · ${page?.press} · ${page?.note}" opens ${page?.opens}`);
		});
	});

	it("Tue 17 Nov, Linear Algebra reviews answered before the plan's day for them (18 Nov: the 8 Nov review that also answered two the plan had moved to 9 Nov)", async () => {
		const { courses } = (await (await fetch("/api/calendar")).json()) as { courses: CalendarCourse[] };
		const course = courses.find((c) => c.map.title === "Linear Algebra")!;
		const ahead = course.planned.find((d) => d.date > course.map.today && d.reviews.length > 0);
		assert.ok(ahead, "the plan reviews Linear Algebra after today");
		const early = ahead.reviews.slice(0, 2);
		const res = await fetch("/api/chats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Linear Algebra review", course: { workspace: course.map.workspace }, topics: early }) });
		const { id } = (await res.json()) as { id: string };
		await app.save(id, { observations: early.map((topic, i) => ({ topics: [topic], text: `Early review question ${i + 1}`, result: "correct", help: "hint" })) });
		app.doneForToday(id);
		await holds("Tue 17 Nov, after Linear Algebra reviews answered early", (s) => {
			for (const topic of early) assert.ok(s.pages.has(keyOf(course.map.workspace, topic)), `${topic}'s page is among those read`);
		});
	});
});
