/**
 * Tab is dead (Edo, 17 Sep 2026): the shortcuts list it nowhere, and the
 * day's end reads Done for today.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { KEYBOARD_ACTIONS } from "../src/core/keyboard.ts";

test("the shortcuts list Tab nowhere and say Done for today", () => {
	assert.ok(!KEYBOARD_ACTIONS.some((a) => a.binding === "tab"));
	assert.equal(KEYBOARD_ACTIONS.find((a) => a.id === "done-tonight")?.label, "Done for today");
	assert.ok(!KEYBOARD_ACTIONS.some((a) => /tonight/i.test(a.label)));
});
