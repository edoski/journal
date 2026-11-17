/**
 * The topic page has the course page's composer at its foot, with the topic
 * already chosen (audit 17 Nov 2026, parity gap; Edo's default): the same
 * part, compact, and sending from it starts a lesson in the course on the
 * topic through the page's one start, whose failure the head says. Before,
 * the topic page had no composer: a new lesson started from New lesson.
 */
import "./helpers/radix-dom.ts";
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
// Next's Link schedules its prefetch on `self`, which the test DOM lacks.
Object.defineProperty(globalThis, "self", { value: globalThis, configurable: true, writable: true });
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createRoot, type Root } from "./helpers/app-render.tsx";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { dom } from "./helpers/radix-dom.ts";
import type { CourseMapTopic, StudyCourse, TopicHandle } from "../src/core/index.ts";

class MemoryStorage {
	private map = new Map<string, string>();
	get length() { return this.map.size; }
	key(i: number) { return [...this.map.keys()][i] ?? null; }
	getItem(k: string) { return this.map.get(k) ?? null; }
	setItem(k: string, v: string) { this.map.set(k, v); }
	removeItem(k: string) { this.map.delete(k); }
	clear() { this.map.clear(); }
}
Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });
Object.defineProperty(globalThis, "sessionStorage", { value: new MemoryStorage(), configurable: true });

const { ServerEventsProvider } = await import("../components/server-events.tsx");
const { TopicPage } = await import("../components/unit-inbox/topic-page/topic-page.tsx");
const { CourseComposer } = await import("../components/course-page/course-composer.tsx");
const { useLessonStart } = await import("../components/start/use-lesson-start.ts");
const { StartScope } = await import("../components/start/start-scope.tsx");

const FAILURE = "Couldn’t open the session. Try again.";
const h = (handle: string) => handle as TopicHandle;
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const RANK: CourseMapTopic = { handle: h("rank"), title: "Rank", level: "assisted", introduced: "2026-11-01", review: null, weak: false, signals: QUIET, tasks: [] };
const COURSE: StudyCourse = {
	map: { workspace: "/study/linalg", title: "Linear Algebra", today: "2026-11-08", revision: 1, exam: null, current: h("rank"), focus: null, tasks: [], topics: [RANK], edges: [] },
	unready: null,
	due: [],
	lastActiveDaysAgo: 0,
	newToday: [],
};

/** What the app's server answers, and what was asked of it. */
const server = { opens: true, created: [] as { title: string; course: { workspace: string }; topics?: string[] }[] };
const originalFetch = globalThis.fetch;
beforeEach(() => {
	Object.assign(server, { opens: true, created: [] });
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const path = String(input);
		if (path.startsWith("/api/models")) return Response.json({ account: "claude-subscription", connected: true, contextWindow: 8192 });
		if (path.startsWith("/api/topic?")) return Response.json({ ok: true, record: null, plans: [] });
		if (path === "/api/chats" && init?.method === "POST") {
			server.created.push(JSON.parse(String(init.body)) as (typeof server.created)[number]);
			return server.opens ? Response.json({ id: "chat_opened" }) : new Response("engine down", { status: 500 });
		}
		return new Response("{}", { status: 404 });
	}) as typeof fetch;
});

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(async () => {
	await act(async () => root?.unmount());
	host?.remove();
	root = host = undefined;
	globalThis.fetch = originalFetch;
});

const settle = () => act(async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); });

async function mount(node: React.ReactNode) {
	const pushed: string[] = [];
	const router = { push: (href: string) => pushed.push(href), replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };
	host = dom.document.createElement("div");
	dom.document.body.append(host);
	root = createRoot(host);
	await act(async () =>
		root!.render(
			<ServerEventsProvider connect={() => ({ close() {}, onOpen() {}, onEvent() {} })}>
				<AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>
			</ServerEventsProvider>,
		),
	);
	await settle();
	return pushed;
}

const topicPage = () => <TopicPage course={COURSE} courses={[COURSE]} topic={RANK} chats={[]} />;

/** The course page's composer, under its page's one start. */
function CoursePageComposer() {
	const lesson = useLessonStart();
	return (
		<StartScope lesson={lesson}>
			<CourseComposer course={{ workspace: COURSE.map.workspace, title: COURSE.map.title }} />
		</StartScope>
	);
}

/** A part's anatomy: each element's tag, slot and classes, its words and placeholder left out. */
function anatomy(el: Element): string {
	const own = `${el.tagName}[${el.getAttribute("data-slot") ?? ""}](${el.getAttribute("class") ?? ""})`;
	return `${own}{${[...el.children].map(anatomy).join(",")}}`;
}

async function send(words: string) {
	const form = host!.querySelector<HTMLFormElement>('[data-slot="course-composer"] [data-slot="composer"]')!;
	const field = form.querySelector("textarea")!;
	await act(async () => {
		Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value")!.set!.call(field, words);
		field.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
	});
	await act(async () => form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
	await settle();
}

describe("the topic page's composer", () => {
	it("is the course page's composer, compact, at the page's foot, its placeholder naming the topic", async () => {
		await mount(<CoursePageComposer />);
		const course = anatomy(host!.querySelector('[data-slot="course-composer"]')!);
		await act(async () => root?.unmount());
		host?.remove();
		await mount(topicPage());
		const page = host!.querySelector('[data-testid="unit-page"]')!;
		const composer = page.querySelector('[data-slot="course-composer"]');
		assert.ok(composer, "the topic page draws the course page's composer");
		assert.ok(page.lastElementChild === composer, "at the page's foot");
		assert.equal(anatomy(composer), course, "the same part, compact as on the course page");
		assert.equal(composer.querySelector("textarea")!.getAttribute("placeholder"), "Ask a question or paste a problem on Rank");
	});

	it("starts a lesson in the course on the topic", async () => {
		const pushed = await mount(topicPage());
		await send("Why is the rank of a product at most the smaller rank?");
		assert.deepEqual(server.created.map(({ title, course, topics }) => ({ title, workspace: course.workspace, topics })), [
			{ title: "Why is the rank of a product at most the smaller rank?", workspace: "/study/linalg", topics: ["rank"] },
		]);
		assert.deepEqual(pushed, ["/chat/chat_opened"]);
	});

	it("says a failed start under the head, the page's one place for every start on it", async () => {
		server.opens = false;
		const pushed = await mount(topicPage());
		await send("Rank of a 3x3 matrix");
		assert.equal(server.created.length, 1, "the start was tried");
		const alerts = [...host!.querySelectorAll('[role="alert"]')];
		assert.equal(alerts.length, 1, "one failure line");
		assert.equal(alerts[0]!.textContent, FAILURE);
		assert.ok(alerts[0]!.closest('[data-slot="page-head"]'), "under the head");
		assert.deepEqual(pushed, []);
	});
});
