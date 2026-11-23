/**
 * Round 21, m8 (4 minor 4; round-20 m5's remainder): Calculus I deleted
 * from window 1 while window 2 was in its review. Window 2's transcript
 * flipped to the deleted notice at 1.55 s, on the delete's event, but both
 * sidebars still read "Calculus I · Your turn · Continue Calculus I review"
 * about 2.4 s after the delete, and pressing it opened the deleted course's
 * review. The sidebar now drops the course's cards on that same event,
 * before any read, and a read begun before it no longer puts them back.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { parseHTML } from "linkedom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

const dom = parseHTML("<html><body></body></html>");
Object.assign(globalThis, {
	window: dom.window,
	document: dom.document,
	Element: dom.window.Element,
	HTMLElement: dom.window.HTMLElement,
	CustomEvent: dom.window.CustomEvent,
	IS_REACT_ACT_ENVIRONMENT: true,
	localStorage: { getItem: () => null, setItem() {} },
});

const { createRoot } = await import("react-dom/client");
const { ServerEventsProvider } = await import("../components/server-events.tsx");
const { useSessionsSidebar } = await import("../components/sidebar-state.ts");
const { useUnitInbox } = await import("../components/unit-inbox/use-unit-inbox.ts");
const { nowFor } = await import("../components/unit-inbox/now-inbox.ts");
const { chat, map, topic } = await import("./fixtures/round8-home.ts");
type NotifySource = import("../components/server-events.tsx").NotifySource;
type Root = import("react-dom/client").Root;
type StudyCourse = import("../src/core/index.ts").StudyCourse;

const TODAY = "2026-11-08";
const CALC = { workspace: "/study/calculus-1", title: "Calculus I" };
const LA = { workspace: "/s/la", title: "Linear Algebra" };
const calculus: StudyCourse = { map: map({ workspace: CALC.workspace, title: CALC.title, today: TODAY, current: "shells" as never, topics: [topic("shells", "Volumes by cylindrical shells", { review: { kind: "due", date: TODAY, overdue: 0 } })] }), unready: null, due: ["shells" as never], newToday: [], lastActiveDaysAgo: 0 };
const algebra: StudyCourse = { map: map({ today: TODAY }), unready: null, due: [], newToday: [], lastActiveDaysAgo: 1 };
const review = chat({ id: "c_calc", title: "Calculus I review", course: CALC, topics: ["shells"], ownTopics: ["shells"], pendingQuestion: true, review: true, updatedAt: `${TODAY}T09:00:00.000Z` });

const originalFetch = globalThis.fetch;
let root: Root | undefined;
afterEach(async () => {
	await act(async () => root?.unmount());
	root = undefined;
	globalThis.fetch = originalFetch;
});

function channel() {
	const handlers = new Map<string, (data: string) => void>();
	const source: NotifySource = { close() {}, onOpen() {}, onEvent: (name, cb) => void handlers.set(name, cb) };
	return { source, push: (name: string, payload: unknown) => act(async () => handlers.get(name)?.(JSON.stringify(payload))) };
}

/** The sidebar's cards: its sessions and courses, as `UnitSidebar` reads them. */
let cards: string[] = [];
function Cards() {
	const s = useSessionsSidebar({ open: true, toggle() {} });
	const { state } = useUnitInbox(s.chats);
	const needs = state.status === "ready" ? nowFor(state.courses, state.chats, null, TODAY) : null;
	cards = needs ? [...needs.lines, ...needs.also].map((l) => `${l.row.course?.map.title ?? ""} · ${l.slot ?? ""} · ${l.title}`) : [];
	return null;
}

const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
const settle = () => act(async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); });

describe("a deleted course's cards leave the sidebar on the delete's event (round 21, m8; 4 minor 4)", () => {
	it("no Calculus I card once the event lands, and a read begun before it does not bring one back", async () => {
		let deleted = false;
		let hold = false;
		const held: Array<() => void> = [];
		globalThis.fetch = (async (input: RequestInfo | URL) => {
			const url = new URL(String(input), "http://localhost");
			const before = !deleted;
			const answer = () =>
				url.pathname === "/api/chats"
					? Response.json({ chats: before ? [review] : [{ ...review, courseDeleted: true }] })
					: Response.json({ available: true, courses: before ? [algebra, calculus] : [algebra], failed: [] });
			return hold ? new Promise<Response>((resolve) => held.push(() => resolve(answer()))) : answer();
		}) as unknown as typeof fetch;
		const { source, push } = channel();
		const host = document.createElement("div");
		document.body.append(host);
		root = createRoot(host);
		await act(async () =>
			root!.render(
				<AppRouterContext.Provider value={router as never}>
					<ServerEventsProvider connect={() => source}>
						<Cards />
					</ServerEventsProvider>
				</AppRouterContext.Provider>,
			),
		);
		await settle();
		assert.ok(cards.some((c) => c.startsWith("Calculus I · Your turn")), `before: ${JSON.stringify(cards)}`);
		// Reads of both lists are in flight as he deletes: a turn settled and a record changed a moment before.
		hold = true;
		await push("turn-settled", { chatId: "c_other" });
		await push("course-changed", { workspace: LA.workspace });
		await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
		assert.equal(held.length, 2, "both reads are in flight");
		hold = false;
		deleted = true;
		await push("courses-changed", { deleted: CALC.workspace });
		assert.deepEqual(cards.filter((c) => c.startsWith("Calculus I")), [], `on the event: ${JSON.stringify(cards)}`);
		await act(async () => { for (const answer of held.splice(0)) answer(); });
		await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
		await settle();
		assert.deepEqual(cards.filter((c) => c.startsWith("Calculus I")), [], `after the reads begun before it: ${JSON.stringify(cards)}`);
	});
});
