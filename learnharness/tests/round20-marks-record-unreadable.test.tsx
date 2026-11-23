/**
 * Round 20, M4 (e) (4 minor 8): Sequence limit proofs, opened after Real
 * Analysis's `course.json` went unreadable, showed its answers with no
 * marks, only their Model solution rows. Opened before the fault it kept
 * them (round 17, m23): a window keeps the marks it drew, and a fresh one
 * had drawn none. The failed read now carries the marks the session's own
 * saves sent (each `course_save`'s observations and each conclude's
 * attempts, by their receipts' ids), and a window takes them for the
 * answers it has no mark for.
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

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lh-marks-record-unreadable-"));
process.env.LH_DATA_DIR = path.join(TMP, "data");
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const { stores } = await import("../src/server/stores.ts");
const { answerMarks } = await import("../src/server/marks.ts");
const { savedAttemptsOf } = await import("../src/core/answer-marks.ts");
const { newThinkingMessage, newUserMessage } = await import("../src/core/native-messages.ts");
const { ServerEventsProvider } = await import("../components/server-events.tsx");
const { useAnswerMarks } = await import("../components/answer-marks-fetch.ts");
type LhMessage = import("../src/core/native-messages.ts").LhMessage;
type NotifySource = import("../components/server-events.tsx").NotifySource;

const WS = "/study/real-analysis";
const call = (id: string, name: string, args: unknown): LhMessage => ({ id: `a_${id}`, role: "assistant", content: [{ type: "toolCall", id, name, arguments: args }], stopReason: "toolUse", timestamp: 1 }) as unknown as LhMessage;
const result = (id: string, name: string, text: string): LhMessage => ({ id: `r_${id}`, role: "toolResult", toolCallId: id, toolName: name, content: [{ type: "text", text }], details: null, isError: false, timestamp: 2 }) as unknown as LhMessage;

/** The seeded practice lesson: one problem right on his own, one wrong
 *  then right after a nudge; then a lesson question answered in words. */
function lesson(): LhMessage[] {
	const said = newUserMessage("Take N > 1/ε; then 1/n < ε for every n > N.");
	return [
		call("p1", "problem", { statement: "Prove $1/n \\to 0$ with an explicit $M$.", mode: "recall", topics: ["sequence-limits"] }),
		result("p1", "problem", "Problem posed"),
		newThinkingMessage("p1", "Given ε, take M > 1/ε.", "confident"),
		call("c1", "conclude", { outcome: "solved", verdict: "Right.", rung: null, missClass: null, retest: false, result: "correct", response: "M > 1/ε", record: "Chose M > 1/ε for 1/n → 0" }),
		result("c1", "conclude", 'Problem concluded. Course record: {"revision":4,"observations":["o40"],"saved":["o40"]}'),
		call("p2", "problem", { statement: "Prove $\\sqrt{n}/(n+1) \\to 0$.", mode: "recall", topics: '["sequence-limits"]' }),
		result("p2", "problem", "Problem posed"),
		newThinkingMessage("p2", "bounded by its derivative", "confident"),
		newThinkingMessage("p2", "√n/(n+1) < 1/√n, which tends to 0", undefined),
		call("c2", "conclude", { outcome: "solvedWithHints", verdict: "Right after the nudge.", rung: "R1", missClass: "cue", retest: false, result: "correct", response: "< 1/√n", record: "Bounded by 1/√n after the nudge", firstTry: { result: "incorrect", response: "derivative", record: "Bounded the derivative instead of the term", sure: "confident" } }),
		result("c2", "conclude", 'Problem concluded. Course record: {"revision":5,"observations":["o41","o42"],"saved":["o41","o42"]}'),
		said,
		call("s1", "course_save", { changes: { observations: [{ topics: ["sequence-limits"], text: "Chose N > 1/ε", response: "N > 1/ε", help: "none", result: "correct", sure: "guess", question: "his-message" }] } }),
		result("s1", "course_save", '{"revision":6,"observations":["o43"],"saved":["o43"]}'),
	];
}

describe("marks while the course's record can't be read", () => {
	const original = stores.courseRecords;
	afterEach(() => void (stores.courseRecords = original));

	it("the session's own saves give each answer its mark: First try and Then included", () => {
		const attempts = savedAttemptsOf(lesson());
		assert.deepEqual(Object.keys(attempts).sort(), ["o40", "o41", "o42", "o43"]);
		assert.deepEqual([attempts.o40!.result, attempts.o40!.grade, attempts.o40!.sure], ["correct", "solid", "confident"]);
		assert.deepEqual([attempts.o41!.result, attempts.o41!.grade], ["incorrect", "missed"]);
		assert.deepEqual([attempts.o42!.result, attempts.o42!.grade], ["correct", "helped"]);
		assert.deepEqual([attempts.o43!.grade, attempts.o43!.sure], ["helped", "guess"], "a right guess is helped, as the engine grades it");
	});

	it("a lesson opened after the fault reads them in its failed read", async () => {
		const chat = stores.chatStore.createChat("Sequence limit proofs", { workspace: WS, title: "Real Analysis" });
		stores.chatStore.saveMessages(chat.id, lesson());
		stores.courseRecords = { ...original, run: async () => ({ ok: false, kind: "io", message: "PermissionError: course.json" }) };
		const read = await answerMarks(chat.id);
		assert.equal(read.status, 503, "still a failed read, so a window keeps what it drew");
		assert.equal(read.body.ok, false);
		const marks = (read.body as { marks?: Record<string, { rows: Array<{ label: string | null; result: string; helped: boolean }> }> }).marks!;
		assert.deepEqual(Object.keys(marks).filter((k) => k.startsWith("c")).sort(), ["c1", "c2"]);
		assert.deepEqual(marks.c2!.rows.map((r) => [r.label, r.result, r.helped]), [["First try", "incorrect", false], ["Then", "correct", true]]);
	});
});

describe("a window opened while the record can't be read", () => {
	let root: Root | null = null;
	const originalFetch = globalThis.fetch;
	afterEach(async () => {
		await act(async () => root?.unmount());
		root = null;
		document.body.innerHTML = "";
		globalThis.fetch = originalFetch;
	});

	it("draws the saves' marks, and never replaces a mark it drew from the record", async () => {
		const row = (id: string, result: string) => ({ id, topics: ["sequence-limits"], label: null, result, grade: "solid", helped: false, predicted: false, gaveUp: false, uncertain: false, sure: null });
		const answers: Response[] = [
			Response.json({ ok: false, error: "The course's record can't be read", marks: { c1: { rows: [row("o40", "correct")], disputed: false } } }, { status: 503 }),
			Response.json({ ok: true, marks: { c1: { rows: [row("o40", "partial")], disputed: true } } }),
			Response.json({ ok: false, error: "The course's record can't be read", marks: { c1: { rows: [row("o40", "correct")], disputed: false }, c2: { rows: [row("o42", "correct")], disputed: false } } }, { status: 503 }),
		];
		globalThis.fetch = (() => Promise.resolve(answers.shift()!)) as unknown as typeof fetch;
		const handlers = new Map<string, (data: string) => void>();
		const source: NotifySource = { close() {}, onOpen() {}, onEvent: (name, cb) => void handlers.set(name, cb) };
		function Marks() {
			const marks = useAnswerMarks("c_seq", WS, "14:r_s1");
			return <p data-testid="marks">{Object.entries(marks).map(([k, m]) => `${k}=${m.rows[0]!.result}`).join(",")}</p>;
		}
		const host = document.createElement("div");
		document.body.appendChild(host);
		root = createRoot(host);
		await act(async () => root!.render(<ServerEventsProvider connect={() => source}><Marks /></ServerEventsProvider>));
		const shown = () => document.querySelector("[data-testid=marks]")!.textContent;
		assert.equal(shown(), "c1=correct", "a fresh open shows the mark, no reload");
		await act(async () => handlers.get("record-changed")!(JSON.stringify({ chatId: "c_seq" })));
		assert.equal(shown(), "c1=partial", "the record's mark, once it reads");
		await act(async () => handlers.get("record-changed")!(JSON.stringify({ chatId: "c_seq" })));
		assert.equal(shown(), "c1=partial,c2=correct", "the record's mark stays; the saves add only what it lacks");
	});
});
