/**
 * Round 15, m37 (3 aspect 7): a 2.8 s gap between ordinary turns with Stop
 * shown and no status line. The tutor was writing its question: a question
 * is drawn once its call is whole (open, or answered), so while its
 * arguments stream nothing of it shows, and the working line took the
 * streaming call for words arriving. The replay is the event order of a
 * measured lesson turn (round 15 P5, base-2: the plan's first step, its
 * question streaming 43.2 to 45.7 s with Stop and nothing else on screen),
 * through the lesson's own session model and question component.
 */
import React from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { SessionModel } from "../components/session-core.ts";
import { showsWorking } from "../components/lesson/working-sign.ts";
import { ProseQuestion } from "../components/lesson/prose/prose-question.tsx";
import { renderToStaticMarkup } from "./helpers/app-render.tsx";
import { newUserMessage, type LhMessage, type LhViewMessage } from "../src/core/index.ts";

const MAP = { goal: { title: "Poisson distribution", topic: "poisson" }, mermaid: "graph TD\n  slots[Turning random arrivals into slots]" };
const WORDS = { message: "Chop the hour into $60$ minutes, and pretend each minute holds either one call or none." };
const QUESTION = { type: "check", nodeId: "slots", question: "With the hour cut into $60$ minutes, what distribution does the number of calls have, and why?", correctAnswer: "Bin(60, 1/20): sixty independent minutes, each holding a call with chance 3/60." };

const reply = (content: unknown[], stopReason = "stop") => ({ role: "assistant", content, stopReason });
const call = (id: string, name: string, args: unknown) => ({ type: "toolCall", id, name, arguments: args });

/** The plan turn's events in their measured order, each with what the
 *  step is. pi's events carry the whole partial message. */
const PLAN_TURN: [string, Record<string, unknown>][] = [
	["the reply opens", { type: "message_start", message: reply([]) }],
	["the tutor reasons", { type: "message_update", message: reply([{ type: "thinking", thinking: "" }]) }],
	["it writes the map", { type: "message_update", message: reply([{ type: "thinking", thinking: "" }, call("p1", "plan_init", { goal: MAP.goal })]) }],
	["the map is whole", { type: "message_update", message: reply([{ type: "thinking", thinking: "" }, call("p1", "plan_init", MAP)]) }],
	["its words arrive", { type: "message_update", message: reply([{ type: "thinking", thinking: "" }, call("p1", "plan_init", MAP), call("s1", "send_to_user", { message: WORDS.message.slice(0, 30) })]) }],
	["its words are whole", { type: "message_update", message: reply([{ type: "thinking", thinking: "" }, call("p1", "plan_init", MAP), call("s1", "send_to_user", WORDS)]) }],
	["it starts the question", { type: "message_update", message: reply([{ type: "thinking", thinking: "" }, call("p1", "plan_init", MAP), call("s1", "send_to_user", WORDS), call("q1", "explain", {})]) }],
	["the question is half written", { type: "message_update", message: reply([{ type: "thinking", thinking: "" }, call("p1", "plan_init", MAP), call("s1", "send_to_user", WORDS), call("q1", "explain", { type: "check", nodeId: "slots", question: QUESTION.question.slice(0, 40) })]) }],
	["the question is whole, the reply still open", { type: "message_update", message: reply([{ type: "thinking", thinking: "" }, call("p1", "plan_init", MAP), call("s1", "send_to_user", WORDS), call("q1", "explain", QUESTION)]) }],
	["the reply ends", { type: "message_end", message: reply([{ type: "thinking", thinking: "" }, call("p1", "plan_init", MAP), call("s1", "send_to_user", WORDS), call("q1", "explain", QUESTION)], "toolUse") }],
	["the map is saved", { type: "tool_execution_end", toolCallId: "p1", toolName: "plan_init", result: { content: [{ type: "text", text: "{\"ok\":true}" }], details: { ok: true } }, isError: false }],
	["the words are shown", { type: "tool_execution_end", toolCallId: "s1", toolName: "send_to_user", result: { content: [{ type: "text", text: "Message received for display." }], details: null }, isError: false }],
	["the question is posed", { type: "tool_execution_end", toolCallId: "q1", toolName: "explain", result: { content: [{ type: "text", text: "Question posed." }], details: null }, isError: false }],
];

/** What his pane carries at the end while the turn runs: the working line,
 *  or something of the reply being drawn as it arrives. */
function sign(view: LhViewMessage[]): "line" | "drawn" | null {
	if (showsWorking(view, true)) return "line";
	const last = view.at(-1);
	const part = last?.role === "assistant" ? last.parts.findLast((p) => p.type !== "reasoning" && p.type !== "step-start") : undefined;
	if (!part) return null;
	if (part.type === "text") return part.text?.trim() ? "drawn" : null;
	const tool = part.type.slice("tool-".length);
	if (tool === "explain" || tool === "recall" || tool === "ask_user_question") {
		// The lesson draws a question with ProseQuestion; open only once posed.
		const html = renderToStaticMarkup(<ProseQuestion tool={tool} toolCallId={part.toolCallId!} input={part.input} open={part.state === "input-available"} />);
		return html.trim() ? "drawn" : null;
	}
	return part.state === "input-streaming" ? "drawn" : null;
}

test("from the plan to its first question, every busy step shows the working line or the reply arriving (round 15, m37)", () => {
	const m = new SessionModel({ chatId: "c_m37", initialMessages: [newUserMessage("no idea of the exact model, maybe e^-3?") as LhMessage] });
	(m as unknown as { setStatus(s: string): void }).setStatus("streaming");
	const blank: string[] = [];
	for (const [step, event] of PLAN_TURN) {
		m.applyWireEvent(event);
		if (sign(m.getState().messages) === null) blank.push(step);
	}
	assert.deepEqual(blank, [], "a step with Stop shown and nothing else");
});

test("a question still being written shows the working line; posed, it is the sign itself (round 12, 3 D6 stays)", () => {
	const view = (state: string, input: unknown): LhViewMessage[] => [
		{ id: "u", role: "user", parts: [{ type: "text", text: "my answer" }] } as LhViewMessage,
		{ id: "a", role: "assistant", parts: [{ type: "text", text: "Chop the hour into minutes.", state: "done" }, { type: "tool-explain", toolCallId: "q1", state, input }] } as LhViewMessage,
	];
	assert.equal(showsWorking(view("input-streaming", {}), true), true, "nothing of it is drawn yet");
	assert.equal(showsWorking(view("input-streaming", QUESTION), true), true, "whole but not posed: still not drawn");
	assert.equal(showsWorking(view("input-available", QUESTION), true), false, "posed: he can answer it");
});
