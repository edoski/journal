/**
 * After Done for today his keys go back to the box (round 12, 1 m9): with a
 * half answer kept in the box, focus sat on the page body once the close
 * settled.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { focusAfterDone } from "../components/lesson/done-tonight.tsx";

function page(active: "body" | "elsewhere") {
	const focused: string[] = [];
	const body = { isConnected: true };
	const other = { isConnected: true };
	const doc = { body, activeElement: active === "body" ? body : other, querySelector: (s: string) => (s.includes("composer") ? { focus: () => focused.push("composer") } : null) } as unknown as Document;
	return { doc, focused };
}

describe("focus after Done for today (1 m9)", () => {
	it("lands in the composer once the close settles, and leaves focus he placed himself", () => {
		const settled = page("body");
		focusAfterDone(settled.doc, true, true);
		assert.deepEqual(settled.focused, ["composer"]);
		const writing = page("body");
		focusAfterDone(writing.doc, true, false);
		assert.deepEqual(writing.focused, [], "not while the close is being written");
		const placed = page("elsewhere");
		focusAfterDone(placed.doc, true, true);
		assert.deepEqual(placed.focused, []);
	});
});
