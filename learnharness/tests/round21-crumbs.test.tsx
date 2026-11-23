/**
 * Round 21, the lesson's breadcrumb.
 *   - m9 (2 n4): a review's crumb said the topic's long maths title twice,
 *     "Real Analysis › Cardinality, countable sets and Cantor's theorem
 *     |A| < |𝒫(A)| › Review Cardinality, countable sets and Cantor's theorem
 *     |A| < |𝒫(A)|". A one-topic review named after its topic ends on
 *     "Review".
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;
import { dom } from "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { parseHTML } from "linkedom";

function memoryStorage(): Storage {
	const kept = new Map<string, string>();
	return {
		get length() { return kept.size; },
		key: (i: number) => [...kept.keys()][i] ?? null,
		getItem: (k: string) => kept.get(k) ?? null,
		setItem: (k: string, v: string) => void kept.set(k, String(v)),
		removeItem: (k: string) => void kept.delete(k),
		clear: () => kept.clear(),
	};
}
for (const [key, value] of Object.entries({ localStorage: memoryStorage(), sessionStorage: memoryStorage() })) {
	Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
	Object.defineProperty(dom.window, key, { value, configurable: true, writable: true });
}
(globalThis as Record<string, unknown>).self = globalThis;
if (!(dom.window as { location?: unknown }).location) {
	const location = new URL("http://localhost/chat/c_review");
	Object.defineProperty(dom.window, "location", { value: location, configurable: true, writable: true });
	Object.defineProperty(globalThis, "location", { value: location, configurable: true, writable: true });
}
Object.assign(dom.window, { history: { state: null, replaceState() {}, pushState() {} } });
Object.assign(dom.window.HTMLElement.prototype, { scrollTo() {}, scrollBy() {} });

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-crumbs-"));
process.env.LH_DATA_DIR = scratch;
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const { renderToStaticMarkup } = await import("./helpers/app-render.tsx");
const { Chat } = await import("../components/chat.tsx");
const { ServerEventsProvider } = await import("../components/server-events.tsx");
type NotifySource = import("../components/server-events.tsx").NotifySource;
const quietSource: NotifySource = { close() {}, onOpen() {}, onEvent() {} };
const { newUserMessage } = await import("../src/core/index.ts");
type LessonPlace = import("../src/core/lesson-place.ts").LessonPlace;

const RA = { workspace: "/s/ra", title: "Real Analysis" };
const CANTOR = "Cardinality, countable sets and Cantor's theorem $|A| < |\\mathcal{P}(A)|$";

/** The top bar's trail as he reads it: each crumb's words, then the title's. */
function trail(title: string, place: LessonPlace): string[] {
	const html = renderToStaticMarkup(
		<ServerEventsProvider connect={() => quietSource}>
			<Chat chatId="c_review" title={title} initialMessages={[newUserMessage(title)]} course={RA} place={place} />
		</ServerEventsProvider>,
	);
	const doc = parseHTML(`<html><body>${html}</body></html>`).document;
	const crumbs = doc.querySelector('[data-slot="crumbs"]')!;
	for (const math of crumbs.querySelectorAll(".katex")) math.replaceWith(doc.createTextNode(`$${math.querySelector("annotation")?.textContent ?? ""}$`));
	return [...crumbs.children].filter((el) => el.getAttribute("data-slot") !== "crumb-chevron").map((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim());
}

describe("a one-topic review's crumb ends on Review (round 21, m9; 2 n4)", () => {
	const place: LessonPlace = { topic: { handle: "cardinality", title: CANTOR }, arc: null, task: null };

	it("Real Analysis › Cardinality… › Review, the long title once", () => {
		assert.deepEqual(trail(`Review ${CANTOR}`, place), ["Real Analysis", CANTOR, "Review"]);
	});

	it("any other title still ends the trail, and one named as its topic is not drawn twice", () => {
		assert.deepEqual(trail("Cantor practice", place), ["Real Analysis", CANTOR, "Cantor practice"]);
		assert.deepEqual(trail(CANTOR, place), ["Real Analysis", CANTOR]);
	});
});
