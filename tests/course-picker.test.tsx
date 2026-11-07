import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { ComposerActions } from "../components/composer-actions.tsx";
import { CourseControl, CoursePicker, NewCourseBody, PICK_A_COURSE, type CourseChoice, type CourseState } from "../components/course-picker.tsx";
import { CourseLinkBody } from "../components/course-link-banner.tsx";

const COURSES = [
	{ workspace: "/study/smm", title: "SMM", due: 2, current: "rank", task: null },
	{ workspace: "/study/untitled-dir", title: null, due: 0, current: null, task: null },
];
const READY: CourseState = { status: "ready", courses: COURSES, roots: ["/vault/learn", "/vault/university/msc"] };

function documentFor(node: React.ReactNode) {
	return parseHTML(`<html><body>${renderToStaticMarkup(node)}</body></html>`).document;
}

function choice(over: Partial<CourseChoice> = {}): CourseChoice {
	return { state: READY, workspace: "", notice: null, choose: () => {}, add: () => {}, requireCourse: () => null, ...over };
}

describe("course picker", () => {
	it("lists every registered course with due counts and directory fallback names, then New course, and no No course", () => {
		const document = documentFor(<CoursePicker courses={COURSES} workspace="" onChange={() => {}} onNew={() => {}} />);
		const options = [...document.querySelectorAll("option")].map((o) => [o.getAttribute("value"), o.textContent, o.hasAttribute("disabled")]);
		assert.deepEqual(options, [
			["", "Pick a course", true],
			["/study/smm", "SMM (2 due)", false],
			["/study/untitled-dir", "untitled-dir", false],
			["new", "New course…", false],
		]);
		assert.equal(document.querySelector('[data-testid="course-picker"] span')!.textContent, "Pick a course");
		assert.ok(!document.body.textContent!.includes("No course"));
	});

	it("shows the picked course and leads the composer action row", () => {
		const document = documentFor(
			<ComposerActions course={<CourseControl choice={choice({ workspace: "/study/smm" })} />} setup={<button data-testid="setup-cta">Set up</button>} />,
		);
		const row = document.querySelector('[data-testid="composer-actions"]')!;
		assert.ok(row.classList.contains("justify-start"));
		assert.equal(row.firstElementChild!.getAttribute("data-testid"), "course-picker");
		assert.equal(row.querySelector('[data-testid="course-picker"] span')!.textContent, "SMM");
		assert.equal(row.querySelector('[data-testid="course-notice"]'), null);
	});

	it("a blocked send shows its reason beside the picker", () => {
		const document = documentFor(<CourseControl choice={choice({ notice: PICK_A_COURSE })} />);
		assert.equal(document.querySelector('[data-testid="course-notice"]')!.textContent, "Pick a course first");
	});

	it("an unavailable engine replaces the picker with one line naming the reason and the two settings", () => {
		const document = documentFor(<CourseControl choice={choice({ state: { status: "unavailable", reason: "The learning engine could not start: spawn ENOENT" } })} />);
		assert.equal(document.querySelector('[data-testid="course-picker"]'), null);
		const line = document.querySelector('[data-testid="courses-unavailable"]')!.textContent!;
		assert.match(line, /^Courses are unavailable: The learning engine could not start: spawn ENOENT\./);
		assert.match(line, /LH_LEARNING_ENGINE/);
		assert.match(line, /LH_LEARNING_PYTHON/);
	});

	it("renders nothing while the engine is being asked", () => {
		assert.equal(renderToStaticMarkup(<CourseControl choice={choice({ state: { status: "loading" } })} />), "");
	});
});

describe("new course dialog", () => {
	it("asks for a title and one of the offered study roots", () => {
		const document = documentFor(<NewCourseBody roots={READY.status === "ready" ? READY.roots : []} onClose={() => {}} onCreated={() => {}} />);
		assert.ok(document.querySelector('[data-testid="new-course-title"]')!.hasAttribute("required"));
		const roots = [...document.querySelectorAll('[data-testid="new-course-root"] option')].map((o) => [o.getAttribute("value"), o.textContent]);
		assert.deepEqual(roots, [
			["/vault/learn", "vault/learn"],
			["/vault/university/msc", "university/msc"],
		]);
		assert.ok(document.querySelector('[data-testid="new-course-create"]')!.hasAttribute("disabled"), "no title yet");
	});
});

describe("course link banner", () => {
	it("asks for the session's course with the picker and a Link button", () => {
		const document = documentFor(<CourseLinkBody choice={choice()} busy={false} error={null} onLink={() => {}} />);
		const banner = document.querySelector('[data-testid="course-link-banner"]')!;
		assert.match(banner.textContent!, /This session has no course yet\. Pick the course it belongs to, to continue\./);
		assert.ok(banner.querySelector('[data-testid="course-picker"] option[value="new"]'), "New course is offered");
		assert.equal(banner.querySelector('[data-testid="course-link"]')!.textContent, "Link");
	});

	it("with the engine unavailable it shows the reason and no Link button", () => {
		const document = documentFor(<CourseLinkBody choice={choice({ state: { status: "unavailable", reason: "plan failed" } })} busy={false} error={null} onLink={() => {}} />);
		assert.ok(document.querySelector('[data-testid="courses-unavailable"]'));
		assert.equal(document.querySelector('[data-testid="course-link"]'), null);
	});
});
