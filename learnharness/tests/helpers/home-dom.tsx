/**
 * Home's real body on the demo courses, mounted in a DOM that takes real
 * key events, for the tests of Home's keys.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import { dom } from "./radix-dom.ts";
// next/link reaches for `self` when a link mounts.
(globalThis as Record<string, unknown>).self = globalThis;
import { createRoot, type Root } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { HomeBody } from "../../components/study-home/study-home.tsx";
import { lessonOf } from "../../components/study-home/lesson-facts.ts";
import { needsYouNow } from "../../components/study-home/needs-you.ts";
import { todayCourses } from "../../components/study-home/study-facts.ts";
import { CHATS, COURSES, TODAY } from "../fixtures/now-demo.ts";

let root: Root | null = null;
let host: HTMLDivElement | null = null;
/** Every page Home's router was asked to open, oldest first. */
export const pushed: string[] = [];
const router = { push: (href: string) => pushed.push(href), replace: () => {}, prefetch: () => {}, back: () => {}, forward: () => {}, refresh: () => {} };

export const { rows } = needsYouNow(COURSES, CHATS, TODAY);
const ready = { rows, lessons: rows.map(lessonOf), courses: todayCourses(rows, COURSES), chats: CHATS, done: [], exam: null, busy: false, onContinue: () => {} };

export async function unmount() {
	await act(async () => root?.unmount());
	root = null;
	host?.remove();
	host = null;
	pushed.length = 0;
}

export async function mount() {
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	const Home = () => {
		const [enlarged, setEnlarged] = React.useState(false);
		return <HomeBody ready={ready} enlarged={enlarged} onEnlarge={setEnlarged} />;
	};
	await act(async () =>
		root!.render(
			<AppRouterContext.Provider value={router as never}>
				<main data-slot="study-home">
					<Home />
				</main>
			</AppRouterContext.Provider>,
		),
	);
}

/** One keydown on `target` (the focused element by default), as a browser sends it. */
export async function press(key: string, target: EventTarget = document.activeElement ?? document.body) {
	const event = new dom.window.Event("keydown", { bubbles: true, cancelable: true });
	Object.assign(event, { key, altKey: false, metaKey: false, ctrlKey: false, shiftKey: false });
	await act(async () => {
		target.dispatchEvent(event as unknown as Event);
	});
}

export const tab = () => document.querySelector('[data-slot="home-map-tabs"] [data-state="active"]')?.textContent;
export const tabTitles = () => [...document.querySelectorAll('[data-slot="home-map-tabs"] [data-slot="tabs-trigger"]')].map((t) => t.textContent);
export const lineOf = (el: Element | null) => el?.closest('[data-slot="today-line"]') ?? null;
export const lines = () => [...document.querySelectorAll('[data-slot="today-line"]')];
