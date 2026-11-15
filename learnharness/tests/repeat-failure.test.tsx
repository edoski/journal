/**
 * Every send gets a visible answer (round 9, 4 #3): a second Enter while
 * the app can't be reached failed the same way and left the screen exactly
 * as it was, so he couldn't tell whether the press counted. A failure that
 * repeats the one before it is counted, reads "Still can't reach the
 * app…", and its line enters again.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionModel } from "../components/session-core.ts";
import type { ChatInput } from "../src/core/input-events.ts";
import type { LhMessage } from "../src/core/native-messages.ts";
import { newUserMessage } from "../src/core/native-messages.ts";
import { buildAnswer } from "../src/core/question-core.ts";
import { turnErrorText } from "../components/lesson/turn-error-text.ts";
import { TurnError } from "../components/lesson/turn-error.tsx";

const offline = (async () => {
	throw new TypeError("Failed to fetch");
}) as typeof globalThis.fetch;

describe("a failure that repeats the one before it", () => {
	it("is counted for a message sent again while the app is down", async () => {
		const m = new SessionModel({ chatId: "c1", initialMessages: [newUserMessage("hi")], fetch: offline });
		await m.send({ type: "text", text: "v = (1, -2)" });
		assert.equal(m.getState().error?.message, "Failed to fetch");
		assert.equal(m.getState().error?.repeat ?? 0, 0, "the first failure is not a repeat");
		await m.send({ type: "text", text: "v = (1, -2)" });
		assert.equal(m.getState().error?.repeat, 1, "the second press is answered as a repeat");
		await m.send({ type: "text", text: "v = (1, -2)" });
		assert.equal(m.getState().error?.repeat, 2, "and the third");
	});

	it("is counted for an answer sent again, whose retry first reads the lesson", async () => {
		const question = { role: "assistant", id: "a1", content: [{ type: "toolCall", id: "q1", name: "explain", arguments: { question: "Q?" } }], stopReason: "toolUse", timestamp: 0, api: "x", provider: "x", model: "x", usage: { input: 0, output: 0, total: 0, cacheReads: 0, cacheWrites: 0 } } as unknown as LhMessage;
		const answer = buildAnswer({ id: "q1", kind: "explain", question: "Q?", mode: "text", options: [], createdAt: "fixture" }, { text: "v = " });
		const m = new SessionModel({ chatId: "c1", initialMessages: [question], fetch: offline });
		await m.send({ type: "answer", toolCallId: "q1", answer } as ChatInput);
		assert.equal(m.getState().error?.repeat ?? 0, 0);
		await m.send({ type: "answer", toolCallId: "q1", answer } as ChatInput);
		assert.equal(m.getState().error?.repeat, 1);
	});

	it("starts again from zero once a different failure comes", async () => {
		let down = true;
		const fetch = (async () => {
			if (down) throw new TypeError("Failed to fetch");
			return new Response("The reply could not be saved.", { status: 500 });
		}) as typeof globalThis.fetch;
		const m = new SessionModel({ chatId: "c1", initialMessages: [newUserMessage("hi")], fetch });
		await m.send({ type: "text", text: "x" });
		await m.send({ type: "text", text: "x" });
		down = false;
		await m.send({ type: "text", text: "x" });
		assert.equal(m.getState().error?.message, "The reply could not be saved.");
		assert.equal(m.getState().error?.repeat ?? 0, 0);
	});
});

describe("the line for a repeated failure", () => {
	it("says the app still can't be reached", () => {
		assert.equal(turnErrorText("Failed to fetch", true).sentence, "Still can't reach the app. Check it's running, then try again.");
		assert.equal(turnErrorText("Failed to fetch").sentence, "Couldn't reach the app. Check it's running, then try again.");
	});

	it("enters again, so each press shows", () => {
		const html = renderToStaticMarkup(<TurnError message="Failed to fetch" again onOpenSettings={() => {}} />);
		assert.match(html, /Still can&#x27;t reach the app/);
		assert.match(html, /lh-card-enter/);
	});
});
