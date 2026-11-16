/**
 * The voice, held per turn (spec: src/agent/prompts/shared/10-voice.md).
 * Each message the tutor sends with `send_to_user`, and each question it
 * poses, is read with the voice checker before he sees it. One that breaks
 * the voice is refused with what to fix, and the tutor rewrites it in the
 * same turn; he sees only the rewrite. Each kind of call is refused twice a
 * turn at most (a rewrite is read against every rule again, round 8: a
 * length rewrite glued sentences, a verdict rewrite opened on a formula),
 * then only the hard rules hold, so a rewrite that still slips is shown
 * rather than looped.
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
import { normalizeQuestionType } from "../core/question-core.ts";
import { parseMermaidPlan } from "./tools/mermaid-plan.ts";
import { answeredQuestionsOf, GRADED_QUESTION_TOOLS, isRealAnswer, opensTurn, PRACTICE_CONCLUDE_TOOL, PRACTICE_PROBLEM_TOOL, savedQuestionsOf, SEND_TO_USER_TOOL, UNGRADED_ANSWER, failedOutputCallIds, sendToUserText, type LhMessage } from "../core/native-messages.ts";
import { adviceSentences, afterQuestion, asksAreHis, reasonAskedTwice, recordConfidenceWord, clausesOf, closingMoral, compoundAsk, echoOf, heavySentences, leavesAWayOn, narratedConfidence, problemAdvice, restatingCallout, reusedLetter, repeatedAdvice, repeatedPoint, restatesWithoutReason, SENTENCE_WORDS, sentences, voiceBreaks, type TurnKind, type VoiceBreak, type VoiceRule } from "../core/voice-check.ts";

type Family = "message" | "question";

const PROBE_DONE_TOOL = "probe_done";

/** The words that give a topic's planned day. */
const PLANNED_DAY = /^(?:is planned for|planned to start)$/i;

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
	/** He answered unsure (marked it a guess, or said he doesn't see why):
	 *  the reply owes him words before any next question (round 8: a right
	 *  guess and "Not sure why I'm allowed to split T" got none). */
	unsure?: string;
	/** His work on a problem, which a reply leaves open: the reply ends on
	 *  a way on (round 8: photo feedback stopped on the faulty line). */
	work?: boolean;
	/** A ruling on his dispute of a mark: each ruling is news, however much
	 *  it reads like an earlier one ("The mark stays …"). */
	ruling?: boolean;
	/** His message asks to guess first ("let me guess first"): the guess
	 *  is a prediction, never a counted attempt (round 12, 2 M1). */
	guess?: string;
}

/** His words asking to guess before he is told: "let me guess first",
 *  "can I guess", "I want to predict it". */
const GUESS_ASK = /\b(?:let me|i(?:'ll| will| want to| wanna|'d like to| would like to)|can i|could i|may i)\s+(?:first\s+)?(?:try\s+(?:to\s+)?|have\s+a\s+|take\s+a\s+|make\s+a\s+)?(?:guess|predict)\b|\b(?:guess|predict)(?:ing)?\s+first\b/i;

/** The tutor's words inviting a guess: "Go ahead, guess.", "Take a guess",
 *  "What's your guess?", "Make a prediction". Never words about a guess
 *  he already made ("your guess fails there"). */
const GUESS_INVITE = /\b(?:go ahead(?:,| and)?\s+guess|guess (?:first|away)|(?:take|make|have) a (?:quick |first )?guess|what(?:'s| is| would be) your (?:best )?guess|what would you guess|(?:make|give) (?:me )?(?:a|your) prediction)\b/i;

/** Words in his answer that say he is not sure of it or of its reason. */
const DOUBT = /\b(?:not sure|unsure|no idea|i think|i guess|i'?m guessing|maybe|probably|don'?t (?:know|see|get)|why (?:i'?m|am i|is it|does it|can i))\b/i;

/** Why his answer reads unsure, or undefined. */
function unsureOf(details: Record<string, unknown>, words: string | null): string | undefined {
	const said = words ? DOUBT.exec(words) : null;
	if (said) return `he wrote "${said[0]}"`;
	return details.confidence === "guessing" ? "he marked his answer a guess" : undefined;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function textOf(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content.flatMap((p) => (isRecord(p) && p.type === "text" && typeof p.text === "string" ? [p.text] : [])).join("\n");
}

/** Practice handed the session back to teaching, and since then he wrote
 *  nothing of his own and no handoff went back to practice. */
function afterHandBack(messages: readonly LhMessage[]): boolean {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i]!;
		if (m.role === "user") return false;
		if (m.role === "toolResult" && m.toolName === "practice" && !m.isError) return false;
		if (m.role === "custom" && m.customType === "mode-handoff") return isRecord(m.details) && m.details.mode === "teach";
	}
	return false;
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
		const guess = GUESS_ASK.exec(words)?.[0];
		return { kind: opens ? "teach" : "direct", answers: false, words, ...(guess ? { guess } : {}) };
	}
	if (input.role === "toolResult") {
		const details = isRecord(input.details) ? input.details : {};
		// His answer to the check after practice handed back: he still needs a way on.
		const handedBack = afterHandBack(messages.slice(0, at)) ? { handedBack: true } : {};
		if (details.hintRequested === true) return { kind: "hint", answers: false, words: null };
		// A shown answer sets its own length, as a shown solution does.
		if (details.showMe === true) return { kind: undefined, answers: false, words: null };
		const words = typeof details.text === "string" ? details.text : textOf(input.content);
		const unsure = unsureOf(details, words);
		return { kind: "wrong", answers: true, words, ...handedBack, ...(unsure ? { unsure } : {}) };
	}
	if (input.role !== "custom") return none;
	switch (input.customType) {
		case "done-tonight":
		case "practice-next":
			return { kind: "close", answers: false, words: null };
		case "practice-thinking":
			return { kind: "wrong", answers: true, words: textOf(input.content), work: true };
		case "practice-request": {
			// A hint's rung and a shown solution set their own length.
			const request = isRecord(input.details) ? input.details.request : undefined;
			return { kind: request === "explain" ? "teach" : undefined, answers: false, words: null };
		}
		case UNGRADED_ANSWER:
			return { kind: "wrong", answers: true, words: textOf(input.content) };
		case "dispute":
			return { kind: "direct", answers: false, words: null, ruling: true };
		case "mode-handoff":
			return isRecord(input.details) && input.details.mode === "teach" ? { kind: "teach", answers: false, words: null, handedBack: true } : none;
		default:
			return none;
	}
}

/** Every text he read from the tutor before this turn: its delivered
 *  messages and the questions it posed, each marked which it is. */
function earlierTexts(messages: readonly LhMessage[]): Array<{ text: string; asked: boolean }> {
	const failed = failedOutputCallIds(messages);
	return messages.flatMap((m) =>
		m.role !== "assistant"
			? []
			: m.content.flatMap((b) => {
					if (b.type !== "toolCall" || failed.has(b.id)) return [];
					const asked = (QUESTION_TOOLS as readonly string[]).includes(b.name);
					const text = b.name === SEND_TO_USER_TOOL ? sendToUserText(b) : asked ? questionText(b) : undefined;
					return text ? [{ text, asked }] : [];
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
const HARD: ReadonlySet<VoiceRule> = new Set(["questions", "compound", "verdict", "guess"]);

const SAVE_TOOL = "course_save";

/** The session called a lesson, which a review never is (round 9, 2 m4:
 *  the Binomial review closed on "the binomial lesson"). */
const SESSION_AS_LESSON = /\b(?:this|today'?s|the|our|your)(?: [a-z]+)? lesson\b/i;

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

/** The rulings a save records on a dispute (`ruling` on each re-mark). */
function savedRulings(args: unknown): string[] {
	if (!isRecord(args)) return [];
	let changes: unknown = args.changes;
	if (typeof changes === "string") {
		try {
			changes = JSON.parse(changes);
		} catch {
			return [];
		}
	}
	const listed = isRecord(changes) && Array.isArray(changes.observations) ? changes.observations : [];
	return listed.flatMap((o) => (isRecord(o) && typeof o.ruling === "string" ? [o.ruling] : []));
}

/** A ruling saved in the record's confidence word, not his card's: the
 *  card's "Disputed:" line would read "sure" beside "Confident". */
const RULING_WORDS = (slip: string): AgentToolResult<unknown> => ({
	content: [{ type: "text", text: `Not saved: the ruling words his confidence as the record does, "${slip}", but his card says "Guessing" or "Confident". Send the save again with the ruling in the card's words.` }],
	isError: true,
	details: { withheld: "card-words" },
});

const DEMO_TOOL = "demo";

/** Maths as a key that ignores how it was typed: TeX or Unicode, spaces,
 *  braces and `\\left`/`\\right` aside, so "(1 − λ/n)^n" in a brief and
 *  "$(1-\\lambda/n)^n$" in a step's title read the same. */
function formulaKey(text: string): string {
	return text
		.replace(/\\(?:left|right|,|;|!|quad|qquad)(?![A-Za-z])/g, "")
		.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, "$1/$2")
		.replace(/\\lambda(?![A-Za-z])/g, "λ").replace(/\\mu(?![A-Za-z])/g, "μ").replace(/\\sigma(?![A-Za-z])/g, "σ").replace(/\\theta(?![A-Za-z])/g, "θ")
		.replace(/[−–]/g, "-")
		.replace(/[\s${}]/g, "")
		.toLowerCase();
}

/** The formulas a step's title names, each as a key. */
function formulasOf(title: string): string[] {
	return [...title.matchAll(/\$([^$]+)\$/g)].map((m) => formulaKey(m[1]!));
}

/** The latest plan's steps that no `lesson_progress` has marked done. */
function stepsNotDone(messages: readonly LhMessage[]): Array<{ id: string; title: string }> {
	const failed = failedOutputCallIds(messages);
	let steps: Array<{ id: string; title: string }> = [];
	const done = new Set<string>();
	for (const m of messages) {
		if (m.role !== "assistant") continue;
		for (const b of m.content) {
			if (b.type !== "toolCall" || failed.has(b.id) || !isRecord(b.arguments)) continue;
			if (b.name === "plan_init" && typeof b.arguments.mermaid === "string") {
				const plan = parseMermaidPlan(b.arguments.mermaid).plan;
				if (plan) steps = plan.nodes.map((node) => ({ id: node.id, title: node.title }));
			} else if (b.name === "lesson_progress" && Array.isArray(b.arguments.done)) {
				for (const id of b.arguments.done) if (typeof id === "string") done.add(id);
			}
		}
	}
	return steps.filter((step) => !done.has(step.id));
}

/** A demo brief that prints a step ahead's formula. */
const DEMO_GIVES_AWAY = (title: string): AgentToolResult<unknown> => ({
	content: [
		{
			type: "text",
			text: `Not built: the brief prints the formula of "${title}", a step he has not done yet, so the demo would hand him what the lesson is about to ask. A demo shows what he has been taught and lets him find the rest: label each control and readout by what it is ("chance per slot"), never by a formula or value he is still to find, and send the brief again.`,
		},
	],
	isError: true,
	details: { withheld: "demo-gives-away" },
});

/** A save of a partly right answer after he was told it was not right:
 *  the mark under the card would contradict the words above it (round 7:
 *  "Partly right" under "That's not right."). */
const SAVED_AGAINST_WORDS: AgentToolResult<unknown> = {
	content: [{ type: "text", text: "Not saved: your message told him his answer is not right, so it is not partly right. Save it with result incorrect." }],
	isError: true,
	details: { withheld: "verdict" },
};

/** An ask for the reason of the answer beside it: "explain why…", "say how
 *  you got it", "justify it". */
const REASON_ASK = /^(?:explain|say|justify|give|state)\b[^.?!]*\b(?:why|how|reason)\b|^(?:explain|justify) (?:it|this|that|your)\b|^why\b/i;

/** Words under a question that ask for his reason or his working ("Say
 *  why.", "Justify your answer.", "Show how you get it."): the reason
 *  belongs in the question, as ", and why?" (round 10: told only "no
 *  advice", the rewrite asked it as a second clause and was refused again). */
const REASON_UNDER = /\b(?:why|reasons?|justify|explain|show how|how you (?:got|get)|accounts? for)\b/i;

const quoted = (text: string) => `"${text.length > 160 ? `${text.slice(0, 157)}…` : text}"`;

/** What to fix for each break, in the voice's own terms. */
function fixFor(b: VoiceBreak, kind: TurnKind | undefined, text: string): string {
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
		case "operand":
			return `An operator stands alone, acting on nothing: ${quoted(b.excerpt)}. Write what it acts on ("$\\operatorname{im} A$"), or say it in words ("the image of A").`;
		case "reprint":
			return `His open question stays above as it was, and the app shows no copy of it: ${quoted(b.excerpt)}. Say it is still open above ("Your question is still open above."), never that you give it again.`;
		case "machinery":
			return `Never name the app's parts or how his words reached you: ${quoted(b.excerpt)}. Speak to what he wrote.`;
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
		case "compound": {
			const asks = b.excerpt.split(" / ");
			// A reason asked beside the answer is one ask, said "…, and why?"
			// (round 8: the rewrite read "with the reason the formula counts it?").
			const reason = asks.slice(1).every((a) => REASON_ASK.test(a));
			return reason
				? `One question asks one thing, and this one asks more: ${asks.map(quoted).join(", ")}. A reason asked with the answer is part of it: end the first ask with ", and why?".`
				: `One question asks one thing, and this one asks more: ${asks.map(quoted).join(", ")}. Ask the first alone; the rest waits for his answer.`;
		}
		case "length": {
			const what = kind ? KIND_WORDS[kind] : "one turn";
			if (b.excerpt.startsWith("joined: ")) return `It is still too long for ${what}: it joins sentences the draft had apart and cuts almost nothing (${b.excerpt.slice("joined: ".length)}). Cut a whole sentence instead.`;
			const heavy = heavySentences(text).map((h) => `${quoted(h.sentence)} is ${[h.words > SENTENCE_WORDS ? `${h.words} words` : null, h.joins > 0 ? `${h.joins + 1} clauses joined by a colon or a semicolon` : null].filter(Boolean).join(" and ")}`);
			const counted = heavy.length > 0 ? ` A sentence over ${SENTENCE_WORDS} words counts as two, and each clause after a colon or a semicolon as one more: ${heavy.join("; ")}.` : "";
			return `It is too long for ${what} (${b.excerpt}).${counted} Keep the one idea: cut whole sentences, or cut a long one to ${SENTENCE_WORDS} words or fewer; never join two.`;
		}
		case "options":
			return `An option that joins others is a choice of several: drop ${quoted(b.excerpt)} and set multiSelect, so he picks each he wants.`;
		case "symbol":
			return `Never start a sentence with a symbol or a formula; open it with words: ${quoted(b.excerpt)}.`;
		case "displays":
			return `Too many displays for ${kind ? KIND_WORDS[kind] : "one turn"} (${b.excerpt}).`;
		case "advice":
			return REASON_UNDER.test(b.excerpt)
				? `A question is its own words with nothing under them: ${quoted(b.excerpt)}. To ask for his reason, end the question itself with ", and why?".`
				: `A question is its own words with nothing under them: no advice on how to answer it, ${quoted(b.excerpt)}.`;
		case "repeat":
			if (b.excerpt.startsWith("display ")) return `He has already seen ${b.excerpt.slice("display ".length)} earlier in the session, and what he was told is said once: build on it with a new case, never show or explain it again.`;
			if (b.excerpt.startsWith("callout ")) return `A callout holds what the message has not said, and this one says again what the paragraph above it said: ${b.excerpt.slice("callout ".length)}. Drop the callout, or the sentence it restates.`;
			if (b.excerpt.startsWith("point ")) return `He was already told this earlier in the session, and a point is made once: ${b.excerpt.slice("point ".length)}. Leave it out; say only what is new.`;
			return `This advice was given earlier in the session, and advice is said once: ${b.excerpt}. Leave it out.`;
		case "colon":
			return `A colon goes only before a display, a list or a definition's body: end the verdict with a full stop and give the reason as its own sentence: ${quoted(b.excerpt)}.`;
		case "backref":
			return `Say the thing itself, never point back to an earlier one, which he must check against the screen: ${quoted(b.excerpt)}.`;
		case "chain":
			return `One relation per display: this one chains different relations, ${quoted(b.excerpt)}. Give each relation its own display line, or say the step in words.`;
		case "moral":
			return `A direct answer stops where the answer does, with no closing lesson: drop ${quoted(b.excerpt)}.`;
		case "reason":
			return `He was unsure of his answer, and this only states it again: give in one or two sentences the reason it holds, opening on the fact itself, never on "That holds": ${quoted(b.excerpt)}.`;
		case "echo":
			return `Start with the content, never by handing his answer back or grading a right one: ${quoted(b.excerpt)}.${/^(?:(?:that|this|it) holds|(?:you|your \w+) (?:were|was) right)\b/i.test(b.excerpt) ? " Open on the fact that makes it hold." : ""}`;
		case "feedback":
			return `A right answer gets no feedback sentence: ${quoted(b.excerpt)}.`;
		case "confidence":
			return `Closing words never tell him how sure he was, which his card already shows, and never restate the break your feedback named: drop ${quoted(b.excerpt)} and keep only the one move that was not obvious.`;
		case "letter":
			return `${b.excerpt.split(" ")[0]} already names another matrix in this session, so he cannot tell which one a step means. Name this matrix with a letter the session has not used yet: ${quoted(b.excerpt.slice(b.excerpt.indexOf(" ") + 1))}.`;
		case "card-words":
			return `His card words his confidence "Guessing" or "Confident", so the ruling does too, never the record's "sure" or "guess": ${quoted(b.excerpt)}.`;
		case "reason-twice":
			return `A "Show that…" already asks for his reason, so it takes no ", and why?": ${quoted(b.excerpt)}. End it with a full stop, and pose a part he typed in his words, all of it.`;
		case "maths-words":
			return `Words are prose, never maths type: ${quoted(b.excerpt)} sets a phrase in a formula. Write the sentence as prose with only its maths in $…$ ("$A$ is invertible exactly when $\\det A \\neq 0$").`;
		case "unsaved":
			return `Never tell him an answer is not saved: every answer in the record stays saved, an earlier day's included, and the app itself says when his record can't be read: ${quoted(b.excerpt)}. Leave it out.`;
		case "guess":
			return `${b.excerpt.startsWith("he wrote ") ? `He asked to guess first (${b.excerpt})` : `You invited a guess (${quoted(b.excerpt)})`}, so his answer is a guess before he is told, never a counted attempt: pose it as a prediction, \`type: predict\`, tagged with the step it grows from, so it is kept and never counts. Ask the open question again once his guess is answered.`;
		case "review-lesson":
			return `This session is his review, whatever it re-teaches, so call it his review, never a lesson: ${quoted(b.excerpt)}.`;
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
		content: [{ type: "text", text: [head, ...breaks.map((b) => `- ${fixFor(b, kind, text)}`), again].join("\n") }],
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
const NEXT_ACTION_NOTE = "He has nothing to do next. End this turn on one question for him with your question tool, or, once he has answered your check, hand the session back to the problems with practice.";
/** A reply to his work that leaves the problem open with nothing for him
 *  to do (round 8: "It breaks at the line −3x + 2y = 0" and nothing after). */
const NUDGE_NOTE = "His work broke and the problem is still open, but your reply gives him no way on. Send one more message with send_to_user: the smallest nudge toward his next move, as one question or instruction he can act on, never the correction.";
/** A call that would end the turn before his answer this turn was saved
 *  (round 10, 1 m1: a wrong prediction got a rebuttal and the same
 *  question again, and only his right retry was ever saved). */
const UNSAVED = (tool: string): AgentToolResult<unknown> => ({
	content: [{ type: "text", text: `Not done: his answer to your last question is not saved yet. Save it with course_save first, as it was, a wrong prediction included, since every attempt is kept; then call ${tool} again. If it only asked you something and holds no attempt, call ${tool} again as it is.` }],
	isError: true,
	details: { withheld: "unsaved" },
});
const UNSAVED_NOTE = "His answer to your last question is not saved. Save it with course_save now, as it was, a wrong prediction included, since every attempt is kept; if it only asked you something, it holds no attempt.";

/** The graded question his answer opening this turn replies to, while no
 *  save has kept it yet; null for any other turn. */
function unsavedAnswerOf(messages: readonly LhMessage[]): string | null {
	const input = messages[messages.findLastIndex(opensTurn)];
	if (input?.role !== "toolResult" || input.isError || !GRADED_QUESTION_TOOLS.includes(input.toolName) || !isRealAnswer(input.details)) return null;
	return answeredQuestionsOf(messages).get(input.toolCallId)?.recorded === false ? input.toolCallId : null;
}

/** A question posed straight after an unsure answer, with no words. */
const UNSURE = (why: string): AgentToolResult<unknown> => ({
	content: [
		{
			type: "text",
			text: `Not posed: he was unsure of his answer (${why}), and you gave him no words on it. First send him with send_to_user, in one or two sentences, the reason his answer holds or where it broke, opening on the fact itself, never on a grade ("That holds", "You were right"); then ask this again.`,
		},
	],
	isError: true,
	details: { withheld: "unsure" },
});

/** An option of a choice that stands for several others ("Both: …", "All
 *  of the above"): the question is a choice of several (round 8: the goal
 *  question's "Both" option). */
function joinedOptions(call: Pick<ToolCall, "arguments">): VoiceBreak[] {
	const options = isRecord(call.arguments) && Array.isArray(call.arguments.options) ? call.arguments.options : [];
	return options.flatMap((o) => {
		const label = isRecord(o) && typeof o.label === "string" ? o.label : typeof o === "string" ? o : "";
		return /^(?:both|all of (?:these|them|the above)|all (?:three|four)|any of (?:these|them))\b/i.test(label.trim()) ? [{ rule: "options" as const, excerpt: label }] : [];
	});
}

const MATRIX = /\\begin\{([pbvBV]?matrix)\}[\s\S]*?\\end\{\1\}/g;
const DISPLAY = /\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]/g;
const squash = (tex: string) => tex.replace(/\s+/g, "");

/** The matrices and displays of a text, each by a key that ignores
 *  spacing. `displaysOnly` reads the matrices inside displays alone (what
 *  a teaching step shows), else every matrix (a question's inline one too). */
function mathsShown(text: string, displaysOnly: boolean): Array<{ key: string; label: string }> {
	const out: Array<{ key: string; label: string }> = [];
	const displays = [...text.matchAll(DISPLAY)].map((m) => (m[1] ?? m[2] ?? "").trim()).filter(Boolean);
	for (const d of displays) out.push({ key: `d:${squash(d)}`, label: "this display" });
	for (const source of displaysOnly ? displays : [text]) {
		for (const m of source.matchAll(MATRIX)) out.push({ key: `d:${squash(m[0])}`, label: "this matrix" });
	}
	return out;
}

/** One turn's guard, built from the record the turn runs on. `endsTurn`
 *  names the calls that end the turn (a question, a pose, a handoff). */
export class VoiceGuard {
	private readonly input: TurnInput;
	private readonly earlier: string[];
	/** The messages he read before this turn, questions aside. */
	private readonly told: string[];
	private readonly answeredAt: number;
	private readonly decisions = new Map<string, AgentToolResult<unknown> | null>();
	/** How many times each kind of call was refused this turn. */
	private readonly refused = new Map<Family, number>();
	private readonly said: string[] = [];
	/** The messages shown this turn, questions aside. */
	private readonly toldNow: string[] = [];
	/** A message refused for its length this turn: its words and clauses,
	 *  so a rewrite that has fewer clauses but cut less than the shortest
	 *  of them joined them instead (round 9: ", that" and "because" for a
	 *  colon, nothing cut). A rewrite that splits or trims a sentence keeps
	 *  its clauses and is read by the budget alone (round 10: a one-sentence
	 *  close split in two was refused, as the draft less its only sentence
	 *  left no words at all). */
	private lengthDraft: { words: number; clauses: number; shortest: number } | null = null;
	private readonly asked: string[] = [];
	private concluded = false;
	private sentAtConclude = 0;
	private sent = 0;
	private duplicates = 0;
	private probeEnded = false;
	/** A refused message not yet rewritten, and whether a turn-ending call
	 *  was already held back for it (once a turn). */
	private owed = false;
	private heldForOwed = 0;
	private heldUnsure = false;
	/** Ordinary text this turn took out of a reply, and whether the turn
	 *  posed a question he can answer, and was already told at its end. */
	private plain = false;
	private posed = false;
	/** This turn saved an answer of his as partly right, or told him one
	 *  was not right: the mark and the words must agree. */
	private savedPartial = false;
	private toldWrong = false;
	private readonly noted = new Set<string>();
	/** His answer this turn that no save has named yet, in a session with
	 *  a course record to save it to, and whether a turn-ending call was
	 *  held back for it (once a turn). */
	private unsaved: string | null;
	private heldUnsaved = false;
	/** The lesson plan's steps not yet done, each with its title. */
	private readonly stepsAhead: Array<{ id: string; title: string }>;
	/** A demo brief that gave away a step ahead was held back once. */
	private heldDemo = false;
	/** A ruling saved with the record's confidence word was held back once. */
	private heldRuling = false;

	constructor(
		messages: readonly LhMessage[],
		private readonly endsTurn: (toolName: string) => boolean = (name) => (QUESTION_TOOLS as readonly string[]).includes(name),
		/** The session is his review (session-opening.ts `reviewRecord`). */
		private readonly review = false,
		/** The session saves his answers to a course record (`course_save`). */
		saves = false,
	) {
		this.input = turnInputOf(messages);
		this.stepsAhead = stepsNotDone(messages);
		this.unsaved = saves ? unsavedAnswerOf(messages) : null;
		const earlier = earlierTexts(messages);
		this.earlier = earlier.map((e) => e.text);
		this.told = earlier.filter((e) => !e.asked).map((e) => e.text);
		// The question his answer replies to is the last one he read: a reply
		// works on its matrix, so only what came before it counts as shown.
		this.answeredAt = this.input.answers ? Math.max(0, this.earlier.length - 1) : this.earlier.length;
	}

	/** Whether a tool's calls pass through the guard: the probe's end too,
	 *  which it reads only once the probe has ended. */
	guards(toolName: string): boolean {
		return toolName === SEND_TO_USER_TOOL || toolName === PROBE_DONE_TOOL || toolName === SAVE_TOOL || toolName === DEMO_TOOL || this.endsTurn(toolName);
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
		if (this.unsaved && !this.noted.has(UNSAVED_NOTE)) {
			this.noted.add(UNSAVED_NOTE);
			return UNSAVED_NOTE;
		}
		if (this.probeEnded || this.posed) return undefined;
		const shown = this.sent > 0;
		const leftNoWayOn = this.input.work === true && shown && !this.concluded && !this.owed && !this.said.some(leavesAWayOn);
		const note = !shown && this.owed ? OWED_NOTE : !shown && this.plain ? PLAIN_TEXT_NOTE : this.input.handedBack ? NEXT_ACTION_NOTE : leftNoWayOn ? NUDGE_NOTE : undefined;
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
		// A save read as it streams, before the calls after it: one that
		// names his answer keeps it, so the question after it goes through.
		if (call.name === SAVE_TOOL && this.unsaved && savedQuestionsOf(call.arguments).includes(this.unsaved)) this.unsaved = null;
		if (this.unsaved && !this.heldUnsaved && (this.endsTurn(call.name) || call.name === PROBE_DONE_TOOL)) {
			this.heldUnsaved = true;
			return UNSAVED(call.name);
		}
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
				this.refused.set("message", (this.refused.get("message") ?? 0) + 1);
				this.owed = true;
				if (breaks.some((b) => b.rule === "length") && !this.lengthDraft) this.lengthDraft = clausesOf(text);
				return refusal("message", call.name, text, breaks, kind);
			}
			this.owed = false;
			this.lengthDraft = null;
			this.toldNow.push(text);
			if (FLAT_MISS.test(sentences(text)[0]?.trim() ?? "")) this.toldWrong = true;
			this.said.push(text);
			this.asked.push(...sentences(text).filter((s) => s.trim().endsWith("?")));
			this.sent++;
			return null;
		}
		if (call.name === DEMO_TOOL) return this.judgeDemo(call);
		if (call.name === SAVE_TOOL && this.input.ruling && !this.heldRuling) {
			const slip = savedRulings(call.arguments).map(recordConfidenceWord).find(Boolean);
			if (slip) {
				this.heldRuling = true;
				return RULING_WORDS(slip);
			}
		}
		if (this.probeEnded && (QUESTION_TOOLS as readonly string[]).includes(call.name)) return ASKED_AFTER_PROBE(questionText(call) ?? "");
		// Held once for each refused message (a rewrite may be refused again),
		// or once for ordinary text.
		if ((this.owed || (this.plain && this.sent === 0)) && this.heldForOwed < Math.max(1, this.refused.get("message") ?? 0) && this.endsTurn(call.name)) {
			this.heldForOwed++;
			return this.owed ? OWED(call.name) : PLAIN_OWED(call.name);
		}
		if (call.name === PRACTICE_PROBLEM_TOOL) return this.judgeProblem(call);
		if (!(QUESTION_TOOLS as readonly string[]).includes(call.name)) return null;
		const text = questionText(call);
		if (!text) return null;
		if (this.input.unsure && this.sent === 0 && !this.heldUnsure) {
			this.heldUnsure = true;
			return UNSURE(this.input.unsure);
		}
		const breaks = this.held("question", [...this.questionBreaks(text), ...joinedOptions(call), ...this.guessAsked(call, text)]);
		if (breaks.length > 0) {
			this.refused.set("question", (this.refused.get("question") ?? 0) + 1);
			return refusal("question", call.name, text, breaks, undefined);
		}
		this.said.push(text);
		this.posed = true;
		return null;
	}

	/** A posed problem's statement holds no advice and no instruction to
 *  defend the answer under its question (round 9: "What is dim span{u, v,
 *  w}? Justify your answer."); its parts are its own asks. */
	private judgeProblem(call: ToolCall): AgentToolResult<unknown> | null {
		const statement = isRecord(call.arguments) && typeof call.arguments.statement === "string" ? call.arguments.statement : "";
		const advice = problemAdvice(statement);
		const breaks = this.held("question", advice.length > 0 ? [{ rule: "advice", excerpt: advice.join(" ") }] : []);
		if (breaks.length === 0) return null;
		this.refused.set("question", (this.refused.get("question") ?? 0) + 1);
		return refusal("question", call.name, statement, breaks, undefined);
	}

	/** The breaks a call is refused for: all of them for the draft and its
	 *  first rewrite, then only the hard rules, so a rewrite that still
	 *  slips elsewhere is shown rather than looped. */
	private held(family: Family, breaks: VoiceBreak[]): VoiceBreak[] {
		return (this.refused.get(family) ?? 0) >= 2 ? breaks.filter((b) => HARD.has(b.rule)) : breaks;
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
		// The plan's days are the answer to his question about the plan, and
		// a close names the day he picks up on (round 10: "Its review is
		// planned for tomorrow" refused in a close).
		const asksPlan = kind === "direct" && PLAN_QUESTION.test(this.input.words ?? "");
		const out = voiceBreaks(text, kind).filter((b) => !(b.rule === "plan" && (asksPlan || (kind === "close" && PLANNED_DAY.test(b.excerpt)))));
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
		const unsureEcho = replying && this.input.unsure ? restatesWithoutReason(text) : null;
		if (unsureEcho && !echo) out.push({ rule: "reason", excerpt: unsureEcho });
		const moral = kind === "direct" ? closingMoral(text) : null;
		if (moral) out.push({ rule: "moral", excerpt: moral });
		const recordWord = this.input.ruling ? recordConfidenceWord(text) : null;
		if (recordWord) out.push({ rule: "card-words", excerpt: recordWord });
		const sure = kind === "close" ? narratedConfidence(text) : null;
		if (sure) out.push({ rule: "confidence", excerpt: sure });
		if (this.owed && this.lengthDraft && !out.some((b) => b.rule === "length")) {
			const { words, clauses } = clausesOf(text);
			const draft = this.lengthDraft;
			if (clauses < draft.clauses && words > draft.words - draft.shortest) out.push({ rule: "length", excerpt: `joined: ${words} words where the draft had ${draft.words}, in fewer sentences` });
		}
		const asLesson = this.review ? SESSION_AS_LESSON.exec(text) : null;
		if (asLesson) out.push({ rule: "review-lesson", excerpt: asLesson[0] });
		const shownBefore = kind === "teach" ? this.shownBefore(text) : null;
		if (shownBefore) out.push({ rule: "repeat", excerpt: `display ${shownBefore}` });
		const boxed = restatingCallout(text);
		if (boxed) out.push({ rule: "repeat", excerpt: `callout ${quoted(boxed.said)}, said above as ${quoted(boxed.before)}` });
		return [...out, ...this.letters(text), ...this.repeats(text, true)];
	}

	private questionBreaks(text: string): VoiceBreak[] {
		const out = voiceBreaks(text).filter((b) => b.rule !== "headings");
		// A part he typed is the sheet's own and is posed in his words, all
		// of it, whatever it asks (round 12, 2 n5).
		const compound = compoundAsk(text);
		if (compound && !asksAreHis(text, this.input.words)) out.push(compound);
		const twice = reasonAskedTwice(text);
		if (twice) out.push({ rule: "reason-twice", excerpt: twice });
		const advice = [...new Set([...afterQuestion(text), ...adviceSentences(text)])];
		if (advice.length > 0) out.push({ rule: "advice", excerpt: advice.join(" ") });
		return [...out, ...this.letters(text), ...this.repeats(text)];
	}

	/** A demo brief that prints the formula a step not yet done is about:
	 *  the demo would hand him what the lesson is about to ask (round 12,
	 *  3 D1: the Poisson demo printed (1 − λ/n)^n beside e^{−λ} before the
	 *  limit was taught). Held back once a turn. */
	private judgeDemo(call: ToolCall): AgentToolResult<unknown> | null {
		if (this.heldDemo) return null;
		const brief = isRecord(call.arguments) ? [call.arguments.title, call.arguments.brief].filter((v) => typeof v === "string").join("\n") : "";
		const said = formulaKey(brief);
		const ahead = this.stepsAhead.find((step) => formulasOf(step.title).some((f) => f.length >= 5 && said.includes(f)));
		if (!ahead) return null;
		this.heldDemo = true;
		return DEMO_GIVES_AWAY(ahead.title);
	}

	/** A lesson question posed after he asked to guess first, or under the
	 *  tutor's own invitation to guess, that is not a prediction: his guess
	 *  would count as an attempt (round 12, 2 M1: "Go ahead, guess." and a
	 *  check, and his guess became the topic's open mistake). */
	private guessAsked(call: ToolCall, text: string): VoiceBreak[] {
		if (call.name !== "explain" || normalizeQuestionType(isRecord(call.arguments) ? call.arguments.type : undefined) === "predict") return [];
		if (this.input.guess) return [{ rule: "guess", excerpt: `he wrote "${this.input.guess}"` }];
		const invited = [...this.toldNow, text].map((t) => GUESS_INVITE.exec(t)?.[0]).find(Boolean);
		return invited ? [{ rule: "guess", excerpt: invited }] : [];
	}

	/** A matrix named with a letter an earlier one of the session has. */
	private letters(text: string): VoiceBreak[] {
		const reused = reusedLetter(text, [...this.earlier, ...this.said]);
		return reused ? [{ rule: "letter", excerpt: `${reused.letter} ${reused.written}` }] : [];
	}

	/** A matrix or display of a teaching step that he already read earlier
	 *  in the session, outside the question this turn answers: the step says
	 *  again what he was shown (round 8: the first teaching step re-taught
	 *  the probe's feedback on the same matrix). */
	private shownBefore(text: string): string | null {
		const mine = mathsShown(text, true);
		if (mine.length === 0) return null;
		const before = this.earlier.slice(0, this.answeredAt);
		const seen = new Set(before.flatMap((t) => mathsShown(t, false).map((m) => m.key)));
		const hit = mine.find((m) => seen.has(m.key));
		return hit ? hit.label : null;
	}

	/** Advice said earlier in the session, and for a message, a point it
 *  made earlier (round 9: one lesson said four times that pairs miss a
 *  combination of two others). A question may name what a message said. */
	private repeats(text: string, message = false): VoiceBreak[] {
		const repeat = repeatedAdvice(text, [...this.earlier, ...this.said]);
		if (repeat) return [{ rule: "repeat", excerpt: `${quoted(repeat.said)}, said before as ${quoted(repeat.before)}` }];
		// A close names what he picks up and its day, as its rule says, each
		// time he closes; a ruling is news (round 10: both refused as repeats).
		const pointsHeld = message && this.input.kind !== "close" && !this.input.ruling;
		const point = pointsHeld ? repeatedPoint(text, [...this.told, ...this.toldNow]) : null;
		return point ? [{ rule: "repeat", excerpt: `point ${quoted(point.said)}, said before as ${quoted(point.before)}` }] : [];
	}
}
