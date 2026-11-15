/**
 * Claude Code compacts a long lesson at its own point, its automatic
 * compaction (Edo, 15 Nov 2026: no app trigger, no 150k). The app only
 * gives the summary the lesson's instructions, through Claude Code's
 * PreCompact hook, and records the compaction as the transcript's marker.
 * Scripted faux models on the fake Agent SDK: no real provider calls.
 */

import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, type FauxResponseStep } from "@earendil-works/pi-ai";
import { signInTestClaude } from "./claude-fixture.ts";
import { fakeSdk, onFake, sendToUser, type ScriptedModel } from "./helpers/fake-sdk.ts";

assert.equal(process.env.NODE_ENV, "test", "Run with NODE_ENV=test; these tests must not invoke real providers.");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-native-compaction-"));
process.env.LH_DATA_DIR = path.join(scratch, "data");
process.env.LH_CREDENTIALS_DIR = scratch;
await signInTestClaude();

const { createTeacherAgent } = await import("../src/agent/teacher-agent.ts");
const { handleChatRequest } = await import("../src/server/chat-handler.ts");
const { runningTurn } = await import("../src/server/turn-runs.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { newUserMessage } = await import("../src/core/native-messages.ts");
const { activeCompactionOf, COMPACTED_HISTORY_HEADER } = await import("../src/core/index.ts");

after(() => fs.rmSync(scratch, { recursive: true, force: true }));

function scripted(steps: FauxResponseStep[]): ScriptedModel {
	const faux = createFauxCore({});
	faux.setResponses(steps);
	return { model: faux.getModel(), streamFn: faux.streamSimple };
}

const APP = path.join(import.meta.dirname, "..");
function sources(dir: string): string[] {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) return sources(full);
		return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
	});
}

describe("native compaction", () => {
	it("the app never compacts a lesson itself: no /compact, no threshold of its own", () => {
		const own = [...sources(path.join(APP, "src")), ...sources(path.join(APP, "app")), ...sources(path.join(APP, "components"))];
		for (const file of own) {
			const text = fs.readFileSync(file, "utf8");
			assert.doesNotMatch(text, /[`"']\/compact\b/, `${path.relative(APP, file)} sends Claude Code a /compact`);
			assert.doesNotMatch(text, /LH_COMPACTION_TOKENS|COMPACTION_THRESHOLD|150_000/, `${path.relative(APP, file)} keeps a compaction threshold`);
		}
	});

	it("a lesson Claude Code compacts on its own gets the lesson's instructions, plan tree included, and its transcript gets the marker", async () => {
		const engine = scripted([
			() => sendToUser("Hash tables map keys to buckets."), () => fauxAssistantMessage(""),
			() => sendToUser("A collision chains in its bucket."), () => fauxAssistantMessage(""),
		]);
		const fake = fakeSdk(engine, { compactWhen: (history) => history.length > 2 && history.at(-1)!.message.role === "user" });
		const chat = chatStore.createChat("Test: native compaction");
		chatStore.saveTree(chat.id, { nodes: [{ id: "buckets", title: "Buckets" }], edges: [], version: 1 });
		const turn = async (text: string) => {
			chatStore.saveMessages(chat.id, [...chatStore.getChat(chat.id)!.messages, newUserMessage(text)]);
			const ack = await handleChatRequest(
				new Request("http://test/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId: chat.id, input: { type: "continue" } }) }),
				(opts) => createTeacherAgent(undefined, onFake(engine, opts, fake.engine)),
			);
			assert.equal(ack.status, 200);
			const handle = runningTurn(chat.id);
			if (handle) await new Response(handle.subscribe()).text();
		};

		await turn("Teach me hash tables.");
		assert.equal(fake.compactions.length, 0, "a short lesson is not compacted");
		await turn("What happens on a collision?");

		assert.equal(fake.compactions.length, 1, "Claude Code compacted the session once, at its own point");
		const instructions = fake.compactions[0]!.instructions;
		assert.match(instructions, /^This is a tutoring session/, "the lesson's own instructions");
		assert.match(instructions, /## The plan dependency tree\n[\s\S]*- \[\w+\] Buckets \(buckets\)/, "with the plan tree as it stands");
		const marker = activeCompactionOf(chatStore.getChat(chat.id)!.messages);
		assert.ok(marker, "the transcript shows the compaction");
		assert.equal(marker!.content, `${COMPACTED_HISTORY_HEADER}\n\nSUMMARY #1: the learner maps keys to buckets.`);
		assert.equal(marker!.details.tokensBefore, 123_000);
	});
});
