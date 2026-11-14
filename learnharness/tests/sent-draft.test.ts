/**
 * A sent message never comes back into the box (round 6, robustness major
 * 2): the words of a send are held for the refusal flow only until the
 * server accepts it.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SessionModel } from "../components/session-core.ts";
import { sendHoldingDraft } from "../components/lesson/sent-draft.ts";
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
