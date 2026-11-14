import type { ImageContent, TextContent, ToolResultMessage } from "@earendil-works/pi-ai";
import { isUiOnlyMarker, type LhMarkerMessage, type LhMessage } from "./native-messages.ts";
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

export interface SessionTurnEnd { id: string; anchor?: string; held: SessionHeld }

/** The record's session map after a turn, read against the record the turn
 *  persisted. A turn that held nothing keeps the previous point, so the next
 *  turn re-sends its input. */
export function nextChatSession(previous: ChatSession | undefined, end: SessionTurnEnd, record: readonly LhMessage[]): ChatSession {
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
 *  is tagged with the question call it answers; an app-made conclude reads
 *  as a note. Model output the session already holds, UI-only markers and
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
				if (m.provider === SYNTHETIC_PROVIDER) for (const block of m.content) if (block.type === "toolCall") synthetic.add(block.id);
				break;
			case "toolResult":
				out.push(...resultBlocks(m, synthetic));
				break;
		}
	}
	return out;
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

/** Sent when a turn owes the model nothing new (a retry after a turn whose
 *  tool results the session kept): carry on from there. */
export const CONTINUE_TEXT = "Continue from where you stopped.";
