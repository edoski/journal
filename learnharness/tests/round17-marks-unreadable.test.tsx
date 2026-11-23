/**
 * Round 17, m23 (4 minor 5): with Real Analysis's `course.json` unreadable,
 * the next read of a practice lesson's marks answered "no marks", and every
 * earlier mark vanished from the transcript, leaving only its "Model
 * solution" rows. A record the engine cannot read is a failed read: the
 * marks route says so (503), and the window keeps the marks it drew until
 * the record reads again.
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

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lh-marks-unreadable-"));
process.env.LH_DATA_DIR = path.join(TMP, "data");
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const { stores } = await import("../src/server/stores.ts");
const { answerMarks } = await import("../src/server/marks.ts");
const { newUserMessage } = await import("../src/core/index.ts");
const { ServerEventsProvider } = await import("../components/server-events.tsx");
const { useAnswerMarks } = await import("../components/answer-marks-fetch.ts");
type CourseResult = import("../src/core/index.ts").CourseResult;
type NotifySource = import("../components/server-events.tsx").NotifySource;

const WS = "/study/real-analysis";
const ATTEMPT = { kind: "attempt", topics: ["sequence-limits"], text: "Proved $1/n \\to 0$ from the definition", result: "correct", grade: "solid", help: "none", date: "2026-11-08" };

function lessonWithAnswer(): string {
	const chat = stores.chatStore.createChat("Sequence limit proofs", { workspace: WS, title: "Real Analysis" });
	const said = newUserMessage("Take N > 1/ε; then 1/n < ε for every n > N.");
	stores.chatStore.saveMessages(chat.id, [said]);
	stores.chatStore.saveAnswerSaves(chat.id, { [said.id]: ["o12"] });
	return said.id;
}

describe("the marks route with the course's record unreadable (round 17, m23)", () => {
	const original = stores.courseRecords;
	afterEach(() => void (stores.courseRecords = original));
	const engine = (result: CourseResult) => void (stores.courseRecords = { ...original, run: async () => result });

	it("reads the mark while the record reads", async () => {
		const answer = lessonWithAnswer();
		const chat = stores.chatStore.listChats().find((c) => c.title === "Sequence limit proofs")!;
		engine({ ok: true, json: { items: { o12: ATTEMPT } } });
		const read = await answerMarks(chat.id);
		assert.equal(read.status, 200);
		assert.ok(read.body.ok && answer in read.body.marks);
	});

	it("is a failed read once the engine cannot read it, never no marks", async () => {
		const chat = stores.chatStore.listChats().find((c) => c.title === "Sequence limit proofs")!;
		engine({ ok: false, kind: "io", message: "PermissionError: course.json" });
		const read = await answerMarks(chat.id);
		assert.equal(read.status, 503);
		assert.equal(read.body.ok, false);
	});
});

describe("the lesson's marks while the record can't be read", () => {
	const originalFetch = globalThis.fetch;
	let root: Root | null = null;
	afterEach(async () => {
		await act(async () => root?.unmount());
		root = null;
		document.body.innerHTML = "";
		globalThis.fetch = originalFetch;
	});

	it("keeps the marks it drew, and takes the record's again once it reads", async () => {
		const MARK = { rows: [{ id: "o12", topics: ["sequence-limits"], label: null, result: "correct", grade: "solid", helped: false, predicted: false, gaveUp: false, uncertain: false }], disputed: false };
		let readable = true;
		globalThis.fetch = (() =>
			Promise.resolve(readable ? Response.json({ ok: true, marks: { u1: MARK } }) : Response.json({ ok: false, error: "The course's record can't be read" }, { status: 503 }))) as unknown as typeof fetch;
		const handlers = new Map<string, (data: string) => void>();
		const source: NotifySource = { close() {}, onOpen() {}, onEvent: (name, cb) => void handlers.set(name, cb) };
		function Marks() {
			const marks = useAnswerMarks("c1", WS, "1:u1");
			return <p data-testid="marks">{Object.keys(marks).join(",")}</p>;
		}
		const host = document.createElement("div");
		document.body.appendChild(host);
		root = createRoot(host);
		await act(async () => root!.render(<ServerEventsProvider connect={() => source}><Marks /></ServerEventsProvider>));
		const shown = () => document.querySelector("[data-testid=marks]")!.textContent;
		assert.equal(shown(), "u1");
		readable = false;
		await act(async () => handlers.get("turn-settled")!(JSON.stringify({ chatId: "c1" })));
		assert.equal(shown(), "u1", "the mark stays while the record is unreadable");
	});
});
