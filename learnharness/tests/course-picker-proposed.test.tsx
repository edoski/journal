import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import { dom } from "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { CoursePicker, NewCourseBody } from "../components/course-picker.tsx";
import { DeleteCourseDialog, RenameCourseDialog } from "../components/course-manage-dialogs.tsx";
import { pickWords } from "../components/new-course-facts.ts";
import { CourseMapStatus } from "../components/course-map-status.tsx";
import { kbdEventForAction } from "../src/core/keyboard.ts";
import { Dialog } from "../components/ui/dialog.tsx";

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
	it("opens a menu of the courses by name, with no counts, then New course", async () => {
		await mount(<CoursePicker variant="proposed" courses={COURSES} workspace="/study/smm" onChange={() => {}} onNew={() => {}} />);
		const chip = element('[data-testid="course-picker"]');
		assert.equal(chip.textContent, "SMM");
		assert.equal(document.querySelectorAll("select").length, 0, "no browser select");
		await press(chip, "pointerdown");
		const rows = [...document.querySelectorAll('[data-testid="course-option"]')];
		assert.deepEqual(rows.map((r) => r.textContent), ["SMM", "untitled-dir"]);
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
		await mount(
			<Dialog open>
				<NewCourseBody variant="proposed" roots={["/vault/learn", "/vault/university/msc"]} onClose={() => {}} onCreated={() => {}} />
			</Dialog>,
		);
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

/** A fetch that records each request and answers with `reply`. */
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

describe("Proposed New course", () => {
	it("asks for the title, the exam day and the material in plain words, with no folder choice when one is known", async () => {
		await mount(
			<Dialog open>
				<NewCourseBody variant="proposed" roots={["/vault/courses"]} onClose={() => {}} onCreated={() => {}} />
			</Dialog>,
		);
		const text = element('[data-testid="new-course-dialog"]').textContent ?? "";
		for (const words of ["Title", "Exam day", "Not set yet", "Course material", "Add files", "Add a folder"]) assert.match(text, new RegExp(words));
		assert.doesNotMatch(text, /Study root/);
		assert.equal(document.querySelector('[data-testid="new-course-root"]'), null);
	});

	it("sends the title, the picked exam day and every picked file under its folder path", async () => {
		const created: unknown[] = [];
		const { sent, fetchLike } = recorder((init) =>
			init.method === "POST" ? Response.json({ workspace: "/vault/courses/group-theory", title: "Group Theory" }) : Response.json({ state: "building" }),
		);
		await mount(
			<Dialog open>
				<NewCourseBody variant="proposed" roots={["/vault/courses"]} fetchLike={fetchLike} onClose={() => {}} onCreated={(c) => created.push(c)} />
			</Dialog>,
		);
		await typeInto(element('[data-testid="new-course-title"]') as HTMLInputElement, "  Group Theory ");
		await press(element('[data-testid="new-course-exam"]'), "click");
		const days = [...document.querySelectorAll<HTMLButtonElement>('[data-testid="new-course-exam-calendar"] button[data-day]')].filter((b) => !b.disabled);
		assert.ok(days.length > 0, "the calendar offers days from today on");
		const picked = days.at(-1)!;
		await press(picked, "click");
		assert.doesNotMatch(element('[data-testid="new-course-exam"]').textContent ?? "", /Not set yet/, "the picked day shows on the button");

		const syllabus = new File(["s"], "Syllabus.pdf");
		const week = new File(["w"], "Week 1.md");
		Object.defineProperty(week, "webkitRelativePath", { value: "Lectures/Week 1.md" });
		await pickFiles(element('[data-testid="new-course-files-input"]') as HTMLInputElement, [syllabus, new File(["x"], ".DS_Store")]);
		await pickFiles(element('[data-testid="new-course-folder-input"]') as HTMLInputElement, [week]);
		assert.deepEqual([...document.querySelectorAll('[data-testid="new-course-material-pick"]')].map((r) => r.textContent), ["Syllabus.pdf", "Lectures"]);

		await press(element('[data-testid="new-course-create"]'), "click");
		await act(async () => { element('[data-testid="new-course-dialog"] form').dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
		const posts = sent.filter((init) => init.method === "POST");
		assert.equal(posts.length, 1);
		const form = posts[0]!.body as FormData;
		assert.equal(form.get("title"), "Group Theory");
		assert.match(String(form.get("exam")), /^\d{4}-\d{2}-\d{2}$/);
		assert.equal(form.get("root"), "/vault/courses");
		assert.deepEqual(form.getAll("material").map((f) => (f as File).name), ["Syllabus.pdf", "Lectures/Week 1.md"]);
		assert.equal(created.length, 1);
		await act(async () => {});
		assert.match(element('[data-testid="course-map-status"]').textContent ?? "", /Group Theory is ready.*topic map is being built from your material/, "with material, the dialog stays to show the map being built");
	});

	it("says in plain words when the map could not be built, that nothing changed, and offers Try again", async () => {
		const { fetchLike } = recorder(() => Response.json({ state: "failed", reason: "it was stopped before it finished" }));
		await mount(
			<Dialog open>
				<CourseMapStatus course={{ workspace: "/vault/courses/group-theory", title: "Group Theory", due: 0, reviews: [], current: null, currentTitle: null, task: null, step: null, exam: null, lastActiveDaysAgo: null }} fetchLike={fetchLike} onClose={() => {}} />
			</Dialog>,
		);
		await act(async () => {});
		assert.equal(element('[data-testid="course-map-status"] [role="status"]').textContent, "Its topic map could not be built, because it was stopped before it finished. Nothing in the course changed.");
		assert.ok(document.querySelector('[data-testid="course-map-retry"]'));
	});

	it("closes at once after Create when no material came with the course", async () => {
		let closed = 0;
		const { fetchLike } = recorder(() => Response.json({ workspace: "/vault/courses/group-theory", title: "Group Theory" }));
		await mount(
			<Dialog open>
				<NewCourseBody variant="proposed" roots={["/vault/courses"]} fetchLike={fetchLike} onClose={() => closed++} onCreated={() => {}} />
			</Dialog>,
		);
		await typeInto(element('[data-testid="new-course-title"]') as HTMLInputElement, "Group Theory");
		await act(async () => { element('[data-testid="new-course-dialog"] form').dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
		assert.equal(closed, 1);
	});

	it("shows the server's plain sentence when a course cannot be made, and keeps the form", async () => {
		const { fetchLike } = recorder(() => Response.json({ error: "You already have a course called Group Theory.", code: "course_exists" }, { status: 409 }));
		await mount(
			<Dialog open>
				<NewCourseBody variant="proposed" roots={["/vault/courses"]} fetchLike={fetchLike} onClose={() => {}} onCreated={() => assert.fail("not created")} />
			</Dialog>,
		);
		await typeInto(element('[data-testid="new-course-title"]') as HTMLInputElement, "group theory");
		await act(async () => { element('[data-testid="new-course-dialog"] form').dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
		assert.equal(element('[data-testid="new-course-dialog"] [role="alert"]').textContent, "You already have a course called Group Theory.");
		assert.equal((element('[data-testid="new-course-title"]') as HTMLInputElement).value, "group theory");
	});

	it("names a pick of files by up to two names and a folder by its name, never a count", () => {
		const f = (name: string, at = "") => Object.defineProperty(new File([""], name), "webkitRelativePath", { value: at });
		assert.equal(pickWords({ kind: "files", files: [f("A.pdf")] }), "A.pdf");
		assert.equal(pickWords({ kind: "files", files: [f("A.pdf"), f("B.pdf")] }), "A.pdf and B.pdf");
		assert.equal(pickWords({ kind: "files", files: [f("A.pdf"), f("B.pdf"), f("C.pdf")] }), "A.pdf, B.pdf and more");
		assert.equal(pickWords({ kind: "folder", files: [f("x.pdf", "Slides/w1/x.pdf")] }), "Slides");
	});
});

describe("Proposed course menu: rename and delete", () => {
	it("offers Rename and Delete for the picked course only, and hands the course to the host", async () => {
		const asked: Array<[string, string | null]> = [];
		await mount(<CoursePicker variant="proposed" courses={COURSES} workspace="/study/smm" onChange={() => {}} onNew={() => {}} onManage={(action, course) => asked.push([action, course.title])} />);
		await press(element('[data-testid="course-picker"]'), "pointerdown");
		assert.equal(element('[data-testid="course-rename"]').textContent, "Rename SMM…");
		assert.equal(element('[data-testid="course-delete"]').textContent, "Delete SMM…");
		await press(element('[data-testid="course-delete"]'), "click");
		assert.deepEqual(asked, [["delete", "SMM"]]);
	});

	it("has no Rename or Delete while no course is picked", async () => {
		await mount(<CoursePicker variant="proposed" courses={COURSES} workspace="" onChange={() => {}} onNew={() => {}} onManage={() => {}} />);
		await press(element('[data-testid="course-picker"]'), "pointerdown");
		assert.equal(document.querySelector('[data-testid="course-rename"]'), null);
		assert.equal(document.querySelector('[data-testid="course-delete"]'), null);
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

	it("a refused delete shows the server's sentence and keeps the question open", async () => {
		const { fetchLike } = recorder(() => Response.json({ error: "That course is no longer in your list." }, { status: 404 }));
		await mount(<DeleteCourseDialog course={{ workspace: "/study/smm", title: "SMM" }} fetchLike={fetchLike} onClose={() => {}} onDeleted={() => assert.fail("not deleted")} />);
		await press(element('[data-testid="delete-course-confirm"]'), "click");
		assert.equal(element('[data-testid="delete-course-dialog"] [role="alert"]').textContent, "That course is no longer in your list.");
	});
});

describe("Proposed course chip by keyboard", () => {
	it("Command O opens the course menu, and a send blocked for want of a course opens it too", async () => {
		await mount(<CoursePicker variant="proposed" courses={COURSES} workspace="" onChange={() => {}} onNew={() => {}} asked={0} />);
		assert.equal(document.querySelector('[data-testid="course-menu"]'), null);
		await act(async () => { window.dispatchEvent(new dom.window.CustomEvent(kbdEventForAction("pick-course"))); });
		assert.ok(document.querySelector('[data-testid="course-menu"]'), "the shortcut's event opens the menu");
		await escapeReachesWindow();
		assert.equal(document.querySelector('[data-testid="course-menu"]'), null);
		await act(async () => { root!.render(<CoursePicker variant="proposed" courses={COURSES} workspace="" onChange={() => {}} onNew={() => {}} asked={1} />); });
		assert.ok(document.querySelector('[data-testid="course-menu"]'), "a blocked send opens the menu");
	});
});
