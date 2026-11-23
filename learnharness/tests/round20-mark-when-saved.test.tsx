/**
 * Round 20, M4 (a) and (d) (1 m5, 2 n3): Rank practice, wrong then right
 * after the nudge, showed neither mark until a reload; on 10 Nov the RV
 * answer's mark showed about 3 s after the next question. The engine's
 * write announces the course (`course-changed`) before the app keeps the
 * save's links, so the marks read it starts finds no link: the receipt
 * reaches the transcript only when the turn ends. Keeping the links now
 * announces the session's record (`record-changed`), and the window reads
 * again then. And the window's own read once the turn ends was keyed on
 * the transcript's length, which the settle sync can leave unchanged as
 * it swaps the streamed copies for the record's: it is keyed on the
 * newest id too.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "react-dom/client";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lh-mark-when-saved-"));
process.env.LH_DATA_DIR = TMP;

const { chatStore } = await import("../src/store/chats.ts");
const { subscribe } = await import("../src/core/events.ts");
const { keepAnswerSaves } = await import("../src/server/chat-handler.ts");
const { markLinks } = await import("../src/core/answer-marks.ts");
const { ServerEventsProvider } = await import("../components/server-events.tsx");
const { useAnswerMarks } = await import("../components/answer-marks-fetch.ts");
type NotifySource = import("../components/server-events.tsx").NotifySource;

const originalFetch = globalThis.fetch;
let root: Root | null = null;
afterEach(async () => {
	await act(async () => root?.unmount());
	root = null;
	document.body.innerHTML = "";
	globalThis.fetch = originalFetch;
});
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

describe("a save's links, kept while the turn runs", () => {
	it("are announced once kept, so a marks read then finds them", () => {
		const chat = chatStore.createChat("Rank practice");
		const linksWhenAnnounced: Array<Record<string, string[]>> = [];
		const off = subscribe((e) => {
			if (e.type === "record-changed" && e.chatId === chat.id) linksWhenAnnounced.push(markLinks(chatStore.getChat(chat.id)!, { running: true }));
		});
		keepAnswerSaves(chat.id, null, [{ question: "toolu_conclude", observation: "o126" }, { question: "toolu_conclude", observation: "o127" }]);
		off();
		assert.deepEqual(linksWhenAnnounced, [{ toolu_conclude: ["o126", "o127"] }]);
	});

	it("an answer in words keys his newest message; a save naming no answer announces nothing", () => {
		const chat = chatStore.createChat("Probability review");
		let announced = 0;
		const off = subscribe((e) => {
			if (e.type === "record-changed" && e.chatId === chat.id) announced++;
		});
		keepAnswerSaves(chat.id, null, [{ question: "his-message", observation: "o97" }]);
		assert.equal(announced, 0);
		keepAnswerSaves(chat.id, "u_rv", [{ question: "his-message", observation: "o97" }]);
		off();
		assert.equal(announced, 1);
		assert.deepEqual(chatStore.getChat(chat.id)!.answerSaves, { u_rv: ["o97"] });
	});
});

const CHAT = "chat_rank";
const WS = "/study/la";
const MARK = { rows: [{ id: "o127", topics: ["rank"], label: null, result: "correct", grade: "helped", helped: true, predicted: false, gaveUp: false, uncertain: false, sure: null }], disputed: false };

function Marks({ settled }: { settled: string | null }) {
	const marks = useAnswerMarks(CHAT, WS, settled);
	return <p data-testid="marks">{Object.keys(marks).join(",")}</p>;
}

describe("the window's read once its turn has ended", () => {
	it("reads again when the settle sync swaps the streamed copies for the record's, at the same length", async () => {
		let saved = false;
		globalThis.fetch = (() => Promise.resolve(Response.json({ ok: true, marks: saved ? { toolu_conclude: MARK } : {} }))) as unknown as typeof fetch;
		const source: NotifySource = { close() {}, onOpen() {}, onEvent() {} };
		const host = document.createElement("div");
		document.body.appendChild(host);
		root = createRoot(host);
		const render = (s: string | null) => act(async () => root!.render(<ServerEventsProvider connect={() => source}><Marks settled={s} /></ServerEventsProvider>));
		// The stream ends: four messages, the newest the streamed closing words.
		await render("4:c_closing");
		assert.equal(document.querySelector("[data-testid=marks]")!.textContent, "");
		// The record lands with the conclude's receipt: four messages again.
		saved = true;
		await render("4:m_closing");
		assert.equal(document.querySelector("[data-testid=marks]")!.textContent, "toolu_conclude");
	});
});
