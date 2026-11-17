/**
 * One Today line, one press (audit 17 Nov 2026, finding 9; Edo's default:
 * the sidebar's card does what Home's row does): pressed, a line that leads
 * with a topic goes to the same place from Home's row and from the
 * sidebar's card, the session that waits or holds its step, else the
 * lesson started on it, never the topic's page. Mounted in a DOM so each
 * press is clicked as he clicks it.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { dom } from "./helpers/radix-dom.ts";
// next/link reaches for `self` when a link mounts.
(globalThis as Record<string, unknown>).self = globalThis;
import { createRoot, type Root } from "./helpers/app-render.tsx";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { continueHref } from "../components/nav/session-state.ts";
import { needsYouNow } from "../components/study-home/needs-you.ts";
import { courseMove, type CourseMove } from "../components/study-home/study-facts.ts";
import { HybridRows } from "../components/study-home/agenda-rows/hybrid/hybrid-rows.tsx";
import { StartScope } from "../components/start/start-scope.tsx";
import { NowCard } from "../components/unit-inbox/now-card.tsx";
import { topicUnit } from "../components/unit-inbox/now-inbox.ts";
import { buildInbox } from "../components/unit-inbox/units.ts";
import { CHATS, COURSES, TODAY } from "./fixtures/now-demo.ts";

const router = { push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {}, forward: () => {}, refresh: () => {} };
const noop = () => {};

let root: Root | null = null;
let host: HTMLDivElement | null = null;
async function unmount() {
	await act(async () => root?.unmount());
	host?.remove();
	root = host = null;
}
afterEach(unmount);

async function mount(node: React.ReactNode) {
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	await act(async () => root!.render(<AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>));
}

/** Where a move goes, in one word for the comparison. */
const goes = (workspace: string, move: CourseMove) =>
	move.kind === "open" ? `open ${continueHref(move.chat)}` : `start ${workspace}: ${move.opening} [${move.topics.join(", ")}]${move.from ? ` from ${move.from}` : ""}`;

/** Where pressing `el` goes: a link's address, else what its click takes up. */
async function pressed(el: Element, took: () => string | null): Promise<string | null> {
	if (el.tagName === "A") return `open ${el.getAttribute("href")}`;
	await act(async () => {
		el.dispatchEvent(new dom.window.Event("click", { bubbles: true }) as unknown as Event);
	});
	return took();
}

describe("one Today line, one press", () => {
	const inbox = buildInbox(COURSES, CHATS, null);
	const { lines, also } = needsYouNow(COURSES, CHATS, TODAY);
	const led = [...lines, ...also].filter((line) => line.lead !== null && line.row.course);

	it("goes to the same place from Home's row and the sidebar's card, for every line that leads with a topic", async () => {
		assert.ok(led.some((l) => l.row.kind === "session") && led.some((l) => l.row.kind === "course"), "the demo leads sessions and courses with a topic");
		for (const line of led) {
			// Home's row, its course line taken as Home's page takes it (`courseMove`, home-frame.tsx).
			let homeTook: string | null = null;
			await mount(
				<HybridRows
					rows={[line.row]}
					busy={false}
					onContinue={(workspace, step) => {
						const course = COURSES.find((c) => c.map.workspace === workspace)!;
						homeTook = goes(workspace, courseMove(course, CHATS, step));
					}}
				/>,
			);
			const home = await pressed(document.querySelector('[data-slot="today-line"]')!, () => homeTook);
			await unmount();

			let cardTook: string | null = null;
			const take = (workspace: string, move: CourseMove) => {
				cardTook = goes(workspace, move);
			};
			await mount(
				<StartScope lesson={{ start: noop, take, starting: null, busy: false, error: null, setupOpen: false, openSetup: noop, closeSetup: noop }}>
					<ul>
						<NowCard line={line} unit={topicUnit(inbox, line.row.course!, line.lead!, CHATS)} active={false} chats={CHATS} />
					</ul>
				</StartScope>,
			);
			const card = await pressed(document.querySelector('[data-testid="unit-row"]')!, () => cardTook);
			await unmount();
			assert.ok(home, `Home's row for "${line.title}" goes somewhere`);
			assert.equal(card, home, `"${line.title}": the card goes where Home's row goes`);
			assert.doesNotMatch(card ?? "", /\/unit\//, "never the topic's page");
		}
	});
});
