/**
 * Session → markdown — the session export's formatting engine (owner ruling
 * 2026-09-27): a session is rendered as clean, readable markdown — speaker
 * headers, quiz/check-in blocks, tool notes — with optional message-id
 * anchors; `anchors: false` mints the same document without them.
 *
 * Pure core: native messages in (LhMessage), string out. A failed tool
 * call renders nothing (retry context, not learning evidence); custom
 * markers are invisible, same as the view.
 */

import type { LhMessage } from "./native-messages.ts";
import {
	failedOutputCallIds,
	PRACTICE_CONCLUDE_TOOL,
	PRACTICE_PROBLEM_TOOL,
	problemInputForConclude,
	SEND_TO_USER_TOOL,
	userFacingTextOf,
} from "./native-messages.ts";
import type { ToolResultMessage } from "@earendil-works/pi-ai";
import { photosOf, photoSrc, type Photo } from "./photos.ts";
import { normalizeQuestionType } from "./question-core.ts";

/** How photos of his working render: `embed` puts each image in the file
 *  (the export), `note` says one is there (the lesson digest, whose
 *  reader needs the fact, not the bytes). */
export type MarkdownPhotos = "embed" | "note";

/** The photo lines for one message. */
function photoLines(photos: readonly Photo[], mode: MarkdownPhotos): string[] {
	if (photos.length === 0) return [];
	if (mode === "note") return ["*(with a photo of his handwritten working)*"];
	return photos.map((p, i) => `![Photo of the learner's working${photos.length > 1 ? ` ${i + 1}` : ""}](${photoSrc(p)})`);
}

/** The practice join context (owner-approved, 2026-10-06 export round):
 *  practice tool RESULTS are acks — the statement, outcome, and verdict
 *  all live in the assistant's call arguments, and the model solution
 *  commits at POSE time. The markdown blocks join them the same way the
 *  view seam folds cards (clean-only: a refused pose's result is errored
 *  and renders nothing before this join is ever reached). */
export interface MarkdownContext {
	messages: ReadonlyArray<LhMessage>;
	photos?: MarkdownPhotos;
	/** toolCallId → the call part's name + arguments. */
	calls: Map<string, { name: string; args: Record<string, unknown> | undefined }>;
	failedOutputCalls?: ReadonlySet<string>;
}

function markdownContext(messages: ReadonlyArray<LhMessage>): MarkdownContext {
	const calls: MarkdownContext["calls"] = new Map();
	for (const message of messages) {
		if ((message as { role?: string }).role !== "assistant") continue;
		const content = (message as { content?: unknown }).content;
		if (!Array.isArray(content)) continue;
		for (const part of content) {
			const block = part as { type?: string; id?: string; name?: string; arguments?: unknown };
			if (block.type === "toolCall" && typeof block.id === "string") {
				calls.set(block.id, {
					name: typeof block.name === "string" ? block.name : "",
					args: (block.arguments ?? undefined) as Record<string, unknown> | undefined,
				});
			}
		}
	}
	return { messages, calls, failedOutputCalls: failedOutputCallIds(messages) };
}

/** solvedWithHints → "Solved with hints" — the outcome enum reads as prose. */
function outcomeLabel(outcome: string): string {
	const spaced = outcome.replace(/([a-z])([A-Z])/g, (_, lo: string, hi: string) => `${lo} ${hi.toLowerCase()}`);
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Whether an explain result answered a question asked as a prediction. */
function predictedAnswer(result: ToolResultMessage, ctx: MarkdownContext): boolean {
	return result.toolName === "explain" && normalizeQuestionType(ctx.calls.get(result.toolCallId)?.args?.type) === "predict";
}

/** Everything the learner wrote in these messages, in order: his messages
 *  and his answers to the tutor's questions, each marked when it answered a
 *  prediction. What the lesson digest's gaps must quote (lesson-digest.ts). */
export function learnerWords(messages: ReadonlyArray<LhMessage>): { text: string; predicted: boolean }[] {
	const ctx = markdownContext(messages);
	const words: { text: string; predicted: boolean }[] = [];
	const add = (text: unknown, predicted: boolean) => {
		if (typeof text === "string" && text.trim()) words.push({ text: text.trim(), predicted });
	};
	for (const message of messages) {
		if (message.role === "user") for (const text of userFacingTextOf((message as { content: unknown }).content)) add(text, false);
		else if (message.role === "custom" && (message as { customType?: string }).customType === "practice-thinking") add((message as { details?: { text?: unknown } }).details?.text, false);
		else if (message.role === "toolResult" && !message.isError && ["explain", "recall", "ask_user_question"].includes(message.toolName)) {
			const out = message.details as { text?: unknown; note?: unknown; other?: unknown } | undefined;
			const predicted = predictedAnswer(message, ctx);
			for (const text of [out?.text, out?.note, out?.other]) add(text, predicted);
		}
	}
	return words;
}

/** One tool result's learner-visible outcome, rendered as body lines. */
function toolResultBody(result: ToolResultMessage, ctx?: MarkdownContext): { heading: string; body: string[] } {
	const out = result.details as
		| Partial<{
				questionText: string;
				note: string;
				text: string;
				answers: string[];
				other: string;
				dismissed: boolean;
				reason: string;
		  }>
		| undefined;

	if (result.toolName === "explain" || result.toolName === "recall") {
		// A prediction says so wherever the lesson is read back: the digest
		// once wrote one's miss as the topic's gap (round 8, 1 D2).
		const predicted = ctx !== undefined && predictedAnswer(result, ctx);
		const heading = result.toolName === "recall" ? "Recall" : predicted ? "Prediction" : "Recall check"; // explain — the teach free-recall name
		const question = typeof out?.questionText === "string" && out.questionText ? out.questionText : "(no question text)";
		const body = [`**Q:** ${question}`];
		if (predicted) body.push("Asked before the teaching: a prediction never counts, and its miss is never a gap.");
		if ((result.details as { showMe?: unknown } | undefined)?.showMe === true) body.push("The learner pressed Show me: he gave up on it and was shown the answer.");
		if (out?.dismissed === true && out.reason === "tonight") body.push("The learner stopped for today before answering; the answer was not shown.");
		else if (out?.dismissed === true && out.reason === "asked") body.push("The learner asked something before answering; the check was asked again.");
		else if (out?.dismissed === true) body.push("The learner skipped this check.");
		else if (typeof out?.text === "string" && out.text.trim()) body.push(`The learner answered in his own words: ${out.text.trim()}`);
		if (typeof out?.note === "string" && out.note) body.push(`*(his thinking: ${out.note})*`);
		body.push(...photoLines(photosOf(result.content), ctx?.photos ?? "note"));
		return { heading, body };
	}

	if (ctx !== undefined && result.toolName === PRACTICE_PROBLEM_TOOL) {
		const statement = ctx.calls.get(result.toolCallId)?.args?.statement;
		return {
			heading: "Problem",
			body: [typeof statement === "string" && statement.trim() ? statement.trim() : "(no statement)"],
		};
	}

	if (ctx !== undefined && result.toolName === PRACTICE_CONCLUDE_TOOL) {
		const args = ctx.calls.get(result.toolCallId)?.args;
		const outcome = typeof args?.outcome === "string" && args.outcome.trim() ? args.outcome.trim() : "";
		const verdict = typeof args?.verdict === "string" && args.verdict.trim() ? args.verdict.trim() : undefined;
		if (outcome === "dismissed") return { heading: "Concluded", body: ["The learner skipped this problem."] };
		const label = outcome !== "" ? `**${outcomeLabel(outcome)}.**` : "**Concluded.**";
		const body = [verdict !== undefined ? `${label} ${verdict}` : label];
		// The reveal (owner round, 2026-10-05): the solution committed at
		// pose time — the newest cleanly-posed problem before this conclude.
		const input = problemInputForConclude(ctx.messages, result.toolCallId);
		const solution = typeof input?.modelSolution === "string" && input.modelSolution.trim() ? input.modelSolution.trim() : undefined;
		if (solution !== undefined) body.push(`> **Model solution**\n>\n> ${solution.replace(/\n/g, "\n> ")}`);
		return { heading: "Concluded", body };
	}

	if (result.toolName === "ask_user_question") {
		const question = typeof out?.questionText === "string" && out.questionText ? out.questionText : "(no question text)";
		const body = [`**Q:** ${question}`];
		const chosen = [
			...(Array.isArray(out?.answers) ? out!.answers! : []),
			...(typeof out?.other === "string" && out.other.trim() ? [out.other.trim()] : []),
		];
		if (typeof out?.text === "string" && out.text.trim()) body.push(`The learner answered: ${out.text.trim()}`);
		else if (chosen.length > 0) body.push(`The learner chose: ${chosen.join(", ")}`);
		else if (out?.dismissed === true && out.reason === "tonight") body.push("The learner stopped for today before answering.");
		else if (out?.dismissed === true && out.reason === "asked") body.push("The learner asked something before answering; the question was asked again.");
		else if (out?.dismissed === true) body.push("The learner skipped this question.");
		if (typeof out?.note === "string" && out.note) body.push(`*(his thinking: ${out.note})*`);
		body.push(...photoLines(photosOf(result.content), ctx?.photos ?? "note"));
		return { heading: "Question", body };
	}

	// Parity with the line builder: other clean tool results are one line.
	return { heading: "Tool", body: [`*${result.toolName} result delivered*`] };
}

/**
 * ONE message as a markdown block — `null` when the message renders
 * nothing (a failed tool call, a bare marker, an empty text part set).
 * `mid` is the provenance anchor shown when `anchors` is on.
 */
export function messageMarkdown(
	message: LhMessage,
	mid: string,
	anchors = true,
	ctx?: MarkdownContext,
): string | null {
	const role = (message as { role?: string }).role;
	const anchor = anchors ? ` · ${mid}` : "";
	const parts: string[] = [];

	if (role === "user") {
		const content = (message as { content: unknown }).content;
		const texts = userFacingTextOf(content).map((text) => text.trim());
		const photos = photoLines(photosOf(content), ctx?.photos ?? "note");
		if (photos.length > 0) parts.push(`### Learner${anchor}\n\n${[...texts, ...photos].join("\n\n")}`);
		else for (const text of texts) parts.push(`### Learner${anchor}\n\n${text}`);
	} else if (role === "custom" && (message as { customType?: string }).customType === "practice-thinking" && (message as { images?: Photo[] }).images?.length) {
		// A practice submission with photos: the photo needs its words
		// beside it. Submissions without one stay invisible, as markers are.
		const text = ((message as { details?: { text?: unknown } }).details?.text ?? "") as string;
		const body = [...(typeof text === "string" && text.trim() ? [text.trim()] : []), ...photoLines((message as { images: Photo[] }).images, ctx?.photos ?? "note")];
		parts.push(`### Learner's working${anchor}\n\n${body.join("\n\n")}`);
	} else if (role === "assistant") {
		for (const text of userFacingTextOf((message as { content: unknown }).content, ctx?.failedOutputCalls ?? failedOutputCallIds([message]))) {
			parts.push(`### Teacher${anchor}\n\n${text.trim()}`);
		}
	} else if (role === "toolResult") {
		const result = message as ToolResultMessage;
		if (result.isError || result.toolName === SEND_TO_USER_TOOL) return null; // retry context or output ack, not learning evidence
		const { heading, body } = toolResultBody(result, ctx);
		parts.push(`### ${heading}${anchor}\n\n${body.join("\n\n")}`);
	}

	// custom markers are invisible, same as the extraction view.
	return parts.length > 0 ? parts.join("\n\n") : null;
}

/**
 * A whole session (or one extraction BATCH — same engine, subset of
 * messages) as one markdown document. Blocks render in message order;
 * messages that render nothing are skipped silently. The optional title
 * mints the document header (`# <title>`).
 */
export function sessionMarkdown(
	messages: ReadonlyArray<LhMessage>,
	opts: { title?: string; anchors?: boolean; photos?: MarkdownPhotos } = {},
): string {
	const blocks: string[] = [];
	if (opts.title !== undefined && opts.title.length > 0) blocks.push(`# ${opts.title}`);
	const ctx = { ...markdownContext(messages), photos: opts.photos ?? "note" };
	for (const message of messages) {
		const block = messageMarkdown(message, (message as { id?: string }).id ?? "", opts.anchors ?? true, ctx);
		if (block !== null) blocks.push(block);
	}
	return blocks.join("\n\n");
}
