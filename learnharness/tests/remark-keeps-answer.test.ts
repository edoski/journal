/**
 * A re-mark sets a mark right; it never carries a new answer (round 11, 2
 * n4): in a prediction turn the tutor saved his new answer on the
 * eigen-equation as a re-mark of the seeded o34 (partly right, prompted),
 * so the seeded mark rose to right, on his own, confident, with no word to
 * him and no card of its own. A re-mark the tutor makes unasked keeps the
 * answer it corrects; one that brings another response is refused, naming
 * the fix: a new answer is a new attempt.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { courseTools, type CourseToolContext } from "../src/agent/tools/course.ts";

const O34 = { kind: "attempt", topics: ["eigen"], text: "Explained why an eigenvector stays on its own line under $A$", help: "Prompted to name the scaling factor", result: "partial", date: "2026-11-08" };

function saving() {
	const saves: unknown[] = [];
	const ctx: CourseToolContext = {
		course: { workspace: "/study/la", title: "Linear Algebra" },
		records: {
			run: async (_w: string, verb: { verb: string; changes?: unknown; handles?: unknown }) => {
				if (verb.verb === "show") return { ok: true, json: { items: { o34: O34 } } };
				if (verb.verb === "save") saves.push(verb.changes);
				return { ok: true, json: { saved: ["o41"], notes: [] } };
			},
		} as unknown as CourseToolContext["records"],
		arcs: false,
		answers: new Map(),
		remarkable: { saved: new Set(["o34"]), disputed: new Set() },
	};
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

describe("a re-mark the tutor makes unasked", () => {
	it("is refused when it brings a new answer, and saves nothing", async () => {
		const { saves, save } = saving();
		const refused = await save([{ kind: "attempt", topics: ["eigen"], corrects: ["o34"], text: "Explained why $Av = \\lambda v$ forces $\\det(A - \\lambda I) = 0$", response: "Av = λv means (A − λI)v = 0, so the determinant is zero.", help: "none", result: "correct" }]);
		assert.match(refused ?? "", /o34.*new answer is a new attempt/s);
		assert.equal(saves.length, 0);
	});

	it("goes through when it keeps the answer it corrects", async () => {
		const { saves, save } = saving();
		assert.equal(await save([{ ...O34, corrects: ["o34"], help: "none", result: "correct" }]), null);
		assert.equal(saves.length, 1);
	});
});
