import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import { dom } from "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { CoursePicker, NewCourseBody } from "../components/course-picker.tsx";

// The Proposed course chip and New course's study root, mounted on the real
// Radix layers: what the learner picks reaches the host, and Esc stays put.
const COURSES = [
	{ workspace: "/study/smm", title: "SMM", due: 2, reviews: [], current: "rank", currentTitle: null, task: null, step: null, exam: null, lastActiveDaysAgo: null },
	{ workspace: "/study/untitled-dir", title: null, due: 0, reviews: [], current: null, currentTitle: null, task: null, step: null, exam: null, lastActiveDaysAgo: null },
];

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
	await act(async () => { root?.unmount(); });
	root = null;
	host?.remove();
	host = null;
});

async function mount(node: React.ReactElement) {
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	await act(async () => { root!.render(node); });
}

function element(selector: string): HTMLElement {
	const node = document.querySelector<HTMLElement>(selector);
	assert.ok(node, `expected ${selector}`);
	return node;
}

async function press(target: Element, type: string, init: Record<string, unknown> = {}) {
	await act(async () => {
		const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
		Object.assign(event, { pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, ctrlKey: false, detail: 1, ...init });
		target.dispatchEvent(event);
	});
}

async function escapeReachesWindow(): Promise<boolean> {
	let reached = false;
	const onWindow = (e: Event) => { if ((e as KeyboardEvent).key === "Escape") reached = true; };
	window.addEventListener("keydown", onWindow);
	await press(document.activeElement ?? document.body, "keydown", { key: "Escape" });
	window.removeEventListener("keydown", onWindow);
	return reached;
}

describe("Proposed course chip", () => {
	it("opens a menu of the courses with their due counts, then New course", async () => {
		await mount(<CoursePicker variant="proposed" courses={COURSES} workspace="/study/smm" onChange={() => {}} onNew={() => {}} />);
		const chip = element('[data-testid="course-picker"]');
		assert.equal(chip.textContent, "SMM");
		assert.equal(document.querySelectorAll("select").length, 0, "no browser select");
		await press(chip, "pointerdown");
		const rows = [...document.querySelectorAll('[data-testid="course-option"]')];
		assert.deepEqual(rows.map((r) => r.textContent), ["SMM2 due", "untitled-dir"]);
		assert.equal(rows[0]!.getAttribute("aria-checked"), "true", "the picked course is the checked one");
		assert.equal(element('[data-testid="course-new"]').textContent, "New course…");
	});

	it("picking a course or New course reaches the host, and Esc closes the menu only", async () => {
		const picks: string[] = [];
		let created = 0;
		await mount(<CoursePicker variant="proposed" courses={COURSES} workspace="" onChange={(w) => picks.push(w)} onNew={() => created++} />);
		await press(element('[data-testid="course-picker"]'), "pointerdown");
		await press(document.querySelectorAll('[data-testid="course-option"]')[1]!, "click");
		assert.deepEqual(picks, ["/study/untitled-dir"]);
		await press(element('[data-testid="course-picker"]'), "pointerdown");
		await press(element('[data-testid="course-new"]'), "click");
		assert.equal(created, 1);
		await press(element('[data-testid="course-picker"]'), "pointerdown");
		assert.ok(document.querySelector('[data-testid="course-menu"]'));
		assert.equal(await escapeReachesWindow(), false, "Esc must not abort the turn underneath");
		assert.equal(document.querySelector('[data-testid="course-menu"]'), null);
	});
});

describe("Proposed New course study root", () => {
	it("shows the root's last two folders and picks another from the shared select", async () => {
		await mount(<NewCourseBody variant="proposed" roots={["/vault/learn", "/vault/university/msc"]} onClose={() => {}} onCreated={() => {}} />);
		const trigger = element('[data-testid="new-course-root"]');
		assert.equal(trigger.textContent, "vault/learn");
		await press(trigger, "pointerdown");
		const options = [...document.querySelectorAll('[data-testid="new-course-root-option"]')];
		assert.deepEqual(options.map((o) => o.textContent), ["vault/learn", "university/msc"]);
		await press(options[1]!, "pointerdown");
		await press(options[1]!, "pointerup");
		assert.equal(element('[data-testid="new-course-root"]').textContent, "university/msc");
	});
});
