/**
 * Round 14, m12 (known; 2 n4, 4 step 4): the tutor re-marked older answers
 * unasked. "I've changed the mark on your earlier answer… to right on your
 * own": o43 corrected the seeded o37 in lens 2, and o38 in lens 4, each
 * saving `sure: confident`, which he never gave. Round 11's rule only kept
 * the corrected answer's response, and a re-mark of any attempt the session
 * had saved went through. Edo: never re-mark unasked, and never save a
 * confidence he never gave. Only a ruling on his dispute re-marks, and it
 * keeps the confidence of the answer it re-marks.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { courseTools, type CourseToolContext } from "../src/agent/tools/course.ts";
import { remarkableOf } from "../src/core/answer-marks.ts";
import { courseRecordPrompt } from "../src/agent/prompt-segments.ts";
import { newDisputeMessage, type LhMessage } from "../src/core/native-messages.ts";

const O37 = { kind: "attempt", topics: ["eigen"], text: "Explained why an eigenvector stays on its own line under $A$", response: "Av = λv means (A − λI)v = 0", help: "Prompted to name the scaling factor", result: "partial", date: "2026-11-08" };
const SEEDED = [
	{ id: "a1", role: "assistant", content: [{ type: "toolCall", id: "s1", name: "course_save", arguments: { changes: { observations: [O37] } } }], timestamp: 1 },
	{ id: "r1", role: "toolResult", toolCallId: "s1", toolName: "course_save", content: [{ type: "text", text: JSON.stringify({ saved: ["o37"] }) }], isError: false, timestamp: 2 },
] as unknown as LhMessage[];

function saving(messages: LhMessage[], target: Record<string, unknown> = O37) {
	const saves: { observations: Record<string, unknown>[] }[] = [];
	const ctx = {
		course: { workspace: "/study/la", title: "Linear Algebra" },
		records: {
			run: async (_w: string, verb: { verb: string; changes?: unknown }) => {
				if (verb.verb === "show") return { ok: true, json: { items: { o37: target } } };
				if (verb.verb === "save") saves.push(verb.changes as never);
				return { ok: true, json: { saved: ["o43"], notes: [] } };
			},
		},
		arcs: false,
		answers: new Map(),
		remarkable: remarkableOf(messages),
	} as unknown as CourseToolContext;
	const save = async (observations: unknown[]) => {
		try {
			await courseTools(ctx).course_save!.execute("t1", { changes: { observations } } as never);
			return null;
		} catch (error) {
			return (error as Error).message;
		}
	};
	return { saves, save };
}

const remark = { ...O37, corrects: ["o37"], help: "none", result: "correct", sure: "confident" };
const dispute = (messages: LhMessage[]) => [...messages, newDisputeMessage({ answerId: "q", observations: ["o37"], said: "It was right" }, "Question")] as LhMessage[];

describe("no mark changes unasked (round 14, m12)", () => {
	it("the recorded re-mark of a seeded answer this session saved is refused, and saves nothing", async () => {
		const { saves, save } = saving(SEEDED);
		assert.match((await save([remark])) ?? "", /he did not dispute o37, so it stands as recorded: never re-mark an answer on your own, and never tell him a mark changed/);
		assert.equal(saves.length, 0);
	});

	it("a ruling on his dispute keeps the confidence he gave the answer: none when he gave none", async () => {
		const { saves, save } = saving(dispute(SEEDED));
		assert.equal(await save([{ ...remark, disputed: "It was right", ruling: "You named every step." }]), null);
		assert.equal("sure" in saves[0]!.observations[0]!, false);
	});

	it("and his own when he gave one", async () => {
		const { saves, save } = saving(dispute(SEEDED), { ...O37, sure: "guess" });
		assert.equal(await save([{ ...remark, disputed: "It was right", ruling: "You named every step." }]), null);
		assert.equal(saves[0]!.observations[0]!.sure, "guess");
	});

	it("the record prompt never invites a re-mark on his own", () => {
		const prompt = courseRecordPrompt("teacher", { arcs: false });
		assert.doesNotMatch(prompt, /or one you saved in this session and recorded wrongly/);
		assert.match(prompt, /never re-mark one on your own/);
	});
});
