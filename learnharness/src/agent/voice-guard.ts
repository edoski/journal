/**
 * The voice, held per turn (spec: src/agent/prompts/shared/10-voice.md).
 * Each message the tutor sends with `send_to_user`, and each question it
 * poses, is read with the voice checker before he sees it. One that breaks
 * the voice is refused with what to fix, and the tutor rewrites it in the
 * same turn; he sees only the rewrite. Each kind of call is refused once a
 * turn at most, so a rewrite that still slips is shown rather than looped.
 *
 * A refused message never shows: `screen` runs as the call finishes
 * streaming, before any view reads it, and takes its text out of the live
 * call (the refusal's details keep it). A refused question never showed:
 * the question dock waits for the call's result.
 */

import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { ToolCall } from "@earendil-works/pi-ai";
import { QUESTION_TOOLS } from "../core/pending.ts";
import { opensTurn, PRACTICE_CONCLUDE_TOOL, SEND_TO_USER_TOOL, UNGRADED_ANSWER, failedOutputCallIds, sendToUserText, type LhMessage } from "../core/native-messages.ts";
import { adviceSentences, afterQuestion, echoOf, repeatedAdvice, sentences, voiceBreaks, type TurnKind, type VoiceBreak } from "../core/voice-check.ts";

type Family = "message" | "question";

/** What the turn's input asks of the replies to it: the kind of turn its
 *  first message is (no kind: no length budget), and his words when it
 *  answers something of his, which a reply must not hand back. */
export interface TurnInput {
	kind: TurnKind | undefined;
	answers: boolean;
	words: string | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function textOf(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content.flatMap((p) => (isRecord(p) && p.type === "text" && typeof p.text === "string" ? [p.text] : [])).join("\n");
}

/** The turn's input, read from the last message that opens a turn. */
export function turnInputOf(messages: readonly LhMessage[]): TurnInput {
	const at = messages.findLastIndex(opensTurn);
	const input = messages[at];
	const none: TurnInput = { kind: "teach", answers: false, words: null };
	if (!input) return none;
	if (input.role === "user") {
		const first = !messages.slice(0, at).some((m) => m.role === "assistant");
		return { kind: first ? "teach" : "direct", answers: false, words: textOf(input.content) };
	}
	if (input.role === "toolResult") {
		const details = isRecord(input.details) ? input.details : {};
		if (details.hintRequested === true) return { kind: "hint", answers: false, words: null };
		return { kind: "wrong", answers: true, words: typeof details.text === "string" ? details.text : textOf(input.content) };
	}
	if (input.role !== "custom") return none;
	switch (input.customType) {
		case "done-tonight":
		case "practice-next":
			return { kind: "close", answers: false, words: null };
		case "practice-thinking":
			return { kind: "wrong", answers: true, words: textOf(input.content) };
		case "practice-request": {
			// A hint's rung and a shown solution set their own length.
			const request = isRecord(input.details) ? input.details.request : undefined;
			return { kind: request === "explain" ? "teach" : undefined, answers: false, words: null };
		}
		case UNGRADED_ANSWER:
			return { kind: "wrong", answers: true, words: textOf(input.content) };
		case "dispute":
			return { kind: "direct", answers: false, words: null };
		default:
			return none;
	}
}

/** Every text he read from the tutor before this turn: its delivered
 *  messages and the questions it posed. */
function earlierTexts(messages: readonly LhMessage[]): string[] {
	const failed = failedOutputCallIds(messages);
	return messages.flatMap((m) =>
		m.role !== "assistant"
			? []
			: m.content.flatMap((b) => {
					if (b.type !== "toolCall" || failed.has(b.id)) return [];
					const text = b.name === SEND_TO_USER_TOOL ? sendToUserText(b) : (QUESTION_TOOLS as readonly string[]).includes(b.name) ? questionText(b) : undefined;
					return text ? [text] : [];
				}),
	);
}

function questionText(call: Pick<ToolCall, "arguments">): string | undefined {
	const q = isRecord(call.arguments) ? call.arguments.question : undefined;
	return typeof q === "string" && q.trim() ? q : undefined;
}

const KIND_WORDS: Readonly<Record<TurnKind, string>> = {
	teach: "a teaching turn",
	right: "a reply to a right answer",
	wrong: "a reply to his answer",
	hint: "a hint",
	direct: "a direct answer to his question",
	close: "a close",
};

const quoted = (text: string) => `"${text.length > 160 ? `${text.slice(0, 157)}…` : text}"`;

/** What to fix for each break, in the voice's own terms. */
function fixFor(b: VoiceBreak, kind: TurnKind | undefined): string {
	switch (b.rule) {
		case "praise":
			return `No praise or performed reaction: ${quoted(b.excerpt)}.`;
		case "preview":
			return `No preview of what comes next: ${quoted(b.excerpt)}.`;
		case "narration":
			return `Never narrate what you do, save or wait for: ${quoted(b.excerpt)}.`;
		case "plan":
			return `Never tell him the plan, the order, why you ask, or a planned day that puts off what he asked: ${quoted(b.excerpt)}.`;
		case "offer":
			return `No offer here: ${quoted(b.excerpt)}.`;
		case "comprehension":
			return `Never ask whether it makes sense: ${quoted(b.excerpt)}.`;
		case "exclamation":
			return "No exclamation marks.";
		case "dash":
			return `No em or en dashes; use a period or a comma: ${quoted(b.excerpt)}.`;
		case "headings":
			return "No headings.";
		case "questions":
			return `One question per turn, and this turn asks more: ${quoted(b.excerpt)}.`;
		case "length":
			return `It is too long for ${kind ? KIND_WORDS[kind] : "one turn"} (${b.excerpt}). Keep the one idea and cut the rest.`;
		case "displays":
			return `Too many displays for ${kind ? KIND_WORDS[kind] : "one turn"} (${b.excerpt}).`;
		case "advice":
			return `A question is its own words with nothing under them: no advice on how to answer it, ${quoted(b.excerpt)}.`;
		case "repeat":
			return `This advice was given earlier in the session, and advice is said once: ${b.excerpt}. Leave it out.`;
		case "echo":
			return `Start with the content, never by handing his answer back or grading a right one: ${quoted(b.excerpt)}.`;
		case "feedback":
			return `A right answer gets no feedback sentence: ${quoted(b.excerpt)}.`;
		default:
			return quoted(b.excerpt);
	}
}

/** The refusal the tutor reads: what broke and how to send it again. The
 *  details keep the refused text for the record. */
function refusal(family: Family, tool: string, text: string, breaks: VoiceBreak[], kind: TurnKind | undefined): AgentToolResult<unknown> {
	const head = family === "message" ? "Not shown to him: this message breaks the voice." : "Not posed: this question breaks the voice.";
	const again =
		family === "message"
			? "Send it again with send_to_user, rewritten to fix only these, and say nothing about the change."
			: `Call ${tool} again with the question rewritten to fix only these, and say nothing about the change.`;
	return {
		content: [{ type: "text", text: [head, ...breaks.map((b) => `- ${fixFor(b, kind)}`), again].join("\n") }],
		isError: true,
		details: { withheld: "voice", rules: breaks.map((b) => b.rule), text },
	};
}

const DUPLICATE: AgentToolResult<unknown> = {
	content: [{ type: "text", text: "Not shown again: he already has this message from this turn. Send nothing more of it." }],
	isError: true,
	details: { withheld: "duplicate" },
};

/** One turn's guard, built from the record the turn runs on. */
export class VoiceGuard {
	private readonly input: TurnInput;
	private readonly earlier: string[];
	private readonly decisions = new Map<string, AgentToolResult<unknown> | null>();
	private readonly refused = new Set<Family>();
	private readonly said: string[] = [];
	private readonly asked: string[] = [];
	private concluded = false;
	private sentAtConclude = 0;
	private sent = 0;
	private duplicates = 0;

	constructor(messages: readonly LhMessage[]) {
		this.input = turnInputOf(messages);
		this.earlier = earlierTexts(messages);
	}

	/** Read a call as it finishes streaming. A refused message's text leaves
	 *  the live call, so no view ever draws it. */
	screen(call: ToolCall): void {
		if (call.name === PRACTICE_CONCLUDE_TOOL && !this.concluded) {
			this.concluded = true;
			this.sentAtConclude = this.sent;
		}
		const refused = this.decide(call);
		if (refused && call.name === SEND_TO_USER_TOOL) call.arguments = {};
	}

	/** The tool, refusing the calls `screen` refused, and deciding the ones
	 *  it never saw. */
	wrap<T extends AgentTool<any>>(tool: T): T {
		return {
			...tool,
			execute: async (toolCallId, params, signal, onUpdate) => {
				const refused = this.decide({ type: "toolCall", id: toolCallId, name: tool.name, arguments: params as ToolCall["arguments"] });
				return refused ?? tool.execute(toolCallId, params, signal, onUpdate);
			},
		};
	}

	private decide(call: ToolCall): AgentToolResult<unknown> | null {
		if (this.decisions.has(call.id)) return this.decisions.get(call.id)!;
		const decision = this.judge(call);
		this.decisions.set(call.id, decision);
		return decision;
	}

	private judge(call: ToolCall): AgentToolResult<unknown> | null {
		if (call.name === SEND_TO_USER_TOOL) {
			const text = sendToUserText(call);
			if (!text) return null;
			if (this.said.some((s) => s.trim() === text.trim()) && this.duplicates < 2) {
				this.duplicates++;
				return DUPLICATE;
			}
			const kind = this.messageKind();
			const breaks = this.refused.has("message") ? [] : this.messageBreaks(text, kind);
			if (breaks.length > 0) {
				this.refused.add("message");
				return refusal("message", call.name, text, breaks, kind);
			}
			this.said.push(text);
			this.asked.push(...sentences(text).filter((s) => s.trim().endsWith("?")));
			this.sent++;
			return null;
		}
		if (!(QUESTION_TOOLS as readonly string[]).includes(call.name)) return null;
		const text = questionText(call);
		if (!text) return null;
		const breaks = this.refused.has("question") ? [] : this.questionBreaks(text);
		if (breaks.length > 0) {
			this.refused.add("question");
			return refusal("question", call.name, text, breaks, undefined);
		}
		this.said.push(text);
		return null;
	}

	/** The kind of turn this message is: the input's for the turn's first
	 *  message, closing words for the first after a concluded problem, a
	 *  teaching step for any later one. */
	private messageKind(): TurnKind | undefined {
		if (this.concluded) return "close";
		if (this.sent === 0 || this.input.kind === "close") return this.input.kind;
		return "teach";
	}

	private messageBreaks(text: string, kind: TurnKind | undefined): VoiceBreak[] {
		const out = voiceBreaks(text, kind);
		if (!out.some((b) => b.rule === "questions")) {
			const asked = [...this.asked, ...sentences(text).filter((s) => s.trim().endsWith("?"))];
			if (asked.length > 1) out.push({ rule: "questions", excerpt: asked.join(" ") });
		}
		const under = afterQuestion(text);
		if (under.length > 0 && kind !== "hint") out.push({ rule: "advice", excerpt: under.join(" ") });
		const replying = this.input.answers && (this.sent === 0 || (this.concluded && this.sent === this.sentAtConclude));
		const echo = replying ? echoOf(text, this.input.words) : null;
		if (echo) out.push({ rule: "echo", excerpt: echo });
		return [...out, ...this.repeats(text)];
	}

	private questionBreaks(text: string): VoiceBreak[] {
		const out = voiceBreaks(text).filter((b) => b.rule !== "headings");
		const advice = adviceSentences(text);
		if (advice.length > 0) out.push({ rule: "advice", excerpt: advice.join(" ") });
		return [...out, ...this.repeats(text)];
	}

	private repeats(text: string): VoiceBreak[] {
		const repeat = repeatedAdvice(text, [...this.earlier, ...this.said]);
		return repeat ? [{ rule: "repeat", excerpt: `${quoted(repeat.said)}, said before as ${quoted(repeat.before)}` }] : [];
	}
}
