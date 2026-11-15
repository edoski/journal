/**
 * A sent message never comes back into the box (round 6, robustness major
 * 2): the words of a send are held for the refusal flow only until the
 * server accepts it.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SessionModel } from "../components/session-core.ts";
import { sendHoldingDraft, sendKeepingWords } from "../components/lesson/sent-draft.ts";
import { providerKeyMissing } from "../src/core/settings.ts";

const REFUSAL = JSON.stringify(providerKeyMissing("claude-subscription"));

function model(post: () => Response): SessionModel {
	return new SessionModel({
		chatId: "fixture",
		initialMessages: [],
		fetch: async (_url, init) => {
			if (init?.method === "POST") return post();
			return new Response(JSON.stringify({ messages: [], turnInFlight: false }), { status: 200 });
		},
	});
}

describe("the words of a message on its way", () => {
	it("are no longer held once the server accepts the send, so a later refusal puts nothing back", async () => {
		const held: { current: string | null } = { current: null };
		const m = model(() => new Response("ok", { status: 200 }));
		const accepted = await sendHoldingDraft(held, "hello? did my answer go through?", (onAccepted) =>
			m.send({ type: "text", text: "hello? did my answer go through?" }, onAccepted));
		assert.equal(accepted, true);
		assert.equal(held.current, null, "an accepted message belongs to the transcript, not the box");
	});

	it("stay held when the send is refused at once, for the box to take back", async () => {
		const held: { current: string | null } = { current: null };
		const m = model(() => new Response(REFUSAL, { status: 503 }));
		await sendHoldingDraft(held, "why is det the product?", (onAccepted) => m.send({ type: "text", text: "why is det the product?" }, onAccepted));
		assert.equal(held.current, "why is det the product?");
	});

	it("an earlier send's acceptance never drops a newer message's words", async () => {
		const held: { current: string | null } = { current: null };
		let accept!: () => void;
		const first = sendHoldingDraft(held, "first", (onAccepted) => new Promise<boolean>((resolve) => { accept = () => { onAccepted(); resolve(true); }; }));
		held.current = "second";
		accept();
		await first;
		assert.equal(held.current, "second");
	});
});

describe("a message that never reached the app", () => {
	const offline = () => { throw new TypeError("Failed to fetch"); };

	it("comes back into the box as he typed it, trailing space too (round 10, 4 major 1)", async () => {
		const held: { current: string | null } = { current: null };
		const m = model(offline);
		const sent = await sendKeepingWords(held, "hello? did that go through? ", (text, onAccepted) => m.send({ type: "text", text }, onAccepted), () => "");
		assert.deepEqual(sent, { accepted: false, back: "hello? did that go through? " });
		assert.equal(held.current, null, "given back once: no refusal flow puts it back a second time");
		assert.ok(!m.getState().nativeMessages.some((msg) => msg.role === "user"), "and no bubble stays in the transcript");
	});

	it("comes back after a reply the connection cut, while the app is still down", async () => {
		const held: { current: string | null } = { current: null };
		let down = false;
		const m = new SessionModel({
			chatId: "fixture",
			initialMessages: [],
			fetch: async (url) => {
				if (down) throw new TypeError("Failed to fetch");
				if (String(url).endsWith("/stream")) return new Response("data: {\"type\":\"message_start\",\"message\":{\"role\":\"assistant\",\"content\":[]}}\n\n", { status: 200, headers: { "Content-Type": "text/event-stream" } });
				if (String(url) === "/api/chat") return Response.json({ ok: true });
				return Response.json({ messages: [], turnInFlight: false });
			},
		});
		await m.send({ type: "text", text: "my answer" });
		assert.equal(m.getState().error?.message, "The connection dropped before the tutor finished replying.");
		down = true;
		const sent = await sendKeepingWords(held, "hello? did that go through?", (text, onAccepted) => m.send({ type: "text", text }, onAccepted), () => "");
		assert.equal(sent.back, "hello? did that go through?");
	});

	it("waits where another flow already put it, and never over newer words", async () => {
		const taken: { current: string | null } = { current: null };
		const m = model(offline);
		const sent = await sendKeepingWords(taken, "first", (text, onAccepted) => { taken.current = null; return m.send({ type: "text", text }, onAccepted); }, () => "");
		assert.equal(sent.back, null, "a flow that took the words (a deleted course) keeps them");
		const held: { current: string | null } = { current: null };
		const typedSince = await sendKeepingWords(held, "first", (text, onAccepted) => m.send({ type: "text", text }, onAccepted), () => "second");
		assert.equal(typedSince.back, null, "what he typed since stays in the box");
	});

	it("puts nothing back for a send the app took", async () => {
		const held: { current: string | null } = { current: null };
		const sent = await sendKeepingWords(held, "fine", (text, onAccepted) => model(() => new Response("ok")).send({ type: "text", text }, onAccepted), () => "");
		assert.deepEqual(sent, { accepted: true, back: null });
	});
});
