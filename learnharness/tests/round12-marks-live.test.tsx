/**
 * Round 12, 3 D3 and 4 minor 1: an answer's mark showed only after a
 * reload. The session read its marks once, when the window's own stream
 * ended; a save that landed in the record after that (the turn's persist,
 * a problem closed late, answers saved once an unreadable record came
 * back) was never read, while the tutor said the marks were on their
 * cards. The marks are read again each time the record they come from
 * changes: the course record (`course-changed`) and the session's own
 * (`turn-settled`, `record-changed`), mid-turn included.
 */

import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { ServerEventsProvider, type NotifySource } from "../components/server-events.tsx";
import { useAnswerMarks } from "../components/answer-marks-fetch.ts";

const WS = "/study/probability";
const CHAT = "chat_poisson";

const originalFetch = globalThis.fetch;
let root: Root | null = null;
afterEach(async () => {
	await act(async () => root?.unmount());
	root = null;
	document.body.innerHTML = "";
	globalThis.fetch = originalFetch;
});

const MARK = { rows: [{ id: "o24", topics: ["poisson"], label: null, result: "correct", grade: "solid", helped: false, predicted: false, gaveUp: false, uncertain: false, sure: "guess" }], disputed: false };

function Marks({ settled }: { settled: number | null }) {
	const marks = useAnswerMarks(CHAT, WS, settled);
	return <p data-testid="marks">{Object.keys(marks).join(",")}</p>;
}

async function mount(settled: number | null) {
	let saved = false;
	let reads = 0;
	globalThis.fetch = ((input: string) => {
		reads++;
		assert.equal(String(input), `/api/chats/${CHAT}/marks`);
		return Promise.resolve(Response.json({ ok: true, marks: saved ? { toolu_e6: MARK } : {} }));
	}) as typeof fetch;
	const handlers = new Map<string, (data: string) => void>();
	const source: NotifySource = { close() {}, onOpen() {}, onEvent: (name, cb) => void handlers.set(name, cb) };
	const host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	const render = (s: number | null) => act(async () => root!.render(<ServerEventsProvider connect={() => source}><Marks settled={s} /></ServerEventsProvider>));
	await render(settled);
	const fire = (name: string, payload: unknown) => act(async () => handlers.get(name)!(JSON.stringify(payload)));
	const shown = () => document.querySelector("[data-testid=marks]")!.textContent;
	return { render, fire, shown, save: () => void (saved = true), reads: () => reads };
}

describe("an answer's mark shows as soon as the record holds it", () => {
	it("a save that lands after the stream ended shows with the turn's settle, no reload", async () => {
		const page = await mount(12);
		assert.equal(page.shown(), "");
		page.save();
		await page.fire("turn-settled", { chatId: CHAT });
		assert.equal(page.shown(), "toolu_e6");
	});

	it("a save in the course record shows while the turn still runs", async () => {
		const page = await mount(null);
		page.save();
		await page.fire("course-changed", { workspace: WS });
		assert.equal(page.shown(), "toolu_e6");
	});

	it("answers saved later (the record came back) show when the session's record changes", async () => {
		const page = await mount(12);
		page.save();
		await page.fire("record-changed", { chatId: CHAT });
		assert.equal(page.shown(), "toolu_e6");
	});

	it("another course's or session's change reads nothing", async () => {
		const page = await mount(12);
		const before = page.reads();
		await page.fire("course-changed", { workspace: "/study/linear-algebra" });
		await page.fire("turn-settled", { chatId: "chat_other" });
		assert.equal(page.reads(), before);
	});
});
