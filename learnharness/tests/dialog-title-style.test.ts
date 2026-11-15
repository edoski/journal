/**
 * One dialog title style (round 6, visual polish m7: Settings named itself
 * with a 13px muted section header and a hidden title, the shortcuts sheet
 * with the 18/600 dialog title). Every dialog shows its DialogTitle in the
 * primitive's style; a caller may place it, never restyle or hide it.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const ROOT = path.resolve(import.meta.dirname, "..");
const files = (dir: string): string[] =>
	fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : /\.tsx$/.test(e.name) ? [path.join(dir, e.name)] : []));

describe("dialog titles", () => {
	it("are shown in the primitive's style everywhere", () => {
		const offenders = files("components").flatMap((f) =>
			[...fs.readFileSync(path.join(ROOT, f), "utf8").matchAll(/<DialogTitle\b[^>]*className="([^"]*)"/g)]
				.filter((m) => /\bsr-only\b|\btext-|\bfont-/.test(m[1]!))
				.map((m) => `${f}: ${m[0]}`),
		);
		assert.deepEqual(offenders, []);
	});
});
