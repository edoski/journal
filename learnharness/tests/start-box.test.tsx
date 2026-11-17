/**
 * The boxes that start a lesson, New lesson and a course page's composer,
 * keep his words and photos until the lesson has opened, and a photo alone
 * can be sent from either (audit 17 Nov 2026, finding 1: New lesson refused
 * a photo alone, and the course composer dropped the photos and the kept
 * words before its start resolved, so a failed start or a sign-in lost them).
 */
import "./helpers/radix-dom.ts";
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createRoot, type Root } from "./helpers/app-render.tsx";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
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
Object.defineProperty(globalThis, "localStorage", { value: local, configurable: true });
Object.defineProperty(globalThis, "sessionStorage", { value: new MemoryStorage(), configurable: true });

// A pasted photo is drawn on a canvas and read back as JPEG; Node has neither.
Object.assign(globalThis, {
	createImageBitmap: async () => ({ width: 40, height: 30, close() {} }),
	FileReader: class {
		result: string | null = null;
		onload: (() => void) | null = null;
		onerror: (() => void) | null = null;
		readAsDataURL() { this.result = "data:image/jpeg;base64,/9j/AAAA"; queueMicrotask(() => this.onload?.()); }
	},
});
Object.assign(Object.getPrototypeOf(dom.document.createElement("canvas")), {
	getContext: () => ({ fillStyle: "", fillRect() {}, drawImage() {} }),
	toBlob: (done: (blob: Blob) => void) => done(new Blob(["jpeg"], { type: "image/jpeg" })),
});

const { setKeptWindow, keptWords, NEW_LESSON_BOX } = await import("../components/lesson/kept-drafts.ts");
const { ServerEventsProvider } = await import("../components/server-events.tsx");
const { StartScreen } = await import("../components/start/start-screen.tsx");
const { CourseComposer } = await import("../components/course-page/course-composer.tsx");
const { useLessonStart } = await import("../components/start/use-lesson-start.ts");
const { StartFailure, StartScope } = await import("../components/start/start-scope.tsx");
const { LINALG } = await import("./fixtures/now-demo.ts");
setKeptWindow("w-start", { live: ["w-start"] });

const WORKSPACE = LINALG.map.workspace;
const FAILURE = "Couldn’t open the session. Try again.";

/** What the app's server answers, and what was asked of it. */
const server = { signedIn: true, opens: true, created: [] as { title: string }[] };
const originalFetch = globalThis.fetch;
beforeEach(() => {
	Object.assign(server, { signedIn: true, opens: true, created: [] });
	local.clear();
	local.setItem("lh:course", WORKSPACE);
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const path = String(input);
		if (path.startsWith("/api/models")) return Response.json({ account: "claude-subscription", connected: server.signedIn, contextWindow: 8192 });
		if (path === "/api/courses") return Response.json({ available: true, courses: [{ workspace: WORKSPACE, title: LINALG.map.title, due: 0, reviews: [], current: null, currentTitle: null, task: null, step: null, exam: null, lastActiveDaysAgo: null }], roots: [] });
		if (path === "/api/chats" && init?.method === "POST") {
			server.created.push(JSON.parse(String(init.body)) as { title: string });
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

async function mount(box: React.ReactNode) {
	const pushed: string[] = [];
	const router = { push: (href: string) => pushed.push(href), replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };
	const source = { close() {}, onOpen() {}, onEvent() {} };
	host = dom.document.createElement("div");
	dom.document.body.append(host);
	root = createRoot(host);
	await act(async () => root!.render(
		<ServerEventsProvider connect={() => source}>
			<AppRouterContext.Provider value={router as never}>{box}</AppRouterContext.Provider>
		</ServerEventsProvider>,
	));
	await settle();
	const form = () => host!.querySelector<HTMLFormElement>('[data-slot="composer"]')!;
	const field = () => form().querySelector("textarea")!;
	return {
		pushed,
		field,
		photos: () => form().querySelectorAll('[data-testid="pending-photos"] img').length,
		send: () => form().querySelector('[data-slot="composer-send"]')!,
		alert: () => host!.querySelector('[role="alert"]')?.textContent ?? null,
		type: async (words: string) => {
			await act(async () => {
				Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value")!.set!.call(field(), words);
				field().dispatchEvent(new dom.window.Event("input", { bubbles: true }));
			});
		},
		paste: async () => {
			const event = new dom.window.Event("paste", { bubbles: true, cancelable: true });
			Object.assign(event, { clipboardData: { files: [new File(["png"], "working.png", { type: "image/png" })] } });
			await act(async () => field().dispatchEvent(event));
			await settle();
		},
		submit: async () => {
			await act(async () => form().dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
			await settle();
		},
	};
}

/** The course page's composer, under the page's one start, whose failure the page's head says. */
function CoursePage() {
	const lesson = useLessonStart();
	return (
		<StartScope lesson={lesson}>
			<StartFailure />
			<CourseComposer course={LINALG} />
		</StartScope>
	);
}

const boxes = [
	{ name: "New lesson", box: () => <StartScreen />, scope: NEW_LESSON_BOX },
	{ name: "a course page's composer", box: () => <CoursePage />, scope: `course:${WORKSPACE}` },
];

describe("a photo alone starts a lesson", () => {
	for (const { name, box } of boxes) {
		it(`from ${name}`, async () => {
			const view = await mount(box());
			await view.paste();
			assert.equal(view.photos(), 1, "the photo waits in the box");
			assert.equal(view.send().hasAttribute("disabled"), false, "a photo alone can be sent");
			await view.submit();
			assert.deepEqual(server.created.map((c) => c.title), [""], "the lesson opens on the photo, with no words");
			assert.deepEqual(view.pushed, ["/chat/chat_opened"]);
		});
	}
});

describe("a start that does not open the lesson keeps his words and photos", () => {
	for (const { name, box, scope } of boxes) {
		it(`on ${name}, when the session cannot be opened`, async () => {
			server.opens = false;
			const view = await mount(box());
			await view.type("Diagonalise this matrix");
			await view.paste();
			await view.submit();
			assert.equal(server.created.length, 1, "the start was tried");
			assert.equal(view.alert(), FAILURE);
			assert.equal(view.field().value, "Diagonalise this matrix");
			assert.equal(view.photos(), 1, "the photo is still in the box");
			assert.equal(keptWords(scope)?.text, "Diagonalise this matrix", "the words still survive a reload");
			assert.deepEqual(view.pushed, []);
		});

		it(`on ${name}, when the Claude account is signed out and sign-in opens`, async () => {
			server.signedIn = false;
			const view = await mount(box());
			await view.type("Diagonalise this matrix");
			await view.paste();
			await view.submit();
			assert.equal(server.created.length, 0, "nothing is created before sign-in");
			assert.ok(dom.document.querySelector('[role="dialog"]'), "sign-in opens");
			assert.equal(view.field().value, "Diagonalise this matrix");
			assert.equal(view.photos(), 1, "the photo is still in the box");
			assert.equal(keptWords(scope)?.text, "Diagonalise this matrix", "the words still survive a reload");
		});
	}
});
