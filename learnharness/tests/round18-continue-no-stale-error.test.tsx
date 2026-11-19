/**
 * Round 18, m25 (1 n9). "The tutor stopped before replying. Try again"
 * flashed for about half a second as Continue on a problem sheet opened:
 * the page drew the last turn's remembered failure until the Continue
 * turn's start cleared it. A Continue's page now opens with no failure
 * line; a page opened any other way still shows a failure it holds.
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
// A sheet session whose saves hold the open task, its last turn ended.
const record = [
	newUserMessage("Problem sheet 4") as LhMessage,
	{ id: "a_save", role: "assistant", content: [{ type: "toolCall", id: "s1", name: "course_save", arguments: { changes: { tasks: { "sheet-4": { step: "Part (c)" } } } } }], stopReason: "toolUse", timestamp: at(1) },
	{ id: "r_save", role: "toolResult", toolCallId: "s1", toolName: "course_save", content: [{ type: "text", text: "Saved." }], details: null, isError: false, timestamp: at(2) },
	{ id: "a_end", role: "assistant", content: [{ type: "text", text: "Good place to stop." }], stopReason: "stop", timestamp: at(3) },
] as unknown as LhMessage[];
// The failure the server remembers from the session's last failed turn.
const FAILURE = "Claude Code stopped with an error before it finished.";

const page = (continueTask: boolean) =>
	renderToStaticMarkup(
		<ServerEventsProvider connect={() => quietSource}>
			<Chat chatId={CHAT} title="Problem sheet 4: rank and nullity" initialMessages={record} initialError={FAILURE} continueTask={continueTask} course={{ workspace: "la", title: "Linear Algebra" }} />
		</ServerEventsProvider>,
	);

test("Continue's page opens with no failure line from the last turn (round 18, m25)", () => {
	assert.doesNotMatch(page(true), /stopped before replying/);
});

test("a page opened without Continue still shows the failure it holds", () => {
	assert.match(page(false), /stopped before replying/);
});
