/**
 * Round 18, m20 (2 m7). The dispute dialog opened with no choice picked, on
 * a "Right · On your own" card, and Send to the tutor looked as it does when
 * it sends: pressed with nothing written, it did nothing, and nothing said
 * why. A pick equal to the card's own mark counted as a change. Now, on one
 * try, the choices start at the card's mark and how it counted, Send waits
 * until he writes words or moves a choice off them, and only what he moved
 * is sent.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import { dom } from "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "./helpers/app-render.tsx";
import { DisputeDialog, disputeDraft, disputeStart, type DisputeDraft } from "../components/answer-mark.tsx";
import type { MarkRow } from "../src/core/index.ts";

Object.assign(globalThis, { CSS: { escape: (value: string) => value } });

const row = (over: Partial<MarkRow> = {}): MarkRow => ({ id: "o94", topics: ["rv"], label: null, result: "correct", grade: "solid", helped: false, predicted: false, gaveUp: false, uncertain: false, sure: null, ...over });

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(async () => {
	await act(async () => { root?.unmount(); });
	root = null;
	host?.remove();
	host = null;
	document.body.innerHTML = "";
});
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

async function open(rows: MarkRow[]) {
	const sent: DisputeDraft[] = [];
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	await act(async () => { root!.render(<DisputeDialog rows={rows} onClose={() => {}} onSend={(d) => sent.push(d)} />); });
	await settle();
	return sent;
}
const send = () => document.querySelector<HTMLButtonElement>('[data-testid="dispute-send"]')!;
const picked = (group: string) => document.querySelector(`[data-testid="${group}"] [data-state="on"]`)?.getAttribute("data-pick") ?? null;
const press = (group: string, pick: string) => act(async () => { document.querySelector<HTMLButtonElement>(`[data-testid="${group}"] [data-pick="${pick}"]`)!.click(); });

describe("the dispute's Send waits for a change (round 18, m20)", () => {
	it("opens on the card's own mark and how it counted, with Send off", async () => {
		const sent = await open([row()]);
		assert.equal(picked("dispute-pick"), "correct");
		assert.equal(picked("dispute-how"), "ownWork");
		assert.equal(send().disabled, true, "nothing differs from the card yet");
		await act(async () => send().click());
		assert.deepEqual(sent, []);
	});

	it("moving a choice off the card's turns Send on, and sends only what moved", async () => {
		const sent = await open([row()]);
		await press("dispute-pick", "partial");
		assert.equal(send().disabled, false);
		await act(async () => send().click());
		assert.deepEqual(sent, [{ proposed: "partial" }], "how it counted was not moved, so it is not sent");
	});

	it("moving a choice back to the card's turns Send off again", async () => {
		await open([row({ helped: true })]);
		assert.equal(picked("dispute-how"), "withHelp");
		await press("dispute-how", "ownWork");
		assert.equal(send().disabled, false);
		await press("dispute-how", "withHelp");
		assert.equal(send().disabled, true);
	});
});

describe("what a dispute sends", () => {
	it("starts at the card on one try, and at nothing on several", () => {
		assert.deepEqual(disputeStart([row({ result: "partial" })]), { result: "partial", how: "ownWork" });
		assert.deepEqual(disputeStart([row({ gaveUp: true, result: "incorrect" })]), { result: "incorrect", how: "" }, "gave up is no How choice");
		assert.deepEqual(disputeStart([row(), row({ id: "o95" })]), { result: "", how: "" });
	});

	it("is null until words or a moved choice, and carries only those", () => {
		const start = { result: "correct" as const, how: "ownWork" as const };
		assert.equal(disputeDraft(start, "  ", "correct", "ownWork"), null);
		assert.equal(disputeDraft(start, "", "", ""), null, "a choice cleared is no change");
		assert.deepEqual(disputeDraft(start, "The 7 was a typo", "correct", "ownWork"), { said: "The 7 was a typo" });
		assert.deepEqual(disputeDraft(start, "", "correct", "withHelp"), { proposedHow: "withHelp" });
		assert.deepEqual(disputeDraft({ result: "", how: "" }, "", "correct", ""), { proposed: "correct" });
	});
});
