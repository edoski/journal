import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KEYBOARD_ACTIONS } from "../src/core/keyboard.ts";

// The sidebar's search finds topics, lessons and courses (unit-inbox.md,
// "Search"); its label, tooltip and keyboard-list row read one string.
describe("search's label", () => {
	it("names everything search finds, courses included", () => {
		assert.equal(KEYBOARD_ACTIONS.find((action) => action.id === "sessions-search")!.label, "Search topics, lessons and courses");
	});
});
