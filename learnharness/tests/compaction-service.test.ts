/**
 * THE COMPACTION SERVICE: the app's policy over Claude Code's own `/compact`.
 * The laws:
 * - the trigger reads the settled turn's last request (input + cacheRead + cacheWrite);
 * - over the trigger → the session is compacted, a marker with the summary
 *   is appended, the session map moves to the compacted anchor, events fire;
 * - the registry is a mutex, and a gate at the limit rides the in-flight run;
 * - a compaction works on a copy of the session: under the limit a turn
 *   never waits on it, and a summary a turn overtook is dropped and redone;
 * - background eligibility (`canStart`) skips without writes;
 * - a lesson with no session is never compacted;
 * - LH_COMPACTION_TOKENS overrides the trigger.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it, mock } from "node:test";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { createFauxCore, fauxAssistantMessage, type AssistantMessage } from "@earendil-works/pi-ai";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-compaction-"));
process.env.LH_DATA_DIR = TMP_DATA;

const { chatStore } = await import("../src/store/chats.ts");
const { ensureCompacted, kickCompaction, awaitCompaction, compactionInFlight, compactionHoldsTurn, effectiveThresholdTokens, effectiveLimitTokens } = await import("../src/server/compaction.ts");
import type { CompactionDeps } from "../src/server/compaction.ts";
const { subscribe } = await import("../src/core/events.ts");
const { activeCompactionOf, newUserMessage, COMPACTED_HISTORY_HEADER } = await import("../src/core/index.ts");
import type { ChatSession, LhMessage } from "../src/core/index.ts";
const { SdkAgent, IDLE_MS } = await import("../src/agent/sdk/agent.ts");
import type { SdkEngine, SdkPrompt } from "../src/agent/sdk/engine.ts";
import type { Options } from "@anthropic-ai/claude-agent-sdk";
import { fakeSdk, type FakeSdk } from "./helpers/fake-sdk.ts";

after(() => {
	fs.rmSync(TMP_DATA, { recursive: true, force: true });
});

const USAGE = { input: 10_000, output: 1, cacheRead: 30_000, cacheWrite: 5_000, totalTokens: 45_001, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const OVER = 40_000;

/** A lesson whose Claude Code session a real turn on the fake started, and
 *  whose last reply carried 45k of context (10k + 30k cached + 5k written). */
async function lesson(label: string, { session = true }: { session?: boolean } = {}): Promise<{ chatId: string; fake: FakeSdk; session: ChatSession | undefined }> {
	const faux = createFauxCore({});
	faux.setResponses([fauxAssistantMessage("Hash tables map keys to buckets.")]);
	const fake = fakeSdk({ model: faux.models[0], streamFn: faux.streamSimple });
	const user = newUserMessage("Teach me hash tables.");
	const agent = new SdkAgent({ engine: fake.engine, systemPrompt: "tutor", tools: [], messages: [user as AgentMessage], endsTurn: () => false });
	await agent.continue();
	const reply = { ...(agent.state.messages.at(-1) as AssistantMessage), id: `a_${label}`, usage: USAGE } as LhMessage;
	assert.equal((reply as AssistantMessage).stopReason, "stop");
	const chat = chatStore.createChat(label);
	chatStore.saveMessages(chat.id, [user, reply]);
	const end = agent.sessionEnd()!;
	const map: ChatSession = { id: end.id, synced: reply.id, anchor: "anchor-before", cut: true };
	if (session) chatStore.saveSession(chat.id, map);
	return { chatId: chat.id, fake, session: session ? map : undefined };
}

/** Claude Code's `/compact` as the SDK reports it: a compact boundary, then
 *  the synthetic summary message, then the result. The fake runs model
 *  turns, not slash commands, so this query stands in for it. */
function compactor(fake: FakeSdk, { gate, fail = false }: { gate?: Promise<void>; fail?: boolean } = {}) {
	const runs: { prompt: SdkPrompt; options: Options }[] = [];
	let n = 0;
	const engine: SdkEngine = {
		...fake.engine,
		query: (params) => {
			runs.push(params);
			const k = ++n;
			const lines: unknown[] = fail
				? [{ type: "result", subtype: "error_during_execution", is_error: true, errors: ["boom"] }]
				: [
					{ type: "system", subtype: "init", session_id: params.options.forkSession ? params.options.sessionId : params.options.resume, apiKeySource: "none", mcp_servers: [], uuid: `init-${k}` },
					{ type: "system", subtype: "compact_boundary", compact_metadata: { trigger: "manual", pre_tokens: 45_000 }, uuid: `boundary-${k}` },
					{ type: "user", isSynthetic: true, message: { role: "user", content: `This session is being continued from a previous conversation that ran out of context. Summary:\nSUMMARY #${k}: the learner knows buckets.\n\nIf you need specific details from before compaction, read the transcript.` }, parent_tool_use_id: null, uuid: `summary-${k}` },
					{ type: "result", subtype: "success", is_error: false, result: "", session_id: params.options.resume },
				];
			const iterator = (async function* () {
				await gate;
				for (const line of lines) yield line as SDKMessage;
			})();
			return { [Symbol.asyncIterator]: () => iterator, interrupt: async () => undefined, close: () => void iterator.return(undefined) };
		},
	};
	return { engine, runs };
}

/** The limit defaults to the trigger: a lesson with no room left, whose turn waits. */
const depsOf = (engine: SdkEngine, thresholdTokens = OVER, limitTokens = thresholdTokens): CompactionDeps => ({ chatStore, engine, kind: "teach", thresholdTokens, limitTokens });
const ROOM = 1_000_000;

function watchEvents(chatId: string): { events: string[]; off: () => void } {
	const events: string[] = [];
	const off = subscribe((e) => {
		const { chatId: c, running } = e as { chatId?: string; running?: boolean };
		if (e.type === "compaction-changed" && c === chatId) events.push(`${running}`);
		if (e.type === "record-changed" && c === chatId) events.push("record");
	});
	return { events, off };
}

describe("the compaction service", () => {
	it("under the trigger → nothing runs and nothing is written", async () => {
		const { chatId, fake } = await lesson("compact: under");
		const { engine, runs } = compactor(fake);
		const before = chatStore.getChat(chatId);
		await ensureCompacted(depsOf(engine, 45_001), chatId);
		assert.equal(runs.length, 0, "45k of context does not reach a 45,001 trigger");
		assert.deepEqual(chatStore.getChat(chatId), before);
	});

	it("over the trigger → the session is compacted, the marker appended, the anchor moved, both events emitted", async () => {
		const { chatId, fake, session } = await lesson("compact: basic");
		const { engine, runs } = compactor(fake);
		const { events, off } = watchEvents(chatId);
		await ensureCompacted(depsOf(engine, 45_000), chatId);
		off();

		assert.equal(runs.length, 1, "input + cacheRead + cacheWrite reach the trigger");
		assert.match(String(runs[0]!.prompt), /^\/compact This is a tutoring session/, "Claude Code's own /compact with the lesson's instructions");
		assert.equal(runs[0]!.options.resume, session!.id);
		assert.equal(runs[0]!.options.resumeSessionAt, "anchor-before", "a cut session compacts from its anchor");
		assert.equal(runs[0]!.options.forkSession, true, "it compacts a copy: the lesson's own session is never written");
		const copy = runs[0]!.options.sessionId!;
		assert.notEqual(copy, session!.id);

		const record = chatStore.getChat(chatId)!;
		const marker = activeCompactionOf(record.messages);
		assert.ok(marker, "the marker landed");
		assert.equal(record.messages.at(-1), marker, "appended at the record's end");
		assert.equal(marker!.content, `${COMPACTED_HISTORY_HEADER}\n\nSUMMARY #1: the learner knows buckets.`, "the summary without Claude Code's framing");
		assert.equal(marker!.details.firstKeptMessageId, "", "Claude Code's compaction keeps no verbatim tail");
		assert.equal(marker!.details.tokensBefore, 45_000);
		assert.deepEqual(record.session, { id: copy, synced: session!.synced, anchor: "summary-1" }, "the lesson moves to the compacted copy, at its end, and the cut clears");
		assert.deepEqual(events, ["true", "record", "false"]);
	});

	it("background eligibility skips both entrypoints without writes, but still awaits an existing run", async () => {
		const { chatId, fake } = await lesson("compact: consent off");
		let release!: () => void;
		const gate = new Promise<void>((done) => { release = done; });
		const { engine, runs } = compactor(fake, { gate });
		const denied = { ...depsOf(engine), canStart: () => false };
		await ensureCompacted(denied, chatId);
		kickCompaction(() => denied, chatId);
		assert.equal(runs.length, 0);
		assert.equal(activeCompactionOf(chatStore.getChat(chatId)!.messages), null);

		kickCompaction(() => depsOf(engine), chatId);
		assert.equal(compactionInFlight(chatId), true);
		let finished = false;
		const waiter = ensureCompacted(denied, chatId).then(() => { finished = true; });
		await new Promise((r) => setTimeout(r, 10));
		assert.equal(finished, false, "the denied gate still waits for the running compaction");
		release();
		await waiter;
		assert.equal(runs.length, 1);
		assert.ok(activeCompactionOf(chatStore.getChat(chatId)!.messages));
	});

	it("the registry is a mutex: concurrent gates → ONE compaction", async () => {
		const { chatId, fake } = await lesson("compact: mutex");
		const { engine, runs } = compactor(fake);
		const deps = depsOf(engine);
		await Promise.all([ensureCompacted(deps, chatId), ensureCompacted(deps, chatId), ensureCompacted(deps, chatId)]);
		assert.equal(runs.length, 1, "exactly one compaction however many gates race");
		assert.equal(chatStore.getChat(chatId)!.messages.filter((m) => m.role === "custom" && m.customType === "compaction").length, 1);
	});

	it("awaitCompaction rides the in-flight run; a compacted lesson is under the trigger", async () => {
		const { chatId, fake } = await lesson("compact: gate");
		const { engine, runs } = compactor(fake);
		const { events, off } = watchEvents(chatId);
		kickCompaction(() => depsOf(engine), chatId);
		await awaitCompaction(chatId);
		assert.equal(compactionInFlight(chatId), false);
		kickCompaction(() => depsOf(engine), chatId);
		await ensureCompacted(depsOf(engine), chatId);
		off();
		assert.equal(runs.length, 1, "the marker after the last reply means no context is settled over the trigger");
		assert.deepEqual(events, ["record"], "no second compaction started, and one in the background holds no turn, so the lesson shows no line for it");
	});

	it("a lesson with no session is never compacted", async () => {
		const { chatId, fake } = await lesson("compact: no session", { session: false });
		const { engine, runs } = compactor(fake);
		await ensureCompacted(depsOf(engine), chatId);
		kickCompaction(() => depsOf(engine), chatId);
		await awaitCompaction(chatId);
		assert.equal(runs.length, 0);
		assert.equal(activeCompactionOf(chatStore.getChat(chatId)!.messages), null);
	});

	it("a failed compaction leaves the record untouched and the next gate retries", async () => {
		const { chatId, fake } = await lesson("compact: fail");
		const before = chatStore.getChat(chatId);
		const failing = compactor(fake, { fail: true });
		await ensureCompacted(depsOf(failing.engine), chatId);
		assert.equal(failing.runs.length, 1);
		assert.deepEqual(chatStore.getChat(chatId), before, "no marker, no session change on failure");
		assert.equal(compactionInFlight(chatId), false, "the failed run releases its gate");
		const ok = compactor(fake);
		await ensureCompacted(depsOf(ok.engine), chatId);
		assert.ok(activeCompactionOf(chatStore.getChat(chatId)!.messages));
	});

	it("a compaction Claude Code goes silent on is stopped after the idle limit, so the lesson's next turn is not held", async () => {
		const { chatId, fake } = await lesson("compact: silent");
		const before = chatStore.getChat(chatId);
		let closed = false;
		const engine: SdkEngine = {
			...fake.engine,
			query: () => {
				let end: () => void = () => undefined;
				const ended = new Promise<void>((resolve) => { end = resolve; });
				const iterator = (async function* (): AsyncGenerator<SDKMessage> { await ended; })();
				return { [Symbol.asyncIterator]: () => iterator, interrupt: async () => undefined, close: () => { closed = true; end(); } };
			},
		} as SdkEngine;
		mock.timers.enable({ apis: ["setTimeout"] });
		try {
			const gate = ensureCompacted(depsOf(engine), chatId);
			await new Promise((resolve) => setImmediate(resolve));
			assert.equal(compactionInFlight(chatId), true);
			mock.timers.tick(IDLE_MS);
			await gate;
		} finally {
			mock.timers.reset();
		}
		assert.equal(closed, true, "the silent query is closed");
		assert.equal(compactionInFlight(chatId), false, "the gate is released");
		assert.deepEqual(chatStore.getChat(chatId), before, "no marker, no session change");
	});

	it("a turn under the limit never waits on a running compaction: the summary it overtook is dropped and redone once no turn runs (round 9 #5, 30 to 43 s under \"Compacting the conversation…\")", async () => {
		const { chatId, fake, session } = await lesson("compact: overtaken");
		let release!: () => void;
		const gate = new Promise<void>((done) => { release = done; });
		const first = compactor(fake, { gate });
		const { events, off } = watchEvents(chatId);
		kickCompaction(() => depsOf(first.engine, OVER, ROOM), chatId);
		assert.equal(compactionInFlight(chatId), true);
		let passed = false;
		const turn = ensureCompacted(depsOf(first.engine, OVER, ROOM), chatId).then(() => { passed = true; });
		await new Promise((r) => setTimeout(r, 10));
		assert.equal(passed, true, "his turn goes ahead while the copy is compacted");
		assert.equal(compactionHoldsTurn(chatId), false, "no turn waits, so the lesson shows no compacting line");
		await turn;
		release();
		await awaitCompaction(chatId);
		await awaitCompaction(chatId);
		off();
		assert.equal(first.runs.length, 2, "the overtaken summary is redone once no turn runs");
		const record = chatStore.getChat(chatId)!;
		assert.equal(record.messages.filter((m) => m.role === "custom" && m.customType === "compaction").length, 1, "only the redone summary lands");
		assert.equal(record.session!.id, first.runs[1]!.options.sessionId, "the lesson moves to the redone copy");
		assert.notEqual(record.session!.id, session!.id);
		assert.deepEqual(events, ["record"]);
	});

	it("a compaction a turn ran past while it worked is never adopted: the lesson keeps the session the turn wrote", async () => {
		const { chatId, fake, session } = await lesson("compact: turn ran");
		let release!: () => void;
		const gate = new Promise<void>((done) => { release = done; });
		const { engine, runs } = compactor(fake, { gate });
		kickCompaction(() => ({ ...depsOf(engine, OVER, ROOM), canStart: () => runs.length < 1 }), chatId);
		chatStore.saveSession(chatId, { ...session!, synced: "a turn that ran meanwhile" });
		release();
		await awaitCompaction(chatId);
		const record = chatStore.getChat(chatId)!;
		assert.equal(activeCompactionOf(record.messages), null, "no marker for a summary of an older conversation");
		assert.deepEqual(record.session, { ...session!, synced: "a turn that ran meanwhile" });
	});

	it("at the limit his turn waits for the compaction, and only then does the lesson say so", async () => {
		const { chatId, fake } = await lesson("compact: at the limit");
		let release!: () => void;
		const gate = new Promise<void>((done) => { release = done; });
		const { engine, runs } = compactor(fake, { gate });
		const { events, off } = watchEvents(chatId);
		let passed = false;
		const turn = ensureCompacted(depsOf(engine, OVER, 45_000), chatId).then(() => { passed = true; });
		await new Promise((r) => setTimeout(r, 10));
		assert.equal(passed, false, "45k reaches a 45k limit: the request would not fit");
		assert.equal(compactionHoldsTurn(chatId), true);
		release();
		await turn;
		off();
		assert.equal(compactionHoldsTurn(chatId), false);
		assert.equal(runs.length, 1);
		assert.deepEqual(events, ["true", "record", "false"]);
	});

	it("effectiveLimitTokens: the window less its reserve, unmoved by LH_COMPACTION_TOKENS", () => {
		const previous = process.env.LH_COMPACTION_TOKENS;
		try {
			process.env.LH_COMPACTION_TOKENS = "20000";
			assert.equal(effectiveLimitTokens(200_000), 200_000 - 16_384);
			assert.equal(effectiveLimitTokens(undefined), 150_000, "with no known window the trigger's bound is the limit");
			assert.equal(effectiveLimitTokens(10_000), 20_000, "never under the trigger");
		} finally {
			if (previous === undefined) delete process.env.LH_COMPACTION_TOKENS;
			else process.env.LH_COMPACTION_TOKENS = previous;
		}
	});

	it("effectiveThresholdTokens: LH_COMPACTION_TOKENS overrides; else the 150k bound or the window rule", () => {
		const previous = process.env.LH_COMPACTION_TOKENS;
		try {
			delete process.env.LH_COMPACTION_TOKENS;
			assert.equal(effectiveThresholdTokens(1_000_000), 150_000);
			assert.equal(effectiveThresholdTokens(100_000), 100_000 - 16_384);
			assert.equal(effectiveThresholdTokens(undefined), 150_000);
			process.env.LH_COMPACTION_TOKENS = "20000";
			assert.equal(effectiveThresholdTokens(1_000_000), 20_000);
			assert.equal(effectiveThresholdTokens(undefined), 20_000);
			process.env.LH_COMPACTION_TOKENS = "nonsense";
			assert.equal(effectiveThresholdTokens(1_000_000), 150_000, "an unusable override is ignored");
		} finally {
			if (previous === undefined) delete process.env.LH_COMPACTION_TOKENS;
			else process.env.LH_COMPACTION_TOKENS = previous;
		}
	});
});
