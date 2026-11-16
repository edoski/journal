/**
 * Nothing in the demo world's seeded lesson prints what its prediction
 * asks him to find (round 13, 1 n10): the seeded Eigen lesson's code
 * sample ran `np.linalg.eig` on the very matrix the prediction then asked
 * about and printed its eigenvalues, `[3. 1.]`, above the question. The
 * seed is the Logbook adapter's; the check skips where it is not installed.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

const SEED = path.join(os.homedir(), ".claude", "skills", "logbook", "adapters", "journal", "seed", "seed-chats.mjs");

/** A 2 × 2 pmatrix's entries as a code literal: "[[2, 1], [1, 2]]". */
function literalOf(tex: string): string | null {
	const m = /\\\\begin\{pmatrix\}\s*(-?\d+)\s*&\s*(-?\d+)\s*\\\\\\\\\s*(-?\d+)\s*&\s*(-?\d+)\s*\\\\end\{pmatrix\}/.exec(tex);
	return m ? `[[${m[1]}, ${m[2]}], [${m[3]}, ${m[4]}]]` : null;
}

describe("the seeded lesson never prints its prediction's answer (1 n10)", { skip: !fs.existsSync(SEED) && "the Logbook seed is not installed" }, () => {
	it("computes no eigenvalues of the matrix the prediction asks about", () => {
		const seed = fs.readFileSync(SEED, "utf8");
		const predict = /const predictQ = "([^"]+)"/.exec(seed)?.[1] ?? "";
		const matrix = literalOf(predict);
		assert.ok(matrix, "the prediction names a 2 × 2 matrix");
		const samples = [...seed.matchAll(/FENCEpython\n([\s\S]*?)FENCE/g)].map((m) => m[1]!);
		for (const code of samples) assert.ok(!(code.includes(matrix) && /linalg\.eig/.test(code)), `a code sample runs eig on ${matrix}`);
	});
});
