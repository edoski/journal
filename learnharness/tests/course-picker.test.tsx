import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import { dom } from "./helpers/radix-dom.ts";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { ComposerActions } from "../components/composer-actions.tsx";
import { CourseControl, CoursesUnavailable, type CourseChoice, type CourseState } from "../components/course-picker.tsx";
import { CourseLinkBody } from "../components/course-link-banner.tsx";

const COURSES = [
	{ workspace: "/study/smm", title: "SMM", due: 2, reviews: [], current: "rank", currentTitle: null, task: null, step: null, exam: null, lastActiveDaysAgo: null },
	{ workspace: "/study/untitled-dir", title: null, due: 0, reviews: [], current: null, currentTitle: null, task: null, step: null, exam: null, lastActiveDaysAgo: null },
];
const READY: CourseState = { status: "ready", courses: COURSES, roots: ["/vault/learn", "/vault/university/msc"] };

function documentFor(node: React.ReactNode) {
	return parseHTML(`<html><body>${renderToStaticMarkup(node)}</body></html>`).document;
}

function choice(over: Partial<CourseChoice> = {}): CourseChoice {
	return { state: READY, workspace: "", notice: null, asked: 0, choose: () => {}, add: () => {}, renamed: () => {}, removed: () => {}, requireCourse: () => null, ...over };
}

describe("course picker", () => {
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

	it("an unavailable engine leaves no picker, and its line names the reason and the two settings", () => {
		assert.equal(renderToStaticMarkup(<CourseControl choice={choice({ state: { status: "unavailable", reason: "The learning engine could not start: spawn ENOENT" } })} />), "");
		const document = documentFor(<CoursesUnavailable reason="The learning engine could not start: spawn ENOENT" />);
		const line = document.querySelector('[data-testid="courses-unavailable"]')!.textContent!;
		assert.match(line, /^Courses are unavailable: The learning engine could not start: spawn ENOENT\./);
		assert.match(line, /LH_LEARNING_ENGINE/);
		assert.match(line, /LH_LEARNING_PYTHON/);
	});

	it("renders nothing while the engine is being asked", () => {
		assert.equal(renderToStaticMarkup(<CourseControl choice={choice({ state: { status: "loading" } })} />), "");
	});
});

describe("course link banner", () => {
	it("asks for the session's course with the picker and a Link button", async () => {
		const host = dom.document.createElement("div");
		dom.document.body.appendChild(host);
		const root = createRoot(host);
		try {
			await act(async () => root.render(<CourseLinkBody choice={choice()} busy={false} error={null} onLink={() => {}} />));
			const banner = host.querySelector('[data-testid="course-link-banner"]')!;
			assert.match(banner.textContent!, /^Link this session to a course to continue\./);
			assert.equal(banner.querySelector('[data-testid="course-link"]')!.textContent, "Link");
			const chip = banner.querySelector('[data-testid="course-picker"]')!;
			assert.equal(chip.textContent, "Pick a course");
			await act(async () => {
				const event = new dom.window.Event("pointerdown", { bubbles: true, cancelable: true });
				Object.assign(event, { pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, ctrlKey: false });
				chip.dispatchEvent(event);
			});
			assert.ok(dom.document.querySelector('[data-testid="course-new"]'), "New course is offered");
		} finally {
			await act(async () => root.unmount());
			host.remove();
		}
	});

	it("with the engine unavailable it shows the reason and no Link button", () => {
		const document = documentFor(<CourseLinkBody choice={choice({ state: { status: "unavailable", reason: "plan failed" } })} busy={false} error={null} onLink={() => {}} />);
		assert.ok(document.querySelector('[data-testid="courses-unavailable"]'));
		assert.equal(document.querySelector('[data-testid="course-link"]'), null);
	});
});
