/**
 * Round 20, m11 (1 m6). On 17 Nov, Continue Stirling's formula lesson
 * opened on the 10 Nov close, "continues tomorrow, Wednesday 11 November",
 * right above "Your turn", with no word that a week had passed. A session
 * picked up on a later study day than he last studied it now has a quiet
 * date divider ("17 Nov") where it picks up: before the left question the
 * app asks again on opening, else before whatever comes next.
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
const { newUserMessage, newQuestionRepose, resumedOn } = await import("../src/core/index.ts");
type LhMessage = import("../src/core/index.ts").LhMessage;


const { renderToStaticMarkup } = await import("./helpers/app-render.tsx");
const close = { id: "a_close", role: "assistant", content: [{ type: "text", text: "We stop at the square root. Stirling's formula continues tomorrow, Wednesday 11 November." }], stopReason: "stop", timestamp: Date.now() - 600_000 } as unknown as LhMessage;
const question = { question: "Where does the $\\sqrt{n}$ in Stirling's formula come from?", correctAnswer: "The width of the peak.", type: "check" };
const repose = newQuestionRepose([{ tool: "explain", input: question }]) as LhMessage;
const record = [newUserMessage("Stirling's formula") as LhMessage, close, repose];

test("a session last studied on an earlier day picks up after a date divider, before its left question", () => {
	const resumed = resumedOn(record, "2026-11-10T19:40:00", "2026-11-17");
	assert.deepEqual(resumed, { day: "2026-11-17", before: repose.id });
	const html = renderToStaticMarkup(
		<ServerEventsProvider connect={() => quietSource}>
			<Chat chatId="c_stirling" title="Stirling's formula lesson" initialMessages={record} resumed={resumed!} course={{ workspace: "pr", title: "Probability" }} />
		</ServerEventsProvider>,
	);
	const divider = html.indexOf('data-testid="resumed-day"');
	assert.ok(divider > 0, "the divider is drawn");
	assert.match(html.slice(divider, divider + 300), /17 Nov/);
	assert.ok(html.indexOf("continues tomorrow") < divider, "after the old close");
	assert.ok(divider < html.indexOf("Your turn"), "before the question it picks up on");
});

test("studied today, or a session with no left question, as the divider's rule reads it", () => {
	assert.equal(resumedOn(record, "2026-11-17T08:00:00", "2026-11-17"), null);
	assert.deepEqual(resumedOn(record.slice(0, 2), "2026-11-10T19:40:00", "2026-11-17"), { day: "2026-11-17", before: null });
});
