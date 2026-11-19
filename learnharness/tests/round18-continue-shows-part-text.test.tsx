/**
 * Round 18, M6 (1, 2): Continue Problem sheet 4 drew "Part (c): show
 * dim ker A = 2 for the 3 × 5 matrix A" at once (round 17, M8), but the
 * matrix itself came only with the tutor's turn, 64 to 80 s later, once it
 * had found and read the sheet. The engine's map now says where each task's
 * text is in his material, the server reads the part from the sheet, and
 * the Continue line draws it the moment he presses; the turn's input carries
 * the same text, so the tutor reads no file to find it.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import { dom } from "./helpers/radix-dom.ts";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, it } from "node:test";

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
	const location = new URL("http://localhost/chat/c_sheet4");
	Object.defineProperty(dom.window, "location", { value: location, configurable: true, writable: true });
	Object.defineProperty(globalThis, "location", { value: location, configurable: true, writable: true });
}
Object.assign(dom.window, { history: { state: null, replaceState() {}, pushState() {} } });
Object.assign(dom.window.HTMLElement.prototype, { scrollTo() {}, scrollBy() {} });

const { createRoot } = await import("./helpers/app-render.tsx");
const { Chat } = await import("../components/chat.tsx");
const { ServerEventsProvider } = await import("../components/server-events.tsx");
type NotifySource = import("../components/server-events.tsx").NotifySource;
const quietSource: NotifySource = { close() {}, onOpen() {}, onEvent() {} };
const { continuedTaskOf, inputAppends, newUserMessage, parseChatInput } = await import("../src/core/index.ts");
const { courseMapOf } = await import("../src/store/course-records.ts");
const { continuedTask, passageAt } = await import("../src/server/task-passage.ts");
type LhMessage = import("../src/core/index.ts").LhMessage;

const CHAT = "c_sheet4";
const STEP = "Part (c): show $\\dim \\ker A = 2$ for the $3 \\times 5$ matrix $A$";
/** The demo world's sheet file, as the seed's material holds it. */
const SHEETS = [
	"# Linear Algebra: problem sheets",
	"",
	"Each sheet is set from the textbook's exercises.",
	"",
	"## Sheet 4: rank and nullity",
	"Two.III.1: 20, 21 (*); Two.III.2: 15, 17 (*).",
	"",
	"A further problem, for hand-in. Let $A$ be the $3 \\times 5$ matrix with rows $(1, 2, 0, 1, 3)$, $(0, 1, 1, 2, 1)$ and $(1, 3, 1, 3, 5)$.",
	"(a) Reduce $A$ to echelon form. (b) State rank-nullity. (c) Show $\\dim \\ker A = 2$. (d) Find a basis for $\\ker A$.",
	"",
	"## Sheet 40: more",
	"Not this one.",
	"",
].join("\n");
const LINES = SHEETS.split("\n");
const EXERCISES = LINES[5]!;
const PART = LINES.slice(7, 9).join("\n");

const STAMPS = { api: "faux", provider: "test", model: "test", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, stopReason: "toolUse" } as const;
/** Sheet 4's 6 Nov session, as the seed holds it: it opened the task, saved its step and stopped. */
const SHEET_SESSION: LhMessage[] = [
	newUserMessage("Help me start problem sheet 4.") as LhMessage,
	{ id: "a1", role: "assistant", content: [{ type: "toolCall", id: "save1", name: "course_save", arguments: { changes: { tasks: { "sheet-4": { title: "Problem sheet 4: rank and nullity", step: STEP } }, focus: "sheet-4" } } }], ...STAMPS, timestamp: 1 } as unknown as LhMessage,
	{ id: "r1", role: "toolResult", toolCallId: "save1", toolName: "course_save", content: [{ type: "text", text: "{}" }], details: null, isError: false, timestamp: 1 } as unknown as LhMessage,
	{ id: "t1", role: "assistant", content: [{ type: "text", text: "Good place to stop." }], ...STAMPS, stopReason: "stop", timestamp: 2 } as unknown as LhMessage,
];

/** A course folder holding the sheet, and the engine's map of it as the app parses it. */
function sheetCourse() {
	const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "lh-sheet4-"));
	fs.mkdirSync(path.join(workspace, "material"));
	fs.writeFileSync(path.join(workspace, "material", "problem-sheets.md"), SHEETS);
	const map = courseMapOf(workspace, {
		today: "2026-11-08",
		tasks: [{ key: "sheet-4", title: "Problem sheet 4: rank and nullity", step: STEP, updated: "2026-11-06", topics: [], where: [{ path: "material/problem-sheets.md", locator: "Sheet 4" }] }],
		topics: [],
	});
	assert.ok(map, "the map parses");
	return map;
}

const originalFetch = globalThis.fetch;
let root: { unmount(): void; render(node: React.ReactNode): void } | null = null;
let host: HTMLElement | null = null;
let posted: unknown[] = [];

/** The app's routes; the turn's POST is held, so nothing the model writes ever arrives. */
function stubFetch(messages: LhMessage[]) {
	posted = [];
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(String(input), "http://localhost");
		if (url.pathname === "/api/chat" && init?.method === "POST") {
			posted.push(JSON.parse(String(init.body)));
			return new Promise<Response>(() => {});
		}
		if (url.pathname === "/api/models") return Response.json({ account: "claude-subscription", connected: true, contextWindow: 200000 });
		if (url.pathname === `/api/chats/${CHAT}`) return Response.json({ messages, turnInFlight: false });
		if (url.pathname === `/api/chats/${CHAT}/marks`) return Response.json({ ok: true, marks: {} });
		if (url.pathname === "/api/jobs") return Response.json({ jobs: [] });
		if (url.pathname === "/api/courses") return Response.json({ available: true, courses: [{ workspace: "la" }] });
		if (url.pathname === "/api/subscriptions/claude") return Response.json({ accounts: [] });
		return Response.json({});
	}) as typeof fetch;
}

const settle = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); });

afterEach(async () => {
	await act(async () => root?.unmount());
	root = null;
	host?.remove();
	host = null;
	globalThis.fetch = originalFetch;
});

/** The line's words, its formulas read back as their TeX. */
const lineWords = (page: HTMLElement) => {
	const line = page.querySelector('[data-testid="task-continue-line"]');
	if (!line) return null;
	const copy = line.cloneNode(true) as Element;
	for (const math of copy.querySelectorAll(".katex")) math.replaceWith(copy.ownerDocument.createTextNode(`$${math.querySelector("annotation")?.textContent ?? ""}$`));
	return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
};

describe("Continue on a task shows the part's text from his material at once (round 18, M6)", () => {
	it("the sheet's part is the paragraph of its section that holds the step's label", () => {
		assert.equal(passageAt(SHEETS, "Sheet 4", STEP), PART);
		assert.equal(passageAt(SHEETS, "sheet 4", "Part (z): another"), `${EXERCISES}\n\n${PART}`, "no paragraph holds the label: the whole section");
		assert.equal(passageAt(SHEETS, "Sheet 40", null), "Not this one.", "Sheet 4 is never Sheet 40");
		assert.equal(passageAt(SHEETS, "Sheet 9", STEP), null, "a place no heading names has no passage");
	});

	it("the server reads the part from the course's own sheet, through the map's place", async () => {
		const map = sheetCourse();
		assert.deepEqual(map.tasks[0]!.where, [{ path: "material/problem-sheets.md", locator: "Sheet 4" }]);
		assert.deepEqual(await continuedTask(map, SHEET_SESSION), { title: "Problem sheet 4: rank and nullity", step: STEP, passage: PART });
		const pdf = { ...map, tasks: [{ ...map.tasks[0]!, where: [{ path: "material/book.pdf", locator: "p. 4" }] }] };
		assert.deepEqual(await continuedTask(pdf, SHEET_SESSION), continuedTaskOf(map, SHEET_SESSION), "a PDF place: the step alone");
	});

	it("Continue on sheet 4 puts the part's matrix in the transcript before any model output", async () => {
		const task = await continuedTask(sheetCourse(), SHEET_SESSION);
		stubFetch(SHEET_SESSION);
		host = document.createElement("div");
		document.body.append(host);
		root = createRoot(host);
		await act(async () =>
			root!.render(
				<ServerEventsProvider connect={() => quietSource}>
					<Chat chatId={CHAT} title="Problem sheet 4" initialMessages={SHEET_SESSION} course={{ workspace: "la", title: "Linear Algebra" }} place={{ topic: { handle: "kernel", title: "Kernel" }, arc: null, task }} continueTask />
				</ServerEventsProvider>,
			),
		);
		await settle();
		assert.equal(posted.length, 1, "the press asks for the task's turn, whose POST is held");
		const words = lineWords(host) ?? "";
		assert.match(words, /rows \$\(1, 2, 0, 1, 3\)\$, \$\(0, 1, 1, 2, 1\)\$ and \$\(1, 3, 1, 3, 5\)\$/, "the matrix is on screen");
		assert.match(words, /Part \(c\)/);
		assert.doesNotMatch(words, /Two\.III/, "only the part he left, not the sheet's exercise list");
	});

	it("the turn's input carries the same text, and the record keeps it for a reload", () => {
		const task = { title: "Problem sheet 4: rank and nullity", step: STEP, passage: PART };
		const marker = inputAppends({ messages: SHEET_SESSION }, { type: "task", task }).at(-1)!;
		assert.ok(marker.role === "custom" && marker.customType === "task-continue");
		assert.ok(typeof marker.content === "string" && marker.content.includes(PART), "the tutor reads the part's text in its input");
		assert.equal((marker.details as { passage?: string }).passage, PART);
		const plain = inputAppends({ messages: SHEET_SESSION }, { type: "task", task: { title: task.title, step: STEP } }).at(-1)!;
		assert.ok(plain.role === "custom" && typeof plain.content === "string" && !plain.content.includes("read no file"), "with no passage the input is as before");
		assert.deepEqual(parseChatInput({ type: "task", task }), { type: "task" }, "a client's text never reaches the server's marker");
	});
});
