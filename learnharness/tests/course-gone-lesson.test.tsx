/**
 * A deleted course's lesson (round 7, 15 Nov 2026): going Back to it showed
 * a live box, and the message he sent there was refused and lost. The
 * refusal is now known as such, and what he wrote goes to the New lesson
 * box, which the lesson's line names.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as Record<string, unknown>).self = globalThis;
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHTML } from "linkedom";
import { createRoot } from "react-dom/client";

class MemoryStorage {
	private map = new Map<string, string>();
	get length() { return this.map.size; }
	key(i: number) { return [...this.map.keys()][i] ?? null; }
	getItem(k: string) { return this.map.get(k) ?? null; }
	setItem(k: string, v: string) { this.map.set(k, v); }
	removeItem(k: string) { this.map.delete(k); }
	clear() { this.map.clear(); }
}
Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });
const dom = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { window: dom.window, document: dom.document, HTMLElement: dom.window.HTMLElement });

const { isCourseDeletedRefusal } = await import("../components/lesson/turn-error-text.ts");
const { keepForNewLesson, keptWords, NEW_LESSON_BOX, setKeptWindow } = await import("../components/lesson/kept-drafts.ts");
const { CourseGoneLine } = await import("../components/lesson/course-gone.tsx");
setKeptWindow("w-one", { live: ["w-one"] });

test("the chat route's refusal for a deleted course is told apart from other failures", () => {
	assert.equal(isCourseDeletedRefusal(JSON.stringify({ error: "This course was deleted. Its lessons stay as history.", code: "course_deleted" })), true);
	assert.equal(isCourseDeletedRefusal(JSON.stringify({ error: "Unknown chat" })), false);
	assert.equal(isCourseDeletedRefusal("Failed to fetch"), false);
	assert.equal(isCourseDeletedRefusal(undefined), false);
});

test("what he wrote in a deleted course's lesson waits in the New lesson box, after what it held", () => {
	keepForNewLesson("one more chain rule problem? d/dx sin(x^3)");
	assert.equal(keptWords(NEW_LESSON_BOX)?.text, "one more chain rule problem? d/dx sin(x^3)");
	keepForNewLesson("and the product rule");
	assert.equal(keptWords(NEW_LESSON_BOX)?.text, "one more chain rule problem? d/dx sin(x^3)\n\nand the product rule");
});

test("the deleted course's line says where his words went, and offers a new lesson", async () => {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	await act(async () => root.render(<CourseGoneLine kept />));
	assert.match(host.textContent ?? "", /This course was deleted\. Its lessons stay as history\. What you wrote here is in the new lesson box\./);
	assert.equal(host.querySelector("a")?.getAttribute("href"), "/chat/new");
	await act(async () => root.render(<CourseGoneLine />));
	assert.doesNotMatch(host.textContent ?? "", /new lesson box/);
	await act(async () => root.unmount());
});
