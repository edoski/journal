/**
 * Round 21, M2 (2 N1, 4 minor 1): a session resumed on a later day closed
 * on the topics of its earlier day. Problem sheet 4 was left on 6 Nov with
 * no close; on 8 Nov he answered part (c) and pressed ⌘⇧D, and the close
 * named six reviews over five days, the ones its 6 Nov save had dated. The
 * receipt read the chat since its last close, not the study day it closes.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { closeReceiptFor } from "../src/agent/tools/course.ts";
import { receiptOfSaves, sessionSavesOf } from "../src/core/close-receipt.ts";
import type { CourseMap } from "../src/core/contracts/course-map.ts";
import type { LhMessage } from "../src/core/native-messages.ts";
import type { CourseRecords } from "../src/core/ports.ts";

const D8 = "2026-11-08";
const at = (day: number, hour: number) => new Date(2026, 10, day, hour, 0).getTime();
let n = 0;

const topic = (handle: string, title: string, date: string) => ({ handle, title, level: "attempted", tasks: [], review: { kind: "scheduled", date } });

/** Linear Algebra on 8 Nov, as lens 2's sheet close read it. */
const LA_8 = {
	workspace: "/la",
	title: "Linear Algebra",
	today: D8,
	tasks: [{ key: "sheet-4", title: "Problem sheet 4", step: null, updated: D8, topics: ["kernel"] }],
	topics: [
		topic("kernel", "Kernel and rank-nullity", "2026-11-09"),
		topic("subspace-span", "Subspaces and spanning sets", "2026-11-10"),
		topic("homomorphism", "Homomorphisms (linear maps)", "2026-11-10"),
		topic("mult-mechanics", "Mechanics of matrix multiplication", "2026-11-11"),
		topic("det-properties", "Determinants", "2026-11-12"),
		topic("independence", "Linear independence", "2026-11-27"),
	],
} as unknown as CourseMap;
const records = { map: async () => ({ ok: true, map: LA_8 }) } as unknown as CourseRecords;

/** One save the tutor made, its call and the engine's receipt, at `ts`. */
function saved(ts: number, topics: string[], extra: Record<string, unknown> = {}): LhMessage[] {
	const id = `v-${++n}`;
	const reviews = Object.fromEntries(topics.map((t) => {
		const { title, review } = LA_8.topics.find((x) => x.handle === t) as unknown as { title: string; review: { date: string } };
		return [t, { due: review.date, planned: review.date, title }];
	}));
	return [
		{ id: `a-${++n}`, role: "assistant", content: [{ type: "toolCall", id, name: "course_save", arguments: { changes: { observations: topics.map((t) => ({ topics: [t], text: "…", result: "correct", help: "none" })), ...extra } } }], stopReason: "toolUse", timestamp: ts } as unknown as LhMessage,
		{ id: `r-${++n}`, role: "toolResult", toolCallId: id, toolName: "course_save", content: [{ type: "text", text: JSON.stringify({ revision: n, reviews }) }], details: {}, isError: false, timestamp: ts } as unknown as LhMessage,
	];
}
const said = (ts: number, text: string): LhMessage => ({ id: `u-${++n}`, role: "user", content: text, timestamp: ts }) as LhMessage;

/** The sheet as the seed holds it: five reviews and its own task saved on
 *  6 Nov, never closed, then part (c) answered on 8 Nov. */
const SHEET = {
	title: "Problem sheet 4",
	topics: ["kernel"],
	messages: [
		said(at(6, 10), "Help me start problem sheet 4."),
		...saved(at(6, 11), ["subspace-span", "homomorphism", "mult-mechanics", "independence", "det-properties"], { tasks: { "sheet-4": { title: "Problem sheet 4", step: "Part (c)" } } }),
		said(at(8, 10), "Continue Problem sheet 4"),
		...saved(at(8, 10), ["kernel"]),
	],
};

describe("the close names only the study day it closes (round 21, M2)", () => {
	let pinned: string | undefined;
	beforeEach(() => {
		pinned = process.env.LEARNING_TODAY;
		process.env.LEARNING_TODAY = D8;
	});
	afterEach(() => {
		if (pinned === undefined) delete process.env.LEARNING_TODAY;
		else process.env.LEARNING_TODAY = pinned;
	});

	it("a save on day 1 and no close, then a save on day 3 and the close: only day 3's topics, and the sheet that goes on", async () => {
		const receipt = (await closeReceiptFor(records, "/la", SHEET))!;
		assert.deepEqual(receipt.topics.map((t) => t.title), ["Kernel and rank-nullity"]);
		assert.equal(receipt.continues?.title, "Problem sheet 4");
		assert.doesNotMatch(receipt.says, /Subspaces|Homomorphisms|Mechanics|Determinants|independence/);
	});

	it("a save's close so far counts only the saves of its day", () => {
		const close = receiptOfSaves(sessionSavesOf(SHEET.messages), D8);
		assert.deepEqual(close.topics.map((t) => t.handle), ["kernel"]);
	});

	it("a session that never left its day keeps every save since its last close", async () => {
		const sameDay = { ...SHEET, messages: SHEET.messages.map((m) => ({ ...m, timestamp: at(8, 9) })) };
		const receipt = (await closeReceiptFor(records, "/la", sameDay))!;
		assert.deepEqual(receipt.topics.map((t) => t.handle).sort(), ["det-properties", "homomorphism", "independence", "kernel", "mult-mechanics", "subspace-span"]);
	});
});
