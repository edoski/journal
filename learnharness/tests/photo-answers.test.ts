/**
 * Photos of his handwritten working (14 Nov 2026), end to end with zero
 * tokens: a photo rides a message, a check's answer and a practice
 * submission to the model as image parts, alone counts as an answer,
 * survives a reload in the record, shows in the view and the export, and a
 * photo the server cannot read is refused before anything is saved.
 */

import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { createCanvas } from "@napi-rs/canvas";
import {
	createFauxCore,
	fauxAssistantMessage,
	fauxText,
	fauxToolCall,
	type AssistantMessage,
	type FauxResponseFactory,
	type FauxResponseStep,
	type Message,
	type TranscriptContext,
} from "@earendil-works/pi-ai";
import { onFake, type ScriptedModel } from "./helpers/fake-sdk.ts";
import { createPracticeAgent, createTeacherAgent } from "../src/agent/teacher-agent.ts";
import { QUESTION_POSED_TEXT, sdkInputBlocks } from "../src/core/sdk-session.ts";
import { handleChatRequest } from "../src/server/chat-handler.ts";
import { runningTurn } from "../src/server/turn-runs.ts";
import { PHOTO_UNREADABLE } from "../src/server/photos.ts";
import { chatStore } from "../src/store/chats.ts";
import {
	buildAnswer,
	newSessionModeMessage,
	parseChatInput,
	photosOf,
	projectView,
	sessionMarkdown,
	WORKING_PHOTO_NOTE,
	type LhMessage,
	type QuestionData,
} from "../src/core/index.ts";
import { PATHS } from "../config.ts";
import { signInTestClaude } from "./claude-fixture.ts";

await signInTestClaude();
const recordRoute = await import("../app/api/chats/[id]/route.ts");
const markdownRoute = await import("../app/api/chats/[id]/markdown/route.ts");

/** A page of "working" as a PNG, `width` px wide (a phone photo is wide). */
function workingPng(width = 400, height = 300): string {
	const canvas = createCanvas(width, height);
	const ctx = canvas.getContext("2d");
	ctx.fillStyle = "#fff";
	ctx.fillRect(0, 0, width, height);
	ctx.fillStyle = "#123";
	ctx.font = `${Math.round(height / 10)}px sans-serif`;
	ctx.fillText("x^2 - 5x + 6 = (x-2)(x-3)", width / 20, height / 2);
	return canvas.toBuffer("image/png").toString("base64");
}
const photo = (data = workingPng()) => ({ type: "image" as const, mimeType: "image/png", data });

const createdChats: string[] = [];
after(() => {
	for (const id of createdChats) {
		try {
			fs.unlinkSync(path.join(PATHS.chats, `${id}.json`));
		} catch {
			/* already gone */
		}
	}
});

function post(chatId: string, input: unknown): Request {
	return new Request("http://test/api/chat", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ chatId, input }),
	});
}

async function drainTurn(req: Request, factory: Parameters<typeof handleChatRequest>[1]): Promise<void> {
	const cloned = req.clone();
	const ack = await handleChatRequest(req, factory);
	if (ack.status !== 200) assert.fail(`expected 200 ack, got ${ack.status}: ${await ack.text()}`);
	const { chatId } = (await cloned.json()) as { chatId: string };
	const handle = runningTurn(chatId);
	if (handle) await new Response(handle.subscribe()).text();
}

/** A scripted engine that keeps every context it was given. */
function scripted(steps: FauxResponseStep[]): { engine: ScriptedModel; contexts: Message[][] } {
	const contexts: Message[][] = [];
	const faux = createFauxCore({});
	faux.setResponses(steps.map((step) => async (context: TranscriptContext): Promise<AssistantMessage> => {
		contexts.push(context.messages as Message[]);
		return typeof step === "function" ? await (step as FauxResponseFactory)(context, undefined, undefined as never, undefined as never) : step;
	}));
	return { engine: { model: faux.getModel(), streamFn: faux.streamSimple }, contexts };
}

const imagesIn = (messages: readonly Message[]) =>
	messages.flatMap((m) => (Array.isArray((m as { content?: unknown }).content) ? photosOf((m as { content: unknown[] }).content) : []));

const CHECK = { type: "check", nodeId: "factor", question: "Factor $x^2 - 5x + 6$.", correctAnswer: "$(x-2)(x-3)$" };

function teacherChat(title: string) {
	const chat = chatStore.createChat(title);
	chatStore.saveTree(chat.id, { nodes: [{ id: "factor", title: "Factoring" }], edges: [], version: 1 });
	createdChats.push(chat.id);
	return chat;
}

describe("photos of handwritten working", () => {
	it("a photo alone is a message, reaches the model as his, and survives a reload", async () => {
		const chat = teacherChat("Test: photo message");
		const { engine, contexts } = scripted([fauxAssistantMessage([fauxText("I can read your working.")])]);
		await drainTurn(post(chat.id, { type: "text", text: "", photos: [photo()] }), (opts) => createTeacherAgent(undefined, onFake(engine, opts)));

		// The model got the image part, in his own message.
		assert.equal(imagesIn(contexts[0]!).length, 1);
		const his = contexts[0]!.at(-1)!;
		assert.equal(his.role, "user");
		assert.equal(imagesIn([his]).length, 1, "the photo rides his message");

		// A reload reads it back from the record route, and the view shows it.
		const res = await recordRoute.GET(new Request(`http://test/api/chats/${chat.id}`), { params: Promise.resolve({ id: chat.id }) });
		const record = (await res.json()) as { messages: LhMessage[] };
		const user = record.messages.find((m) => m.role === "user")!;
		assert.equal(photosOf(user.content).length, 1, "the photo is kept with the session");
		const view = projectView(record.messages);
		assert.ok(view[0]!.parts.some((p) => p.type === "photos" && (p.data as unknown[]).length === 1));
	});

	it("a photo alone answers a check: his answer carries it, says so, and the card gets it", async () => {
		const chat = teacherChat("Test: photo answer");
		const { engine, contexts } = scripted([
			fauxAssistantMessage([fauxToolCall("explain", CHECK, { id: "call-photo" })], { stopReason: "toolUse" }),
			fauxAssistantMessage([fauxText("Your second line slips.")]),
		]);
		const factory: Parameters<typeof handleChatRequest>[1] = (opts) => createTeacherAgent(undefined, onFake(engine, opts));
		await drainTurn(post(chat.id, { type: "text", text: "Check me on factoring." }), factory);
		const qd: QuestionData = { id: "call-photo", kind: "explain", question: CHECK.question, mode: "text", options: [], committedAnswer: CHECK.correctAnswer, createdAt: new Date().toISOString() };
		// The dock's answer with no typed words: buildAnswer leaves text out.
		const answer = buildAnswer(qd, { text: "" }, "explain");
		assert.equal(answer.text, undefined);
		await drainTurn(post(chat.id, { type: "answer", toolCallId: "call-photo", answer, photos: [photo()] }), factory);

		// The call's own result is the placeholder; his answer, tagged with the
		// call, and its photo arrive in his next message.
		const saw = contexts[1]!;
		const result = saw.find((m) => m.role === "toolResult" && m.toolCallId === "call-photo")!;
		assert.deepEqual(result.content, [{ type: "text", text: QUESTION_POSED_TEXT }]);
		const next = saw.at(-1)!;
		assert.equal(next.role, "user");
		const blocks = next.content as Array<{ type: string; text?: string }>;
		const at = blocks.findIndex((b) => b.type === "text" && b.text!.startsWith('<answer tool="explain" call="call-photo">'));
		assert.ok(at >= 0, "his answer is tagged with the question it answers");
		const tagged = blocks[at]!.text!;
		assert.equal(JSON.parse(tagged.slice(tagged.indexOf("\n") + 1, tagged.lastIndexOf("\n</answer>"))).photo, WORKING_PHOTO_NOTE);
		assert.equal(blocks[at + 1]?.type, "image", "the photo reaches the model right after the answer");
		assert.equal(imagesIn([next]).length, 1);

		const saved = chatStore.getChat(chat.id)!.messages;
		const view = projectView(saved);
		const part = view.flatMap((m) => m.parts).find((p) => p.toolCallId === "call-photo")!;
		assert.equal(part.state, "output-available");
		assert.equal((part.photos as unknown[]).length, 1, "the answered card gets the photo");
		// The record's answer data stays words: the photo is not a field in it.
		assert.equal(JSON.stringify(part.output).includes(photosOf((saved.find((m) => m.role === "toolResult" && m.toolCallId === "call-photo") as { content: unknown }).content)[0]!.data), false);
	});

	it("a photo alone is a practice submission, sent after the marker's words", async () => {
		const chat = chatStore.createChat("Test: practice photo");
		chatStore.saveMessages(chat.id, [newSessionModeMessage("practice") as LhMessage]);
		createdChats.push(chat.id);
		const POSE = { statement: "Solve $x^2 - 5x + 6 = 0$.", mode: "recall", topics: ["factor"], modelSolution: "$x = 2$ or $x = 3$." };
		const { engine, contexts } = scripted([
			fauxAssistantMessage([fauxToolCall("problem", POSE, { id: "call-pp" })], { stopReason: "toolUse" }),
			fauxAssistantMessage([fauxText("Your factoring holds.")]),
		]);
		const factory: Parameters<typeof handleChatRequest>[1] = (opts) => createPracticeAgent({ chatId: chat.id, chatStore }, onFake(engine, opts));
		await drainTurn(post(chat.id, { type: "text", text: "practice" }), factory);
		await drainTurn(post(chat.id, { type: "thinking", problemCallId: "call-pp", text: "", photos: [photo()] }), factory);

		const last = contexts[1]!.at(-1)!;
		assert.equal(last.role, "user");
		const parts = last.content as Array<{ type: string; text?: string }>;
		assert.equal(parts[0]!.type, "text");
		assert.ok(parts[0]!.text!.includes(WORKING_PHOTO_NOTE));
		assert.equal(parts[1]!.type, "image");

		const marker = chatStore.getChat(chat.id)!.messages.find((m) => m.role === "custom" && m.customType === "practice-thinking")!;
		const card = projectView([marker]).flatMap((m) => m.parts).find((p) => p.type === "data-practice-thinking")!;
		assert.equal(((card.data as { photos?: unknown[] }).photos ?? []).length, 1);
	});

	it("refuses an empty answer and a photo it cannot read, saving nothing", async () => {
		assert.throws(() => parseChatInput({ type: "text", text: "  " }), /non-empty text or a photo/);
		assert.throws(() => parseChatInput({ type: "text", text: "", photos: [{ mimeType: "image/heic", data: "AAAA" }] }), /must be one of/);
		assert.throws(() => parseChatInput({ type: "text", text: "", photos: Array.from({ length: 5 }, () => photo()) }), /at most 4/);

		const chat = teacherChat("Test: unreadable photo");
		const before = chatStore.getChat(chat.id)!.messages.length;
		const res = await handleChatRequest(post(chat.id, { type: "text", text: "", photos: [{ mimeType: "image/png", data: Buffer.from("not an image").toString("base64") }] }));
		assert.equal(res.status, 400);
		assert.equal(((await res.json()) as { error: string }).error, PHOTO_UNREADABLE);
		assert.equal(chatStore.getChat(chat.id)!.messages.length, before);
	});

	it("resizes a large phone photo before it reaches the record", async () => {
		const chat = teacherChat("Test: big photo");
		const { engine } = scripted([fauxAssistantMessage([fauxText("Got it.")])]);
		await drainTurn(post(chat.id, { type: "text", text: "my page", photos: [photo(workingPng(4032, 3024))] }), (opts) => createTeacherAgent(undefined, onFake(engine, opts)));
		const saved = photosOf(chatStore.getChat(chat.id)!.messages.find((m) => m.role === "user")!.content)[0]!;
		const bytes = Buffer.from(saved.data, "base64");
		const { width } = await import("@napi-rs/canvas").then(({ loadImage }) => loadImage(bytes));
		assert.ok(width <= 2000, `the saved photo is at most 2000px wide (got ${width})`);
	});

	it("the export embeds the photo; the digest only says one is there; the model gets the photo", async () => {
		const data = workingPng();
		const messages = [
			{ id: "u1", role: "user", content: [{ type: "text", text: "Here is my page." }, photo(data)], timestamp: 1 },
		] as LhMessage[];
		assert.ok(sessionMarkdown(messages, { photos: "embed" }).includes(`![Photo of the learner's working](data:image/png;base64,${data})`));
		const note = sessionMarkdown(messages);
		assert.ok(note.includes("Here is my page.") && note.includes("photo of his handwritten working"));
		assert.equal(note.includes(data), false);
		const owed = sdkInputBlocks(messages);
		assert.deepEqual(owed.map((b) => b.type), ["text", "image"], "the model still gets the photo itself");

		const chat = teacherChat("Test: photo export");
		chatStore.saveMessages(chat.id, messages);
		const res = await markdownRoute.GET(new Request("http://test"), { params: Promise.resolve({ id: chat.id }) });
		assert.ok((await res.text()).includes(`base64,${data}`));
	});
});
