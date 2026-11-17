/**
 * Underline tabs glide one way (`TabsList` `line`, components/ui/tabs.tsx;
 * audit 17 Nov 2026, finding 13): Home's course tabs and the calendar's
 * Week and Month draw the same bar (`tabs-bar`), one per list, that moves
 * to the tab he chooses, and no tab draws an underline of its own. Before,
 * Home drew its own sliding bar and the calendar's underline faded in
 * under each tab. Settings' section list is vertical rows in the sidebar's
 * look, with no underline, so it draws no bar.
 */
import { dom } from "./helpers/radix-dom.ts";
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
Object.defineProperty(globalThis, "self", { value: globalThis, configurable: true, writable: true });
Object.defineProperty(globalThis, "localStorage", { value: { getItem: () => null, setItem() {}, removeItem() {} }, configurable: true, writable: true });
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, renderToStaticMarkup, type Root } from "./helpers/app-render.tsx";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { mount as mountHome, press, unmount as unmountHome } from "./helpers/home-dom.tsx";
import type { CalendarCourse } from "../src/core/contracts/calendar.ts";
import { kbdEventForAction } from "../src/core/keyboard.ts";
import { CalendarView } from "../components/calendar/calendar-view.tsx";
import { Dialog } from "../components/ui/dialog.tsx";
import { SettingsDialogBody } from "../components/settings/settings-dialog.tsx";

// No layout in the test DOM: each tab sits 100px further right than the one before it, 80px wide.
const proto = dom.window.HTMLElement.prototype as unknown as object;
Object.defineProperty(proto, "offsetLeft", { configurable: true, get(this: Element) { return this.parentElement ? [...this.parentElement.children].indexOf(this) * 100 : 0; } });
Object.defineProperty(proto, "offsetWidth", { configurable: true, get: () => 80 });

let root: Root | null = null;
afterEach(async () => {
	await act(async () => root?.unmount());
	root = null;
	await unmountHome();
	dom.document.body.innerHTML = "";
});

const TODAY = "2026-11-08";
const course = {
	map: { workspace: "/study/linalg", title: "Linear Algebra", today: TODAY, revision: 1, exam: null, current: null, focus: null, tasks: [], topics: [], edges: [] },
	unready: null,
	due: [],
	lastActiveDaysAgo: 0,
	runup: null,
	planned: [],
	doesNotFit: [],
} as unknown as CalendarCourse;

async function mountCalendar() {
	const host = dom.document.createElement("div");
	dom.document.body.appendChild(host);
	root = createRoot(host);
	const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
	await act(async () =>
		root!.render(
			<AppRouterContext.Provider value={router as never}>
				<CalendarView courses={[course]} entries={[]} schedule={[]} today={TODAY} scope={null} onScopeChange={() => {}} busy={false} onStart={() => {}} />
			</AppRouterContext.Provider>,
		),
	);
}

/** The list's bar, and where it sits: its left edge and width. */
function barOf(list: Element) {
	const bars = [...list.querySelectorAll('[data-slot="tabs-bar"]')];
	assert.equal(bars.length, 1, "one bar per list");
	const bar = bars[0] as HTMLElement;
	assert.ok(bar.parentElement === list, "the bar is the list's own part");
	return bar.getAttribute("style") ?? "";
}

/** No tab draws an underline of its own. */
function noOwnUnderline(list: Element) {
	for (const tab of list.querySelectorAll('[data-slot="tabs-trigger"]')) assert.ok(!/after:bg-foreground/.test(tab.getAttribute("class") ?? ""), "a tab's own underline");
}

const pages = [
	{
		name: "Home's course tabs",
		mount: mountHome,
		list: () => dom.document.querySelector('[data-slot="home-map-tabs"]')!,
		choose: () => press("ArrowRight", dom.document.body),
	},
	{
		name: "the calendar's Week and Month",
		mount: mountCalendar,
		list: () => dom.document.querySelector('[data-slot="tabs-list"]')!,
		choose: () => act(async () => { window.dispatchEvent(new CustomEvent(kbdEventForAction("calendar-month"))); }),
	},
];

describe("underline tabs glide one way", () => {
	for (const { name, mount, list, choose } of pages) {
		it(`${name}: one bar under the chosen tab, which moves to the tab he chooses`, async () => {
			await mount();
			const tabs = list();
			assert.equal(tabs.getAttribute("data-variant"), "line");
			noOwnUnderline(tabs);
			assert.match(barOf(tabs), /width: ?80px/);
			assert.match(barOf(tabs), /translateX\(0px\)/, "under the first tab");
			await choose();
			assert.match(barOf(tabs), /translateX\(100px\)/, "under the second tab, once chosen");
		});
	}

	it("Settings' section list, vertical rows, draws no bar", () => {
		const html = renderToStaticMarkup(
			<Dialog open>
				<SettingsDialogBody onClose={() => {}} />
			</Dialog>,
		);
		assert.ok(html.includes('data-variant="line"'));
		assert.ok(!html.includes('data-slot="tabs-bar"'));
	});
});
