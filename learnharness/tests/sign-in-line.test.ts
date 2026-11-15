/**
 * Round 8 (4 #6): the refused-turn line leaves with its cause. After the
 * sign-in was fixed and Refresh pressed, "Claude isn't signed in, so the
 * tutor couldn't reply." stayed red, focus landed on "Sign in" instead of
 * the box, and two sign-in controls sat side by side.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { refusalWatch } from "../components/lesson/turn-error-text.ts";
import { signedInCloseFocus } from "../components/setup-dialog-focus.ts";

test("the signed-out line clears once the account reads connected again", () => {
	let watch = refusalWatch(false, true, true);
	assert.equal(watch.clear, false, "a status read before the refusal still says connected: the line stays");
	watch = refusalWatch(watch.seenSignedOut, true, false);
	assert.equal(watch.clear, false);
	watch = refusalWatch(watch.seenSignedOut, true, true);
	assert.equal(watch.clear, true, "signed in again: the line goes");
	assert.deepEqual(refusalWatch(true, false, true), { seenSignedOut: false, clear: false }, "another error is never cleared");
});

test("the sign-in dialog closing because he signed in puts focus in the box, not on Sign in", () => {
	const focused: string[] = [];
	const doc = { body: {}, activeElement: null, querySelector: (selector: string) => (selector.includes("composer") ? { focus: () => focused.push("box") } : null) } as unknown as Document;
	const signedIn = new Event("focusout", { cancelable: true });
	signedInCloseFocus(true, () => doc)(signedIn);
	assert.equal(signedIn.defaultPrevented, true, "Radix does not hand focus back to the opener");
	assert.deepEqual(focused, ["box"]);
	const closed = new Event("focusout", { cancelable: true });
	signedInCloseFocus(false, () => doc)(closed);
	assert.equal(closed.defaultPrevented, false, "closed without signing in: focus goes back as usual");
});
