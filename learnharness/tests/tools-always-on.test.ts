/**
 * Every tutor tool is always on (owner, 2026-11-14): Settings has no Tutor
 * page and nothing switches a tool off. A settings file saved while the
 * switches existed may still say `agent.tools: { research: false, … }`;
 * a lesson's teacher gets research, demos, figures and PDF reading anyway.
 *
 * Drives the real turn handler over that file under an isolated data
 * folder, building the teacher the handler asks for with a scripted model
 * that records the tools it is offered.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { createFauxCore, fauxAssistantMessage, fauxText, type Message, type TranscriptContext } from "@earendil-works/pi-ai";
import { signInTestClaude } from "./claude-fixture.ts";
import { fakeFor, onFake } from "./helpers/fake-sdk.ts";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-tools-always-on-"));
process.env.LH_DATA_DIR = TMP_DATA;
await signInTestClaude();

const { PATHS, SETTINGS_FILE } = await import("../config.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { jobStore } = await import("../src/store/jobs.ts");
const { handleChatRequest } = await import("../src/server/chat-handler.ts");
const { runningTurn } = await import("../src/server/turn-runs.ts");
const { createProberAgent, createTeacherAgent } = await import("../src/agent/teacher-agent.ts");
const { newUserMessage } = await import("../src/core/native-messages.ts");

import type { AgentKind } from "../src/agent/teacher-agent.ts";
import type { LhMessage } from "../src/core/native-messages.ts";

after(() => fs.rmSync(TMP_DATA, { recursive: true, force: true }));

const USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };

describe("a settings file that switched every tool off", () => {
	it("still gives a lesson's teacher research, demos, figures and PDF reading", async () => {
		fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
		fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ version: 1, agent: { tools: { research: false, demo: false, visual: false, pdf: false } } }));

		// A lesson past its probe: the next turn is the teacher's.
		const chat = chatStore.createChat("Rank and nullity");
		chatStore.saveMessages(chat.id, [
			newUserMessage("Teach me rank."),
			{ id: "a1", role: "assistant", content: [{ type: "toolCall", id: "pd", name: "probe_done", arguments: { strands: [{ strand: "rank", assessment: "pivots with help" }], summary: "ready" } }], api: "faux", provider: "test", model: "test", usage: USAGE, stopReason: "toolUse", timestamp: 1 },
			{ id: "r1", role: "toolResult", toolCallId: "pd", toolName: "probe_done", content: [{ type: "text", text: "ok" }], details: { ok: true }, isError: false, timestamp: 2 },
		] as unknown as LhMessage[]);

		const offered: string[][] = [];
		const kinds: AgentKind[] = [];
		const faux = createFauxCore({});
		faux.setResponses([(context: TranscriptContext) => {
			const system = context.messages.find((m) => m.role === "system");
			offered.push((system && system.role === "system" ? system.toolsAdded ?? [] : []).map((t) => t.name));
			return fauxAssistantMessage([fauxText("Let's plan it.")]);
		}]);
		const scripted = { model: faux.getModel(), streamFn: faux.streamSimple };
		// The probe ran on Claude Code: its session holds the record so far.
		const held = chatStore.getChat(chat.id)!.messages.map((m) => ({ uuid: randomUUID(), message: m as Message }));
		const session = randomUUID();
		fakeFor(scripted).sessions.set(session, held);
		fs.mkdirSync(PATHS.chats, { recursive: true });
		fs.writeFileSync(path.join(PATHS.chats, `${chat.id}.session.jsonl`), `${JSON.stringify({ entries: held.length })}\n`);
		chatStore.saveSession(chat.id, { id: session, synced: "r1", anchor: held.at(-1)!.uuid });

		const res = await handleChatRequest(
			new Request("http://test/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId: chat.id, input: { type: "text", text: "Go." } }) }),
			(opts) => {
				kinds.push(opts.agent);
				const ctx = { chatId: chat.id, chatStore, jobStore, spawn: () => {}, deliver: () => {} };
				const build = { ...onFake(scripted, opts), onUsage: opts.onUsage };
				return opts.agent === "teacher" ? createTeacherAgent(ctx, build) : createProberAgent(ctx, build);
			},
		);
		assert.equal(res.status, 200, await res.clone().text());
		const handle = runningTurn(chat.id);
		if (handle) await new Response(handle.subscribe()).text();

		assert.deepEqual(kinds, ["teacher"], "the lesson's teacher takes the turn");
		for (const tool of ["research", "demo", "visual", "pdf"]) assert.ok(offered[0]?.includes(tool), `the teacher is offered ${tool}`);
	});
});
