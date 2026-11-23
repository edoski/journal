/**
 * Round 20, m10 (2 n2; round-19 m22, not fixed). Continue Problem sheet 4
 * showed "The tutor stopped before replying. Try again" and "Press Enter
 * to try again, or write something new" for 2 to 7 s at load 49, then
 * Thinking. Round 18 hid the failure the server remembered, but the
 * sheet's own transcript ended on the failed reply, and the page draws
 * that until the Continue turn, sent once the page has mounted, starts.
 * The owed Continue turn is now busy from the first frame: the page the
 * server draws shows the turn starting, never the last turn's failure.
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
const { newUserMessage } = await import("../src/core/index.ts");
type LhMessage = import("../src/core/index.ts").LhMessage;


const { renderToStaticMarkup } = await import("./helpers/app-render.tsx");
const CHAT = "c_sheet";
const at = (n: number) => Date.now() - 10_000 + n;
const FAILURE = "Claude Code stopped with an error before it finished.";
// A sheet session holding its open task, whose last reply failed.
const record = [
	newUserMessage("Problem sheet 4") as LhMessage,
	{ id: "a_save", role: "assistant", content: [{ type: "toolCall", id: "s1", name: "course_save", arguments: { changes: { tasks: { "sheet-4": { step: "Part (c)" } } } } }], stopReason: "toolUse", timestamp: at(1) },
	{ id: "r_save", role: "toolResult", toolCallId: "s1", toolName: "course_save", content: [{ type: "text", text: "Saved." }], details: null, isError: false, timestamp: at(2) },
	{ id: "a_end", role: "assistant", content: [{ type: "text", text: "Good place to stop." }], stopReason: "stop", timestamp: at(3) },
	newUserMessage("and part (c)?") as LhMessage,
	{ id: "a_fail", role: "assistant", content: [], stopReason: "error", errorMessage: FAILURE, timestamp: at(5) },
] as unknown as LhMessage[];

const page = (continueTask: boolean) =>
	renderToStaticMarkup(
		<ServerEventsProvider connect={() => quietSource}>
			<Chat chatId={CHAT} title="Problem sheet 4: rank and nullity" initialMessages={record} continueTask={continueTask} course={{ workspace: "la", title: "Linear Algebra" }} />
		</ServerEventsProvider>,
	);

test("Continue's page, before its turn's first output, shows the turn starting and no failure from the transcript", () => {
	const html = page(true);
	assert.doesNotMatch(html, /stopped before replying/);
	assert.doesNotMatch(html, /try again/i);
	assert.match(html, /data-testid="thinking-placeholder"/);
});

test("the same page opened without Continue still shows the failure its transcript holds", () => {
	assert.match(page(false), /stopped before replying/);
});
