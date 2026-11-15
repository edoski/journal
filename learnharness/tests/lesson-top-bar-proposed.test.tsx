import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
// next/link schedules its prefetch on `self`, which linkedom leaves out.
(globalThis as Record<string, unknown>).self = globalThis;

import { dom } from "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createRoot, type Root } from "./helpers/app-render.tsx";
import { LessonTopBar, topicCrumbShown } from "../components/lesson/lesson-top-bar.tsx";
import { LessonRoadmap } from "../components/lesson/lesson-roadmap.tsx";
import { DoneTonightButton } from "../components/lesson/done-tonight.tsx";
import type { RoadmapStep } from "../components/lesson/roadmap-facts.ts";

// The lesson's top bar on the real Radix layers: the crumbs, Done for
// today and where the lesson is (the roadmap's strip and panel). Fetch is
// stubbed read-only; nothing is saved.
const originalFetch = globalThis.fetch;
let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
	await act(async () => { root?.unmount(); });
	root = null;
	host?.remove();
	host = null;
	globalThis.fetch = originalFetch;
});

async function mount(node: React.ReactElement) {
	globalThis.fetch = async (input, init) => {
		assert.equal(init?.method ?? "GET", "GET", "opening the top bar's layers must not write");
		const path = new URL(String(input), "http://localhost").pathname;
		throw new Error(`unexpected fetch ${path}`);
	};
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	await act(async () => { root!.render(node); });
	await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
}

function element(selector: string): HTMLElement {
	const node = document.querySelector<HTMLElement>(selector);
	assert.ok(node, `expected ${selector}`);
	return node;
}

async function press(target: Element | Window, type: string, init: Record<string, unknown> = {}) {
	await act(async () => {
		const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
		Object.assign(event, { pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, ctrlKey: false, detail: 1, ...init });
		target.dispatchEvent(event);
	});
}

/** A click without its pointerdown: linkedom has no capture phase, so a
 *  pointerdown inside an open Radix layer would read as outside it. */
const click = (target: Element) => press(target, "click");

async function escapeReachesWindow(): Promise<boolean> {
	let reached = false;
	const onWindow = (e: Event) => { if ((e as KeyboardEvent).key === "Escape") reached = true; };
	window.addEventListener("keydown", onWindow);
	await press(document.activeElement ?? document.body, "keydown", { key: "Escape" });
	window.removeEventListener("keydown", onWindow);
	return reached;
}

const STEPS: RoadmapStep[] = [
	{ id: "maps", title: "A matrix is a linear map", status: "visited", done: true, next: false, taught: true },
	{ id: "equation", title: "The eigen-equation", status: "current", done: false, next: false, taught: true },
	{ id: "compute", title: "Computing a $2 \\times 2$ spectrum", status: "upcoming", done: false, next: true, taught: false },
];
const PLACE = { topic: { handle: "eigen", title: "Eigenvalues and eigenvectors" }, arc: { title: "Spectra" } };
const COURSE = { title: "Linear Algebra", workspace: "/courses/la" };

function Roadmap({ onJump = () => {} }: { onJump?: (id: string) => void }) {
	const [open, setOpen] = React.useState(false);
	return <LessonRoadmap steps={STEPS} place={PLACE} course={COURSE} open={open} onOpenChange={setOpen} onJump={onJump} />;
}

describe("the lesson's top bar", () => {
	it("names no phase and holds no details menu: the crumbs, the roadmap and Done for today", async () => {
		await mount(<LessonTopBar title="Eigenvalues" course="Linear Algebra" courseHref="/unit/la" topic={{ title: "Spectra of 2×2 maps", href: "/unit/la/eigen" }} roadmap={<Roadmap />} tonight={<DoneTonightButton onDone={() => {}} />} />);
		assert.ok(document.querySelector('[data-testid="phase-chip"]') === null);
		assert.ok(document.querySelector('[data-testid="session-details"]') === null);
		assert.equal(element('[data-testid="course-label"]').getAttribute("href"), "/unit/la");
		assert.equal(element('[data-testid="topic-label"]').getAttribute("href"), "/unit/la/eigen");
		assert.ok(element('[data-testid="roadmap"]'));
		const done = element('[data-testid="done-tonight"]');
		assert.ok(done.querySelector("svg"), "Done for today carries its icon");
		assert.match(done.textContent!, /Done for today/);
	});

	it("shows the topic crumb only when its words are not the title's", () => {
		assert.equal(topicCrumbShown("Eigenvalues and eigenvectors", "eigenvalues and eigenvectors "), false);
		assert.equal(topicCrumbShown("Eigenvalues and eigenvectors", "Diagonalising"), true);
	});
});

describe("where the lesson is", () => {
	it("the strip marks each step and names the one he is on", async () => {
		await mount(<Roadmap />);
		const trigger = element('[data-testid="roadmap"]');
		assert.deepEqual([...trigger.querySelectorAll('[data-slot="roadmap-strip"] > span')].map((d) => d.getAttribute("data-status")), ["visited", "current", "upcoming"]);
		assert.match(trigger.textContent!, /The eigen-equation/);
		assert.equal(trigger.getAttribute("aria-label"), "Where this lesson is: The eigen-equation");
	});

	it("a taught step opens the transcript where it was taught; a step ahead is not a link", async () => {
		const jumped: string[] = [];
		await mount(<Roadmap onJump={(id) => jumped.push(id)} />);
		await click(element('[data-testid="roadmap"]'));
		const panel = element('[data-testid="roadmap-panel"]');
		assert.match(element('[data-testid="roadmap-step-maps"]').textContent!, /Done$/);
		assert.match(element('[data-testid="roadmap-step-equation"]').textContent!, /Now$/);
		assert.match(element('[data-testid="roadmap-step-compute"]').textContent!, /Next$/);
		assert.ok(element('[data-testid="roadmap-step-compute"]').querySelector("button") === null);
		await click(element('[data-testid="roadmap-step-maps"] button'));
		assert.deepEqual(jumped, ["maps"]);
		assert.equal(panel.isConnected && document.querySelector('[data-testid="roadmap-panel"]') !== null, false, "the panel closes on the jump");
	});

	it("leads up to the topic's page and the course map, with the topic's arc as a bubble", async () => {
		await mount(<Roadmap />);
		await click(element('[data-testid="roadmap"]'));
		assert.match(element('[data-testid="roadmap-topic"]').getAttribute("href")!, /^\/unit\/[^/]+\/eigen$/);
		assert.match(element('[data-testid="roadmap-course"]').getAttribute("href")!, /^\/unit\/[^/]+$/);
		assert.equal(element('[data-slot="arc-pill"]').textContent, "Spectra");
	});

	it("the strip's spoken name reads its maths as words, never as TeX", async () => {
		const steps = STEPS.map((step) => ({ ...step, status: step.id === "compute" ? ("current" as const) : ("visited" as const) }));
		await mount(<LessonRoadmap steps={steps} open={false} onOpenChange={() => {}} onJump={() => {}} />);
		assert.equal(element('[data-testid="roadmap"]').getAttribute("aria-label"), "Where this lesson is: Computing a 2 × 2 spectrum");
	});

	it("⌘K opens the steps with focus on Now, not the first done step (round 8)", async () => {
		await mount(<Roadmap />);
		await act(async () => { window.dispatchEvent(new dom.window.CustomEvent("lh:kbd-open-model-picker")); });
		assert.ok(document.activeElement === element('[data-testid="roadmap-step-equation"] button'));
	});

	it("arrows walk the panel's taught steps and links, Home and End jump to its ends", async () => {
		await mount(<Roadmap />);
		await act(async () => { window.dispatchEvent(new dom.window.CustomEvent("lh:kbd-open-model-picker")); });
		const panel = element('[data-testid="roadmap-panel"]');
		const stops = [element('[data-testid="roadmap-step-maps"] button'), element('[data-testid="roadmap-step-equation"] button'), element('[data-testid="roadmap-topic"]'), element('[data-testid="roadmap-course"]')];
		await act(async () => stops[0]!.focus());
		const key = async (k: string) => press(document.activeElement ?? panel, "keydown", { key: k });
		await key("ArrowDown");
		assert.ok(document.activeElement === stops[1], "down to the next taught step");
		await key("ArrowDown");
		assert.ok(document.activeElement === stops[2], "past the step not taught yet, to the topic's page");
		await key("ArrowUp");
		assert.ok(document.activeElement === stops[1]);
		await key("End");
		assert.ok(document.activeElement === stops[3]);
		await key("ArrowDown");
		assert.ok(document.activeElement === stops[3], "the last stays put");
		await key("Home");
		assert.ok(document.activeElement === stops[0]);
	});

	it("Esc closes the panel without reaching the turn, and ⌘K opens it", async () => {
		await mount(<Roadmap />);
		await act(async () => { window.dispatchEvent(new dom.window.CustomEvent("lh:kbd-open-model-picker")); });
		assert.ok(element('[data-testid="roadmap-panel"]'));
		assert.equal(await escapeReachesWindow(), false);
		assert.ok(document.querySelector('[data-testid="roadmap-panel"]') === null);
	});

	it("draws nothing for a lesson with no plan", async () => {
		await mount(<LessonRoadmap steps={[]} open={false} onOpenChange={() => {}} onJump={() => {}} />);
		assert.ok(document.querySelector('[data-testid="roadmap"]') === null);
	});

	it("⌘K in a lesson with no plan opens the way up, with no strip drawn", async () => {
		// Round 7 (robustness): ⌘K did nothing in a practice lesson.
		function NoPlan() {
			const [open, setOpen] = React.useState(false);
			return <LessonRoadmap steps={[]} place={PLACE} course={COURSE} open={open} onOpenChange={setOpen} onJump={() => {}} />;
		}
		await mount(<NoPlan />);
		assert.ok(document.querySelector('[data-testid="roadmap"]') === null, "no strip without a plan");
		await act(async () => { window.dispatchEvent(new dom.window.CustomEvent("lh:kbd-open-model-picker")); });
		assert.match(element('[data-testid="roadmap-topic"]').getAttribute("href")!, /^\/unit\/[^/]+\/eigen$/);
		assert.match(element('[data-testid="roadmap-course"]').getAttribute("href")!, /^\/unit\/[^/]+$/);
		assert.ok(document.querySelector('[data-slot="roadmap-steps"]') === null);
	});
});
