import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { focusHomeIn, landFocus, readingKeyScroll } from "../components/lesson/focus-home.ts";

const page = (dock: string) => parseHTML(`<html><body><main>${dock}</main></body></html>`).document;

test("an open practice problem puts the next key in its thinking field", () => {
	const doc = page('<div data-testid="practice-dock"><textarea data-testid="practice-thinking-field"></textarea></div>');
	assert.equal(focusHomeIn(doc)?.getAttribute("data-testid"), "practice-thinking-field");
});

test("an open question with a typed answer puts it in the answer field", () => {
	const doc = page('<div data-testid="question-dock"><textarea data-testid="answer-field"></textarea></div>');
	assert.equal(focusHomeIn(doc)?.getAttribute("data-testid"), "answer-field");
});

test("a question with choices leaves the keys to its rows, and a folded one to Enter", () => {
	assert.equal(focusHomeIn(page('<div data-testid="question-dock"><button data-kbdrow="0"></button><textarea data-testid="thinking-field"></textarea></div>')), null);
	assert.equal(focusHomeIn(page('<button data-testid="teach-check-reveal"></button>')), null);
});

test("with nothing open the next key goes to the composer", () => {
	const doc = page('<form data-testid="composer"><textarea></textarea></form>');
	assert.equal(focusHomeIn(doc)?.tagName, "TEXTAREA");
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
