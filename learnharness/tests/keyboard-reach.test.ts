/**
 * Keyboard reach (Edo, 13 Nov 2026): the calendar answers to letters,
 * confidence steps on ⌥↑ ⌥↓, ⌘O picks a course, and the cheat sheet says
 * so in plain words.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	KEYBOARD_ACTIONS,
	actionForBinding,
	formatBinding,
	IS_MAC,
	kbdEventForAction,
} from "../src/core/index.ts";
import { cheatSheetSections } from "../components/keyboard-shortcuts.tsx";

describe("the registry's new keys", () => {
	it("the calendar's letters each fire their own action on its own event", () => {
		const letters = { t: "calendar-today", w: "calendar-week", m: "calendar-month", p: "calendar-previous", n: "calendar-next" } as const;
		for (const [key, action] of Object.entries(letters)) {
			assert.equal(actionForBinding(key), action, key);
			assert.equal(kbdEventForAction(action), `lh:kbd-${action}`);
		}
	});

	it("⌘O picks a course; ⌥↑ ⌥↓ stay with the confidence toggle and never dispatch", () => {
		assert.equal(actionForBinding("mod+o"), "pick-course");
		assert.equal(actionForBinding("alt+arrowup") ?? null, null);
		assert.equal(actionForBinding("alt+arrowdown") ?? null, null);
	});
});

describe("the cheat sheet groups them in plain words", () => {
	const sections = cheatSheetSections();
	const rows = (label: string) =>
		sections.find((s) => s.label === label)?.actions.map((a) => [a.label, formatBinding(a.binding)]) ?? [];

	it("lists its sections in order", () => {
		assert.deepEqual(
			sections.map((s) => s.label),
			["Anywhere", "Pages", "Calendar", "Home", "In a lesson", "Answering a question"],
		);
	});

	it("Pages: move with the arrows, open with Enter", () => {
		assert.deepEqual(rows("Pages"), [
			["Move between rows and links", "↑ ↓ ← →"],
			["Open the row or link", "↵"],
		]);
	});

	it("Calendar: the five letters", () => {
		assert.deepEqual(rows("Calendar"), [
			["Go to today", "T"],
			["Show the week", "W"],
			["Show the month", "M"],
			["Previous week or month", "P"],
			["Next week or month", "N"],
		]);
	});

	it("Home: the map's course, its enlarge and its arcs, and Today's rows (Edo's notes, N2 and N3; Stacked arcs, 17 Nov 2026)", () => {
		const shift = IS_MAC ? "⇧" : "Shift+";
		assert.deepEqual(rows("Home"), [
			["The course left or right on the map", "← →"],
			["Enlarge the map, and back", "F"],
			["The arc above on the map", `${shift}↑`],
			["The arc below on the map", `${shift}↓`],
			["Go to You are here on the map", "H"],
			["Move between Today's rows", "↑ ↓"],
			["Open the row", "O"],
			["Open the row's course page, else the map's", "C"],
		]);
	});

	it("Lesson: more sure, less sure, pick a course", () => {
		const alt = IS_MAC ? "⌥" : "Alt+";
		const mod = IS_MAC ? "⌘" : "Ctrl+";
		const lesson = rows("In a lesson");
		assert.deepEqual(lesson.slice(-3), [
			["More sure", `${alt}↑`],
			["Less sure", `${alt}↓`],
			["Pick a course", `${mod}O`],
		]);
	});

	it("files every action somewhere", () => {
		const shown = new Set(cheatSheetSections().flatMap((s) => s.actions.map((a) => a.id)));
		assert.deepEqual([...shown].sort(), KEYBOARD_ACTIONS.map((a) => a.id).sort());
	});
});
