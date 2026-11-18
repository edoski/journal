/**
 * Edo, 18 Nov 2026: a composer on Home, the same compact one as the course
 * and topic pages (`CourseComposer`), with a course control in its toolbar
 * that starts on the course of the map's tab. Typing anywhere on Home then
 * types into it, so Home's letters move: o is gone (Enter opens a row, as
 * on every page), f is ⌘E (enlarge), c is ⌘↵ (the row's course page, else
 * the map's).
 */
import "./helpers/radix-dom.ts";
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createRoot, type Root } from "./helpers/app-render.tsx";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { dom } from "./helpers/radix-dom.ts";

class MemoryStorage {
	private map = new Map<string, string>();
	get length() { return this.map.size; }
	key(i: number) { return [...this.map.keys()][i] ?? null; }
	getItem(k: string) { return this.map.get(k) ?? null; }
	setItem(k: string, v: string) { this.map.set(k, v); }
	removeItem(k: string) { this.map.delete(k); }
	clear() { this.map.clear(); }
}
const local = new MemoryStorage();
const session = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", { value: local, configurable: true, writable: true });
Object.defineProperty(globalThis, "sessionStorage", { value: session, configurable: true, writable: true });
// Next's Link schedules its prefetch on `self`, which the test DOM lacks.
Object.defineProperty(globalThis, "self", { value: globalThis, configurable: true, writable: true });

const { ServerEventsProvider } = await import("../components/server-events.tsx");
const { StudyHome } = await import("../components/study-home/study-home.tsx");
const { forgetStudyHome } = await import("../components/study-home/use-study-home.ts");
const { useTypeToCompose } = await import("../components/type-to-compose.ts");
const { courseHref } = await import("../components/unit-inbox/unit-href.ts");
const { LINALG, PROB } = await import("./fixtures/now-demo.ts");

const COURSES = [LINALG, PROB];
const summary = (c: typeof LINALG) => ({ workspace: c.map.workspace, title: c.map.title, due: 0, reviews: [], current: null, currentTitle: null, task: null, step: null, exam: null, lastActiveDaysAgo: null });
const created: Array<{ title: string; course: { workspace: string } }> = [];
const originalFetch = globalThis.fetch;
beforeEach(() => {
	created.length = 0;
	local.clear();
	session.clear();
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const path = String(input).split("?")[0];
		if (path === "/api/study") return Response.json({ available: true, courses: COURSES, failed: [] });
		if (path === "/api/chats" && init?.method === "POST") {
			created.push(JSON.parse(String(init.body)) as (typeof created)[number]);
			return Response.json({ id: "chat_opened" });
		}
		if (path === "/api/chats") return Response.json({ chats: [] });
		if (path === "/api/courses") return Response.json({ available: true, courses: COURSES.map(summary), roots: [] });
		if (path === "/api/models") return Response.json({ account: "claude-subscription", connected: true, contextWindow: 8192 });
		return new Response("{}", { status: 404 });
	}) as typeof fetch;
});

let root: Root | null = null;
afterEach(async () => {
	await act(async () => root?.unmount());
	root = null;
	dom.document.body.innerHTML = "";
	globalThis.fetch = originalFetch;
	forgetStudyHome();
});

const settle = () => act(async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); });

function Home() {
	useTypeToCompose();
	return <StudyHome />;
}

async function mount() {
	const pushed: string[] = [];
	const router = { push: (href: string) => pushed.push(href), replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
	const host = dom.document.createElement("div");
	dom.document.body.appendChild(host);
	root = createRoot(host);
	await act(async () =>
		root!.render(
			<AppRouterContext.Provider value={router as never}>
				<SearchParamsContext.Provider value={new URLSearchParams() as never}>
					<ServerEventsProvider connect={() => ({ close() {}, onOpen() {}, onEvent() {} })}>
						<Home />
					</ServerEventsProvider>
				</SearchParamsContext.Provider>
			</AppRouterContext.Provider>,
		),
	);
	await settle();
	const q = <T extends Element = HTMLElement>(selector: string) => dom.document.querySelector<T & Element>(selector);
	const field = () => q<HTMLTextAreaElement>('[data-slot="course-composer"] textarea')!;
	return {
		pushed,
		q,
		field,
		course: () => q('[data-slot="course-composer"] [data-testid="course-picker"]')?.textContent ?? null,
		enlarged: () => q('[data-slot="home-map"]')?.hasAttribute("data-enlarged") === true,
		type: async (words: string) => {
			await act(async () => {
				Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value")!.set!.call(field(), words);
				field().dispatchEvent(new dom.window.Event("input", { bubbles: true }));
			});
		},
		key: async (key: string, mods: { metaKey?: boolean } = {}, target: EventTarget = dom.document.body) => {
			await act(async () => {
				const event = new dom.window.Event("keydown", { bubbles: true, cancelable: true });
				target.dispatchEvent(Object.assign(event, { key, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, isComposing: false, ...mods }) as unknown as Event);
			});
			await settle();
		},
		tab: async (title: string) => {
			const tab = [...dom.document.querySelectorAll<HTMLElement>('[data-slot="home-map-tabs"] [role="tab"]')].find((t) => t.textContent === title)!;
			await act(async () => {
				for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
					const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
					tab.dispatchEvent(Object.assign(event, { pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, ctrlKey: false, detail: 1 }));
				}
			});
			await settle();
		},
	};
}

describe("Home's composer (Edo, 18 Nov 2026)", () => {
	it("is the course composer at Home's foot, its course control on the map's course", async () => {
		const home = await mount();
		const composer = home.q('[data-slot="course-composer"]');
		assert.ok(composer !== null, "Home draws the course composer");
		assert.ok(composer.parentElement?.lastElementChild === composer || composer.nextElementSibling?.getAttribute("role") === "alert", "at Home's foot");
		const shown = home.q('[data-slot="home-map-tabs"] [aria-selected="true"]')!.textContent;
		assert.equal(home.course(), shown);
		assert.equal(home.field().placeholder, `Name a topic, ask a question or paste a problem in ${shown}`);
	});

	it("follows the map's tab while it is empty, and keeps its course once he types", async () => {
		const home = await mount();
		const other = COURSES.map((c) => c.map.title).find((t) => t !== home.course())!;
		await home.tab(other);
		assert.equal(home.course(), other, "an empty box follows the map");
		await home.type("Explain the rank–nullity theorem");
		const back = COURSES.map((c) => c.map.title).find((t) => t !== other)!;
		await home.tab(back);
		assert.equal(home.course(), other, "his words stay in the course they were started in");
		await home.key("e", { metaKey: true });
		await home.key("e", { metaKey: true });
		assert.equal(home.course(), other, "and through the map enlarged and back");
	});

	it("keeps the course beside his words across a reload", async () => {
		let home = await mount();
		const other = COURSES.map((c) => c.map.title).find((t) => t !== home.course())!;
		await home.tab(other);
		await home.type("Explain the rank–nullity theorem");
		await act(async () => root?.unmount());
		dom.document.body.innerHTML = "";
		forgetStudyHome();
		home = await mount();
		assert.equal(home.field().value, "Explain the rank–nullity theorem");
		assert.equal(home.course(), other, "his words came back in the course they were started in");
	});

	it("sends a lesson in the course its control shows", async () => {
		const home = await mount();
		const shown = home.course();
		await home.type("What is a kernel?");
		await act(async () => home.q('[data-slot="course-composer"] form')!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
		await settle();
		const course = COURSES.find((c) => c.map.title === shown)!;
		assert.deepEqual(created.map((c) => [c.title, c.course.workspace]), [["What is a kernel?", course.map.workspace]]);
	});

	it("takes letters: f, o and c type into it and no longer act", async () => {
		const home = await mount();
		await home.key("f");
		assert.equal(home.enlarged(), false, "f no longer enlarges the map");
		assert.ok(dom.document.activeElement === home.field(), "the letter went to the composer");
		await act(async () => home.field().blur());
		await home.key("c");
		assert.deepEqual(home.pushed, [], "c no longer opens a course page");
	});

	it("⌘E enlarges the map and back, from the composer too", async () => {
		const home = await mount();
		await home.key("e", { metaKey: true });
		assert.equal(home.enlarged(), true);
		assert.ok(home.q('[data-slot="course-composer"]')?.closest(".hidden") != null, "the enlarged map takes Home, the composer included");
		await home.key("e", { metaKey: true });
		assert.equal(home.enlarged(), false);
		home.field().focus();
		await home.key("e", { metaKey: true }, home.field());
		assert.equal(home.enlarged(), true, "a ⌘ chord types nothing, so the field passes it on");
	});

	it("⌘↵ opens the focused row's course page, else the map's; in the composer it is the composer's", async () => {
		const home = await mount();
		await home.key("Enter", { metaKey: true });
		const shown = COURSES.find((c) => c.map.title === home.course())!;
		assert.deepEqual(home.pushed, [courseHref(shown.map.workspace)]);
		const line = home.q<HTMLElement>("[data-line]")!;
		line.focus();
		await home.key("Enter", { metaKey: true }, line);
		// With no sessions, every line is a course's step: `<workspace>#<step>`.
		assert.deepEqual(home.pushed.slice(1), [courseHref(line.dataset.line!.split("#")[0]!)]);
		home.field().focus();
		await home.key("Enter", { metaKey: true }, home.field());
		assert.equal(home.pushed.length, 2, "⌘↵ in the field is the composer's send, never a page");
	});
});
