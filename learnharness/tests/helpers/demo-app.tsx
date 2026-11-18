/**
 * The whole app in this process, over the Logbook's seeded demo world
 * (`~/.config/logbook/adapters/journal/seed`, 8 Nov 2026): the real
 * engine on a fresh copy of the world, every `/api` route the pages fetch
 * answered by its own handler, the server's event bus wired into the
 * window's channel, and the pages mounted inside the app shell with its
 * sidebar, as app/layout.tsx mounts them. No tutor turn runs: a save is
 * the tutor's `course_save` written as a turn writes it (the engine's
 * save, then the call and its receipt in the session's record), so every
 * surface reads what a lesson would have left.
 *
 * Import this module before any app module: the app reads its data folder
 * and engine once, at its first import, and `openDemoApp` sets them.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import { dom } from "./radix-dom.ts";
// next/link reaches for `self` when a link mounts.
(globalThis as Record<string, unknown>).self = globalThis;
import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import type { CalendarEntry } from "../../components/calendar/calendar-facts.ts";
import type { CalendarListing, ChatListItem } from "../../src/core/index.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** The journal checkout this app lives in: its `learning` is the engine. */
const REPO = path.resolve(HERE, "../../..");
const API = path.resolve(HERE, "../../app/api");
/** The Logbook's demo world seed (`seed.sh`), or another one named by `LH_DEMO_SEED`. */
export const SEED = process.env.LH_DEMO_SEED ?? path.join(os.homedir(), ".config", "logbook", "adapters", "journal", "seed");

/** The interpreter with the engine's packages: the app's own setting, else
 *  the checkout's `.venv`, else its main worktree's (a worktree has none). */
function enginePython(): string | null {
	const candidates = [process.env.LH_LEARNING_PYTHON, path.join(REPO, ".venv", "bin", "python")];
	try {
		const common = execFileSync("git", ["-C", REPO, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" }).trim();
		candidates.push(path.join(path.dirname(common), ".venv", "bin", "python"));
	} catch {}
	return candidates.find((p): p is string => !!p && fs.existsSync(p)) ?? null;
}

/** Why the demo world can't be seeded here, or null when it can. */
export function demoWorldMissing(): string | null {
	if (!fs.existsSync(path.join(SEED, "seed.sh"))) return `no demo world seed at ${SEED}`;
	if (!enginePython()) return "no Python with the learning engine's packages";
	return null;
}

// linkedom lays nothing out: every one-line label fits whole (MathLine
// measures scrollWidth against clientWidth), and the browser stores the
// window keeps are in memory.
Object.defineProperty(dom.window.HTMLElement.prototype, "scrollWidth", { configurable: true, get: () => 0 });
Object.defineProperty(dom.window.HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 10_000 });
Object.assign(dom.window.HTMLElement.prototype, { scrollTo() {}, scrollBy() {} });
function memoryStorage(): Storage {
	const kept = new Map<string, string>();
	return {
		get length() {
			return kept.size;
		},
		key: (i: number) => [...kept.keys()][i] ?? null,
		getItem: (k: string) => kept.get(k) ?? null,
		setItem: (k: string, v: string) => void kept.set(k, String(v)),
		removeItem: (k: string) => void kept.delete(k),
		clear: () => kept.clear(),
	};
}
// The lesson's page reads the window's address for a message to jump to: it opens with none.
if (!(dom.window as { location?: unknown }).location) {
	const location = new URL("http://localhost/");
	Object.defineProperty(dom.window, "location", { value: location, configurable: true, writable: true });
	Object.defineProperty(globalThis, "location", { value: location, configurable: true, writable: true });
}
const media = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
for (const [key, value] of Object.entries({ localStorage: memoryStorage(), sessionStorage: memoryStorage(), matchMedia: media })) {
	Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
	Object.defineProperty(dom.window, key, { value, configurable: true, writable: true });
}

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response> | Response;

/** The route module that answers `pathname`, as Next's app router finds it. */
async function routeOf(pathname: string): Promise<{ mod: Record<string, Handler>; params: Record<string, string> } | null> {
	let dir = API;
	const params: Record<string, string> = {};
	for (const part of pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean)) {
		if (fs.existsSync(path.join(dir, part))) {
			dir = path.join(dir, part);
			continue;
		}
		const dynamic = fs.readdirSync(dir).find((d) => /^\[[^.\]]+\]$/.test(d));
		if (!dynamic) return null;
		params[dynamic.slice(1, -1)] = decodeURIComponent(part);
		dir = path.join(dir, dynamic);
	}
	const file = path.join(dir, "route.ts");
	return fs.existsSync(file) ? { mod: (await import(file)) as Record<string, Handler>, params } : null;
}

/** One line of Home's Today as drawn: its course, its lesson, its status. */
export interface HomeLine {
	el: Element;
	course: string;
	title: string;
	status: string;
	/** The kind of a new topic's reason its mark gives in place of its plain words (`data-starts`), else null. */
	starts: string | null;
	text: string;
}

/** One card on the sidebar: its title and its status, and the shelf it is on ("" for the top). */
export interface SidebarCard {
	el: Element;
	title: string;
	status: string;
	shelf: string;
	text: string;
}

/** What `lookAt` says of a press that starts a new session. */
export const NEW_SESSION = "a new session";

export const text = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

export type DemoApp = Awaited<ReturnType<typeof openDemoApp>>;

/**
 * Seeds the demo world into a fresh folder, points the app and its engine
 * at it, and returns the app. `days` is the study day to start on.
 */
export async function openDemoApp(day = "2026-11-08") {
	const python = enginePython()!;
	// LH_DEMO_WORLD keeps one seeded world across runs while a check is being written: it is seeded once, and
	// what a run saves stays in it. Unset, every run seeds its own.
	const kept = process.env.LH_DEMO_WORLD;
	const root = kept ? path.resolve(kept) : fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-demo-app-")));
	const world = path.join(root, "world");
	if (!kept || !fs.existsSync(path.join(world, "sessions.json"))) {
		fs.mkdirSync(root, { recursive: true });
		await promisify(execFile)("bash", [path.join(SEED, "seed.sh")], {
			env: { PATH: process.env.PATH ?? "/usr/bin:/bin", SB: world, ENGINE: REPO, PY: python } as unknown as NodeJS.ProcessEnv,
			maxBuffer: 16 << 20,
		});
	}
	// Every sidebar shelf open, so each card can be read where it is filed.
	localStorage.setItem("lh:topic-sidebar-folded", JSON.stringify({ sessions: false }));
	Object.assign(process.env, {
		HOME: path.join(world, "home"),
		VAULT_DIR: path.join(world, "vault"),
		LH_DATA_DIR: path.join(world, "data"),
		LH_LEARNING_ENGINE: REPO,
		LH_LEARNING_PYTHON: python,
		LEARNING_TODAY: day,
		PYTHONDONTWRITEBYTECODE: "1",
	});

	const { createRoot } = await import("./app-render.tsx");
	const { AppRouterContext } = await import("next/dist/shared/lib/app-router-context.shared-runtime");
	const { PathnameContext, SearchParamsContext } = await import("next/dist/shared/lib/hooks-client-context.shared-runtime");
	const { ServerEventsProvider } = await import("../../components/server-events.tsx");
	const { AppShell, SidebarProvider } = await import("../../components/sidebar.tsx");
	const { ActivityProvider } = await import("../../components/activity-dock.tsx");
	const { AppearanceProvider } = await import("../../components/settings/appearance.tsx");
	const { StudyHome } = await import("../../components/study-home/study-home.tsx");
	const { UnitPage } = await import("../../components/unit-inbox/unit-page.tsx");
	const { CoursePage } = await import("../../components/course-page/course-page.tsx");
	const { workspaceOf } = await import("../../components/unit-inbox/unit-href.ts");
	const { forgetStudyHome } = await import("../../components/study-home/use-study-home.ts");
	const { subscribe, emit } = await import("../../src/core/events.ts");
	const { stores } = await import("../../src/server/stores.ts");
	const { newDoneTonightMessage } = await import("../../src/core/native-messages.ts");
	const { withDayWords } = await import("../../src/core/day-words.ts");
	const { calendarEntries } = await import("../../components/calendar/calendar-facts.ts");
	const { CalendarEntryView } = await import("../../components/calendar/calendar-entry.tsx");
	const { TooltipProvider } = await import("../../components/ui/tooltip.tsx");
	const { default: ChatPage } = await import("../../app/chat/[id]/page.tsx");
	const { inputAppends, tonightAppends } = await import("../../src/core/input-events.ts");
	const { danglingQuestionOf } = await import("../../src/core/native-messages.ts");
	const { newQuestionRepose } = await import("../../src/core/native-messages.ts");
	const { planTools } = await import("../../src/agent/tools/plan.ts");

	// Every fetch the pages make, answered by the route that answers it in the app. A read can be held
	// (`hold`) to stand for a slow engine read.
	let inFlight = 0;
	const held = new Map<string, Array<() => void>>();
	const holding = new Set<string>();
	const requests: string[] = [];
	let looking = false;
	/** While a survey reads, the answer each read got, which every page that makes the same read shares:
	 *  nothing writes between them, so each gets what it would have read itself. */
	let shared: Map<string, Promise<{ status: number; body: string }>> | null = null;
	/** The sessions a look-only press asked to start, oldest first. */
	const started: Record<string, unknown>[] = [];
	/** The tutor turns a page asked for (`POST /api/chat`), each refused: no turn runs in this world. */
	const turns: Array<{ chatId: string; body: Record<string, unknown> }> = [];
	const fetchApp = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
		const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url, "http://localhost");
		const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
		requests.push(`${method} ${url.pathname}${url.search}`);
		// A press made only to see where it goes starts no session: the start is recorded and refused.
		if (looking && method === "POST" && url.pathname === "/api/chats") {
			started.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
			return Response.json({ error: "a look, not a start", code: "look" }, { status: 409 });
		}
		// Nor does the process of a turn: the next answer's prestart starts nothing here.
		if (method === "POST" && /^\/api\/chats\/[^/]+\/prestart$/.test(url.pathname)) return Response.json({ ok: true });
		if (method === "POST" && url.pathname === "/api/chat") {
			const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
			turns.push({ chatId: String(body.chatId ?? body.id ?? ""), body });
			return Response.json({ error: "no tutor turn runs in the demo world", code: "demo" }, { status: 503 });
		}
		// A held read is not in flight: the page is meant to settle without it.
		if (holding.has(url.pathname)) await new Promise<void>((resolve) => held.set(url.pathname, [...(held.get(url.pathname) ?? []), resolve]));
		const kept = method === "GET" && shared ? `${url.pathname}${url.search}` : null;
		const reply = kept ? shared?.get(kept) : undefined;
		if (reply) return reply.then(({ status, body }) => new Response(body, { status, headers: { "content-type": "application/json" } }));
		inFlight++;
		let done: (r: { status: number; body: string }) => void = () => {};
		if (kept) shared!.set(kept, new Promise((resolve) => (done = resolve)));
		try {
			const found = await routeOf(url.pathname);
			const handler = found?.mod[method];
			if (!handler) return Response.json({ error: `no ${method} ${url.pathname}` }, { status: 404 });
			const response = await handler(new Request(url, init), { params: Promise.resolve(found.params) });
			// The world has no Claude account and no turn runs: the account reads as signed in, so a start
			// creates its session instead of opening sign-in.
			const answer = url.pathname === "/api/models" && response.ok ? Response.json({ ...((await response.json()) as object), connected: true }) : response;
			if (kept) done({ status: answer.status, body: await answer.clone().text() });
			return answer;
		} finally {
			inFlight--;
		}
	};
	Object.defineProperty(globalThis, "fetch", { value: fetchApp, configurable: true, writable: true });

	// The window's channel: the server's own event bus, as /api/events streams it.
	const channel = () => {
		const named = new Map<string, (raw: string) => void>();
		const off = subscribe(({ type, ...payload }) => named.get(type)?.(JSON.stringify(payload)));
		return {
			onEvent(name: string, cb: (raw: string) => void) {
				named.set(name, cb);
			},
			onOpen() {},
			close: off,
		};
	};

	let mounted: { root: ReturnType<typeof createRoot>; host: HTMLElement } | null = null;
	/** Every page the router was asked to open, oldest first. */
	const pushed: string[] = [];
	/** The lesson's own page while `lesson` has one open, as app/chat/[id]/page.tsx makes it; else a stand-in. */
	let lessonPage: React.ReactNode = null;
	const router = { push: (href: string) => void pushed.push(href), replace: (href: string) => void pushed.push(href), prefetch() {}, back() {}, forward() {}, refresh() {} };

	function page(pathname: string): React.ReactNode {
		if (pathname === "/") return <StudyHome />;
		// A lesson's own page is not drawn here: he is in it, and the rest of the window is the shell's.
		if (pathname.startsWith("/chat/")) return lessonPage ?? <main data-slot="lesson-stand-in" />;
		const unit = /^\/unit\/([^/]+)(?:\/([^/]+))?$/.exec(pathname);
		const workspace = unit && workspaceOf(unit[1]!);
		if (unit && workspace) return unit[2] ? <UnitPage key={pathname} workspace={workspace} handle={decodeURIComponent(unit[2])} /> : <CoursePage key={pathname} workspace={workspace} />;
		throw new Error(`the demo app draws no page at ${pathname}`);
	}

	/** Waits until no read is in flight for a while, and `ready` holds. */
	async function settle(ready: () => boolean = () => true, timeoutMs = 60_000) {
		const start = Date.now();
		let quietSince = 0;
		while (Date.now() - start < timeoutMs) {
			await act(async () => new Promise((r) => setTimeout(r, 50)));
			if (inFlight > 0 || !ready()) {
				quietSince = 0;
				continue;
			}
			quietSince ||= Date.now();
			if (Date.now() - quietSince >= 400) return;
		}
		throw new Error(`the page did not settle in ${timeoutMs} ms (reads in flight: ${inFlight})`);
	}

	async function unmount() {
		if (!mounted) return;
		const { root, host } = mounted;
		await act(async () => root.unmount());
		host.remove();
		mounted = null;
	}

	/** Opens `pathname` in a new window, as a visit does: the shell and its sidebar, then the page, its
	 *  reads landed. `fresh` forgets what an earlier visit to Home read, as a new window would. */
	async function visit(pathname: string, { fresh = false, ready }: { fresh?: boolean; ready?: () => boolean } = {}) {
		await unmount();
		if (fresh) forgetStudyHome();
		const host = document.createElement("div");
		document.body.appendChild(host);
		const root = createRoot(host);
		mounted = { root, host };
		await navigate(pathname, { ready });
	}

	/** Goes to `pathname` in the open window: the shell and its sidebar stay as they are, the page changes. */
	async function navigate(pathname: string, { ready }: { ready?: () => boolean } = {}) {
		if (!mounted) throw new Error("no window is open");
		const { root } = mounted;
		await act(async () =>
			root.render(
				<AppRouterContext.Provider value={router as never}>
					<PathnameContext.Provider value={pathname}>
						<SearchParamsContext.Provider value={new URLSearchParams() as never}>
							<ServerEventsProvider connect={channel as never}>
								<AppearanceProvider>
									<SidebarProvider initial={{ open: true, width: 320 }}>
										<ActivityProvider>
											<AppShell>{page(pathname)}</AppShell>
										</ActivityProvider>
									</SidebarProvider>
								</AppearanceProvider>
							</ServerEventsProvider>
						</SearchParamsContext.Provider>
					</PathnameContext.Provider>
				</AppRouterContext.Provider>,
			),
		);
		if (ready) await settle(ready);
	}

	/** Opens several pages side by side, each in a window of its own with no sidebar, `batch` at a time so
	 *  their reads run together, and hands each to `read` once `ready` holds in it. */
	async function visitEach<T>(pathnames: readonly string[], ready: (page: Element) => boolean, read: (page: Element, pathname: string) => Promise<T> | T, batch = 16): Promise<T[]> {
		await unmount();
		const out: T[] = [];
		for (let i = 0; i < pathnames.length; i += batch) {
			const group = pathnames.slice(i, i + batch).map((pathname) => {
				const host = document.createElement("div");
				document.body.appendChild(host);
				return { pathname, host, root: createRoot(host) };
			});
			await act(async () => {
				for (const { pathname, host, root } of group) {
					void host;
					root.render(
						<AppRouterContext.Provider value={router as never}>
							<PathnameContext.Provider value={pathname}>
								<SearchParamsContext.Provider value={new URLSearchParams() as never}>
									<ServerEventsProvider connect={channel as never}>
										<AppearanceProvider>
											<SidebarProvider initial={{ open: true, width: 320 }}>
												<ActivityProvider>{page(pathname)}</ActivityProvider>
											</SidebarProvider>
										</AppearanceProvider>
									</ServerEventsProvider>
								</SearchParamsContext.Provider>
							</PathnameContext.Provider>
						</AppRouterContext.Provider>,
					);
				}
			});
			try {
				await settle(() => group.every(({ host }) => ready(host)));
				for (const { pathname, host } of group) out.push(await read(host, pathname));
			} finally {
				for (const { root, host } of group) {
					await act(async () => root.unmount());
					host.remove();
				}
			}
		}
		return out;
	}

	/** Home's Today, as drawn. */
	function homeLines(): HomeLine[] {
		return [...document.querySelectorAll('[data-slot="today-line"]')].map((el) => {
			const [course, title] = [...el.children].filter((c) => c.matches("span.block")).map(text);
			const status = text(el.querySelector('[data-slot="why-mark"], [data-slot="today-standing"], [data-slot="today-why"]'));
			const starts = el.querySelector('[data-slot="today-why"]')?.getAttribute("data-starts") ?? null;
			return { el, course: course ?? "", title: title ?? "", status, starts, text: text(el) };
		});
	}

	/** The sidebar's cards and shelf rows, top first, each with the shelf it sits on. */
	function sidebarCards(): SidebarCard[] {
		return [...document.querySelectorAll('[data-slot="unit-card"], [data-slot="unit-slim"], [data-testid="session-row"]')].map((el) => ({
			el,
			title: text(el.querySelector('[data-slot="unit-row-title"]')),
			status: text(el.querySelector('[data-slot="unit-status-slot"]')).replace(/^,\s*/, ""),
			shelf: text(el.closest('[data-slot="unit-shelf"]')?.querySelector('[data-slot="unit-section-header"]')),
			text: text(el),
		}));
	}

	/** Presses `el`, a link or a button. */
	async function click(el: Element) {
		await act(async () => {
			el.dispatchEvent(new dom.window.Event("click", { bubbles: true, cancelable: true }) as unknown as Event);
		});
	}

	/** Where a press on `el` goes, without going there: a link's page, the page the router is sent to, or
	 *  "a new session" when the press starts one (refused, so nothing is created). */
	async function lookAt(el: Element): Promise<string | null> {
		const link = el.closest("a[href]") ?? el.querySelector(":scope a[href]");
		if (link) return link.getAttribute("href");
		const [pushes, starts] = [pushed.length, started.length];
		looking = true;
		try {
			await click(el);
			await settle(() => pushed.length > pushes || started.length > starts, 30_000).catch(() => {});
		} finally {
			looking = false;
		}
		if (pushed.length > pushes) return pushed.at(-1)!;
		return started.length > starts ? NEW_SESSION : null;
	}

	/** Presses `el` for real and returns the page it opened (a new session's included). */
	async function press(el: Element): Promise<string | null> {
		const link = el.closest("a[href]") ?? el.querySelector(":scope a[href]");
		if (link) return link.getAttribute("href");
		const pushes = pushed.length;
		await click(el);
		await settle(() => pushed.length > pushes, 60_000).catch(() => {});
		return pushed.length > pushes ? pushed.at(-1)! : null;
	}

	/** The calendar as its page reads it (`/api/calendar` and `/api/chats`, then `calendarEntries`), each
	 *  entry `pick` keeps drawn by the calendar's own entry, its panel opened: the face, the panel's words,
	 *  and where its action goes. */
	async function calendar(pick: (entry: CalendarEntry, today: string) => boolean) {
		await unmount();
		const listing = (await (await fetchApp("/api/calendar")).json()) as CalendarListing;
		const { chats: list } = (await (await fetchApp("/api/chats")).json()) as { chats: ChatListItem[] };
		if (!listing.available) throw new Error(`the calendar could not read the courses: ${listing.reason}`);
		const today = listing.courses[0]!.map.today;
		const drawn: Array<{ entry: CalendarEntry; face: string; detail: string; opens: string | null }> = [];
		for (const entry of calendarEntries({ courses: listing.courses, chats: list, scope: null }).filter((e) => pick(e, today))) {
			const host = document.createElement("div");
			document.body.appendChild(host);
			const root = createRoot(host);
			mounted = { root, host };
			let opened: string | null = null;
			const onStart = () => void (opened = NEW_SESSION);
			await act(async () =>
				root.render(
					<AppRouterContext.Provider value={router as never}>
						<TooltipProvider>
							<CalendarEntryView entry={entry} today={today} onStart={onStart} />
						</TooltipProvider>
					</AppRouterContext.Provider>,
				),
			);
			const face = host.querySelector('[data-slot="calendar-entry"]')!;
			const faceWords = text(face);
			let detail = "";
			if (entry.kind !== "session") {
				await click(face);
				const panel = document.querySelector('[data-slot="calendar-entry-detail"]');
				detail = text(panel);
				const action = panel?.querySelector('[data-slot="calendar-entry-start"], [data-slot="exam-next"] a[href], a[href^="/chat/"]');
				if (action?.matches("a[href]")) opened = action.getAttribute("href");
				else if (action) await click(action);
			} else opened = face.getAttribute("href");
			drawn.push({ entry, face: faceWords, detail, opens: opened });
			await unmount();
		}
		return { today, courses: listing.courses, chats: list, drawn };
	}

	const chats = () => stores.chatStore.listChats();
	const record = (id: string) => {
		const chat = stores.chatStore.getChat(id);
		if (!chat) throw new Error(`no session ${id}`);
		return chat;
	};
	let n = 0;
	const stamp = () => Date.parse(`${process.env.LEARNING_TODAY}T10:00:00Z`) + ++n * 60_000;
	const usage = { input: 10, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: 20, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
	const assistant = (content: unknown[], stopReason: "toolUse" | "stop") => ({ id: `msg_n6_${++n}`, role: "assistant", content, api: "anthropic-messages", provider: "anthropic", model: "claude-opus-5-5", usage, stopReason, timestamp: stamp() });
	const append = (id: string, ...messages: unknown[]) => {
		stores.chatStore.saveMessages(id, [...record(id).messages, ...(messages as never[])]);
		emit("record-changed", { chatId: id });
		emit("turn-settled", { chatId: id });
	};

	return {
		root,
		world,
		requests,
		pushed,
		/** Runs `read` with every repeated read answered once (`shared`), and forgets the answers after. */
		async reading<T>(read: () => Promise<T>): Promise<T> {
			shared = new Map();
			try {
				return await read();
			} finally {
				shared = null;
			}
		},
		visit,
		navigate,
		visitEach,
		settle,
		unmount,
		homeLines,
		sidebarCards,
		calendar,
		press,
		lookAt,
		click,
		started,
		turns,
		/** Opens session `id`'s own page in a new window, its record as it is now, and hands its page to `read`
		 *  once it has settled. Any turn it asks for is refused and recorded (`turns`). */
		async lesson<T>(href: string, read: (page: Element) => T | Promise<T>): Promise<T> {
			const [pathname, search = ""] = href.split("?");
			const id = pathname!.replace(/^\/chat\//, "");
			lessonPage = await ChatPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve(Object.fromEntries(new URLSearchParams(search))) });
			try {
				await visit(pathname!, { ready: () => !!document.querySelector('[data-slot="composer"], [data-slot="prose-question"], [data-slot="learner-bubble"]') });
				return await read(mounted!.host);
			} finally {
				lessonPage = null;
				await unmount();
			}
		},
		chats,
		record,
		/** Turns the study day over, as the next morning does. */
		day(next: string) {
			process.env.LEARNING_TODAY = next;
			for (const c of chats()) if (c.course) emit("course-changed", { workspace: c.course.workspace });
		},
		/** The tutor's `course_save` in session `id`, as a turn writes it: the engine's save, then the call
		 *  and its receipt in the session's record. */
		async save(id: string, changes: Record<string, unknown>) {
			const chat = record(id);
			if (!chat.course) throw new Error(`session ${id} has no course`);
			const result = await stores.courseRecords.run(chat.course.workspace, { verb: "save", changes } as never);
			if (!result.ok) throw new Error(`the engine refused the save in ${id}: ${result.message}`);
			const call = `toolu_n6_${++n}`;
			const receipt = JSON.stringify(withDayWords(result.json, process.env.LEARNING_TODAY!));
			append(
				id,
				assistant([{ type: "toolCall", id: call, name: "course_save", arguments: { changes } }], "toolUse"),
				{ id: `msg_n6_${++n}`, role: "toolResult", toolCallId: call, toolName: "course_save", content: [{ type: "text", text: receipt }], details: receipt, isError: false, timestamp: stamp() },
			);
			return result.json as Record<string, unknown>;
		},
		/** The tutor's first `plan_init` in session `id`, run through the real tool (its tree and the name it
		 *  gives the session), then the call and its receipt in the session's record. */
		async plan(id: string, mermaid: string, goal: { title: string; topic?: string }) {
			const chat = record(id);
			const course = chat.course ? { course: chat.course, records: stores.courseRecords, arcs: false } : undefined;
			const call = `toolu_n6_${++n}`;
			const result = await planTools({ chatId: id, chatStore: stores.chatStore, course: course as never }).plan_init!.execute(call, { mermaid, goal } as never);
			const receipt = (result as { content?: unknown }).content ?? [{ type: "text", text: "{}" }];
			append(
				id,
				assistant([{ type: "toolCall", id: call, name: "plan_init", arguments: { mermaid, goal } }], "toolUse"),
				{ id: `msg_n6_${++n}`, role: "toolResult", toolCallId: call, toolName: "plan_init", content: receipt, details: {}, isError: false, timestamp: stamp() },
			);
		},
		/** The tutor poses a question in session `id` and waits on him; returns the call, its tool and arguments. */
		pose(id: string, question: string) {
			const call = { tool: "explain", input: { type: "check", question, correctAnswer: "-" } };
			append(id, assistant([{ type: "text", text: "Next one." }, { type: "toolCall", id: `toolu_n6_${++n}`, name: call.tool, arguments: call.input }], "toolUse"));
			return call;
		},
		/** His Done for today in session `id`, as the app writes it (`tonightAppends`): each open question set
		 *  aside, an open problem dropped, then the marker. The tutor's close is `closes`. */
		leave(id: string) {
			append(id, ...tonightAppends(record(id)).map((m) => ({ ...m, timestamp: stamp() })));
		},
		/** The tutor's close in session `id`, as eb91503c's turns recorded it (round 14, 2 D2): its
		 *  `lesson_progress` with `close`, then its closing words through `send_to_user`, each with its receipt.
		 *  Then the turn ends (`end: "stop"`); or the tutor poses `end`, a question, as its last call, waiting
		 *  on him (1 M1, 2 D2: "course_save → lesson_progress {close: true} → send_to_user → explain"); or the
		 *  turn ends and the app poses the calls `end.repose` again from their own call under a new id, as
		 *  eb91503c's server did once the close settled (round 12, 3 n10; round 14, 3 M1, 4 minor 5). */
		closes(id: string, words: string, end: "stop" | { tool: string; input: unknown } | { repose: Array<{ tool: string; input: unknown }> } = "stop") {
			const receipt = (name: string, call: string, text: string) => ({ id: `msg_n6_${++n}`, role: "toolResult", toolCallId: call, toolName: name, content: [{ type: "text", text }], details: {}, isError: false, timestamp: stamp() });
			const progress = `toolu_n6_${++n}`;
			const send = `toolu_n6_${++n}`;
			append(
				id,
				assistant([{ type: "toolCall", id: progress, name: "lesson_progress", arguments: { done: [], close: true } }], "toolUse"),
				receipt("lesson_progress", progress, "Progress recorded."),
				assistant([{ type: "toolCall", id: send, name: "send_to_user", arguments: { message: words } }], "toolUse"),
				receipt("send_to_user", send, "Message received for display."),
				...(typeof end === "object" && "tool" in end
					? [assistant([{ type: "toolCall", id: `toolu_n6_${++n}`, name: end.tool, arguments: end.input }], "toolUse")]
					: [assistant([{ type: "text", text: "" }], "stop"), ...(typeof end === "object" ? [{ ...newQuestionRepose(end.repose as never), timestamp: stamp() }] : [])]),
			);
		},
		/** His answer to the question open in session `id`, as the app records it (`inputAppends`): a check
		 *  answered in `words`, or `pick`, the 1-based option he picks on an ask. His pick of an option the tutor
		 *  marked `stops` is his Done for today. */
		answer(id: string, reply: { words: string } | { pick: number }) {
			const open = danglingQuestionOf(record(id).messages);
			if (!open) throw new Error(`no question waits in ${id}`);
			const options = (open.input as { options?: Array<{ label: string }> }).options ?? [];
			const answer = "pick" in reply
				? { kind: "ask", answers: [{ index: reply.pick, label: options[reply.pick - 1]!.label, value: options[reply.pick - 1]!.label }] }
				: { kind: "explain", text: reply.words, confidence: "confident" };
			append(id, ...inputAppends(record(id), { type: "answer", toolCallId: open.toolCallId, answer } as never).map((m) => ({ ...m, timestamp: stamp() })));
		},
		/** The tutor's choice after the lesson's last step (round 15, M1: "That finishes the … lesson", then
		 *  practice or "Stop here for today", the option it marks as ending the session). */
		offerStop(id: string, question: string) {
			append(id, assistant([{ type: "toolCall", id: `toolu_n6_${++n}`, name: "ask_user_question", arguments: { question, options: [{ label: "Yes, practice now" }, { label: "Stop here for today", stops: true }] } }], "toolUse"));
		},
		/** His message in session `id`. */
		say(id: string, words: string) {
			append(id, { id: `msg_n6_${++n}`, role: "user", content: words, timestamp: stamp() });
		},
		/** His Done for today in session `id`, and the tutor's close. */
		doneForToday(id: string, close = "Good place to stop for today.") {
			append(id, { ...newDoneTonightMessage("teacher"), timestamp: stamp() }, assistant([{ type: "text", text: close }], "stop"));
		},
		/** Holds every read of `pathname` until `release`, as a slow engine read does. */
		hold(pathname: string) {
			holding.add(pathname);
			return () => {
				holding.delete(pathname);
				for (const resolve of held.get(pathname) ?? []) resolve();
				held.delete(pathname);
			};
		},
		async close() {
			await unmount();
			if (!kept) fs.rmSync(root, { recursive: true, force: true });
		},
	};
}
