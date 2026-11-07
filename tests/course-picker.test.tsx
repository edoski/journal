import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { ComposerActions } from "../components/composer-actions.tsx";
import { CoursePicker } from "../components/course-picker.tsx";

const COURSES = [
	{ workspace: "/study/smm", title: "SMM", due: 2, current: "rank", task: null },
	{ workspace: "/study/untitled-dir", title: null, due: 0, current: null, task: null },
];

function documentFor(node: React.ReactNode) {
	return parseHTML(`<html><body>${renderToStaticMarkup(node)}</body></html>`).document;
}

describe("course picker", () => {
	it("offers No course plus every registered course, with due counts and directory fallback names", () => {
		const document = documentFor(<CoursePicker courses={COURSES} workspace="" onChange={() => {}} />);
		const options = [...document.querySelectorAll("option")].map((o) => [o.getAttribute("value"), o.textContent]);
		assert.deepEqual(options, [
			["", "No course"],
			["/study/smm", "SMM (2 due)"],
			["/study/untitled-dir", "untitled-dir"],
		]);
		assert.equal(document.querySelector('[data-testid="course-picker"] span')!.textContent, "No course");
	});

	it("shows the picked course and leads the composer action row", () => {
		const document = documentFor(
			<ComposerActions course={<CoursePicker courses={COURSES} workspace="/study/smm" onChange={() => {}} />} setup={<button data-testid="setup-cta">Set up</button>} />,
		);
		const row = document.querySelector('[data-testid="composer-actions"]')!;
		assert.ok(row.classList.contains("justify-start"));
		assert.equal(row.firstElementChild!.getAttribute("data-testid"), "course-picker");
		assert.equal(row.querySelector('[data-testid="course-picker"] span')!.textContent, "SMM");
	});
});
