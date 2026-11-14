/**
 * One popover width (round 6, visual polish m7: the course page's Mistakes
 * opened 416 wide while the calendar's panels and the roadmap opened 320).
 * The primitive holds the width; a panel never sets its own. Only content
 * that sizes itself (a date picker, a colour swatch grid) says `w-auto`.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const ROOT = path.resolve(import.meta.dirname, "..");
const files = (dir: string): string[] =>
	fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : /\.tsx$/.test(e.name) ? [path.join(dir, e.name)] : []));

describe("popover width", () => {
	it("is 320, set once on the primitive", () => {
		assert.match(fs.readFileSync(path.join(ROOT, "components/ui/popover.tsx"), "utf8"), /"w-80 origin-/);
	});

	it("is never set by a panel", () => {
		const offenders = files("components").filter((f) => !f.endsWith("ui/popover.tsx")).flatMap((f) => {
			const src = fs.readFileSync(path.join(ROOT, f), "utf8");
			return [...src.matchAll(/<PopoverContent\b[^>]*>/gs)]
				.map((m) => m[0])
				.filter((tag) => /\bw-(?!auto\b)[\w[\]-]+|PANEL_WIDTH/.test(tag))
				.map((tag) => `${f}: ${tag.replace(/\s+/g, " ").slice(0, 120)}`);
		});
		assert.deepEqual(offenders, []);
	});
});
