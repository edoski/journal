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
 *
 * Ordinary text never reaches him (round 7: an answer written as plain
 * text skipped every rule): `screenText` takes it out of the reply as it
 * ends, and a turn that would end having given him nothing of what it
 * wrote is told to send it with `send_to_user`, where it is read like any
 * message (`beforeEnd`).
 */

import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { ToolCall } from "@earendil-works/pi-ai";
import { QUESTION_TOOLS } from "../core/pending.ts";
import { opensTurn, PRACTICE_CONCLUDE_TOOL, SEND_TO_USER_TOOL, UNGRADED_ANSWER, failedOutputCallIds, sendToUserText, type LhMessage } from "../core/native-messages.ts";
import { adviceSentences, afterQuestion, compoundAsk, echoOf, repeatedAdvice, sentences, voiceBreaks, type TurnKind, type VoiceBreak, type VoiceRule } from "../core/voice-check.ts";

type Family = "message" | "question";

const PROBE_DONE_TOOL = "probe_done";

/** His question is about the plan: when something comes back, is due or
 *  overdue, the exam, the days ahead. */
const PLAN_QUESTION = /\b(?:reviews?|plan(?:ned)?|overdue|due|exam|when|days?|schedule|calendar|week|tomorrow)\b/i;

/** What the turn's input asks of the replies to it: the kind of turn its
 *  first message is (no kind: no length budget), and his words when it
 *  answers something of his, which a reply must not hand back. */
export interface TurnInput {
	kind: TurnKind | undefined;
	answers: boolean;
	words: string | null;
	/** Practice handed the session back to teaching (Explain instead, or a
	 *  request to be taught): the turn must leave him something to do. */
	handedBack?: boolean;
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
		// A session's first message is the topic it opens on, unless he asks.
		const words = textOf(input.content);
		const opens = !messages.slice(0, at).some((m) => m.role === "assistant") && !words.trim().endsWith("?");
		return { kind: opens ? "teach" : "direct", answers: false, words };
	}
	if (input.role === "toolResult") {
		const details = isRecord(input.details) ? input.details : {};
		if (details.hintRequested === true) return { kind: "hint", answers: false, words: null };
		// A shown answer sets its own length, as a shown solution does.
		if (details.showMe === true) return { kind: undefined, answers: false, words: null };
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
		case "mode-handoff":
			return isRecord(input.details) && input.details.mode === "teach" ? { kind: "teach", answers: false, words: null, handedBack: true } : none;
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

/** The rules a rewrite is still read against after its call was refused
 *  once: a question asks one thing, so no rewrite passes by asking two
 *  (round 7: a rewrite that fixed advice added a second question). */
const HARD: ReadonlySet<VoiceRule> = new Set(["questions", "compound", "verdict"]);

const SAVE_TOOL = "course_save";

/** A reply that calls his whole answer wrong: "That's not right.", "Not
 *  right: …", "No, …", with no part named right ("but", "partly"). */
const FLAT_MISS = /^(?:(?:that|this|it)(?:'s| is) not (?:right|correct)\b|not (?:quite )?(?:right|correct)\b|no(?=[,.]))(?![^.?!]*\b(?:but|partly|part of)\b)/i;

/** The results a save or a conclude records for his answers. */
function savedResults(name: string, args: unknown): string[] {
	if (!isRecord(args)) return [];
	if (name === PRACTICE_CONCLUDE_TOOL) return typeof args.result === "string" ? [args.result] : [];
	let changes: unknown = args.changes;
	if (typeof changes === "string") {
		try {
			changes = JSON.parse(changes);
		} catch {
			return [];
		}
	}
	const listed = isRecord(changes) && Array.isArray(changes.observations) ? changes.observations : [];
	return listed.flatMap((o) => (isRecord(o) && typeof o.result === "string" && !("corrects" in o) ? [o.result] : []));
}

/** A save of a partly right answer after he was told it was not right:
 *  the mark under the card would contradict the words above it (round 7:
 *  "Partly right" under "That's not right."). */
const SAVED_AGAINST_WORDS: AgentToolResult<unknown> = {
	content: [{ type: "text", text: "Not saved: your message told him his answer is not right, so it is not partly right. Save it with result incorrect." }],
	isError: true,
	details: { withheld: "verdict" },
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
			return `One question per turn, and this turn asks more: ${quoted(b.excerpt)}. Ask the first alone; the rest waits for his answer.`;
		case "verdict":
			return `You saved his answer as partly right, so never call it not right: open with the part that is right, then where it broke: ${quoted(b.excerpt)}.`;
		case "compound":
			return `One question asks one thing, and this one asks more: ${b.excerpt.split(" / ").map(quoted).join(", ")}. Ask the first alone; the rest waits for his answer.`;
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

/** Words after `probe_done`: the teacher opens the lesson, so the probe
 *  ends with none (its ack says so). */
const AFTER_PROBE = (text: string): AgentToolResult<unknown> => ({
	content: [{ type: "text", text: "Not shown to him: the probe has ended and the teacher opens the lesson. End your turn with no words." }],
	isError: true,
	details: { withheld: "after-probe", text },
});

/** A question after `probe_done`: its teaching was withheld, so it would
 *  reach him cold, and the teacher asks next (round 7: one was posed, he
 *  missed it, and the miss was saved as a confident error). */
const ASKED_AFTER_PROBE = (text: string): AgentToolResult<unknown> => ({
	content: [{ type: "text", text: "Not posed: the probe has ended and the teacher opens the lesson. End your turn with no question and no words." }],
	isError: true,
	details: { withheld: "after-probe", text },
});

/** A call that would end the turn while a refused message is still owed:
 *  he would never get the rewrite. */
const OWED = (tool: string): AgentToolResult<unknown> => ({
	content: [{ type: "text", text: `Not done: your message before this was not shown to him, so he has nothing to read yet. Send the rewritten message with send_to_user first, then call ${tool} again.` }],
	isError: true,
	details: { withheld: "owed" },
});

/** A turn-ending call after ordinary text: he never reads that text. */
const PLAIN_OWED = (tool: string): AgentToolResult<unknown> => ({
	content: [{ type: "text", text: `Not done: he never sees ordinary text, only what you send with send_to_user. If your text before this held anything for him, send it with send_to_user first; then call ${tool} again.` }],
	isError: true,
	details: { withheld: "plain-text" },
});

/** What the tutor reads when its turn would end with nothing shown: the
 *  ordinary text it wrote, or a message refused and never rewritten. */
const PLAIN_TEXT_NOTE = "Not shown to him: he never sees ordinary text, only what you send with send_to_user. Send your reply to him with send_to_user now, with nothing else.";
const OWED_NOTE = "Not shown to him: your message was refused and you sent no rewrite, so he has nothing to read. Send the rewritten message with send_to_user now.";
/** A turn after practice handed back that would end with nothing for him
 *  to do (round 7: Explain instead ended on an explanation and no action). */
const NEXT_ACTION_NOTE = "He has nothing to do next. End this turn on one question for him with your question tool, a check of what you just explained or the lesson's first question, with no words after it.";

/** One turn's guard, built from the record the turn runs on. `endsTurn`
 *  names the calls that end the turn (a question, a pose, a handoff). */
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
	private probeEnded = false;
	/** A refused message not yet rewritten, and whether a turn-ending call
	 *  was already held back for it (once a turn). */
	private owed = false;
	private heldForOwed = false;
	/** Ordinary text this turn took out of a reply, and whether the turn
	 *  posed a question he can answer, and was already told at its end. */
	private plain = false;
	private posed = false;
	/** This turn saved an answer of his as partly right, or told him one
	 *  was not right: the mark and the words must agree. */
	private savedPartial = false;
	private toldWrong = false;
	private readonly noted = new Set<string>();

	constructor(
		messages: readonly LhMessage[],
		private readonly endsTurn: (toolName: string) => boolean = (name) => (QUESTION_TOOLS as readonly string[]).includes(name),
	) {
		this.input = turnInputOf(messages);
		this.earlier = earlierTexts(messages);
	}

	/** Whether a tool's calls pass through the guard: the probe's end too,
	 *  which it reads only once the probe has ended. */
	guards(toolName: string): boolean {
		return toolName === SEND_TO_USER_TOOL || toolName === PROBE_DONE_TOOL || toolName === SAVE_TOOL || this.endsTurn(toolName);
	}

	/** Read a call as it finishes streaming. A refused message's text leaves
	 *  the live call, so no view ever draws it. */
	screen(call: ToolCall): void {
		if (call.name === PRACTICE_CONCLUDE_TOOL && !this.concluded) {
			this.concluded = true;
			this.sentAtConclude = this.sent;
			if (savedResults(call.name, call.arguments).includes("partial")) this.savedPartial = true;
		}
		const refused = this.decide(call);
		if (refused && call.name === SEND_TO_USER_TOOL) call.arguments = {};
	}

	/** Read ordinary text as its block ends: he never sees it, so it is
	 *  always taken out (true); blank text is left alone. */
	screenText(text: string): boolean {
		if (!text.trim()) return false;
		this.plain = true;
		return true;
	}

	/** What the tutor must read before a turn ends that no tool ended:
	 *  he got nothing to read, though it wrote him something (ordinary
	 *  text, or a refused message never rewritten), or, after practice
	 *  handed the session back, nothing to do. Each once a turn; nothing
	 *  after the probe ends, where the teacher speaks next. */
	beforeEnd(): string | undefined {
		if (this.probeEnded || this.posed) return undefined;
		const shown = this.sent > 0;
		const note = !shown && this.owed ? OWED_NOTE : !shown && this.plain ? PLAIN_TEXT_NOTE : this.input.handedBack ? NEXT_ACTION_NOTE : undefined;
		if (!note || this.noted.has(note)) return undefined;
		this.noted.add(note);
		return note;
	}

	/** The tool, refusing the calls `screen` refused, and deciding the ones
	 *  it never saw. */
	wrap<T extends AgentTool<any>>(tool: T): T {
		return {
			...tool,
			execute: async (toolCallId, params, signal, onUpdate) => {
				const refused = this.decide({ type: "toolCall", id: toolCallId, name: tool.name, arguments: params as ToolCall["arguments"] });
				if (refused) return refused;
				const partial = tool.name === SAVE_TOOL && savedResults(tool.name, params).includes("partial");
				if (partial && this.toldWrong) return SAVED_AGAINST_WORDS;
				const result = await tool.execute(toolCallId, params, signal, onUpdate);
				if (partial && !result.isError) this.savedPartial = true;
				if (tool.name === PROBE_DONE_TOOL && !result.isError && isRecord(result.details) && result.details.ok === true) this.probeEnded = true;
				return result;
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
			// A rewrite he is owed goes through, after probe_done too: it is
			// the answer he asked for, never a closing sentence.
			const afterProbe = this.probeEnded && !this.owed;
			if (this.duplicates < 2 && (afterProbe || this.said.some((s) => s.trim() === text.trim()))) {
				this.duplicates++;
				return afterProbe ? AFTER_PROBE(text) : DUPLICATE;
			}
			const kind = this.messageKind();
			const breaks = this.held("message", this.messageBreaks(text, kind));
			if (breaks.length > 0) {
				this.refused.add("message");
				this.owed = true;
				return refusal("message", call.name, text, breaks, kind);
			}
			this.owed = false;
			if (FLAT_MISS.test(sentences(text)[0]?.trim() ?? "")) this.toldWrong = true;
			this.said.push(text);
			this.asked.push(...sentences(text).filter((s) => s.trim().endsWith("?")));
			this.sent++;
			return null;
		}
		if (this.probeEnded && (QUESTION_TOOLS as readonly string[]).includes(call.name)) return ASKED_AFTER_PROBE(questionText(call) ?? "");
		if ((this.owed || (this.plain && this.sent === 0)) && !this.heldForOwed && this.endsTurn(call.name)) {
			this.heldForOwed = true;
			return this.owed ? OWED(call.name) : PLAIN_OWED(call.name);
		}
		if (!(QUESTION_TOOLS as readonly string[]).includes(call.name)) return null;
		const text = questionText(call);
		if (!text) return null;
		const breaks = this.held("question", this.questionBreaks(text));
		if (breaks.length > 0) {
			this.refused.add("question");
			return refusal("question", call.name, text, breaks, undefined);
		}
		this.said.push(text);
		this.posed = true;
		return null;
	}

	/** The breaks a call is refused for: all of them the first time its
	 *  kind of call is refused in a turn, then only the hard rules, so a
	 *  rewrite that still slips elsewhere is shown rather than looped. */
	private held(family: Family, breaks: VoiceBreak[]): VoiceBreak[] {
		return this.refused.has(family) ? breaks.filter((b) => HARD.has(b.rule)) : breaks;
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
		// The plan's days are the answer to his question about the plan.
		const asksPlan = kind === "direct" && PLAN_QUESTION.test(this.input.words ?? "");
		const out = voiceBreaks(text, kind).filter((b) => !(asksPlan && b.rule === "plan"));
		if (!out.some((b) => b.rule === "questions")) {
			const asked = [...this.asked, ...sentences(text).filter((s) => s.trim().endsWith("?"))];
			if (asked.length > 1) out.push({ rule: "questions", excerpt: asked.join(" ") });
		}
		const first = sentences(text)[0]?.trim() ?? "";
		if (this.savedPartial && FLAT_MISS.test(first)) out.push({ rule: "verdict", excerpt: first });
		const compound = compoundAsk(sentences(text).filter((s) => s.trim().endsWith("?")).join(" "));
		if (compound) out.push(compound);
		const under = afterQuestion(text);
		if (under.length > 0 && kind !== "hint") out.push({ rule: "advice", excerpt: under.join(" ") });
		const replying = this.input.answers && (this.sent === 0 || (this.concluded && this.sent === this.sentAtConclude));
		const echo = replying ? echoOf(text, this.input.words) : null;
		if (echo) out.push({ rule: "echo", excerpt: echo });
		return [...out, ...this.repeats(text)];
	}

	private questionBreaks(text: string): VoiceBreak[] {
		const out = voiceBreaks(text).filter((b) => b.rule !== "headings");
		const compound = compoundAsk(text);
		if (compound) out.push(compound);
		const advice = [...new Set([...afterQuestion(text), ...adviceSentences(text)])];
		if (advice.length > 0) out.push({ rule: "advice", excerpt: advice.join(" ") });
		return [...out, ...this.repeats(text)];
	}

	private repeats(text: string): VoiceBreak[] {
		const repeat = repeatedAdvice(text, [...this.earlier, ...this.said]);
		return repeat ? [{ rule: "repeat", excerpt: `${quoted(repeat.said)}, said before as ${quoted(repeat.before)}` }] : [];
	}
}
