/**
 * Round 14, 4 minor 10: the stop line ("You stopped the tutor before it
 * replied.") appeared 2 to 3 s after ⌘↵, once the server's abort had
 * settled and the record came back, and the sidebar said "Tutor writing"
 * until then. The lesson now reads his stop as the record will
 * (SessionModel.stopReply), and his Stop during a wake's setup stops the
 * turn it was setting up (turn-runs abortTurn).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { SessionModel } from "../components/session-core.ts";
import { newUserMessage, replyCutOf, type LhMessage } from "../src/core/index.ts";
import { abortTurn, forgetStop, markWaking, registerTurn, unregisterTurn } from "../src/server/turn-runs.ts";

const sent = newUserMessage("(3a, b) I think") as LhMessage;

test("a stop before the first word reads as stopped at once", () => {
	const m = new SessionModel({ chatId: "c1", initialMessages: [sent] });
	m.applyWireEvent({ type: "message_start", message: { role: "assistant", content: [] } });
	assert.equal(replyCutOf(m.getState().nativeMessages), null, "the reply is under way");
	m.stopReply();
	assert.equal(m.getState().status, "ready");
	assert.equal(replyCutOf(m.getState().nativeMessages), "stopped");
});

test("a stop after the tutor wrote to him reads as stopped mid-reply", () => {
	const m = new SessionModel({ chatId: "c2", initialMessages: [sent] });
	const said = { role: "assistant", content: [{ type: "toolCall", id: "s1", name: "send_to_user", arguments: { message: "Close: the second column is 3 times the first." } }], stopReason: "toolUse" };
	m.applyWireEvent({ type: "message_start", message: said });
	m.applyWireEvent({ type: "message_end", message: said });
	m.applyWireEvent({ type: "message_start", message: { role: "assistant", content: [] } });
	m.stopReply();
	assert.equal(replyCutOf(m.getState().nativeMessages), "stopped-mid");
});

test("a stop between two messages, with none streaming, reads as stopped too", () => {
	const m = new SessionModel({ chatId: "c3", initialMessages: [sent] });
	m.stopReply();
	assert.equal(replyCutOf(m.getState().nativeMessages), "stopped");
});

test("his Stop while the server sets up a wake turn stops that turn as it registers; with no wake it is refused", () => {
	assert.deepEqual(abortTurn("c4"), { ok: false, reason: "not_running" });
	markWaking("c4", true);
	assert.deepEqual(abortTurn("c4"), { ok: true });
	let aborted = false;
	registerTurn("c4", { abort: () => { aborted = true; } } as never);
	assert.equal(aborted, true, "the wake's turn stops the moment it registers");
	unregisterTurn("c4");
	markWaking("c4", false);
	forgetStop("c4");
	assert.deepEqual(abortTurn("c4"), { ok: false, reason: "not_running" }, "the setup over, nothing is left to stop");
});
