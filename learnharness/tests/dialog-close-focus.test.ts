/**
 * A dialog that closes and finds nothing to give focus back to (opened by
 * a shortcut, or its opener gone) lands focus where he types, never on the
 * page (round 5, 14 Nov 2026: the dispute dialog, deleting a course).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { landFocusAfterClose } from "../components/ui/overlay.ts";

function page(active: "body" | "opener" | "gone") {
	const focused: string[] = [];
	const body = { isConnected: true };
	const opener = { isConnected: active !== "gone" };
	const field = { focus: () => focused.push("composer") };
	const doc = {
		body,
		activeElement: active === "body" ? body : opener,
		querySelector: (selector: string) => (selector.includes("composer") ? field : null),
	} as unknown as Document;
	return { doc, focused };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

test("a dialog closed with focus left on the page puts it in the composer", async () => {
	for (const state of ["body", "gone"] as const) {
		const { doc, focused } = page(state);
		landFocusAfterClose(undefined, () => doc)(new Event("focusout", { cancelable: true }));
		await settle();
		assert.deepEqual(focused, ["composer"], state);
	}
});

test("a dialog whose opener took focus back leaves it there", async () => {
	const { doc, focused } = page("opener");
	landFocusAfterClose(undefined, () => doc)(new Event("focusout", { cancelable: true }));
	await settle();
	assert.deepEqual(focused, []);
});

test("a caller that places focus itself keeps it", async () => {
	const { doc, focused } = page("body");
	landFocusAfterClose((e) => e.preventDefault(), () => doc)(new Event("focusout", { cancelable: true }));
	await settle();
	assert.deepEqual(focused, []);
});
