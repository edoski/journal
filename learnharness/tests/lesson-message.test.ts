/**
 * The handover of a message from the topic page to a lesson that already
 * exists: kept in session storage under the lesson's id, taken once.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { stashLessonMessage, takeLessonMessage } from "../components/lesson-message.ts";

describe("a message handed to a lesson", () => {
	const store = new Map<string, string>();
	const fake = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
	beforeEach(() => {
		store.clear();
		Object.defineProperty(globalThis, "sessionStorage", { value: fake, configurable: true });
	});
	afterEach(() => {
		Reflect.deleteProperty(globalThis, "sessionStorage");
	});

	it("is taken once by that lesson and by no other", () => {
		assert.equal(stashLessonMessage("chat_a", "Go over the sign rule"), true);
		assert.equal(takeLessonMessage("chat_b"), undefined);
		assert.equal(takeLessonMessage("chat_a"), "Go over the sign rule");
		assert.equal(takeLessonMessage("chat_a"), undefined);
	});

	it("is refused when storage throws, and a blank one is never taken", () => {
		Object.defineProperty(globalThis, "sessionStorage", { get: () => { throw new Error("denied"); }, configurable: true });
		assert.equal(stashLessonMessage("chat_a", "hello"), false);
		assert.equal(takeLessonMessage("chat_a"), undefined);
		Object.defineProperty(globalThis, "sessionStorage", { value: fake, configurable: true });
		stashLessonMessage("chat_a", "   ");
		assert.equal(takeLessonMessage("chat_a"), undefined);
	});
});
