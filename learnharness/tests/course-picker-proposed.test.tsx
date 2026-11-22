import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import { dom } from "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "./helpers/app-render.tsx";
import { CoursePicker } from "../components/course-picker.tsx";
import { AddMaterialDialog, DeleteCourseDialog, RenameCourseDialog } from "../components/course-manage-dialogs.tsx";
import { pickWords } from "../components/new-course-facts.ts";
import { CourseMapStatus } from "../components/course-map-status.tsx";
import { kbdEventForAction } from "../src/core/keyboard.ts";
import { Dialog } from "../components/ui/dialog.tsx";

// The course chip and New course's study root, mounted on the real
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

describe("course chip", () => {
	it("opens a menu of the courses by name, with no counts, then New course or self-study", async () => {
		await mount(<CoursePicker courses={COURSES} workspace="/study/smm" onChange={() => {}} onNew={() => {}} />);
		const chip = element('[data-testid="course-picker"]');
		assert.equal(chip.textContent, "SMM");
		assert.equal(document.querySelectorAll("select").length, 0, "no browser select");
		await press(chip, "pointerdown");
		const rows = [...document.querySelectorAll('[data-testid="course-option"]')];
		assert.deepEqual(rows.map((r) => r.textContent), ["SMM", "untitled-dir"]);
		assert.equal(rows[0]!.getAttribute("aria-checked"), "true", "the picked course is the checked one");
		assert.equal(element('[data-testid="course-new"]').textContent, "New course or self-study");
	});

	it("picking a course or New course reaches the host, and Esc closes the menu only", async () => {
		const picks: string[] = [];
		let created = 0;
		await mount(<CoursePicker courses={COURSES} workspace="" onChange={(w) => picks.push(w)} onNew={() => created++} />);
		await press(element('[data-testid="course-picker"]'), "pointerdown");
		await press(document.querySelectorAll('[data-testid="course-option"]')[1]!, "click");
		assert.deepEqual(picks, ["/study/untitled-dir"]);
		await press(element('[data-testid="course-picker"]'), "pointerdown");
		await press(element('[data-testid="course-new"]'), "click");
		assert.equal(created, 1);
		await press(element('[data-testid="course-picker"]'), "pointerdown");
		assert.ok(document.querySelector('[data-testid="course-menu"]'));
		assert.equal(await escapeReachesWindow(), false, "Esc must not abort the turn underneath");
		assert.ok(document.querySelector('[data-testid="course-menu"]') === null);
	});
});

function recorder(reply: (init: RequestInit) => Response) {
	const sent: RequestInit[] = [];
	const fetchLike = (async (_url: unknown, init?: RequestInit) => {
		sent.push(init ?? {});
		return reply(init ?? {});
	}) as typeof fetch;
	return { sent, fetchLike };
}
async function typeInto(input: HTMLInputElement, value: string) {
	await act(async () => {
		// linkedom reports no type for an untyped input, which React needs to
		// read it as a text field.
		if (!input.getAttribute("type")) input.setAttribute("type", "text");
		// The prototype's setter, as a typed value arrives, so React sees a change.
		let proto = Object.getPrototypeOf(input);
		while (proto && !Object.getOwnPropertyDescriptor(proto, "value")?.set) proto = Object.getPrototypeOf(proto);
		Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(input, value);
		input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
	});
}
async function pickFiles(input: HTMLInputElement, files: File[]) {
	await act(async () => {
		Object.defineProperty(input, "files", { value: files, configurable: true });
		input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
	});
}

describe("material picks", () => {
	it("names a pick of files by up to two names and a folder by its name, never a count", () => {
		const f = (name: string, at = "") => Object.defineProperty(new File([""], name), "webkitRelativePath", { value: at });
		assert.equal(pickWords({ kind: "files", files: [f("A.pdf")] }), "A.pdf");
		assert.equal(pickWords({ kind: "files", files: [f("A.pdf"), f("B.pdf")] }), "A.pdf and B.pdf");
		assert.equal(pickWords({ kind: "files", files: [f("A.pdf"), f("B.pdf"), f("C.pdf")] }), "A.pdf, B.pdf and more");
		assert.equal(pickWords({ kind: "folder", files: [f("x.pdf", "Slides/w1/x.pdf")] }), "Slides");
	});
});

describe("course menu: rename and delete", () => {
	it("offers Rename and Delete for the picked course only, and hands the course to the host", async () => {
		const asked: Array<[string, string | null]> = [];
		await mount(<CoursePicker courses={COURSES} workspace="/study/smm" onChange={() => {}} onNew={() => {}} onManage={(action, course) => asked.push([action, course.title])} />);
		await press(element('[data-testid="course-picker"]'), "pointerdown");
		assert.equal(element('[data-testid="course-rename"]').textContent, "Rename SMM…");
		assert.equal(element('[data-testid="course-delete"]').textContent, "Delete SMM…");
		await press(element('[data-testid="course-delete"]'), "click");
		assert.deepEqual(asked, [["delete", "SMM"]]);
	});

	it("has no Rename or Delete while no course is picked", async () => {
		await mount(<CoursePicker courses={COURSES} workspace="" onChange={() => {}} onNew={() => {}} onManage={() => {}} />);
		await press(element('[data-testid="course-picker"]'), "pointerdown");
		assert.ok(document.querySelector('[data-testid="course-rename"]') === null);
		assert.ok(document.querySelector('[data-testid="course-delete"]') === null);
	});

	it("Rename sends the new title for that course and reports it", async () => {
		const renamed: string[] = [];
		const { sent, fetchLike } = recorder(() => Response.json({ ok: true }));
		await mount(<RenameCourseDialog course={{ workspace: "/study/smm", title: "SMM" }} fetchLike={fetchLike} onClose={() => {}} onRenamed={(t) => renamed.push(t)} />);
		await typeInto(element('[data-testid="rename-course-title"]') as HTMLInputElement, " Stochastic Models ");
		await act(async () => { element('[data-testid="rename-course-dialog"] form').dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
		assert.deepEqual([sent[0]?.method, JSON.parse(String(sent[0]?.body))], ["PATCH", { workspace: "/study/smm", title: "Stochastic Models" }]);
		assert.deepEqual(renamed, ["Stochastic Models"]);
	});

	it("Delete asks first, says what stays, then deletes that course", async () => {
		let deleted = 0;
		const { sent, fetchLike } = recorder(() => Response.json({ ok: true }));
		await mount(<DeleteCourseDialog course={{ workspace: "/study/smm", title: "SMM" }} fetchLike={fetchLike} onClose={() => {}} onDeleted={() => deleted++} />);
		const dialog = element('[data-testid="delete-course-dialog"]');
		assert.equal(dialog.getAttribute("role"), "alertdialog");
		assert.match(dialog.textContent ?? "", /Delete SMM\?/);
		assert.match(dialog.textContent ?? "", /lessons stay in your history/);
		assert.equal(sent.length, 0, "nothing is deleted before he confirms");
		await press(element('[data-testid="delete-course-confirm"]'), "click");
		assert.deepEqual([sent[0]?.method, JSON.parse(String(sent[0]?.body))], ["DELETE", { workspace: "/study/smm" }]);
		assert.equal(deleted, 1);
	});

	it("names the exam day only for a course with an exam (round 17, m25)", async () => {
		const { fetchLike } = recorder(() => Response.json({ ok: true }));
		await mount(<DeleteCourseDialog course={{ workspace: "/study/calc", title: "Calculus I", exam: null }} fetchLike={fetchLike} onClose={() => {}} onDeleted={() => {}} />);
		const without = element('[data-testid="delete-course-dialog"]').textContent ?? "";
		assert.match(without, /Its topics and plan leave Home and the calendar/);
		assert.doesNotMatch(without, /exam/);
	});

	it("names the exam day for a course with one", async () => {
		const { fetchLike } = recorder(() => Response.json({ ok: true }));
		await mount(<DeleteCourseDialog course={{ workspace: "/study/smm", title: "SMM", exam: { date: "2026-12-03", daysLeft: 15 } }} fetchLike={fetchLike} onClose={() => {}} onDeleted={() => {}} />);
		assert.match(element('[data-testid="delete-course-dialog"]').textContent ?? "", /Its topics, plan and exam day leave Home/);
	});

	it("a refused delete shows the server's sentence and keeps the question open", async () => {
		const { fetchLike } = recorder(() => Response.json({ error: "That course is no longer in your list." }, { status: 404 }));
		await mount(<DeleteCourseDialog course={{ workspace: "/study/smm", title: "SMM" }} fetchLike={fetchLike} onClose={() => {}} onDeleted={() => assert.fail("not deleted")} />);
		await press(element('[data-testid="delete-course-confirm"]'), "click");
		assert.equal(element('[data-testid="delete-course-dialog"] [role="alert"]').textContent, "That course is no longer in your list.");
	});
});

describe("Add material", () => {
	it("sends the course and every picked file under its folder path, then follows the map growing", async () => {
		const urls: unknown[] = [];
		const { sent, fetchLike } = recorder((init) => (init.method === "POST" ? Response.json({ ok: true, added: ["material/Week 2.md"] }) : Response.json({ state: "building" })));
		const spy = (async (url: unknown, init?: RequestInit) => {
			urls.push(url);
			return fetchLike(url as string, init);
		}) as typeof fetch;
		await mount(<AddMaterialDialog course={{ workspace: "/study/smm", title: "SMM" }} fetchLike={spy} onClose={() => {}} />);
		assert.match(element('[data-testid="add-material-dialog"]').textContent ?? "", /Add material to SMM/);
		assert.equal((element('[data-testid="add-material-add"]') as HTMLButtonElement).disabled, true, "nothing to add before a pick");
		const week = new File(["w"], "Week 2.md");
		Object.defineProperty(week, "webkitRelativePath", { value: "Lectures/Week 2.md" });
		await pickFiles(element('[data-testid="new-course-folder-input"]') as HTMLInputElement, [week]);
		await act(async () => { element('[data-testid="add-material-dialog"] form').dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
		const posts = sent.filter((init) => init.method === "POST");
		assert.equal(posts.length, 1);
		assert.equal(urls[0], "/api/courses/material");
		const form = posts[0]!.body as FormData;
		assert.equal(form.get("workspace"), "/study/smm");
		assert.deepEqual(form.getAll("material").map((f) => (f as File).name), ["Lectures/Week 2.md"]);
		await act(async () => {});
		assert.match(element('[data-testid="course-map-status"]').textContent ?? "", /Material added to SMM.*topic map is being built from your material/);
	});

	it("shows the server's plain sentence when the material cannot be added, and keeps the picks", async () => {
		const { fetchLike } = recorder(() => Response.json({ error: "That course is no longer in your list." }, { status: 404 }));
		await mount(<AddMaterialDialog course={{ workspace: "/study/smm", title: "SMM" }} fetchLike={fetchLike} onClose={() => {}} />);
		await pickFiles(element('[data-testid="new-course-files-input"]') as HTMLInputElement, [new File(["s"], "Slides.pdf")]);
		await act(async () => { element('[data-testid="add-material-dialog"] form').dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
		assert.equal(element('[data-testid="add-material-dialog"] [role="alert"]').textContent, "That course is no longer in your list.");
		assert.deepEqual([...document.querySelectorAll('[data-testid="new-course-material-pick"]')].map((r) => r.textContent), ["Slides.pdf"]);
	});
});

describe("course chip by keyboard", () => {
	it("Command O opens the course menu, and a send blocked for want of a course opens it too", async () => {
		await mount(<CoursePicker courses={COURSES} workspace="" onChange={() => {}} onNew={() => {}} asked={0} />);
		assert.ok(document.querySelector('[data-testid="course-menu"]') === null);
		await act(async () => { window.dispatchEvent(new dom.window.CustomEvent(kbdEventForAction("pick-course"))); });
		assert.ok(document.querySelector('[data-testid="course-menu"]'), "the shortcut's event opens the menu");
		await escapeReachesWindow();
		assert.ok(document.querySelector('[data-testid="course-menu"]') === null);
		await act(async () => { root!.render(<CoursePicker courses={COURSES} workspace="" onChange={() => {}} onNew={() => {}} asked={1} />); });
		assert.ok(document.querySelector('[data-testid="course-menu"]'), "a blocked send opens the menu");
	});
});
