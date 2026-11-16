/**
 * A message sent in the first seconds of a turn reaches that turn (round
 * 12, 4 major 1). The server registers a turn's live agent only after the
 * engine's course brief and plan read, a few seconds after his send's POST
 * arrived; a steer sent in that window got a 409, its plain-send fallback
 * was refused at once by his own send still being taken, and the words sat
 * in the box with no word while the reply ignored them. A steer refused
 * while his own send is still being taken waits for that send, then goes
 * to the turn it started.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { SessionModel } from "../components/session-core.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
});

/** The server as it runs: the turn's POST answers once the turn is live,
 *  and a steer before then finds no live turn. `release` lets the POST
 *  through with the given status. */
function server() {
	let live = false;
	let release: (status: number) => void = () => {};
	const posted = new Promise<number>((resolve) => (release = resolve));
	const calls: string[] = [];
	const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		calls.push(`${init?.method ?? "GET"} ${url}`);
		if (url === "/api/chat") {
			const status = await posted;
			if (status !== 200) return Response.json({ error: "Claude isn't signed in" }, { status });
			live = true;
			return Response.json({ ok: true });
		}
		if (url === "/api/chats/chat_x/steer") return live ? Response.json({ ok: true }) : Response.json({ error: "no live turn to steer" }, { status: 409 });
		if (url === "/api/chats/chat_x") return Response.json({ messages: [], turnInFlight: live });
		if (url === "/api/chats/chat_x/stream") return new Response(new ReadableStream({ start() {} }));
		throw new Error(`unexpected fetch: ${url}`);
	}) as typeof globalThis.fetch;
	return { fetch, calls, release };
}

describe("a message sent while his own send is still being taken", () => {
	it("waits for that send and reaches the turn it started", async () => {
		const s = server();
		const m = new SessionModel({ chatId: "chat_x", initialMessages: [], fetch: s.fetch });
		void m.send({ type: "text", text: "c1 + c2 = 3 and c1 - c2 = 5, so c1 = 4 and c2 = -1" });
		const steered = m.steer("also is P invertible here?");
		await new Promise((resolve) => setTimeout(resolve, 20));
		s.release(200);
		assert.equal(await steered, true, "the steer is taken by the turn");
		assert.equal(s.calls.filter((c) => c === "POST /api/chat").length, 1, "no second turn was asked for");
		assert.equal(s.calls.filter((c) => c === "POST /api/chats/chat_x/steer").length, 2, "refused once before the turn was live, taken after");
		m.stop();
	});

	it("gives the words back when that send is refused, under its refusal", async () => {
		const s = server();
		const m = new SessionModel({ chatId: "chat_x", initialMessages: [], fetch: s.fetch });
		void m.send({ type: "text", text: "my answer" });
		const steered = m.steer("also is P invertible here?");
		await new Promise((resolve) => setTimeout(resolve, 20));
		s.release(503);
		assert.equal(await steered, false, "not taken: the box keeps the words");
		assert.ok(m.getState().error, "the refusal says why");
		assert.equal(s.calls.filter((c) => c === "POST /api/chat").length, 1);
		m.stop();
	});
});
