/**
 * The Mac app's study notifications (Edo, 19 Nov 2026: "macOS
 * notifications (VERY sparingly) on the most important key events"):
 * today's plan at most once a day, in his study hours, in Today's words;
 * work he started (a course's topic map, a new lesson's opening) once,
 * only while he is in another app; nothing when he turned them off.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, it } from "node:test";
import { inStudyHours, planNotice, workNotice } from "../components/desktop-notices.ts";
import { NOTICE_WORDS } from "../components/study-words.ts";
import { courseHref } from "../components/unit-inbox/unit-href.ts";
import { notificationsOn, sanitizeUserSettings } from "../src/core/settings.ts";
import { emit, subscribe, type ServerEvent } from "../src/core/events.ts";
import { SETTINGS_SECTIONS } from "../src/server/settings-body.ts";
import { todayHours } from "../src/server/study.ts";
import { onLessonOpenings } from "../src/server/work-finished.ts";
import type { ChatStore } from "../src/core/ports.ts";

const HOURS = [
	{ start: "09:00", end: "13:00" },
	{ start: "14:00", end: "18:00" },
];
const at = (time: string) => new Date(`2026-11-19T${time}:00`);

describe("today's plan", () => {
	it("says Today's lines in one line, opens Home, once for the day", () => {
		const notice = planNotice(["Review Binomial distribution", "Start Poisson distribution"], HOURS, "2026-11-19", at("09:30"));
		assert.deepEqual(notice, {
			id: "plan:2026-11-19",
			title: "Today",
			body: "Review Binomial distribution, Start Poisson distribution",
			href: "/",
			away: false,
		});
	});

	it("goes out only in his study hours: from the first window's start to the last one's end, lunch included", () => {
		assert.equal(inStudyHours(HOURS, at("08:59")), false);
		assert.equal(inStudyHours(HOURS, at("09:00")), true);
		assert.equal(inStudyHours(HOURS, at("13:30")), true);
		assert.equal(inStudyHours(HOURS, at("17:59")), true);
		assert.equal(inStudyHours(HOURS, at("18:00")), false);
		assert.equal(inStudyHours(HOURS, at("23:00")), false);
		assert.equal(planNotice(["Review Binomial distribution"], HOURS, "2026-11-19", at("07:00")), null);
	});

	it("says nothing when today holds nothing, or the Journal gives no hours today", () => {
		assert.equal(planNotice([], HOURS, "2026-11-19", at("10:00")), null);
		assert.equal(planNotice(["Review Binomial distribution"], [], "2026-11-19", at("10:00")), null);
	});

	it("reads today's hours from Home's plan listing (its today and the Journal's schedule)", () => {
		const listing = {
			today: "2026-11-08",
			journal: { upcoming_schedule: [{ date: "2026-11-08", study_windows: HOURS, is_off_day: false }] },
		};
		assert.deepEqual(todayHours(listing), HOURS);
		assert.deepEqual(todayHours({ today: "2026-11-08", journal: { upcoming_schedule: [{ date: "2026-11-08", study_windows: [], is_off_day: true }] } }), []);
		assert.deepEqual(todayHours(null), []);
	});
});

describe("work he started", () => {
	it("a course's topic map: under the course's name, opening its course page, shown only while he is away", () => {
		const notice = workNotice({ kind: "course-map", workspace: "/study/la", title: "Linear Algebra", at: "2026-11-19T10:00:00.000Z" });
		assert.deepEqual(notice, { id: "map:/study/la:2026-11-19T10:00:00.000Z", title: "Linear Algebra", body: NOTICE_WORDS.mapReady, href: courseHref("/study/la"), away: true });
	});

	it("a new lesson's opening: its title and Your turn, opening the lesson", () => {
		assert.deepEqual(workNotice({ kind: "lesson", chatId: "chat_1", title: "Poisson distribution", }), { id: "lesson:chat_1", title: "Poisson distribution", body: "Your turn", href: "/chat/chat_1", away: true });
	});

	it("is announced when a new lesson's opening turn settles with the tutor's answer, and never for a later turn", () => {
		const messages: { role: string }[] = [{ role: "user" }];
		const store = { getChat: (id: string) => (id === "chat_1" ? { id, title: "Poisson distribution", messages } : null) } as unknown as ChatStore;
		const heard: ServerEvent[] = [];
		const offHeard = subscribe((event) => event.type === "work-finished" && heard.push(event));
		const off = onLessonOpenings(store);
		emit("turn-started", { chatId: "chat_1" });
		messages.push({ role: "assistant" });
		emit("turn-settled", { chatId: "chat_1" });
		messages.push({ role: "user" });
		emit("turn-started", { chatId: "chat_1" });
		messages.push({ role: "assistant" });
		emit("turn-settled", { chatId: "chat_1" });
		off();
		offHeard();
		assert.deepEqual(heard, [{ type: "work-finished", kind: "lesson", chatId: "chat_1", title: "Poisson distribution" }]);
	});

	it("is not announced when the opening stopped before the tutor answered", () => {
		const messages: { role: string }[] = [{ role: "user" }];
		const store = { getChat: (id: string) => ({ id, title: "Stopped", messages }) } as unknown as ChatStore;
		const heard: ServerEvent[] = [];
		const offHeard = subscribe((event) => event.type === "work-finished" && heard.push(event));
		const off = onLessonOpenings(store);
		emit("turn-started", { chatId: "chat_2" });
		emit("turn-settled", { chatId: "chat_2" });
		off();
		offHeard();
		assert.deepEqual(heard, []);
	});
});

describe("the setting", () => {
	it("is on unless he turned it off, and Settings can write it", () => {
		assert.equal(notificationsOn(null), true);
		assert.equal(notificationsOn({ notifications: {} }), true);
		assert.equal(notificationsOn({ notifications: { enabled: false } }), false);
		assert.deepEqual(SETTINGS_SECTIONS.notifications({ enabled: false }), { ok: true, settings: { enabled: false } });
		assert.equal(SETTINGS_SECTIONS.notifications({ enabled: "no" }).ok, false);
		assert.deepEqual(sanitizeUserSettings({ version: 1, notifications: { enabled: false } })?.notifications, { enabled: false });
	});
});

/** The shell's `showNotice` with a stub Electron: what it shows, what it holds, what it logs. */
function shell({ focused = false }: { focused?: boolean } = {}) {
	const mainFile = fileURLToPath(new URL("../electron/main.cjs", import.meta.url));
	const mainRequire = createRequire(mainFile);
	const files = new Map<string, string>();
	const shown: { title: string; body: string }[] = [];
	const logged: string[] = [];
	class FakeNotification {
		static isSupported = () => true;
		constructor(readonly options: { title: string; body: string }) {}
		on() {}
		show() {
			// The options come from the shell's VM realm; plain objects for the assertions.
			shown.push(JSON.parse(JSON.stringify(this.options)));
		}
	}
	const electron = {
		app: { setName() {}, getPath: () => "/fixture/LearnHarness", setPath() {}, requestSingleInstanceLock: () => false, quit() {} },
		BrowserWindow: { getFocusedWindow: () => (focused ? {} : null), getAllWindows: () => [] },
		Notification: FakeNotification,
	};
	const fs = {
		...mainRequire("node:fs"),
		readFileSync: (file: string) => {
			if (!files.has(file)) throw new Error("ENOENT");
			return files.get(file);
		},
		writeFileSync: (file: string, data: string) => void files.set(file, data),
		mkdirSync() {},
		appendFileSync: (_file: string, line: string) => void logged.push(line.trim()),
	};
	const context = {
		require: (id: string) => (id === "electron" ? electron : id === "node:fs" ? fs : mainRequire(id)),
		process: { argv: [], env: {}, on() {} },
		console: { log() {} },
		__dirname: dirname(mainFile),
	};
	runInNewContext(readFileSync(mainFile, "utf8"), context, { filename: mainFile });
	const show = (notice: object) => runInNewContext("showNotice", context)(notice, "http://127.0.0.1:9000");
	return { show, shown, logged, files };
}

describe("the shell shows each notice at most once", () => {
	const plan = { id: "plan:2026-11-19", title: "Today", body: "Review Binomial distribution", href: "/", away: false };
	const map = { id: "map:/study/la:t", title: "Linear Algebra", body: NOTICE_WORDS.mapReady, href: "/unit/x", away: true };

	it("today's plan once a day, kept across relaunches, and logged", () => {
		const s = shell();
		s.show(plan);
		s.show(plan);
		assert.deepEqual(s.shown, [{ title: "Today", body: "Review Binomial distribution" }]);
		assert.deepEqual(JSON.parse(s.files.get("/fixture/LearnHarness/notices.json")!), { plan: "plan:2026-11-19" });
		assert.ok(s.logged.some((l) => l.includes('notice shown: plan:2026-11-19 "Today" — Review Binomial distribution → /')), s.logged.join("\n"));
		assert.ok(s.logged.some((l) => l.includes("notice held: plan:2026-11-19 (already shown)")));
	});

	it("work he started only while no window of the app is focused, once per job", () => {
		const here = shell({ focused: true });
		here.show(map);
		assert.deepEqual(here.shown, []);
		assert.ok(here.logged.some((l) => l.includes("(a window is focused)")));
		const away = shell();
		away.show(map);
		away.show(map);
		assert.equal(away.shown.length, 1);
	});

	it("never a notice whose place is not the app's own", () => {
		const s = shell();
		s.show({ ...map, id: "x", href: "https://example.com" });
		s.show({ ...map, id: "y", href: "//example.com" });
		assert.deepEqual(s.shown, []);
	});
});
