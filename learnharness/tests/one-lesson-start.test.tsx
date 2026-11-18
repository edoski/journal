/**
 * Every press that starts a lesson goes through the one start
 * (`useLessonStart`, components/start/lesson-start.md; audit 17 Nov 2026,
 * finding 6): signed out, it opens sign-in and creates nothing; a start
 * that fails says "Couldn't open the session. Try again." in the
 * surface's one place. Before, the sidebar's topic press, its Today
 * card, Road's Check it and a mistake had no sign-in guard and sent him to
 * New lesson with no word of why on any failure.
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
import type { ArcHandle, CourseMapTopic, CourseStanding, StudyCourse, TopicHandle } from "../src/core/index.ts";

class MemoryStorage {
	private map = new Map<string, string>();
	get length() { return this.map.size; }
	key(i: number) { return [...this.map.keys()][i] ?? null; }
	getItem(k: string) { return this.map.get(k) ?? null; }
	setItem(k: string, v: string) { this.map.set(k, v); }
	removeItem(k: string) { this.map.delete(k); }
	clear() { this.map.clear(); }
}
// The opening waits in session storage for the lesson to send it.
Object.defineProperty(globalThis, "sessionStorage", { value: new MemoryStorage(), configurable: true });

const { ServerEventsProvider } = await import("../components/server-events.tsx");
const { useLessonStart } = await import("../components/start/use-lesson-start.ts");
const { StartFailure, StartScope } = await import("../components/start/start-scope.tsx");
const { TopicCard } = await import("../components/unit-inbox/unit-row.tsx");
const { NowCard } = await import("../components/unit-inbox/now-card.tsx");
const { unitFor } = await import("../components/unit-inbox/now-inbox.ts");
const { needsYouNow } = await import("../components/study-home/needs-you.ts");
const { CourseHead } = await import("../components/course-page/course-head/course-head.tsx");
const { RoadList } = await import("../components/course-page/road/road-list.tsx");
const { courseRead } = await import("../components/course-page/course-model.ts");
const { columnsOf } = await import("./helpers/course-columns.ts");
const { LINALG, TODAY } = await import("./fixtures/now-demo.ts");
const round8 = await import("./fixtures/round8-home.ts");

const FAILURE = "Couldn’t open the session. Try again.";

/** What the app's server answers, and what was asked of it. */
const server = { signedIn: true, opens: true, created: [] as { title: string }[] };
const originalFetch = globalThis.fetch;
beforeEach(() => {
	Object.assign(server, { signedIn: true, opens: true, created: [] });
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const path = String(input);
		if (path.startsWith("/api/models")) return Response.json({ account: "claude-subscription", connected: server.signedIn, contextWindow: 8192 });
		if (path === "/api/chats" && init?.method === "POST") {
			server.created.push(JSON.parse(String(init.body)) as { title: string });
			return server.opens ? Response.json({ id: "chat_opened" }) : new Response("engine down", { status: 500 });
		}
		return new Response("{}", { status: 404 });
	}) as typeof fetch;
});

let root: Root | undefined;
afterEach(async () => {
	await act(async () => root?.unmount());
	dom.document.body.innerHTML = "";
	root = undefined;
	globalThis.fetch = originalFetch;
});

const settle = () => act(async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); });
const click = (el: Element) => act(async () => { el.dispatchEvent(new dom.window.Event("click", { bubbles: true })); });

/** A surface with its one start, as the sidebar and the course page give
 *  theirs (`StartScope`); `failure` draws its failure line, where the
 *  surface has no place of its own in the test. */
function Surface({ children, failure = true }: { children: React.ReactNode; failure?: boolean }) {
	const lesson = useLessonStart();
	return (
		<StartScope lesson={lesson}>
			{children}
			{failure && <StartFailure />}
		</StartScope>
	);
}

async function mount(node: React.ReactNode) {
	const pushed: string[] = [];
	const router = { push: (href: string) => pushed.push(href), replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };
	const host = dom.document.createElement("div");
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

const h = (handle: string) => handle as TopicHandle;
const a = (handle: string) => handle as ArcHandle;
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const topic = (handle: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic => ({ handle: h(handle), title: handle[0]!.toUpperCase() + handle.slice(1), level: "assisted", introduced: "2026-11-01", review: null, weak: false, signals: QUIET, tasks: [], ...over });

/** Linear Algebra with Vector spaces ready for its check and a mistake open on Rank. */
const ROAD: StudyCourse = {
	map: {
		workspace: "/study/linalg",
		title: "Linear Algebra",
		today: "2026-11-08",
		revision: 1,
		exam: null,
		current: h("rank"),
		focus: null,
		tasks: [],
		topics: [topic("span", { level: "retained", arc: a("spaces") }), topic("rank", { arc: a("maps") })],
		edges: [],
		arcs: [
			{ handle: a("spaces"), title: "Vector spaces", state: "ready", entry: [] },
			{ handle: a("maps"), title: "Linear maps", state: "learning", entry: [] },
		],
	},
	unready: null,
	due: [],
	lastActiveDaysAgo: 0,
	newToday: [],
};
const STANDING: CourseStanding = {
	readiness: null,
	mistakes: [{ topic: h("rank"), gap: "You count the vectors, not the dimension of their span", latest: "2026-11-08", answers: [] }],
};

function coursePage() {
	const read = courseRead({ status: "ready", courses: [ROAD], failed: [], open: [], chats: [] }, ROAD.map.workspace);
	assert.equal(read.status, "ready");
	const columns = columnsOf((read as Extract<typeof read, { status: "ready" }>).view, STANDING, { open: { spaces: true } });
	return (
		<Surface failure={false}>
			<CourseHead {...columns} />
			<RoadList {...columns} shown={columns.view.arcs![0]!} />
		</Surface>
	);
}

/** Each press, mounted on its surface, and how to press it. */
const presses: { name: string; surface: () => React.ReactNode; press: () => Promise<void>; failureIn: string }[] = [
	{
		name: "the sidebar's Start on a topic",
		surface: () => {
			const diag = LINALG.map.topics.find((t) => t.handle === "diag")!;
			return (
				<Surface>
					<TopicCard unit={unitFor(LINALG, diag, [])} map={LINALG.map} chats={[]} today={TODAY} active={false} />
				</Surface>
			);
		},
		press: () => click(dom.document.querySelector('[data-slot="row-action"]')!),
		failureIn: "body",
	},
	{
		name: "the sidebar's Continue on a Today card",
		surface: () => {
			const sheet: StudyCourse = {
				map: round8.map({ workspace: "/s/exam", title: "Exam prep", current: null, topics: [], tasks: [{ key: "paper", title: "Past paper 2024", step: "Question 3", updated: round8.TODAY }], focus: "paper" }),
				unready: null,
				due: [],
				lastActiveDaysAgo: 0,
				newToday: [],
			};
			const [line] = needsYouNow([sheet], [], round8.TODAY).lines;
			return (
				<Surface>
					<NowCard line={line!} unit={null} active={false} />
				</Surface>
			);
		},
		press: () => click(dom.document.querySelector('[data-slot="row-action"]')!),
		failureIn: "body",
	},
	{
		name: "Road's Check it",
		surface: coursePage,
		press: () => click(dom.document.querySelector('[data-slot="course-arc-check"]')!),
		failureIn: '[data-slot="page-head"]',
	},
	{
		name: "a mistake on the course page",
		surface: coursePage,
		press: async () => {
			await click(dom.document.querySelector('[data-slot="course-mistakes"]')!);
			await click(dom.document.querySelector('[data-slot="mistake-row"]')!);
		},
		failureIn: '[data-slot="page-head"]',
	},
];

describe("a press that starts a lesson, signed out, opens sign-in", () => {
	for (const { name, surface, press } of presses) {
		it(`from ${name}`, async () => {
			server.signedIn = false;
			const pushed = await mount(surface());
			await press();
			await settle();
			assert.equal(server.created.length, 0, "nothing is created before sign-in");
			assert.ok(dom.document.querySelector('[role="dialog"]'), "sign-in opens");
			assert.deepEqual(pushed, [], "he stays where he is, never sent to New lesson");
		});
	}
});

describe("a press whose start fails says so on its surface", () => {
	for (const { name, surface, press, failureIn } of presses) {
		it(`from ${name}`, async () => {
			server.opens = false;
			const pushed = await mount(surface());
			await press();
			await settle();
			assert.equal(server.created.length, 1, "the start was tried");
			assert.equal(dom.document.querySelector(`${failureIn} [role="alert"]`)?.textContent, FAILURE);
			assert.deepEqual(pushed, [], "he stays where he is, never sent to New lesson");
		});
	}

	it("and a start that opens goes to the lesson", async () => {
		const pushed = await mount(presses[0]!.surface());
		await presses[0]!.press();
		await settle();
		assert.deepEqual(pushed, ["/chat/chat_opened"]);
		assert.ok(dom.document.querySelector('[role="alert"]') === null);
	});
});
