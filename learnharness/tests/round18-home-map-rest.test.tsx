/**
 * Round 18, m8 (1 n6, `19`, `40`): after the Eigen lesson on 8 Nov, and
 * again on 9 Nov, Home's map opened on Linear Algebra's arc 2, with neither
 * You are here (arc 8) nor a Today topic in view: at rest it followed the
 * session he last wrote in, whatever arc that was in. At rest the map now
 * opens on the arc of You are here, or without one on the arc of the first
 * Today row's topic; pointing at a row still follows that row.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import "./helpers/radix-dom.ts";
(globalThis as Record<string, unknown>).self = globalThis;
import { createRoot, type Root } from "./helpers/app-render.tsx";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ChatListItem, StudyCourse } from "../src/core/index.ts";
import { HomeBody } from "../components/study-home/study-home.tsx";
import { ServerEventsProvider } from "../components/server-events.tsx";
import { lessonOf } from "../components/study-home/lesson-facts.ts";
import { needsYouNow } from "../components/study-home/needs-you.ts";
import { CHATS, LINALG_ARCS, PROB, TODAY } from "./fixtures/now-demo.ts";

const router = { push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {}, forward: () => {}, refresh: () => {} };
let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
	await act(async () => root?.unmount());
	host?.remove();
	root = host = null;
});

async function mount(courses: readonly StudyCourse[], chats: readonly ChatListItem[]) {
	const { rows } = needsYouNow(courses, chats, TODAY);
	const ready = { rows, lessons: rows.map(lessonOf), courses, chats, done: [], exam: null, busy: false, onContinue: () => {} };
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	await act(async () =>
		root!.render(
			<AppRouterContext.Provider value={router as never}>
				<ServerEventsProvider connect={() => ({ close() {}, onOpen() {}, onEvent() {} })}>
					<main data-slot="study-home">
						<HomeBody ready={ready as never} enlarged={false} onEnlarge={() => {}} />
					</main>
				</ServerEventsProvider>
			</AppRouterContext.Provider>,
		),
	);
	return rows;
}

const shown = () => document.querySelector('[data-slot="home-map-course"][data-shown]') && document.querySelector('[data-slot="arc-index-row"][data-shown]')?.getAttribute("data-arc");
const tab = () => document.querySelector('[data-slot="home-map-tabs"] [data-state="active"]')?.textContent;

describe("Home's map at rest (round 18, m8)", () => {
	it("opens on You are here's arc, not on the arc of the session he last wrote in", async () => {
		// The Eigenvalues lesson, the newest session, is in the Eigenvalues arc; You are here is Rank, in Linear systems.
		const rows = await mount([LINALG_ARCS, PROB], CHATS);
		assert.equal(tab(), "Linear Algebra");
		const eigen = rows.find((row) => row.kind === "session" && row.chat.id === "chat_eigen");
		assert.ok(eigen && lessonOf(eigen).place?.handle === "eigenvalues", "the session he last wrote in is in another arc than You are here");
		assert.equal(shown(), "systems", "the arc of You are here");
	});

	it("opens on the first Today row's arc in a course with no You are here", async () => {
		const nowhere: StudyCourse = { ...LINALG_ARCS, map: { ...LINALG_ARCS.map, current: null, currentArc: undefined } };
		const rows = await mount([nowhere, PROB], CHATS);
		const first = rows.find((row) => row.course?.map.workspace === nowhere.map.workspace)!;
		const place = lessonOf(first).place?.handle;
		assert.ok(place, "the first Linear Algebra row lies in one arc");
		assert.equal(shown(), place, "the first Today row's arc");
	});
});
