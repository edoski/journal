import type { AssistantMessage, ImageContent, TextContent, ToolResultMessage } from "@earendil-works/pi-ai";
import { activeCompactionOf } from "./compaction.ts";
import { CLAUDE_MODEL } from "./contracts/claude.ts";
import { isQuestionRepose, isUiOnlyMarker, type LhMarkerMessage, type LhMessage } from "./native-messages.ts";
import { QUESTION_TOOLS } from "./pending.ts";

/**
 * The lesson's Claude Code session, as its record maps it. The session is
 * the model's memory (Claude Code owns it: the real conversation, its cache
 * and its compaction); the record stays what every page reads. `synced` is
 * the last record message the session holds, so every input after it is
 * still owed to the model. `anchor` is the session's last entry when that
 * message was reached: a turn that did not finish (`cut`) leaves partial
 * entries behind it, and the next turn resumes at the anchor, dropping them.
 */
export interface ChatSession {
	id: string;
	synced: string | null;
	anchor?: string;
	cut?: true;
}

/** How a turn left its session: everything it produced is held (`all`), up
 *  to a tool result (`through` a call id), or nothing at all. */
export type SessionHeld = "all" | { through: string } | "none";

/** `seeded`: the session the turn seeded (sessionSeed) for a record that had
 *  none to resume, which the record's map moves from instead of its own. */
export interface SessionTurnEnd { id: string; anchor?: string; held: SessionHeld; seeded?: ChatSession }

/** The record's session map after a turn, read against the record the turn
 *  persisted. A turn that held nothing keeps the previous point, so the next
 *  turn re-sends its input. */
export function nextChatSession(recorded: ChatSession | undefined, end: SessionTurnEnd, record: readonly LhMessage[]): ChatSession {
	const previous = end.seeded ?? recorded;
	if (end.held === "all") return { id: end.id, synced: record.at(-1)?.id ?? null, ...(end.anchor ? { anchor: end.anchor } : {}) };
	if (end.held !== "none") {
		const through = (end.held as { through: string }).through;
		const result = record.findLast((m) => m.role === "toolResult" && m.toolCallId === through);
		if (result) return { id: end.id, synced: result.id, ...(end.anchor ? { anchor: end.anchor } : {}), cut: true };
	}
	if (previous?.id === end.id) return { ...previous, cut: true };
	return { id: end.id, synced: previous?.synced ?? null, cut: true };
}

/** The session to resume: none for a lesson whose session never finished a
 *  first turn (it starts a new one), else its id and, after a cut turn, the
 *  entry to resume at. */
export function sessionResume(session: ChatSession | undefined): { resume?: string; at?: string } {
	if (!session) return {};
	if (session.cut && !session.anchor) return {};
	return { resume: session.id, ...(session.cut ? { at: session.anchor } : {}) };
}

/** The record messages a turn still owes its session: everything after the
 *  synced point. Null when the record holds model output its session never
 *  saw: a lesson from before sessions, or one whose session started over. */
export function owedMessages(messages: readonly LhMessage[], session: ChatSession | undefined): LhMessage[] | null {
	const resume = sessionResume(session);
	const start = resume.resume && session!.synced !== null ? messages.findIndex((m) => m.id === session!.synced) + 1 : 0;
	if (resume.resume && session!.synced !== null && start === 0) return null;
	const owed = messages.slice(start);
	if (!resume.resume && owed.some((m) => m.role === "assistant" && m.provider !== SYNTHETIC_PROVIDER && m.stopReason !== "error" && m.stopReason !== "aborted")) return null;
	return owed;
}

/** The provider stamp of app-made assistant messages (a dismissal's
 *  synthesized conclude call): the model never made them, so it reads them
 *  as a note. */
export const SYNTHETIC_PROVIDER = "synthetic";

export type SdkInputBlock =
	| { type: "text"; text: string }
	| { type: "image"; source: { type: "base64"; media_type: string; data: string } };

const image = (part: ImageContent): SdkInputBlock => ({ type: "image", source: { type: "base64", media_type: part.mimeType, data: part.data } });
const blocksOf = (parts: readonly (TextContent | ImageContent)[]): SdkInputBlock[] =>
	parts.flatMap((part) => part.type === "image" ? [image(part)] : part.text ? [{ type: "text" as const, text: part.text }] : []);
const textOf = (parts: readonly (TextContent | ImageContent)[]) => parts.filter((part): part is TextContent => part.type === "text").map((part) => part.text).join("\n");

/** The placeholder a question call returns to the model: it ends the turn,
 *  and the answer comes in a later message tagged with the call's id. */
export const QUESTION_POSED_TEXT = "Question posed. The turn ends here: the learner's answer arrives in their next message, tagged with this call's id. If that message carries no answer for it, the learner set the question aside unanswered.";

/** Owed record messages as the next user message's blocks. Learner words and
 *  photos pass as they are; markers give their model-facing text; an answer
 *  is tagged with the question call it answers; an app-made conclude, and
 *  the questions the app asked again after Done for today, read as notes. Model output the session already holds, UI-only markers and
 *  the record's compaction markers (the session keeps its own summary) give
 *  nothing. */
export function sdkInputBlocks(owed: readonly LhMessage[]): SdkInputBlock[] {
	const synthetic = new Set<string>();
	const out: SdkInputBlock[] = [];
	for (const m of owed) {
		switch (m.role) {
			case "user":
				out.push(...(typeof m.content === "string" ? (m.content ? [{ type: "text" as const, text: m.content }] : []) : blocksOf(m.content)));
				break;
			case "custom": {
				const marker = m as LhMarkerMessage;
				if (isUiOnlyMarker(m) || marker.customType === "compaction") break;
				if (marker.content) out.push({ type: "text", text: marker.content });
				out.push(...(marker.images ?? []).map(image));
				break;
			}
			case "assistant":
				if (isQuestionRepose(m)) out.push(...reposeNotes(m as AssistantMessage));
				else if (m.provider === SYNTHETIC_PROVIDER) for (const block of m.content) if (block.type === "toolCall") synthetic.add(block.id);
				break;
			case "toolResult":
				out.push(...resultBlocks(m, synthetic));
				break;
		}
	}
	return out;
}

/** What the model reads for the questions the app asked again after his
 *  Done for today: each call it posed, so the answer tagged with it reads
 *  as his answer to that question. */
function reposeNotes(repose: AssistantMessage): SdkInputBlock[] {
	return repose.content.flatMap((block) => {
		if (block.type !== "toolCall") return [];
		const question = (block.arguments as { question?: unknown } | null)?.question;
		return [{ type: "text" as const, text: `<app_note tool="${block.name}" call="${block.id}">\nHe pressed Done for today with your question left open, so the app asked it again, as you posed it, for when he came back: "${typeof question === "string" ? question : ""}". What follows answers this call or sets it aside, like any question you pose.\n</app_note>` }];
	});
}

function resultBlocks(result: ToolResultMessage, synthetic: ReadonlySet<string>): SdkInputBlock[] {
	if ((QUESTION_TOOLS as readonly string[]).includes(result.toolName)) {
		const images = result.content.filter((part): part is ImageContent => part.type === "image").map(image);
		return [{ type: "text", text: `<answer tool="${result.toolName}" call="${result.toolCallId}">\n${textOf(result.content)}\n</answer>` }, ...images];
	}
	if (synthetic.has(result.toolCallId)) {
		const details = result.details as { outcome?: string; problemCallId?: string } | undefined;
		return [{ type: "text", text: `<app_note tool="${result.toolName}" outcome="${details?.outcome ?? ""}" problem="${details?.problemCallId ?? ""}">\nThe learner closed the open problem, so the app concluded it for you.\n${textOf(result.content)}\n</app_note>` }];
	}
	return [];
}

/** A tool_use or tool_result block of a seeded session. */
export type SeedToolBlock =
	| { type: "tool_use"; id: string; name: string; input: unknown }
	| { type: "tool_result"; tool_use_id: string; content: SdkInputBlock[]; is_error?: true };

/** One message of a seeded Claude Code session, in the Messages API's shape. */
export interface SeedTurn {
	role: "user" | "assistant";
	content: (SdkInputBlock | SeedToolBlock)[];
	timestamp: number;
	/** An assistant's usage as the record kept it: Claude Code reads the
	 *  last one as the session's context size. */
	usage?: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number };
	model?: string;
}

/** A lesson's conversation rebuilt as a Claude Code session, and the record
 *  message it holds through (`synced`): what came after is still owed. */
export interface SessionSeed { turns: SeedTurn[]; synced: string }

/** What a seeded call that never returned a result reads as. */
export const SEED_INTERRUPTED_TEXT = "Interrupted: this call never returned a result.";

const seedToolUseId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, "_");

/**
 * The session a lesson would hold had it run on the SDK from its start, for
 * a record with no session to resume (a lesson from before sessions, or one
 * whose session is gone from Claude Code and from the app's copy). Every
 * model reply becomes an assistant turn followed by its tool results, as the
 * tool server returned them (a question call returns QUESTION_POSED_TEXT);
 * the inputs between replies become one user turn each, read by
 * `sdkInputBlocks` exactly as a live turn reads them. Inputs after the last
 * reply stay owed, so the first seeded turn sends them as its prompt.
 * Failed or aborted replies, app-made ones and thinking are left out, as a
 * live session never holds them; `toolName` gives a call's name as Claude
 * Code knows it. The active compaction marker cuts the
 * record where the record's own compaction did: its summary opens the
 * session. Null when the record holds no model reply to seed.
 */
export function sessionSeed(messages: readonly LhMessage[], toolName: (name: string) => string): SessionSeed | null {
	const active = activeCompactionOf(messages);
	const markerAt = active ? messages.indexOf(active) : -1;
	const keptAt = active ? (active.details.firstKeptMessageId ? messages.findIndex((m) => m.id === active.details.firstKeptMessageId) : markerAt + 1) : 0;
	const start = Math.max(keptAt, 0);
	const head: SdkInputBlock[] = active && keptAt > 0 ? [{ type: "text", text: active.content }] : [];

	const turns: SeedTurn[] = [];
	const consumed = new Set<number>();
	const usedIds = new Set<string>();
	let inputs: LhMessage[] = [];
	let synced = -1;
	const flush = (timestamp: number, always: boolean) => {
		const blocks = [...head.splice(0), ...sdkInputBlocks(inputs)];
		inputs = [];
		if (!blocks.length && always) blocks.push({ type: "text", text: CONTINUE_TEXT });
		if (blocks.length) turns.push({ role: "user", content: blocks, timestamp });
	};

	for (let i = start; i < messages.length; i++) {
		const m = messages[i]!;
		if (consumed.has(i)) continue;
		if (m.role !== "assistant" || m.provider === SYNTHETIC_PROVIDER || m.stopReason === "error" || m.stopReason === "aborted") {
			inputs.push(m);
			continue;
		}
		const content: SeedTurn["content"] = [];
		const results: SeedToolBlock[] = [];
		for (const block of (m as AssistantMessage).content) {
			if (block.type === "text" && block.text) content.push({ type: "text", text: block.text });
			if (block.type !== "toolCall") continue;
			let id = seedToolUseId(block.id);
			while (usedIds.has(id)) id = `${id}_`;
			usedIds.add(id);
			content.push({ type: "tool_use", id, name: toolName(block.name), input: block.arguments ?? {} });
			const isQuestion = (QUESTION_TOOLS as readonly string[]).includes(block.name);
			const at = isQuestion ? -1 : messages.findIndex((r, j) => j > i && !consumed.has(j) && r.role === "toolResult" && r.toolCallId === block.id);
			const result = at >= 0 ? messages[at] as ToolResultMessage : undefined;
			if (result) { consumed.add(at); synced = Math.max(synced, at); }
			results.push({
				type: "tool_result", tool_use_id: id,
				content: isQuestion ? [{ type: "text", text: QUESTION_POSED_TEXT }] : !result ? [{ type: "text", text: SEED_INTERRUPTED_TEXT }] : resultContent(result),
				...(result?.isError ? { is_error: true as const } : {}),
			});
		}
		if (!content.length) continue;
		flush(m.timestamp, turns.at(-1)?.role !== "user");
		const usage = (m as AssistantMessage).usage;
		turns.push({ role: "assistant", content, timestamp: m.timestamp, model: CLAUDE_MODEL.id, ...(usage ? { usage: { input_tokens: usage.input, output_tokens: usage.output, cache_read_input_tokens: usage.cacheRead, cache_creation_input_tokens: usage.cacheWrite } } : {}) });
		if (results.length) turns.push({ role: "user", content: results, timestamp: m.timestamp });
		synced = Math.max(synced, i);
	}
	if (synced < 0 && !head.length) return null;
	// A cut with no reply after it: the summary and the kept inputs are the seed.
	if (synced < 0) synced = messages.length - 1;
	inputs = inputs.filter((m) => messages.indexOf(m) <= synced);
	if (inputs.length || head.length) flush(messages[synced]!.timestamp, false);
	return { turns, synced: messages[synced]!.id };
}

function resultContent(result: ToolResultMessage): SdkInputBlock[] {
	const blocks = blocksOf(result.content);
	return blocks.length ? blocks : [{ type: "text", text: "(no output)" }];
}

/** Sent when a turn owes the model nothing new (a retry after a turn whose
 *  tool results the session kept): carry on from there. */
export const CONTINUE_TEXT = "Continue from where you stopped.";
