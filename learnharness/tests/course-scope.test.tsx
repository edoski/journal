import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
// next/link schedules its prefetch on `self`.
(globalThis as Record<string, unknown>).self = globalThis;

import { dom } from "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "./helpers/app-render.tsx";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { StudyCourse } from "../src/core/index.ts";
import { CourseScope } from "../components/unit-inbox/course-scope.tsx";
import { courseHref } from "../components/unit-inbox/unit-href.ts";

// The sidebar's course filter (unit-inbox.md, header), mounted on the real
// Radix menu: it still filters, and it opens each course's page.
const course = (workspace: string, title: string) => ({ map: { workspace, title, exam: null } }) as unknown as StudyCourse;
const COURSES = [course("/study/linalg", "Linear Algebra"), course("/study/calc", "Calculus I")];
const router = { push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
	await act(async () => {
		root?.unmount();
	});
	root = null;
	host?.remove();
	host = null;
});

async function mount(node: React.ReactElement) {
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	await act(async () => {
		root!.render(<AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>);
	});
}

async function press(target: Element, type: string) {
	await act(async () => {
		const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
		Object.assign(event, { pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, ctrlKey: false, detail: 1 });
		target.dispatchEvent(event);
	});
}

async function open(scopes: (string | null)[] = []) {
	await mount(<CourseScope courses={COURSES} scope={null} onScopeChange={(scope) => scopes.push(scope)} />);
	await press(document.querySelector('[data-testid="unit-scope"]')!, "pointerdown");
}

describe("the course filter menu", () => {
	it("lists each course once to filter by, with an arrow on its row that opens its page", async () => {
		await open();
		assert.deepEqual(
			[...document.querySelectorAll('[role="menuitemradio"]')].map((item) => item.textContent),
			["All courses", "LALinear Algebra", "CICalculus I"],
		);
		assert.equal(document.querySelector('[data-slot="dropdown-menu-label"]'), null, "no second list under a label");
		const pages = [...document.querySelectorAll('[data-testid="course-scope-page"]')];
		assert.deepEqual(
			pages.map((link) => [link.tagName, link.getAttribute("href"), link.getAttribute("aria-label")]),
			[
				["A", courseHref("/study/linalg"), "Open the Linear Algebra course page"],
				["A", courseHref("/study/calc"), "Open the Calculus I course page"],
			],
		);
		assert.ok(pages.every((link) => link.getAttribute("role") === "menuitem"), "a page link is a menu item the arrow keys reach");
		assert.ok(
			pages.every((link) => link.closest('[data-slot="course-scope-row"]')?.querySelector('[role="menuitemradio"]')),
			"each arrow sits on its course's own row",
		);
	});

	it("still filters the sidebar by the course picked above the links", async () => {
		const scopes: (string | null)[] = [];
		await open(scopes);
		await press(document.querySelectorAll('[role="menuitemradio"]')[2]!, "click");
		assert.deepEqual(scopes, ["/study/calc"]);
	});
});
