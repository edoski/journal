/**
 * Round 18, m22 (2 m5). A problem sheet's header strip spoke a lesson's
 * words: while Continue loaded it read "A worked example", the step of the
 * lesson planned before his Continue, and after part (c) it read "Every
 * step taught" with one dot, parts (d) and (e) still to do. In a task he
 * picked up with Continue, the strip now names the task's part: the one he
 * picked it up at until the tutor plans it, then the plan's, and past the
 * plan's last step the part the session's save named next.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import { dom } from "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

function memoryStorage(): Storage {
	const kept = new Map<string, string>();
	return {
		get length() { return kept.size; },
		key: (i: number) => [...kept.keys()][i] ?? null,
		getItem: (k: string) => kept.get(k) ?? null,
		setItem: (k: string, v: string) => void kept.set(k, String(v)),
		removeItem: (k: string) => void kept.delete(k),
		clear: () => kept.clear(),
	};
}
for (const [key, value] of Object.entries({ localStorage: memoryStorage(), sessionStorage: memoryStorage() })) {
	Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
	Object.defineProperty(dom.window, key, { value, configurable: true, writable: true });
}
(globalThis as Record<string, unknown>).self = globalThis;
if (!(dom.window as { location?: unknown }).location) {
	const location = new URL("http://localhost/chat/c_sheet");
	Object.defineProperty(dom.window, "location", { value: location, configurable: true, writable: true });
	Object.defineProperty(globalThis, "location", { value: location, configurable: true, writable: true });
}
Object.assign(dom.window, { history: { state: null, replaceState() {}, pushState() {} } });
Object.assign(dom.window.HTMLElement.prototype, { scrollTo() {}, scrollBy() {} });

const { createRoot } = await import("./helpers/app-render.tsx");
const { Chat } = await import("../components/chat.tsx");
const { ServerEventsProvider } = await import("../components/server-events.tsx");
type NotifySource = import("../components/server-events.tsx").NotifySource;
const quietSource: NotifySource = { close() {}, onOpen() {}, onEvent() {} };
const { newTaskContinueMessage, newUserMessage, taskSessionOf } = await import("../src/core/index.ts");
const { roadmapLabel } = await import("../components/lesson/roadmap-facts.ts");
type LhMessage = import("../src/core/index.ts").LhMessage;

const CHAT = "c_sheet";
const at = (n: number) => Date.now() - 10_000 + n;
const STEP_C = "Part (c): show $\\dim \\ker A = 2$ for the $3 \\times 5$ matrix $A$";
const STEP_D = "Part (d): find a basis for $\\ker A$";
const tree = (nodes: [string, string][]) => ({ nodes: nodes.map(([id, title]) => ({ id, title })), edges: nodes.slice(1).map(([id]) => ({ from: nodes[0]![0], to: id })), version: 1 });
const plan = (n: number, nodes: [string, string][]) => [
	{ id: `a_plan${n}`, role: "assistant", content: [{ type: "toolCall", id: `plan${n}`, name: "plan_init", arguments: { mermaid: "graph TD" } }], stopReason: "toolUse", timestamp: at(n) },
	{ id: `r_plan${n}`, role: "toolResult", toolCallId: `plan${n}`, toolName: "plan_init", content: [{ type: "text", text: "Planned." }], details: { ok: true, tree: tree(nodes) }, isError: false, timestamp: at(n + 1) },
];
// The 6 Nov sheet session (chat_demo_la_1106_1045.json): a lesson planned
// on the kernel, its example step under way, then his Continue on the sheet.
const lesson = [
	newUserMessage("Problem sheet 4") as LhMessage,
	...plan(1, [["kernel-picture", "What kernel and rank-nullity means"], ["kernel-example", "A worked example"]]),
	{ id: "a_q", role: "assistant", content: [{ type: "toolCall", id: "q1", name: "explain", arguments: { question: "What is $\\dim \\ker A$?", nodeId: "kernel-example" } }], stopReason: "toolUse", timestamp: at(3) },
	{ id: "r_q", role: "toolResult", toolCallId: "q1", toolName: "explain", content: [{ type: "text", text: "3" }], details: { answer: "3" }, isError: false, timestamp: at(4) },
	{ id: "a_stop", role: "assistant", content: [{ type: "text", text: "Good place to stop." }], stopReason: "stop", timestamp: at(5) },
] as unknown as LhMessage[];
const continued = [...lesson, newTaskContinueMessage(["sheet-4"], { title: "Problem sheet 4: rank and nullity", step: STEP_C })] as LhMessage[];
const partCDone = [
	...continued,
	...plan(10, [["part-c", "Part (c) of the further problem"]]),
	{ id: "a_save", role: "assistant", content: [{ type: "toolCall", id: "s1", name: "course_save", arguments: { changes: { tasks: { "sheet-4": { step: STEP_D } } } } }, { type: "toolCall", id: "lp1", name: "lesson_progress", arguments: { done: ["part-c"] } }], stopReason: "toolUse", timestamp: at(20) },
	{ id: "r_save", role: "toolResult", toolCallId: "s1", toolName: "course_save", content: [{ type: "text", text: "Saved." }], details: null, isError: false, timestamp: at(21) },
	{ id: "r_lp", role: "toolResult", toolCallId: "lp1", toolName: "lesson_progress", content: [{ type: "text", text: "Done." }], details: null, isError: false, timestamp: at(22) },
	{ id: "a_offer", role: "assistant", content: [{ type: "text", text: "Part (c) is done. Next on the sheet is part (d)." }], stopReason: "stop", timestamp: at(23) },
] as unknown as LhMessage[];

const originalFetch = globalThis.fetch;
let root: { unmount(): void; render(node: React.ReactNode): void } | null = null;
let host: HTMLElement | null = null;

function stubFetch(messages: LhMessage[]) {
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		const url = new URL(String(input), "http://localhost");
		if (url.pathname === "/api/models") return Response.json({ account: "claude-subscription", connected: true, contextWindow: 200000 });
		if (url.pathname === `/api/chats/${CHAT}`) return Response.json({ messages, turnInFlight: false });
		if (url.pathname === `/api/chats/${CHAT}/marks`) return Response.json({ ok: true, marks: {} });
		if (url.pathname === "/api/jobs") return Response.json({ jobs: [] });
		if (url.pathname === "/api/courses") return Response.json({ available: true, courses: [{ workspace: "la" }] });
		if (url.pathname === "/api/subscriptions/claude") return Response.json({ accounts: [] });
		return Response.json({});
	}) as typeof fetch;
}
const settle = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); });
afterEach(async () => {
	await act(async () => root?.unmount());
	root = null;
	host?.remove();
	host = null;
	globalThis.fetch = originalFetch;
});

async function strip(messages: LhMessage[]) {
	stubFetch(messages);
	host = document.createElement("div");
	document.body.append(host);
	root = createRoot(host);
	await act(async () =>
		root!.render(
			<ServerEventsProvider connect={() => quietSource}>
				<Chat chatId={CHAT} title="Problem sheet 4: rank and nullity" initialMessages={messages} course={{ workspace: "la", title: "Linear Algebra" }} />
			</ServerEventsProvider>,
		),
	);
	await settle();
	return host.querySelector('[data-testid="roadmap"]')?.getAttribute("aria-label") ?? null;
}

test("before his Continue, the lesson's own step (the lesson strip as it was)", async () => {
	assert.equal(await strip(lesson), "Where this lesson is: A worked example");
});

test("while Continue loads, the strip names the part he picked the sheet up at, never the lesson's step (round 18, m22)", async () => {
	const label = await strip(continued);
	assert.ok(label !== null && label.startsWith("Where this lesson is: Part (c)"), `${label}`);
	assert.doesNotMatch(label!, /worked example/);
});

test("past the plan's last part, the strip names the part the save named next, never Every step taught (round 18, m22)", async () => {
	const label = await strip(partCDone);
	assert.ok(label !== null && label.startsWith("Where this lesson is: Next: Part (d)"), `${label}`);
	assert.doesNotMatch(label!, /Every step taught/);
});

test("the task session's facts, and the label they give", () => {
	assert.equal(taskSessionOf(lesson), null, "no Continue on a task: a lesson");
	assert.deepEqual(taskSessionOf(continued), { title: "Problem sheet 4: rank and nullity", step: STEP_C, next: null, closed: false, planned: false });
	assert.deepEqual(taskSessionOf(partCDone), { title: "Problem sheet 4: rank and nullity", step: STEP_C, next: STEP_D, closed: false, planned: true });
	assert.equal(roadmapLabel([], taskSessionOf(continued)), STEP_C);
	assert.equal(roadmapLabel([{ id: "part-c", title: "Part (c)", status: "visited", done: true, next: false, taught: true }], { ...taskSessionOf(partCDone)!, closed: true }), "Every step taught", "the task closed: every part is done");
});
