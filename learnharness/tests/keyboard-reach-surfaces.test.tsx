/**
 * Keyboard reach on the surfaces that own their keys (Edo, 13 Nov 2026):
 * the calendar answers to its letters' events while it is mounted, and the
 * Proposed confidence toggle steps on ⌥↑ ⌥↓ from anywhere while it is
 * shown, the answer field included.
 */
import React, { act, useState } from "react";
(globalThis as Record<string, unknown>).React = React;

import { dom } from "./helpers/radix-dom.ts";
// next/link reaches for `self` when a link mounts.
(globalThis as Record<string, unknown>).self = globalThis;
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { CalendarCourse } from "../src/core/contracts/calendar.ts";
import type { Confidence } from "../src/core/contracts/course.ts";
import { kbdEventForAction, type KeyAction } from "../src/core/keyboard.ts";
import { CalendarView } from "../components/calendar/calendar-view.tsx";
import { ConfidenceChoice } from "../components/confidence-choice.tsx";

const TODAY = "2026-11-08";
const router = { push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {}, forward: () => {}, refresh: () => {} };

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
	await act(async () => root?.unmount());
	root = null;
	host?.remove();
	host = null;
});

async function render(node: React.ReactNode) {
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	await act(async () => root!.render(<AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>));
}

// The fields the calendar draws an empty course from; the rest of the
// read's shape is the calendar facts' business, not the keys'.
const course = {
	map: {
		workspace: "/study/linalg",
		title: "Linear Algebra",
		today: TODAY,
		revision: 1,
		exam: null,
		current: null,
		focus: null,
		tasks: [],
		topics: [],
		edges: [],
	},
	unready: null,
	due: [],
	lastActiveDaysAgo: 0,
	runup: null,
	planned: [],
	doesNotFit: [],
} as unknown as CalendarCourse;

const range = () => document.querySelector("[data-slot=calendar-range]")?.textContent;

async function letter(action: KeyAction) {
	await act(async () => {
		window.dispatchEvent(new CustomEvent(kbdEventForAction(action)));
	});
}

describe("the calendar's letters", () => {
	it("M shows the month, N and P step it, T comes back to today, W shows the week", async () => {
		await render(
			<CalendarView courses={[course]} entries={[]} schedule={[]} today={TODAY} scope={null} onScopeChange={() => {}} busy={false} onStart={() => {}} />,
		);
		assert.equal(range(), "2 to 8 Nov 2026");
		await letter("calendar-month");
		assert.equal(range(), "November 2026");
		await letter("calendar-next");
		assert.equal(range(), "December 2026");
		await letter("calendar-previous");
		await letter("calendar-previous");
		assert.equal(range(), "October 2026");
		await letter("calendar-today");
		assert.equal(range(), "November 2026");
		await letter("calendar-week");
		assert.equal(range(), "2 to 8 Nov 2026");
	});
});

function Toggle({ initial }: { initial: Confidence }) {
	const [value, setValue] = useState<Confidence>(initial);
	return (
		<>
			<textarea data-testid="answer" />
			<ConfidenceChoice value={value} onChange={setValue} variant="proposed" />
		</>
	);
}

const chosen = () => document.querySelector("[data-testid=confidence-choice] [data-state=on]")?.getAttribute("data-confidence");

/** An ⌥-arrow keydown from the answer field; true when something claimed it. */
async function altArrow(key: "ArrowUp" | "ArrowDown"): Promise<boolean> {
	const event = new dom.window.Event("keydown", { bubbles: true, cancelable: true });
	Object.assign(event, { key, altKey: true, metaKey: false, ctrlKey: false, shiftKey: false });
	await act(async () => {
		document.querySelector("[data-testid=answer]")!.dispatchEvent(event);
	});
	return event.defaultPrevented;
}

describe("confidence from the keyboard", () => {
	const shown = (visible: boolean) => {
		(dom.window.HTMLElement.prototype as unknown as { checkVisibility: () => boolean }).checkVisibility = () => visible;
	};

	it("⌥↑ is more sure and ⌥↓ less sure, from the answer field, held at the ends", async () => {
		shown(true);
		await render(<Toggle initial="neutral" />);
		assert.equal(await altArrow("ArrowUp"), true, "the toggle claims the key");
		assert.equal(chosen(), "confident");
		await altArrow("ArrowUp");
		assert.equal(chosen(), "confident");
		await altArrow("ArrowDown");
		await altArrow("ArrowDown");
		await altArrow("ArrowDown");
		assert.equal(chosen(), "guessing");
	});

	it("does nothing, and leaves the key to the field, while the toggle is not on screen", async () => {
		shown(false);
		await render(<Toggle initial="neutral" />);
		assert.equal(await altArrow("ArrowUp"), false);
		assert.equal(chosen(), "neutral");
	});
});
