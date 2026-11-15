/**
 * A field keeps the keys that type (round 3, 14 Nov 2026): F2 renames a
 * lesson even while focus sits in its answer box, and the cheat sheet
 * lists Try again's key.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fieldKeepsKey } from "../src/core/index.ts";
import { cheatSheetSections } from "../components/keyboard-shortcuts.tsx";

const press = (key: string, tagName: string, mods: Partial<Record<"metaKey" | "ctrlKey" | "altKey", boolean>> = {}) =>
	({ key, metaKey: false, ctrlKey: false, altKey: false, ...mods, target: { tagName, isContentEditable: false } }) as unknown as KeyboardEvent;

describe("fieldKeepsKey", () => {
	it("F2 in the answer box reaches rename instead of the box", () => {
		assert.equal(fieldKeepsKey(press("F2", "TEXTAREA")), false);
		assert.equal(fieldKeepsKey(press("F12", "INPUT")), false);
	});

	it("keys that type stay with the field; chords pass", () => {
		assert.equal(fieldKeepsKey(press("?", "TEXTAREA")), true);
		assert.equal(fieldKeepsKey(press("t", "INPUT")), true);
		assert.equal(fieldKeepsKey(press("n", "TEXTAREA", { metaKey: true })), false);
	});

	it("outside a field nothing is kept", () => {
		assert.equal(fieldKeepsKey(press("t", "DIV")), false);
	});
});

describe("the cheat sheet", () => {
	it("lists Try again under In a lesson", () => {
		const lesson = cheatSheetSections().find((s) => s.label === "In a lesson");
		assert.ok(lesson?.actions.some((a) => a.id === "try-again"));
	});

	it("lists Esc to stop the tutor's reply under In a lesson", () => {
		// Round 7 (robustness): the sheet still did not say Esc stops the tutor.
		const lesson = cheatSheetSections().find((s) => s.label === "In a lesson");
		const stop = lesson?.actions.find((a) => a.id === "stop-reply");
		assert.equal(stop?.binding, "escape");
		assert.equal(stop?.label, "Stop the tutor's reply");
	});
});
