import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { focusHomeIn, landFocus, readingKeyScroll } from "../components/lesson/focus-home.ts";

const page = (dock: string) => parseHTML(`<html><body><main>${dock}</main></body></html>`).document;

test("the next key goes to the composer, the message or the answer field", () => {
	const doc = page('<form data-testid="composer"><textarea></textarea></form>');
	assert.equal(focusHomeIn(doc)?.tagName, "TEXTAREA");
});

test("while the tutor answers what he sent from a question or problem, his next key stays out of the message box", () => {
	// Round 4: Enter sent part 1 of an answer, and part 2, typed on, went into
	// the message box, kept there unseen behind the next question until it
	// surfaced later as a stray draft ("he o").
	const doc = page('<form data-testid="composer"><textarea></textarea></form>');
	assert.equal(focusHomeIn(doc, true), null);
	let focused = "";
	const root = { querySelector: (selector: string) => (selector.includes("composer") ? { focus: () => { focused = "composer"; } } : null) } as unknown as ParentNode;
	const body = { isConnected: true };
	landFocus({ body, activeElement: body } as unknown as Document, root, true);
	assert.equal(focused, "", "no key lands in the message box mid-reply");
	landFocus({ body, activeElement: body } as unknown as Document, root, false);
	assert.equal(focused, "composer", "once the reply is in, focus goes home as before");
});

test("focus moves only when nothing holds it", () => {
	let focused = "";
	const composer = { focus: () => { focused = "composer"; } };
	const root = { querySelector: (selector: string) => (selector.includes("composer") ? composer : null) } as unknown as ParentNode;
	const body = { isConnected: true };
	const search = { isConnected: true };
	landFocus({ body, activeElement: search } as unknown as Document, root);
	assert.equal(focused, "", "a field he is in keeps focus");
	landFocus({ body, activeElement: body } as unknown as Document, root);
	assert.equal(focused, "composer", "focus on the page itself goes home");
	focused = "";
	landFocus({ body, activeElement: { isConnected: false } } as unknown as Document, root);
	assert.equal(focused, "composer", "focus on an element that left the page goes home");
});

test("in an empty field the arrows read the lesson; with text they move the caret", () => {
	assert.equal(readingKeyScroll("ArrowDown", true, 900), 40);
	assert.equal(readingKeyScroll("PageUp", true, 900), -810);
	assert.equal(readingKeyScroll("ArrowDown", false, 900), null);
	assert.equal(readingKeyScroll("a", true, 900), null);
});
