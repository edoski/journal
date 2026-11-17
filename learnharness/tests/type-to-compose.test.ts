import { test } from "node:test";
import assert from "node:assert/strict";
import { typesCharacter } from "../components/type-to-compose.ts";

const key = (k: string, mods: Partial<Record<"metaKey" | "ctrlKey" | "altKey" | "isComposing", boolean>> = {}) => ({ key: k, metaKey: false, ctrlKey: false, altKey: false, isComposing: false, ...mods });

test("a key that types a character goes to the composer: letters, capitals, digits and punctuation", () => {
	for (const k of ["h", "H", "7", ".", "é"]) assert.ok(typesCharacter(key(k)), k);
});

test("commands, navigation, Space and the shortcut list's ? stay with the page", () => {
	assert.ok(!typesCharacter(key("k", { metaKey: true })), "⌘K");
	assert.ok(!typesCharacter(key("h", { altKey: true })), "⌥H");
	assert.ok(!typesCharacter(key("ArrowDown")), "arrows");
	assert.ok(!typesCharacter(key("Enter")), "Enter");
	assert.ok(!typesCharacter(key(" ")), "Space presses the focused button");
	assert.ok(!typesCharacter(key("?")), "? opens the shortcut list");
	assert.ok(!typesCharacter(key("a", { isComposing: true })), "mid-composition");
});
