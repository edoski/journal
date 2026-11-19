/**
 * THE NATIVE MESSAGE RECORD (Wave B, owner-approved 2026-09-26): chat
 * records store pi's own message shapes — the exact history the agent
 * loop builds — instead of AI-SDK UIMessages. Provider, model, usage,
 * stopReason, and thinking signatures are stamped by pi itself; replay is
 * `state.messages = record.messages` + `continue()` — the record IS the
 * agent state.
 *
 * WHY pi MESSAGES LACK OUR `id`: pi's session format gives every ENTRY an
 * id, never the message. This app needs a per-message id for client
 * identity (React keys, append-only adoption, the continuation seam), so
 * every record message carries ONE extra field — `id` — alongside the
 * native shape. `toLlmMessages` strips it at the wire: the provider never
 * sees it (verified single site, below).
 *
 * UI-ONLY CONTENT (owner ruling, fork 1 + the plan's custom-message
 * taxonomy): the probe→teach handoff, sub-agent steers,
 * and plan blocks are LhMarkerMessage — this app's declaration-merged
 * member of pi-agent-core's CustomAgentMessages extension point, shaped
 * exactly like pi's own CustomMessage ({role:"custom", customType,
 * content, display, details}). ONE seam — toLlmMessages, wired as the
 * agent's convertToLlm — owns every model-facing decision: markers
 * flatten to their canonical user text (single-sourced in
 * core/contracts), plan blocks are UI-only and filtered, and dangling
 * tool calls (an aborted turn) get the interrupted-result synthesis the
 * provider protocol demands.
 *
 * Answers (fork 1, owner 2026-09-26): the learner's answer IS the tool
 * call's ToolResultMessage — appended natively at answer time. The
 * synthetic "question posed" placeholder is an in-memory loop device
 * (Wave A's terminate) and is never persisted: the record ends at the
 * unanswered call in the pose→answer window, where no turn can run (the
 * question gate holds steers; a POST would 409).
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { sameQuestionKey } from "./shown-help.ts";
import type { AssistantMessage, Message, ToolCall, ToolResultMessage, UserMessage } from "@earendil-works/pi-ai";
import { QUESTION_TOOLS, type PendingQuestion } from "./pending.ts";
import {
	CONCLUDE_ACK_TEXT,
	DONE_TONIGHT_TEXT,
	HANDOFF_TEXT,
	REVIEW_HANDOFF_TEXT,
	TASK_HANDOFF_TEXT,
	taskContinueText,
	MODE_HANDOFF_TEXT,
	NEXT_PROBLEM_TEXT,
	PRACTICE_REQUEST_TEXT,
	hintRungText,
	probeFeedbackText,
	THINKING_LABEL,
	type PracticeRequest,
	type SessionMode,
	disputeText,
} from "./contracts/chat.ts";
import { LESSON_PROGRESS_TOOL, lessonProgressOf } from "./contracts/plan.ts";
import { compactAnswerForModel, normalizeQuestionType, type QuestionAnswerData } from "./question-core.ts";
import { chosenConfidence, type Confidence } from "./contracts/course.ts";
import type { MarkResult } from "./contracts/marks.ts";
import { parseQuestionInput } from "./tool-parts.ts";
import { PHOTO_ONLY_TEXT, WORKING_PHOTO_NOTE, type Photo } from "./photos.ts";

// ─── The record's message type ───────────────────────────────────────────────

/**
 * The app's custom message (declaration-merged into pi-agent-core's
 * CustomAgentMessages below). Shaped like pi's own CustomMessage —
 * `content` is the MODEL-facing text (single-sourced in core/contracts,
 * never fake human speech), `details` is the UI payload (never
 * model-visible), `display` marks messages the UI renders (our projection
 * keys rendering on customType; the flag documents intent).
 */
export interface LhMarkerMessage {
	/** Record identity (pi messages carry no id — see the file header). */
	id: string;
	role: "custom";
	customType:
		// Older sessions started from picks on the retired knowledge map.
		| "graph-context"
		| "course-context"
		| "probe-handoff"
		| "session-mode"
		| "mode-handoff"
		| "subagent-steer"
		| "subagent-abort"
		| "plan-block"
		| "practice-thinking"
		| "practice-next"
		| "practice-request"
		| "done-tonight"
		| "task-continue"
		| "dispute"
		| "problem-dismissed"
		| "compaction"
		| "session-resume"
		| "ungraded-answer"
		| "asked";
	/** The model-facing text ("" for plan blocks — UI-only). */
	content: string;
	display: boolean;
	/** The UI payload — per-customType, never model-visible. */
	details: unknown;
	/** Photos of his handwritten working (photos.ts), model-facing like
	 *  `content`: toLlmMessages sends them after it. A practice
	 *  submission's only. */
	images?: Photo[];
	timestamp: number;
}

declare module "@earendil-works/pi-agent-core" {
	interface CustomAgentMessages {
		lhMarker: LhMarkerMessage;
	}
}

/** A record message: a native pi message (or our marker) plus the record id. */
export type LhMessage = (UserMessage | AssistantMessage | ToolResultMessage | LhMarkerMessage) & { id: string };

/** A record message list is assignable to the agent's context — that IS
 *  the replay (ui-stream/chat-handler assign it to initialState.messages). */
export function asAgentMessages(messages: readonly LhMessage[]): AgentMessage[] {
	return messages as unknown as AgentMessage[];
}

// ─── explicit learner-facing output ─────────────────────────────────────────

export const SEND_TO_USER_TOOL = "send_to_user";

/** Read the output tool's message without changing the native call. Also
 * accepts partial arguments while streaming; malformed/empty inputs carry
 * no prose. This projection is independent of the currently selected model. */
export function sendToUserText(block: unknown): string | undefined {
	if (!block || typeof block !== "object") return undefined;
	const call = block as { type?: unknown; name?: unknown; arguments?: unknown };
	if (call.type !== "toolCall" || call.name !== SEND_TO_USER_TOOL) return undefined;
	if (!call.arguments || typeof call.arguments !== "object") return undefined;
	const message = (call.arguments as { message?: unknown }).message;
	return typeof message === "string" && message.trim() ? message : undefined;
}

/** Learner-facing prose, in content order. Only the explicit output tool
 * joins ordinary text here — thinking and all other tool inputs stay out.
 * Shared by coverage/extraction and Markdown; native history stays intact. */
export function userFacingTextOf(content: unknown, failedOutputCalls?: ReadonlySet<string>): string[] {
	if (typeof content === "string") return content.trim() ? [content] : [];
	if (!Array.isArray(content)) return [];
	const out: string[] = [];
	for (const block of content) {
		if (!block || typeof block !== "object") continue;
		if (block.type === "toolCall" && failedOutputCalls?.has(block.id)) continue;
		const text = block.type === "text" ? block.text : sendToUserText(block);
		if (typeof text === "string" && text.trim()) out.push(text);
	}
	return out;
}

/** Failed output calls remain retry context, not delivered teaching.
 * Truncated calls can have valid-looking partial arguments. Failed/aborted
 * generations do not execute their calls at all, so may have no result. */
export function failedOutputCallIds(messages: readonly LhMessage[]): ReadonlySet<string> {
	const failed = new Set<string>();
	for (const message of messages) {
		if (message.role === "toolResult" && message.toolName === SEND_TO_USER_TOOL && message.isError) {
			failed.add(message.toolCallId);
		} else if (message.role === "assistant" && (message.stopReason === "error" || message.stopReason === "aborted")) {
			for (const block of message.content) {
				if (block.type === "toolCall" && block.name === SEND_TO_USER_TOOL) failed.add(block.id);
			}
		}
	}
	return failed;
}

// ─── id minting ──────────────────────────────────────────────────────────────

/** The app-wide message id shape (same as the UIMessage-era mint). */
export function newMessageId(): string {
	return `msg_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

// ─── constructors (the input-event → native append mapping lives in
//     core/input-events.ts; steers in core/contracts/jobs.ts) ─────────────────

/** A learner-authored user message (text input, verdict note). */
export function newUserMessage(text: string, photos?: readonly Photo[]): LhMessage & UserMessage {
	return {
		id: newMessageId(),
		role: "user",
		content: withPhotos(text, photos),
		timestamp: Date.now(),
	};
}

/** A user message's content: the plain string, or with photos his words
 *  (when he typed any) followed by the image parts. */
function withPhotos(text: string, photos?: readonly Photo[]): UserMessage["content"] {
	if (!photos?.length) return text;
	return [...(text.trim() ? [{ type: "text" as const, text }] : []), ...photos.map((p) => ({ type: "image" as const, data: p.data, mimeType: p.mimeType }))];
}

/** A steered user message (mid-turn composer steering, owner 2026-10-03):
 *  a plain user message with the CLIENT-minted steer id — the same object
 *  rides agent.steer(), the live stream's message events, and the settled
 *  record, so the optimistic queued indicator and the transcript card
 *  upsert by one identity. */
export function newUserSteer(text: string, id: string, photos?: readonly Photo[]): LhMessage & UserMessage {
	return { id, role: "user", content: withPhotos(text, photos), timestamp: Date.now() };
}

/** The learner's answer — the question call's tool result (fork 1).
 *  TWO AUDIENCES (owner, tool-result diet 2026-10-02): the MODEL sees the
 *  compact learner-only record (compactAnswerForModel — the call's own
 *  arguments already carry the question/options/explanation/commitment;
 *  restating them doubled every answer's tokens), while `details` keeps
 *  the FULL graded QuestionAnswerData for the record and the UI. */
export function newAnswerResult(
	toolCallId: string,
	toolName: string,
	answer: unknown,
	photos?: readonly Photo[],
): LhMessage & ToolResultMessage {
	// A photo of his working rides the result as image parts after the
	// answer, and the answer says it is there.
	// An answer to a graded question carries its id first: the attempt the
	// tutor saves names it (`question`), so his card shows that mark.
	const compact = GRADED_QUESTION_TOOLS.includes(toolName) && isRealAnswer(answer) ? { question: toolCallId, ...compactAnswerForModel(answer as QuestionAnswerData) } : compactAnswerForModel(answer as QuestionAnswerData);
	if (photos?.length) compact.photo = WORKING_PHOTO_NOTE;
	return {
		id: newMessageId(),
		role: "toolResult",
		toolCallId,
		toolName,
		content: [{ type: "text", text: JSON.stringify(compact) }, ...(photos ?? []).map((p) => ({ type: "image" as const, data: p.data, mimeType: p.mimeType }))],
		// 0.87.1 narrowed ToolResultMessage.details to JsonRepresentation —
		// our payloads are JSON-safe answer structures, so the cast is honest.
		details: answer as ToolResultMessage["details"],
		isError: false,
		timestamp: Date.now(),
	};
}

/** The probe→teach handoff wake: scaffolding, not speech — the model reads
 *  HANDOFF_TEXT, with a review's own line in a review, or TASK_HANDOFF_TEXT
 *  in a session that continues an open task, and the UI renders the quiet
 *  system line. */
export function newHandoffMessage(chatId: string, review = false, task = false): LhMarkerMessage {
	return {
		id: `steer_probe_${chatId}`,
		role: "custom",
		customType: "probe-handoff",
		content: task ? TASK_HANDOFF_TEXT : review ? `${HANDOFF_TEXT} ${REVIEW_HANDOFF_TEXT}` : HANDOFF_TEXT,
		display: true,
		details: { chatId },
		timestamp: Date.now(),
	};
}

/** The probe-handoff wake as the teacher reads it: its text, then what
 *  the probe's last answer got, read from `record`, where the probe's
 *  turn has landed (`probeFeedbackText`). Every other steer as it is. */
export function withProbeFeedback<T extends LhMessage>(steer: T, record: readonly LhMessage[]): T {
	if (steer.role !== "custom" || steer.customType !== "probe-handoff" || typeof steer.content !== "string") return steer;
	const line = probeFeedbackText(probeFeedbackOf(record));
	return line ? { ...steer, content: `${steer.content} ${line}` } : steer;
}

/** What the tutor told him after his last answer to a question: its
 *  messages, as he read them. Null when no answer came. Pure. */
export function probeFeedbackOf(messages: readonly LhMessage[]): string[] | null {
	const at = messages.findLastIndex((m) => m.role === "toolResult" && (QUESTION_TOOLS as readonly string[]).includes(m.toolName) && !m.isError && isRealAnswer(m.details));
	if (at < 0) return null;
	const failed = failedOutputCallIds(messages);
	return messages.slice(at + 1).flatMap((m) =>
		m.role !== "assistant" ? [] : m.content.flatMap((b) => (b.type === "toolCall" && b.name === SEND_TO_USER_TOOL && !failed.has(b.id) ? [sendToUserText(b)].filter((t): t is string => !!t?.trim()) : [])),
	);
}

// ─── the session's mode: teaching or practice ───────────────────────────────

/** The handoff tools, by the mode each one switches the session to. */
export const MODE_HANDOFF_TOOLS: Readonly<Record<string, SessionMode>> = { practice: "practice", teach: "teach" };

/** The mode a session starts in, chosen at creation (Current design's
 *  Teach/Practice switch). UI-only: the model never sees it, since the
 *  agent's system prompt already says what it runs. */
export function newSessionModeMessage(mode: SessionMode): LhMarkerMessage {
	return {
		id: newMessageId(),
		role: "custom",
		customType: "session-mode",
		content: "",
		display: false,
		details: { mode },
		timestamp: Date.now(),
	};
}

/** The wake a handoff queues: it starts the new mode's agent, which reads
 *  the handoff call's arguments above it. One per handoff call. */
export function newModeHandoffMessage(chatId: string, toolCallId: string, mode: SessionMode): LhMarkerMessage {
	return {
		id: `steer_mode_${toolCallId}`,
		role: "custom",
		customType: "mode-handoff",
		content: MODE_HANDOFF_TEXT[mode],
		display: true,
		details: { chatId, mode },
		timestamp: Date.now(),
	};
}

/** Walks the transcript's mode: `written[i]` is the mode message i was
 *  written in, `now` the mode after the last one. `initial` is a record's
 *  stored `kind` (sessions made before modes followed the transcript),
 *  else teach. A session-mode marker sets the mode; a handoff call
 *  switches it from its successful result on. A call from a failed or
 *  aborted generation, an error result or a refusal (`details.ok: false`)
 *  switches nothing. */
function foldModes(messages: readonly LhMessage[], initial: SessionMode): { written: SessionMode[]; now: SessionMode } {
	let mode = initial;
	const calls = new Map<string, SessionMode>();
	const written = messages.map((m) => {
		const at = mode;
		if (m.role === "custom" && m.customType === "session-mode") {
			mode = (m.details as { mode?: unknown } | null)?.mode === "practice" ? "practice" : "teach";
			return mode;
		}
		if (m.role === "assistant" && m.stopReason !== "error" && m.stopReason !== "aborted") {
			for (const block of m.content) {
				if (block.type === "toolCall" && MODE_HANDOFF_TOOLS[block.name]) calls.set(block.id, MODE_HANDOFF_TOOLS[block.name]!);
			}
		} else if (m.role === "toolResult" && !m.isError && (m.details as { ok?: unknown } | null | undefined)?.ok !== false) {
			const target = calls.get(m.toolCallId);
			if (target && MODE_HANDOFF_TOOLS[m.toolName] === target) mode = target;
		}
		return at;
	});
	return { written, now: mode };
}

/** The mode each message was written in, index for index. */
export function sessionModesOf(messages: readonly LhMessage[], initial: SessionMode = "teach"): SessionMode[] {
	return foldModes(messages, initial).written;
}

/** The mode the session is in now: the one its next turn runs. */
export function sessionModeOf(messages: readonly LhMessage[], initial: SessionMode = "teach"): SessionMode {
	return foldModes(messages, initial).now;
}

/** The opening of a fresh session that picks up a finished lesson
 *  (`from`): model-facing (sessionResumeText), and it stands for the
 *  concluded probe and the plan, which the record's tree carries over. It
 *  also carries the open tasks the lesson held, so the new session holds
 *  them from its first message. */
export function newSessionResumeMessage(from: { id: string; title: string }, text: string, tasks: readonly string[]): LhMarkerMessage {
	return {
		id: `resume_${from.id}_${newMessageId()}`,
		role: "custom",
		customType: "session-resume",
		content: text,
		display: true,
		details: { from: from.id, title: from.title, tasks: [...tasks] },
		timestamp: Date.now(),
	};
}

/** Does the session pick up an earlier lesson (a session-resume opening)? */
export function resumesLesson(messages: readonly LhMessage[]): boolean {
	return messages.some((m) => m.role === "custom" && m.customType === "session-resume");
}

/** The plan presentation block: pure UI history (a frozen snapshot), no
 *  model face — toLlmMessages filters it. `planCallId` keys idempotent
 *  emission (one block per successful plan_init call). */
export function newPlanBlockMessage(
	planCallId: string,
	block: unknown,
): LhMarkerMessage {
	return {
		id: `pb_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`,
		role: "custom",
		customType: "plan-block",
		content: "",
		display: true,
		details: { planCallId, block },
		timestamp: Date.now(),
	};
}

// ─── practice sessions (owner, 2026-10-04) ───────────────────────────────────

/** The practice agent's two tools (the conclude-before-next-problem gate's
 *  vocabulary — the tool-execute layer owns the tools themselves). */
export const PRACTICE_PROBLEM_TOOL = "problem";
export const PRACTICE_CONCLUDE_TOOL = "conclude";

/** The course brief marker (core/course-brief.ts): the learner's course
 *  record as the lesson's agent sees it without asking. `details.key`
 *  decides when a fresh brief is due. Model-facing only: the view renders
 *  nothing for it. */
export function newCourseContextMessage(text: string, key: string): LhMarkerMessage {
	return {
		id: newMessageId(),
		role: "custom",
		customType: "course-context",
		content: text,
		display: false,
		details: { key },
		timestamp: Date.now(),
	};
}

/** The key of the latest course brief the agent can still see: none once
 *  a compaction summarized it away. */
export function visibleCourseBriefKey(messages: readonly LhMessage[]): string | null {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i]!;
		if (m.role !== "custom") continue;
		if (m.customType === "compaction") return null;
		if (m.customType === "course-context") {
			const key = (m.details as { key?: unknown } | null)?.key;
			return typeof key === "string" ? key : null;
		}
	}
	return null;
}

/** How many Hint requests this problem has had so far. */
export function hintsAsked(messages: readonly LhMessage[], problemCallId: string): number {
	return messages.filter((m) => {
		if (m.role !== "custom" || m.customType !== "practice-request") return false;
		const d = m.details as Partial<PracticeRequestDetails> | null;
		return d?.problemCallId === problemCallId && d.request === "hint";
	}).length;
}

/** Whether he gave this problem up: he pressed Show me or Explain
 *  instead on it. Both end it (`PRACTICE_REQUEST_TEXT`), so nothing is
 *  left for him to answer while the tutor concludes it. */
export function gaveUpOn(messages: readonly LhMessage[], problemCallId: string): boolean {
	return messages.some((m) => {
		if (m.role !== "custom" || m.customType !== "practice-request") return false;
		const d = m.details as Partial<PracticeRequestDetails> | null;
		return d?.problemCallId === problemCallId && (d.request === "show" || d.request === "explain");
	});
}

/** The learner's thinking submission (ONE send lane, owner round
 *  2026-10-05): the register is no longer declared by a button — the
 *  model READS the text to tell working traces from claimed answers. The
 *  content label is the single "Your thinking"; `details` keeps the raw
 *  payload for the transcript card. One problem may carry many
 *  submissions. `confidence` is the learner's one-tap read of the
 *  submission, kept only when he chose one (`chosenConfidence`). */
export function newThinkingMessage(problemCallId: string, text: string, picked?: Confidence, photos?: readonly Photo[]): LhMarkerMessage {
	const confidence = chosenConfidence(picked);
	const typed = text.trim() ? text : photos?.length ? PHOTO_ONLY_TEXT : text;
	return {
		id: newMessageId(),
		role: "custom",
		customType: "practice-thinking",
		content: `${THINKING_LABEL}:\n${typed}${photos?.length ? `\n\n${WORKING_PHOTO_NOTE}` : ""}${confidence ? `\n\nConfidence: ${confidence}` : ""}`,
		display: true,
		details: { problemCallId, text, ...(confidence ? { confidence } : {}) },
		...(photos?.length ? { images: photos.map((p) => ({ type: "image" as const, data: p.data, mimeType: p.mimeType })) } : {}),
		timestamp: Date.now(),
	};
}

/** A practice request (the dock's Hint, Show me and Explain instead):
 *  never an answer. `details.request` names it for the record and the
 *  transcript; `text` is any work he had written when he pressed it. */
export interface PracticeRequestDetails {
	problemCallId: string;
	request: PracticeRequest;
	text?: string;
}

/** `nth`: which hint on this problem a Hint request is (1 for the first). */
export function newPracticeRequestMessage(problemCallId: string, request: PracticeRequest, text?: string, nth = 1): LhMarkerMessage {
	const work = text?.trim();
	const head = request === "hint" ? `${PRACTICE_REQUEST_TEXT.hint} ${hintRungText(nth)}` : PRACTICE_REQUEST_TEXT[request];
	return {
		id: newMessageId(),
		role: "custom",
		customType: "practice-request",
		content: work ? `${head}\n\nHis work so far:\n${work}` : head,
		display: true,
		details: { problemCallId, request, ...(work ? { text: work } : {}) } satisfies PracticeRequestDetails,
		timestamp: Date.now(),
	};
}

/** The learner's explicit move-on signal (owner round 16): appended by
 *  the next input (the composer band's chip, or Enter on an empty
 *  composer during the between-problems pause). The content is the
 *  single-sourced NEXT_PROBLEM_TEXT — the model's unambiguous go-ahead;
 *  the transcript renders its own compact line off the marker (never
 *  the content). */
export function newNextMessage(): LhMarkerMessage {
	return {
		id: newMessageId(),
		role: "custom",
		customType: "practice-next",
		content: NEXT_PROBLEM_TEXT,
		display: true,
		details: {},
		timestamp: Date.now(),
	};
}

/** The marker for an answer whose grading turn was cut (`ungradedAnswerOf`). */
export const UNGRADED_ANSWER = "ungraded-answer";

/**
 * A graded answer he gave whose turn stopped before the tutor graded it
 * (round 3: a stop right after a confident wrong answer left it unrecorded
 * unless he pressed Try again). He answered and the question showed him its
 * answer, so by the engine's rules it is an attempt, and the record must
 * hold it whatever he does next. The question he answered, when the newest
 * graded answer (a check or a recall, never a prediction, which is not
 * graded) has no save that went through after it and every reply since was
 * cut; else null. Pure.
 */
export function ungradedAnswerOf(messages: readonly LhMessage[]): string | null {
	const at = messages.findLastIndex((m) => m.role === "toolResult" && (m.toolName === "explain" || m.toolName === "recall") && !m.isError && !isDismissedResult(m));
	if (at < 0) return null;
	const result = messages[at] as ToolResultMessage;
	const call = messages
		.slice(0, at)
		.flatMap((m) => (m.role === "assistant" ? m.content : []))
		.find((b) => b.type === "toolCall" && b.id === result.toolCallId);
	if (!call || call.type !== "toolCall" || !questionNeedsGrade(call.arguments)) return null;
	const after = messages.slice(at + 1);
	const clean = cleanToolCallIds(after);
	for (const m of after) {
		if (m.role !== "assistant") continue;
		if (m.stopReason !== "aborted" && m.stopReason !== "error") return null;
		if (m.content.some((b) => b.type === "toolCall" && b.name === "course_save" && clean.has(b.id))) return null;
	}
	const question = (result.details as { questionText?: unknown } | null)?.questionText;
	return typeof question === "string" ? question : "";
}

/** A question whose answer is graded: every check and recall but a
 *  prediction. */
function questionNeedsGrade(input: unknown): boolean {
	const type = (input as { type?: unknown } | null)?.type;
	return !(typeof type === "string" && type.replace(/["']/g, "").trim() === "predict");
}

/** The note riding his next input after `ungradedAnswerOf`: grade and save
 *  that answer first. Model-facing only. */
export function newUngradedAnswerMessage(question: string): LhMarkerMessage {
	const which = question ? ` to "${question}"` : "";
	return {
		id: newMessageId(),
		role: "custom",
		customType: UNGRADED_ANSWER,
		content: `[UNGRADED ANSWER] His answer${which} was submitted and its answer shown to him, but your turn stopped before you graded it. It is an attempt, not a question left open: grade it and save it with course_save in this turn, before anything else, then answer what follows. The mark the save puts under his answer tells him it came through, so never say it arrived or was received.`,
		display: false,
		details: {},
		timestamp: Date.now(),
	};
}

/**
 * His work on the open problem that no reply has answered yet: his newest
 * input on it is his work, and no reply since ended its turn (each one
 * stopped, failed, or is a step of the turn Done for today stops). By the
 * rule Done for today states, an answer he sent before pressing it is
 * still graded, so this problem is graded, not dropped (round 13, 4 M2:
 * ⌘⇧D 2.5 s after a right answer dropped the problem, and the closing
 * turn saved the attempt on no card and without his Guessing). A reply
 * with no words and no call, thinking at most, answered nothing (round
 * 15, M4: the cut grading turn left an empty reply that read as ended,
 * and the answer was dropped). Pure.
 */
export function workAwaitingGradeOf(messages: readonly LhMessage[], problemCallId: string): boolean {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i]!;
		if (m.role === "user") return false;
		if (m.role === "assistant") {
			if (m.content.some((b) => b.type === "toolCall" && b.id === problemCallId)) return false;
			if (!m.content.some((b) => (b.type === "text" && b.text.trim() !== "") || b.type === "toolCall")) continue;
			if (m.stopReason !== "aborted" && m.stopReason !== "error" && m.stopReason !== "toolUse") return false;
			continue;
		}
		if (m.role !== "custom") continue;
		if ((m.details as { problemCallId?: unknown } | null)?.problemCallId !== problemCallId) continue;
		if (m.customType === "practice-thinking") return true;
		if (m.customType === "practice-request") return false;
	}
	return false;
}

/** The note Done for today carries for `workAwaitingGradeOf`: grade his
 *  work through `conclude`, so the attempt is saved with his confidence
 *  and its card shows the mark. Model-facing only. */
export function newUngradedWorkMessage(): LhMarkerMessage {
	return {
		id: newMessageId(),
		role: "custom",
		customType: UNGRADED_ANSWER,
		content:
			"[UNGRADED WORK] His work on the open problem was sent before he pressed Done for today, and your turn stopped before you answered it, so that problem is still open, not dropped. Grade it now with `conclude`, as you would have: a claimed answer concludes with its result, and the attempt is saved with the confidence he gave it; work that claims no answer concludes `movedOn` with `result: null`, and nothing is recorded. Never save it with course_save. Then close as the next message says.",
		display: false,
		details: {},
		timestamp: Date.now(),
	};
}

/** The questions Done for today left open, posed again once the close
 *  has settled (`leftQuestionRepose`): an app-made message whose calls ask
 *  each one as the tutor posed it, its tool and arguments, under a new id,
 *  so the box serves it after Resume as before Done (round 12, 3 n10). The
 *  model reads it as a note beside his answer (sdk-session.ts). */
export function newQuestionRepose(calls: ReadonlyArray<{ tool: string; input: ToolCall["arguments"] }>): LhMessage & AssistantMessage {
	return {
		id: newMessageId(),
		role: "assistant",
		content: calls.map((call) => ({ type: "toolCall" as const, id: `call_again_${newMessageId()}`, name: call.tool, arguments: call.input })),
		timestamp: Date.now(),
		...syntheticStamps(REPOSE_MODEL),
	};
}

const REPOSE_MODEL = "synthetic-repose";

/** Whether a message is the app's re-pose of his left questions
 *  (`newQuestionRepose`). */
export function isQuestionRepose(m: LhMessage): boolean {
	return m.role === "assistant" && m.provider === "synthetic" && m.model === REPOSE_MODEL;
}

/** The note riding a message he sent from Ask (round 5: an answer typed
 *  while Ask stayed on was graded, with an earlier note's confidence):
 *  what follows is a question to the tutor, never an answer. Model-facing
 *  only. */
export function newAskedMessage(open: "question" | "problem"): LhMarkerMessage {
	const beside = open === "problem" ? "while the problem stays open" : "after setting the question aside";
	return {
		id: newMessageId(),
		role: "custom",
		customType: "asked",
		content: `[ASKED] He sent his next message from Ask, ${beside}: a question to you, not his answer. Answer it. Never grade it, save it as an attempt or conclude a problem from it as solved; his answer comes as his work. When it asks to guess first, his guess is a prediction: pose it as one, so it is kept and never counts. Only when it asks nothing and only answers the open question (a guess, a value, a choice) is it his answer to it: save it as his attempt naming "his-message", a prediction when the question asked for one.`,
		display: false,
		details: {},
		timestamp: Date.now(),
	};
}

/** What he sent last on a problem: his work, with the confidence he chose
 *  for it, or a message from Ask (any message of his while the problem is
 *  open, a question by the composer's rule); null before either. A request
 *  (Hint, Show me, Explain instead) is neither. Pure. */
export function finalSubmissionOf(messages: readonly LhMessage[], problemCallId: string): { kind: "work"; confidence?: Confidence } | { kind: "asked" } | null {
	const posed = messages.findIndex((m) => m.role === "assistant" && m.content.some((b) => b.type === "toolCall" && b.id === problemCallId));
	if (posed < 0) return null;
	for (let i = messages.length - 1; i > posed; i--) {
		const m = messages[i]!;
		if (m.role === "user") return { kind: "asked" };
		if (m.role === "custom" && m.customType === "practice-thinking") {
			const details = m.details as { problemCallId?: unknown; confidence?: unknown } | null;
			if (details?.problemCallId !== problemCallId) continue;
			const confidence = chosenConfidence(details.confidence);
			return { kind: "work", ...(confidence ? { confidence } : {}) };
		}
	}
	return null;
}

/** His Done for tonight: he stops now. The content tells the agent that
 *  answers it to close without grading what he left open; the
 *  transcript draws its own quiet line off the marker. */
export function newDoneTonightMessage(agent: keyof typeof DONE_TONIGHT_TEXT): LhMarkerMessage {
	return {
		id: newMessageId(),
		role: "custom",
		customType: "done-tonight",
		content: DONE_TONIGHT_TEXT[agent],
		display: true,
		details: {},
		timestamp: Date.now(),
	};
}

/** The task Continue picks up, as the engine's record names it: its title
 *  and the step he left it at. */
export interface ContinuedTask {
	title: string;
	step: string | null;
}

/** His Continue on an open task the session holds, with nothing in it
 *  waiting on him (round 13, 2 M1): the turn carries on at the task's step.
 *  With the task's record (`task`), the transcript draws its title and the
 *  step he left it at the moment he presses, before the tutor's turn writes
 *  that step out (round 17, M8: Continue Problem sheet 4 showed "Thinking…"
 *  for 42 s before part (c)). The model reads the content alone. */
export function newTaskContinueMessage(tasks: readonly string[], task?: ContinuedTask | null): LhMarkerMessage {
	return {
		id: newMessageId(),
		role: "custom",
		customType: "task-continue",
		content: taskContinueText(tasks),
		display: true,
		details: { tasks: [...tasks], ...(task ? { title: task.title, step: task.step } : {}) },
		timestamp: Date.now(),
	};
}

/** His dispute of an answer's mark (Edo, 14 Nov 2026), the transcript's
 *  record of it: which answer, the attempts that stood for it, and what he
 *  said or the mark he picked. */
export interface DisputeDetails {
	/** The answer's tool call: a question's, or a problem's conclude. */
	answerId: string;
	observations: string[];
	/** The try he disputes, on a card of several ("First try"). */
	row?: string;
	said?: string;
	proposed?: MarkResult;
	/** How he thinks it should count: as his own work, or with help. */
	proposedHow?: DisputedHow;
}

/** How a disputed answer should count, as his answer card says it. */
export type DisputedHow = "ownWork" | "withHelp";
export const DISPUTED_HOWS: readonly DisputedHow[] = ["ownWork", "withHelp"];

/** His dispute, as its own message to the tutor: the content names the
 *  answer and its attempts, so the agent re-judges them as the course
 *  record says (prompts/course/10-record.md). */
export function newDisputeMessage(details: DisputeDetails, question: string): LhMarkerMessage {
	return {
		id: newMessageId(),
		role: "custom",
		customType: "dispute",
		content: disputeText(details, question),
		display: true,
		details,
		timestamp: Date.now(),
	};
}

/** The problem-dismissal marker (ask-style discard, owner 2026-10-04):
 *  UI-ONLY — toLlmMessages filters it. The model's face arrives later, at
 *  the user's next input, as the synthesized conclude pair
 *  (concludedByDismissalPair below) — the agent sees the dismissal as a
 *  conclude call it "made" with outcome "dismissed", so the slot-freed
 *  state and the dismissal read through the one vocabulary it owns. */
export function newProblemDismissedMarker(problemCallId: string): LhMarkerMessage {
	return {
		id: newMessageId(),
		role: "custom",
		customType: "problem-dismissed",
		content: "",
		display: true,
		details: { problemCallId },
		timestamp: Date.now(),
	};
}

/** The stamps of an app-made assistant message. They are placeholders by
 *  design: history serialization reads ONLY the content blocks (verified
 *  in pi-ai's converters), and the app's money channel is the parallel
 *  turns log, never message objects — so "synthetic" never corrupts a wire
 *  view or a cost fold. */
function syntheticStamps(model: string) {
	return {
		api: "faux",
		provider: "synthetic",
		model,
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "toolUse",
	} as const;
}

/** The dismissal's deferred conclude (owner ruling 2026-10-04): the pair
 *  prepended to the user's NEXT input — a synthetic assistant message
 *  carrying a conclude call (outcome "dismissed") plus its ack result, so
 *  both the record and the model context read the problem as concluded
 *  by dismissal, slot freed. Pure; ids are deterministic off the problem
 *  call id (idempotent shape — the pending-dismissal gate guarantees the
 *  pair appends at most once per marker). */
export function concludedByDismissalPair(
	problemCallId: string,
	/** "tonight" when Done for today dropped it (the card says it was left
	 *  for next time); the model's face is the same either way. */
	reason?: "tonight",
): [LhMessage & AssistantMessage, LhMessage & ToolResultMessage] {
	const callId = `call_conc_${problemCallId}`;
	const now = Date.now();
	return [
		{
			id: newMessageId(),
			role: "assistant",
			content: [{ type: "toolCall", id: callId, name: PRACTICE_CONCLUDE_TOOL, arguments: { outcome: "dismissed" } }],
			timestamp: now,
			...syntheticStamps("synthetic-conclude"),
		},
		{
			id: newMessageId(),
			role: "toolResult",
			toolCallId: callId,
			toolName: PRACTICE_CONCLUDE_TOOL,
			content: [{ type: "text", text: CONCLUDE_ACK_TEXT }],
			details: { outcome: "dismissed", problemCallId, ...(reason ? { reason } : {}) },
			isError: false,
			timestamp: now,
		},
	];
}

/** The active-problem fold (the conclude-before-next-problem gate): the
 *  NEWEST problem tool call with nothing concluding after it — either a
 *  conclude call or a dismissal marker deactivates. The ack result at pose
 *  time does NOT (the problem stays on screen through nudges; the dock's
 *  subject is the call, not a dangling result). */
/** The ids of tool calls whose results are CLEAN (not errored) — the only
 *  calls that ever happened, per the honest-activation ruling. */
export function cleanToolCallIds(messages: readonly LhMessage[]): Set<string> {
	const ids = new Set<string>();
	for (const m of messages) {
		if ((m as { role?: string }).role !== "toolResult") continue;
		const result = m as ToolResultMessage;
		if (!result.isError) ids.add(result.toolCallId);
	}
	return ids;
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

/** A course_save's changes as the engine read them: the tool takes an
 *  object, and also its JSON text, which the tutor often sends. Null when
 *  neither. Pure. */
export function saveChanges(args: Record<string, unknown>): Record<string, unknown> | null {
	let changes = args.changes;
	if (typeof changes === "string") {
		try {
			changes = JSON.parse(changes);
		} catch {
			return null;
		}
	}
	return typeof changes === "object" && changes !== null && !Array.isArray(changes) ? (changes as Record<string, unknown>) : null;
}

/** The sources the last turn's clean course_saves registered: material
 *  added during a lesson. Pure. */
export function sourcesRegisteredInLastTurn(messages: readonly LhMessage[]): string[] {
	const start = messages.findLastIndex((m) => m.role === "user") + 1;
	const turn = messages.slice(start);
	const clean = cleanToolCallIds(turn);
	const added: string[] = [];
	for (const m of turn) {
		if (m.role !== "assistant") continue;
		for (const block of m.content) {
			if (block.type !== "toolCall" || block.name !== "course_save" || !clean.has(block.id)) continue;
			const sources = saveChanges(block.arguments as Record<string, unknown>)?.sources;
			if (typeof sources !== "object" || sources === null) continue;
			for (const [handle, entry] of Object.entries(sources)) if (entry !== null && !added.includes(handle)) added.push(handle);
		}
	}
	return added;
}

/** The course topics a session worked on, by its own transcript, in the
 *  order it first touched them: the topics of each problem it posed and of
 *  each observation it saved, and the topics a save introduced. Only calls
 *  that went through count; a plan step never does, whatever its name.
 *  Candidates only: a caller keeps the ones its course map lists. Pure. */
export function sessionTopicsOf(messages: readonly LhMessage[]): string[] {
	const clean = cleanToolCallIds(messages);
	const topics = new Set<string>();
	for (const m of messages) {
		if ((m as { role?: string }).role !== "assistant") continue;
		for (const block of (m as AssistantMessage).content) {
			if (block.type !== "toolCall" || !clean.has(block.id)) continue;
			const args = block.arguments as Record<string, unknown>;
			if (block.name === PRACTICE_PROBLEM_TOOL) for (const t of strings(args.topics)) topics.add(t);
			const changes = block.name === "course_save" ? saveChanges(args) : null;
			if (!changes) continue;
			for (const o of Array.isArray(changes.observations) ? changes.observations : []) {
				for (const t of strings((o as { topics?: unknown } | null)?.topics)) topics.add(t);
			}
			if (typeof changes.topics === "object" && changes.topics !== null) {
				for (const [t, patch] of Object.entries(changes.topics)) {
					if ((patch as { introduced?: unknown } | null)?.introduced === true) topics.add(t);
				}
			}
		}
	}
	return [...topics];
}

/** The topics a practice session's first problem is on. A practice session
 *  with no topic of its own (one the naming rule never reached) belongs to
 *  them, so it stays with its topic while open (round 6 N10); a lesson
 *  still belongs to none until its plan names one. */
export function firstProblemTopicsOf(messages: readonly LhMessage[]): string[] {
	const clean = cleanToolCallIds(messages);
	for (const m of messages) {
		if ((m as { role?: string }).role !== "assistant") continue;
		for (const block of (m as AssistantMessage).content) {
			if (block.type === "toolCall" && clean.has(block.id) && block.name === PRACTICE_PROBLEM_TOOL && strings((block.arguments as Record<string, unknown>).topics).length > 0) {
				return strings((block.arguments as Record<string, unknown>).topics);
			}
		}
	}
	return [];
}

/** A JSON array the tutor may send as its text, as a list of strings. */
function stringList(value: unknown): string[] {
	if (typeof value !== "string") return strings(value);
	try {
		return strings(JSON.parse(value));
	} catch {
		return [];
	}
}

/** A question he answered in this session, or a practice problem that
 *  ended: what a saved attempt names as its `question`. */
export interface AnsweredQuestion {
	/** The tool the answer came through: `explain`, `recall`, a problem's
	 *  `conclude`, or `message` for an answer in words (`HIS_MESSAGE`). */
	tool: string;
	/** Its solution was shown to him before it was asked: the same words
	 *  were asked earlier in the session and answered, or posed as a
	 *  problem that ended (shown-help.ts). */
	seenBefore: boolean;
	/** Asked as a prediction (an `explain` with `type` predict): such an
	 *  answer is saved `predicted`, and no other is (round 8, 4 #12: the box
	 *  said "Your prediction" and the answer counted). Absent for an answer
	 *  in words, which no question declared. */
	predicted?: boolean;
	/** The confidence he chose with this answer, null for none (the meter
	 *  left alone, or a message, which has no meter). Absent for a
	 *  problem's conclude, whose attempts carry the confidence of each
	 *  submission. */
	confidence?: Exclude<Confidence, "neutral"> | null;
	/** He pressed Show me on it: he gave up and was shown its answer. */
	showMe?: boolean;
	/** The question he answered, as `sameQuestionKey` reads it; absent for
	 *  an answer in words or a problem's conclude. */
	asked?: string;
	/** His answer as he wrote it, for a graded question's answer. */
	words?: string;
	/** A save that went through already recorded it, or its problem's
	 *  conclude did. */
	recorded: boolean;
	/** For a problem's conclude that could not save its attempts (the
	 *  record could not be read): the observations it would have written,
	 *  its first try and its final answer, which a later save naming it
	 *  writes as they are (round 15, M3: after the record came back, the
	 *  save of the pair was refused as two results for one answer, and his
	 *  fix was lost). */
	replay?: readonly Record<string, unknown>[];
	/** For an answer in words: a problem posed after his newest message was
	 *  dropped (Done for today, or his discard) with nothing recorded, so
	 *  nothing of it is saved (round 15, M4: the closing turn saved the
	 *  dropped problem's answer as "his-message"). */
	dropped?: true;
}

/** The name a save gives an answer he gave in words, in a message of his
 *  rather than through a question (round 5: such an answer was recorded
 *  and showed no mark). It stands for his newest message before the save:
 *  the message the turn answers. */
export const HIS_MESSAGE = "his-message";

/** The probe's graded question: the prober's alone, asked before any
 *  teaching of the session. */
export const PROBE_QUESTION_TOOL = "recall";

/** The graded question tools: an answer to one is an attempt. */
export const GRADED_QUESTION_TOOLS: readonly string[] = ["explain", "recall"];

/** A graded question's result that is his answer: not a Hint press, not a
 *  question left unanswered. */
export function isRealAnswer(details: unknown): boolean {
	const d = details as { dismissed?: unknown; hintRequested?: unknown } | null;
	return !!d && typeof d === "object" && d.dismissed !== true && d.hintRequested !== true;
}

/** Every question he answered and every problem that ended, keyed by the
 *  call a saved attempt names: the graded question's call, or the
 *  problem's `conclude`; and `HIS_MESSAGE` once he has sent a message.
 *  Only calls that went through count; a problem left for today ended
 *  unseen. Pure. */
export function answeredQuestionsOf(messages: readonly LhMessage[]): Map<string, AnsweredQuestion> {
	return questionScan(messages).answered;
}

/** Whether he studied in a session: he answered a question or a problem in
 *  it ended, or he wrote to the tutor after the words it opened with (an
 *  answer in words, a follow-up). A session holding only its opening, a
 *  plan question or "Continue Problem sheet 4" and the tutor's first
 *  question, is not study (round 10, 1 m2: Home's "Studied today" listed
 *  both). Pure. */
export function studiedIn(messages: readonly LhMessage[]): boolean {
	if (messages.filter((m) => m.role === "user").length > 1) return true;
	return [...answeredQuestionsOf(messages).keys()].some((key) => key !== HIS_MESSAGE);
}

/** True when the solution of the question or problem a call asked had been
 *  shown to him before it was asked (`AnsweredQuestion.seenBefore`). Pure. */
export function seenBeforeAsked(messages: readonly LhMessage[], callId: string): boolean {
	return questionScan(messages).posed.get(callId)?.seen === true;
}

/** A conclude's result says its attempts were not recorded: the save
 *  failed or the pose was lost (tools/practice.ts). Any other result of a
 *  problem that ended recorded them, or had nothing to record. */
const UNSAVED_CONCLUDE = /The attempt was not saved|The attempt could not be recorded/;

function questionScan(messages: readonly LhMessage[]): { posed: Map<string, { key: string; seen: boolean; predicted: boolean }>; answered: Map<string, AnsweredQuestion> } {
	const clean = cleanToolCallIds(messages);
	const revealed = new Set<string>();
	const posed = new Map<string, { key: string; seen: boolean; predicted: boolean }>();
	const answered = new Map<string, AnsweredQuestion>();
	// Each save's named answers, until its result says whether it went
	// through; an answer in words stands for his newest message then.
	const naming = new Map<string, string[]>();
	const recorded = new Set<string>();
	const unsaved = new Map<string, Record<string, unknown>[]>();
	let problem: string | null = null;
	let lastSaid: string | null = null;
	// A problem posed since his newest message, and whether one was dropped.
	let posedSinceSaid = false;
	let droppedSinceSaid = false;
	const pose = (callId: string, text: unknown, type?: unknown) => {
		if (typeof text !== "string") return;
		const key = sameQuestionKey(text);
		posed.set(callId, { key, seen: revealed.has(key), predicted: normalizeQuestionType(type) === "predict" });
	};
	for (const m of messages) {
		if (m.role === "user") {
			lastSaid = m.id;
			posedSinceSaid = false;
			droppedSinceSaid = false;
		} else if (m.role === "custom" && m.customType === "problem-dismissed") {
			problem = null;
			if (posedSinceSaid) droppedSinceSaid = true;
		}
		else if (m.role === "assistant") {
			for (const block of m.content) {
				if (block.type !== "toolCall") continue;
				const args = (block.arguments ?? {}) as Record<string, unknown>;
				if (GRADED_QUESTION_TOOLS.includes(block.name)) pose(block.id, args.question, args.type);
				else if (block.name === "course_save") {
					naming.set(block.id, savedQuestionsOf(args).flatMap((q) => (q === null ? [] : [q === HIS_MESSAGE ? `${HIS_MESSAGE}:${lastSaid}` : q])));
				} else if (block.name === PRACTICE_PROBLEM_TOOL && clean.has(block.id)) {
					pose(block.id, args.statement);
					problem = block.id;
					posedSinceSaid = true;
				} else if (block.name === PRACTICE_CONCLUDE_TOOL && clean.has(block.id) && problem) {
					const asked = posed.get(problem);
					problem = null;
					if (!asked || args.outcome === "dismissed") continue;
					revealed.add(asked.key);
					answered.set(block.id, { tool: PRACTICE_CONCLUDE_TOOL, seenBefore: asked.seen, predicted: false, recorded: false });
				}
			}
		} else if (m.role === "toolResult" && !m.isError && m.toolName === "course_save") {
			for (const key of naming.get(m.toolCallId) ?? []) recorded.add(key);
		} else if (m.role === "toolResult" && !m.isError && m.toolName === PRACTICE_CONCLUDE_TOOL) {
			if (!UNSAVED_CONCLUDE.test(resultText(m))) recorded.add(m.toolCallId);
			else {
				const kept = (m.details as { unsaved?: unknown } | null)?.unsaved;
				if (Array.isArray(kept) && kept.length > 0 && kept.every((o) => typeof o === "object" && o !== null)) unsaved.set(m.toolCallId, kept as Record<string, unknown>[]);
			}
		} else if (m.role === "toolResult" && GRADED_QUESTION_TOOLS.includes(m.toolName) && !m.isError && isRealAnswer(m.details)) {
			const asked = posed.get(m.toolCallId);
			if (!asked) continue;
			revealed.add(asked.key);
			const details = m.details as { confidence?: unknown; showMe?: unknown; text?: unknown };
			const confidence = chosenConfidence(details.confidence) ?? null;
			const words = typeof details.text === "string" && details.text.trim() ? { words: details.text } : {};
			answered.set(m.toolCallId, { tool: m.toolName, seenBefore: asked.seen, predicted: asked.predicted, confidence, ...(details.showMe === true ? { showMe: true } : {}), asked: asked.key, ...words, recorded: false });
		}
	}
	for (const [key, answer] of answered) {
		answer.recorded = recorded.has(key);
		const replay = unsaved.get(key);
		if (replay && !answer.recorded) answer.replay = replay;
	}
	if (lastSaid) answered.set(HIS_MESSAGE, { tool: "message", seenBefore: false, confidence: null, recorded: recorded.has(`${HIS_MESSAGE}:${lastSaid}`), ...(droppedSinceSaid ? { dropped: true as const } : {}) });
	return { posed, answered };
}

/** The answers with the ones the lesson's kept save links name read as
 *  saved (`ChatRecord.answerSaves`): a save the transcript never got still
 *  saved them. `lastSaid` is his newest message's id, the one an answer in
 *  words names. Pure; the map is copied. */
export function recordedBySaves(answers: ReadonlyMap<string, AnsweredQuestion>, saves: Readonly<Record<string, readonly string[]>> | undefined, lastSaid: string | null): Map<string, AnsweredQuestion> {
	const out = new Map<string, AnsweredQuestion>();
	for (const [key, answer] of answers) {
		const kept = (saves?.[key === HIS_MESSAGE ? (lastSaid ?? "") : key]?.length ?? 0) > 0;
		out.set(key, kept && !answer.recorded ? { ...answer, recorded: true } : answer);
	}
	return out;
}

function resultText(m: ToolResultMessage): string {
	return m.content.map((part) => (part.type === "text" ? part.text : "")).join("");
}

/** The question each observation of a course_save call names
 *  (`question`), in order; null where it names none. */
export function savedQuestionsOf(args: unknown): (string | null)[] {
	const changes = saveChanges((args ?? {}) as Record<string, unknown>);
	const listed = Array.isArray(changes?.observations) ? changes.observations : [];
	return listed.map((o) => {
		const q = (o as { question?: unknown } | null)?.question;
		return typeof q === "string" && q.trim() ? q.trim() : null;
	});
}

/** The course saves a session made that went through, each as the changes
 *  the engine read, in order. Pure. */
export function sessionSavesOf(messages: readonly LhMessage[]): Record<string, unknown>[] {
	const clean = cleanToolCallIds(messages);
	return messages.flatMap((m) =>
		m.role === "assistant"
			? m.content.flatMap((block) => {
					if (block.type !== "toolCall" || block.name !== "course_save" || !clean.has(block.id)) return [];
					const changes = saveChanges(block.arguments as Record<string, unknown>);
					return changes ? [changes] : [];
				})
			: [],
	);
}

/** The engine tasks a session holds: each task key its saves that went
 *  through last wrote as open (a task patch), or that the lesson it picked
 *  up held, and never removed after (a `null` entry). Never the `focus`:
 *  it is the course's pointer, and a close that ends its own task moves it
 *  to another session's work (round 12, 1 D1: the Eigen lesson's Done for
 *  today then held Problem sheet 4, so Continue on the sheet opened it).
 *  Which of them the engine still has open, and at which step, is the
 *  engine's to say. Pure. */
export function sessionTasksOf(messages: readonly LhMessage[]): string[] {
	return [...sessionTaskStatesOf(messages)].filter(([, open]) => open).map(([key]) => key);
}

/** Every engine task the session's saves (or the lesson it picked up)
 *  wrote, by key: true while it is open, false once a save removed it, so
 *  a session whose own saves closed the work it held is told apart from
 *  one that held none (round 15, M1). Pure. */
export function sessionTaskStatesOf(messages: readonly LhMessage[]): Map<string, boolean> {
	const clean = cleanToolCallIds(messages);
	const held = new Map<string, boolean>();
	for (const m of messages) {
		if (m.role === "custom" && m.customType === "session-resume") {
			for (const key of strings((m.details as { tasks?: unknown } | null)?.tasks)) held.set(key, true);
		}
		if (m.role !== "assistant") continue;
		for (const block of m.content) {
			if (block.type !== "toolCall" || block.name !== "course_save" || !clean.has(block.id)) continue;
			const changes = saveChanges(block.arguments as Record<string, unknown>);
			if (!changes) continue;
			if (typeof changes.tasks === "object" && changes.tasks !== null) {
				for (const [key, patch] of Object.entries(changes.tasks)) held.set(key, patch !== null);
			}
		}
	}
	return held;
}

/** The title the session's saves gave the first task they opened, the
 *  newest title it gave that task, kept after the task closes, so the day's
 *  record names the session one way all day (round 13, 1 n9: "Eigenvalues
 *  and eigenvectors lesson", then "Eigenvalues and eigenvectors" once its
 *  task closed). Null when its saves titled no task. Pure. */
export function sessionTaskTitleOf(messages: readonly LhMessage[]): string | null {
	const clean = cleanToolCallIds(messages);
	let first: string | null = null;
	let title: string | null = null;
	for (const m of messages) {
		if (m.role !== "assistant") continue;
		for (const block of m.content) {
			if (block.type !== "toolCall" || block.name !== "course_save" || !clean.has(block.id)) continue;
			const tasks = saveChanges(block.arguments as Record<string, unknown>)?.tasks;
			if (typeof tasks !== "object" || tasks === null) continue;
			for (const [key, patch] of Object.entries(tasks)) {
				const named = (patch as { title?: unknown } | null)?.title;
				if (typeof named !== "string" || !named.trim()) continue;
				first ??= key;
				if (key === first) title = named.trim();
			}
		}
	}
	return title;
}

/** The topics its saves gave the first task they opened (the one
 *  `sessionTaskTitleOf` names), so a session that took up a task belongs
 *  to the task's topics (round 15, m4: the Ask-the-tutor session that took
 *  up the Expectation lesson stayed the Geometric page's Now). Empty when
 *  its saves gave that task none. Pure. */
export function sessionTaskTopicsOf(messages: readonly LhMessage[]): string[] {
	const clean = cleanToolCallIds(messages);
	let first: string | null = null;
	let topics: string[] = [];
	for (const m of messages) {
		if (m.role !== "assistant") continue;
		for (const block of m.content) {
			if (block.type !== "toolCall" || block.name !== "course_save" || !clean.has(block.id)) continue;
			const tasks = saveChanges(block.arguments as Record<string, unknown>)?.tasks;
			if (typeof tasks !== "object" || tasks === null) continue;
			for (const [key, patch] of Object.entries(tasks)) {
				const named = (patch as { title?: unknown } | null)?.title;
				if (first === null && typeof named === "string" && named.trim()) first = key;
				const given = (patch as { topics?: unknown } | null)?.topics;
				if (key === first && Array.isArray(given)) topics = given.filter((t): t is string => typeof t === "string" && t.length > 0);
			}
		}
	}
	return topics;
}

/** The course topic the session's first plan teaches: the `topic` of the
 *  goal its first `plan_init` that went through gave; null when it gave
 *  none. Pure. */
export function sessionPlanTopicOf(messages: readonly LhMessage[]): string | null {
	const clean = cleanToolCallIds(messages);
	for (const m of messages) {
		if (m.role !== "assistant") continue;
		for (const block of m.content) {
			if (block.type !== "toolCall" || block.name !== "plan_init" || !clean.has(block.id)) continue;
			const topic = ((block.arguments as { goal?: { topic?: unknown } } | null)?.goal ?? null)?.topic;
			return typeof topic === "string" && topic.trim() ? topic.trim() : null;
		}
	}
	return null;
}

/** The topic not started that the session's answers started before any
 *  plan: the first save that went through whose receipt moved a topic up
 *  from "new" (its `levels`), as a probe's first answer on the topic he
 *  asked to start does (round 17, M5). Null when a plan came first, or no
 *  save started one. Pure. */
export function firstStartedTopicOf(messages: readonly LhMessage[]): string | null {
	const clean = cleanToolCallIds(messages);
	for (const m of messages) {
		if (m.role === "assistant" && m.content.some((b) => b.type === "toolCall" && b.name === "plan_init" && clean.has(b.id))) return null;
		if (m.role !== "toolResult" || m.isError || m.toolName !== "course_save") continue;
		let receipt: unknown;
		try { receipt = JSON.parse(resultText(m)); } catch { continue; }
		const levels = (receipt as { levels?: unknown } | null)?.levels;
		const started = Object.entries(typeof levels === "object" && levels !== null ? levels : {}).find(([, change]) => (change as { from?: unknown } | null)?.from === "new");
		if (started) return started[0];
	}
	return null;
}

/** The topics whose start the session's saves moved: each key of a
 *  `starts_moved` in the receipt of a save that went through, in order.
 *  Pure. */
export function startsMovedOf(messages: readonly LhMessage[]): string[] {
	const moved = new Set<string>();
	for (const m of messages) {
		if (m.role !== "toolResult" || m.isError || m.toolName !== "course_save") continue;
		let receipt: unknown;
		try { receipt = JSON.parse(resultText(m)); } catch { continue; }
		const starts = (receipt as { starts_moved?: unknown } | null)?.starts_moved;
		for (const key of typeof starts === "object" && starts !== null ? Object.keys(starts) : []) moved.add(key);
	}
	return [...moved];
}

/** The goal topic of each plan that went through, in order. Pure. */
export function plannedTopicsOf(messages: readonly LhMessage[]): string[] {
	const clean = cleanToolCallIds(messages);
	return messages.flatMap((m) =>
		m.role !== "assistant"
			? []
			: m.content.flatMap((block) => {
					if (block.type !== "toolCall" || block.name !== "plan_init" || !clean.has(block.id)) return [];
					const topic = ((block.arguments as { goal?: { topic?: unknown } } | null)?.goal ?? null)?.topic;
					return typeof topic === "string" && topic.trim() ? [topic.trim()] : [];
				}),
	);
}

/** When the session's saved answers on each topic came: the time of the
 *  newest message whose save went through with an answer on it, by topic.
 *  Pure. */
export function savedAnswerTimesOf(messages: readonly LhMessage[]): Map<string, number> {
	const clean = cleanToolCallIds(messages);
	const at = new Map<string, number>();
	for (const m of messages) {
		if (m.role !== "assistant" || typeof m.timestamp !== "number") continue;
		for (const block of m.content) {
			if (block.type !== "toolCall" || block.name !== "course_save" || !clean.has(block.id)) continue;
			const changes = saveChanges(block.arguments as Record<string, unknown>);
			for (const o of Array.isArray(changes?.observations) ? changes.observations : []) {
				for (const t of strings((o as { topics?: unknown } | null)?.topics)) at.set(t, Math.max(at.get(t) ?? 0, m.timestamp));
			}
		}
	}
	return at;
}

/** When the session's saves wrote each engine task: the time of the newest
 *  message whose save went through with that task in it, by key, a task
 *  removed included. Pure. */
export function savedTaskTimesOf(messages: readonly LhMessage[]): Map<string, number> {
	const clean = cleanToolCallIds(messages);
	const at = new Map<string, number>();
	for (const m of messages) {
		if (m.role !== "assistant" || typeof m.timestamp !== "number") continue;
		for (const block of m.content) {
			if (block.type !== "toolCall" || block.name !== "course_save" || !clean.has(block.id)) continue;
			const tasks = saveChanges(block.arguments as Record<string, unknown>)?.tasks;
			for (const key of typeof tasks === "object" && tasks !== null ? Object.keys(tasks) : []) at.set(key, Math.max(at.get(key) ?? 0, m.timestamp));
		}
	}
	return at;
}

/** The topics the session's saved answers were on: each observation's
 *  `topics` in the saves that went through, in order. Pure. */
export function savedAnswerTopicsOf(messages: readonly LhMessage[]): string[] {
	const topics = new Set<string>();
	for (const changes of sessionSavesOf(messages)) {
		for (const o of Array.isArray(changes.observations) ? changes.observations : []) {
			for (const t of strings((o as { topics?: unknown } | null)?.topics)) topics.add(t);
		}
	}
	return [...topics];
}

/** The conclusion's reveal (owner round, 2026-10-05): the hero of a
 *  conclude card is the modelSolution committed at POSE time — the newest
 *  cleanly-posed problem BEFORE this conclude call. The reveal is never
 *  re-authored (the slim schema dropped solutionReveal); legacy conclude
 *  inputs that still carry their own solutionReveal fall back to it at the
 *  card. Undefined when the pose carries no string solution, and when he
 *  pressed Explain instead on it: the explanation that follows is its
 *  answer, and the same solution above it said it twice (round 9). */
export function modelSolutionForConclude(
	messages: readonly LhMessage[],
	concludeCallId: string,
): string | undefined {
	const pose = poseForConclude(messages, concludeCallId);
	if (!pose || typeof pose.input?.modelSolution !== "string") return undefined;
	return explainedInstead(messages, pose.id) ? undefined : pose.input.modelSolution;
}

/** He pressed Explain instead on this problem. */
function explainedInstead(messages: readonly LhMessage[], problemCallId: string): boolean {
	return messages.some((m) => {
		if (m.role !== "custom" || m.customType !== "practice-request") return false;
		const d = m.details as Partial<PracticeRequestDetails> | null;
		return d?.problemCallId === problemCallId && d.request === "explain";
	});
}

/** The full pose-side fold (owner round 17, 2026-10-06 — observability):
 * EVERYTHING the agent filled into the problem call — mode, topics,
 * statement, the committed solution — joined onto the conclude part so
 * the card's collapsible "agent's data" drawer renders pure. Same walk
 * and refusal law as the reveal: a pose the record never acked (a
 * refused call) folds nothing. */
export function problemInputForConclude(
	messages: readonly LhMessage[],
	concludeCallId: string,
): PoseInput | undefined {
	return poseForConclude(messages, concludeCallId)?.input;
}

type PoseInput = { statement?: unknown; mode?: unknown; topics?: unknown; modelSolution?: unknown };

/** The cleanly-posed problem a conclude call ends: the newest before it. */
function poseForConclude(messages: readonly LhMessage[], concludeCallId: string): { id: string; input: PoseInput | undefined } | undefined {
	let mi = messages.findIndex(
		(m) =>
			(m as { role?: string }).role === "assistant" &&
			(m as AssistantMessage).content.some(
				(b) => b.type === "toolCall" && b.id === concludeCallId,
			),
	);
	if (mi < 0) return undefined;
	const clean = cleanToolCallIds(messages);
	for (; mi >= 0; mi--) {
		const m = messages[mi]!;
		if ((m as { role?: string }).role !== "assistant") continue;
		const assistant = m as AssistantMessage;
		for (let bi = assistant.content.length - 1; bi >= 0; bi--) {
			const block = assistant.content[bi]!;
			if (block.type !== "toolCall" || block.name !== PRACTICE_PROBLEM_TOOL) continue;
			if (!clean.has(block.id)) continue; // a refused pose revealed nothing
			return { id: block.id, input: (block.arguments ?? undefined) as PoseInput | undefined };
		}
	}
	return undefined;
}

export function activeProblemOf(
	messages: readonly LhMessage[],
): { toolCallId: string; input: unknown } | null {
	// HONEST ACTIVATION (owner ruling, 2026-10-05 — the BKT incident):
	// calls count only through their RESULTS — a problem activates on its
	// clean ack, a conclude frees on its clean ack; errored and dangling
	// calls are skipped ("either it goes through or it doesn't").
	const cleanCallIds = cleanToolCallIds(messages);
	for (let mi = messages.length - 1; mi >= 0; mi--) {
		const m = messages[mi]!;
		const role = (m as { role?: string }).role;
		if (role === "custom") {
			const marker = m as LhMarkerMessage;
			if (marker.customType === "problem-dismissed") return null;
			continue;
		}
		if (role === "assistant") {
			const assistant = m as AssistantMessage & { id: string };
			for (let bi = assistant.content.length - 1; bi >= 0; bi--) {
				const block = assistant.content[bi]!;
				if (block.type !== "toolCall") continue;
				if (block.name === PRACTICE_CONCLUDE_TOOL) {
					if (cleanCallIds.has(block.id)) return null; // a CLEAN conclude frees
					continue; // errored/dangling conclude: the free never happened
				}
				if (block.name !== PRACTICE_PROBLEM_TOOL) continue;
				if (cleanCallIds.has(block.id)) return { toolCallId: block.id, input: block.arguments };
				// errored/dangling pose — it did not go through; keep scanning
			}
			continue;
		}
	}
	return null;
}

/** Is a problem-dismissal marker waiting for its conclude synthesis? The
 *  text/continue appends read this: the pair rides the user's next input
 *  (input-events). Newest-marker-wins scan: the first dismissal marker or
 *  conclude call from the end decides. */
export function pendingProblemDismissalOf(messages: readonly LhMessage[]): string | null {
	const cleanCallIds = cleanToolCallIds(messages);
	for (let mi = messages.length - 1; mi >= 0; mi--) {
		const m = messages[mi]!;
		const role = (m as { role?: string }).role;
		if (role === "custom") {
			const marker = m as LhMarkerMessage;
			if (marker.customType === "problem-dismissed") {
				return (marker.details as { problemCallId?: unknown }).problemCallId as string;
			}
			continue;
		}
		if (role === "assistant") {
			const assistant = m as AssistantMessage;
			for (let bi = assistant.content.length - 1; bi >= 0; bi--) {
				const block = assistant.content[bi]!;
				if (block.type !== "toolCall" && block.type !== "text") continue;
				if (block.type === "toolCall" && block.name === PRACTICE_CONCLUDE_TOOL) {
					if (cleanCallIds.has(block.id)) return null; // a CLEAN conclude settles it
					continue; // errored/dangling: it never happened
				}
				if (block.type === "toolCall" && block.name === PRACTICE_PROBLEM_TOOL) {
					if (cleanCallIds.has(block.id)) return null; // a CLEAN pose supersedes it
					continue;
				}
			}
			continue;
		}
	}
	return null;
}

// ─── the one model-facing seam (the agent's convertToLlm) ────────────────────

/** The ids of every toolResult in the tail (for the dangling-call scan). */
function resultIdsFrom(messages: readonly AgentMessage[]): Set<string> {
	const ids = new Set<string>();
	for (const m of messages) {
		if ((m as { role?: string }).role === "toolResult") {
			ids.add((m as ToolResultMessage).toolCallId);
		}
	}
	return ids;
}

// ─── native scans (the UIMessage-era pending/phase seams, natively) ──────────

/** The pending-question gate (findPendingToolCall's native twin): the
 *  NEWEST assistant message's FIRST answerable question-tool call with no
 *  result in the tail — never a failed generation or malformed fragment. */
export function danglingQuestionOf(
	messages: readonly LhMessage[],
): { toolCallId: string; tool: string; input: unknown } | null {
	const question = questionCallsOf(messages).find(call => call.status === "answerable");
	return question ? { toolCallId: question.toolCallId, tool: question.tool, input: question.input } : null;
}

/** The same authority, retaining native boundaries for the client dock.
 * Unique call ids are stable even when a live message's local id is replaced
 * by its persisted stamp. Only colliding ids need an occurrence-qualified
 * draft/reset key; this never changes stored ids or the answer wire. */
export function pendingQuestionOf(messages: readonly LhMessage[]): PendingQuestion | null {
	// turn_end includes the temporary questionResult acknowledgement. The
	// view ignores it too: it is NOT the learner's answer. Exclude it only
	// from client authority, leaving persisted/server result policy intact.
	const question = questionCallsOf(messages.filter(message => !isLiveQuestionPlaceholder(message))).find(call => call.status === "answerable");
	if (!question) return null;
	let occurrences = 0;
	for (const message of messages) {
		// A streamed c_ assistant can temporarily coexist with its saved
		// copy during append-only adoption. New live calls are already
		// uniquified; only settled history establishes reuse.
		if (message.role !== "assistant" || message.id.startsWith("c_")) continue;
		for (const call of message.content) {
			if (call.type === "toolCall" && call.id === question.toolCallId) occurrences++;
		}
	}
	return {
		toolCallId: question.toolCallId, tool: question.tool, input: question.input,
		messageId: question.messageId, contentIndex: question.contentIndex,
		key: occurrences > 1 ? JSON.stringify([question.messageId, question.contentIndex, question.toolCallId]) : question.toolCallId,
	};
}

/** Only the transient c_ result with the questionResult contract qualifies.
 * Real answers have details; errors/aborts remain resolving results. A saved
 * null result is not reinterpreted by this client-only compatibility seam. */
function isLiveQuestionPlaceholder(message: LhMessage): boolean {
	return message.role === "toolResult" && message.id.startsWith("c_") &&
		!message.isError && message.details === null &&
		(QUESTION_TOOLS as readonly string[]).includes(message.toolName);
}

export interface QuestionCall extends Omit<PendingQuestion, "key"> {
	status: "streaming" | "answerable" | "malformed" | "failed";
}

/** Newest native assistant only; siblings remain in call order. No result
 * alone is NOT proof of a posed question: failed generations never execute
 * their calls, and older records can contain truncated/unvalidated inputs. */
export function questionCallsOf(messages: readonly LhMessage[]): QuestionCall[] {
	for (let mi = messages.length - 1; mi >= 0; mi--) {
		const assistant = messages[mi]!;
		if (assistant.role !== "assistant") continue;
		const answered = resultIdsFrom(messages.slice(mi + 1));
		const calls: QuestionCall[] = [];
		for (const [contentIndex, block] of assistant.content.entries()) {
			if (block.type !== "toolCall" || !(QUESTION_TOOLS as readonly string[]).includes(block.name) || answered.has(block.id)) continue;
			const status = assistant.stopReason === "error" || assistant.stopReason === "aborted" ? "failed"
				: assistant.stopReason === "pending" ? "streaming"
				: assistant.stopReason === "length" || block.argumentsError || !parseQuestionInput(block.name, block.arguments) ? "malformed"
				: "answerable";
			calls.push({ toolCallId: block.id, tool: block.name, input: block.arguments,
				messageId: assistant.id, contentIndex, status });
		}
		return calls; // never revive older calls, even when this message has none
	}
	return [];
}

/** Background wakes must still wait for an explicit learner action when a
 * question is unusable. Releasing the composer is not permission to retry. */
export function hasUnresolvedQuestion(messages: readonly LhMessage[]): boolean {
	return questionCallsOf(messages).length > 0;
}

/** The one recovery authority, for the transcript's Retry button and the
 * server alike. Only while the malformed batch ends the record: after later
 * learner input, an appended result would follow that input on the wire,
 * and providers reject every later turn. Client placeholders are loop
 * acknowledgements, not learner answers. */
export function malformedQuestionsOf(messages: readonly LhMessage[]): QuestionCall[] {
	const settled = messages.filter(message => !isLiveQuestionPlaceholder(message));
	if (trailingBatchOwner(settled) < 0) return [];
	return questionCallsOf(settled).filter(call => call.status === "malformed");
}

/** Successful probe_done result MESSAGE ids, in transcript order. A call
 *  from a failed/aborted generation grants no completion authority. Its
 *  later result must match both call id and tool name, must not be an
 *  error, and must not explicitly refuse with details.ok:false. Older
 *  clean acknowledgments without ok:true still count. No history changes. */
export function probeDoneResultIds(messages: readonly LhMessage[]): Set<string> {
	const calls = new Set<string>();
	const results = new Set<string>();
	for (const m of messages) {
		if (m.role === "assistant") {
			if (m.stopReason === "error" || m.stopReason === "aborted") continue;
			for (const block of m.content) {
				if (block.type === "toolCall" && block.name === "probe_done") calls.add(block.id);
			}
		} else if (
			m.role === "toolResult" && m.toolName === "probe_done" &&
			calls.has(m.toolCallId) && !m.isError &&
			(m.details as { ok?: unknown } | null | undefined)?.ok !== false
		) {
			results.add(m.id);
		}
	}
	return results;
}

/** The probe→teach construction seam (chat-handler and the tool guard):
 *  only a concluded call plus a matching successful result means teach. */
export function hasProbeDone(messages: readonly LhMessage[]): boolean {
	return probeDoneResultIds(messages).size > 0;
}

/** Which agent answers the record's next input: practice in a practice
 *  session, else the prober until the probe concluded or the session picks
 *  up a lesson, then the teacher. */
export function respondingAgentOf(messages: readonly LhMessage[], startedIn?: SessionMode): "prober" | "teacher" | "practice" {
	if (sessionModeOf(messages, startedIn) === "practice") return "practice";
	return hasProbeDone(messages) || resumesLesson(messages) ? "teacher" : "prober";
}

// ─── the continuation fold (Wave D: the SDK's
//     lastAssistantMessageIsCompleteWithToolCalls, natively) ──────────────────

/**
 * Does the record END on un-consumed tool results — a turn that stopped
 * after its tools ran (a job dispatch's ack, an aborted answer turn),
 * leaving the agent owing a continuation? This is the mount/sync
 * continuation seam's gate (chat.tsx): when true and nothing runs, the
 * client sends {type:"continue"} and the teacher picks up from the record.
 *
 * The pre-Wave-D client asked the SDK's
 * lastAssistantMessageIsCompleteWithToolCalls (last view message is
 * assistant; its last step's tool calls all output-available or
 * output-error; at least one). The native fold over the record: the last
 * message is a toolResult, and the results' OWNING assistant message has
 * at least one call, ALL of them answered (a dangling question — the
 * dock's domain — fails the all-answered rule and never fires a turn,
 * exactly as the SDK's every(output-available) did).
 */
/** Is this record message a user-dismissed question result? The full
 *  answer rides the toolResult's `details` (newAnswerResult) — the
 *  dismissal pause and the continuation fold both read it. */
function isDismissedResult(m: LhMessage): boolean {
	if ((m as { role?: string }).role !== "toolResult") return false;
	const details = (m as { details?: unknown }).details as { dismissed?: unknown } | undefined;
	return details?.dismissed === true;
}

/** The dismissal pause (owner design 2026-10-03, "A2"): the record ends
 *  in user dismissal — the session waits for the USER. While paused,
 *  nothing auto-wakes: the continuation fold demands nothing (below) and
 *  the wake pipeline holds job deliveries in the steer queue until the
 *  next send. Derived from the tail — no latch to persist or clear; any
 *  user message flips it off by changing the record. */
export function endsInDismissal(messages: readonly LhMessage[]): boolean {
	const last = messages[messages.length - 1];
	return last !== undefined && isDismissedResult(last);
}

/** The recovery click authorizes its immediate replacement turn, not an
 * automatic restart if only the write-ahead error results survived. No new
 * stored latch: explicit input or replacement output changes this tail. */
export function endsInQuestionRecovery(messages: readonly LhMessage[]): boolean {
	const last = messages[messages.length - 1];
	return last?.role === "toolResult" && last.isError &&
		(last.details as { questionRecovery?: unknown } | null)?.questionRecovery === true;
}

export type NativeInputCause = "learner" | "automatic" | "neutral" | "unrecognizable";
/** Markers that carry context, never a new input. */
export const NEUTRAL_MARKERS: readonly string[] = ["graph-context", "course-context", "session-mode", "plan-block", "problem-dismissed", "compaction", "session-resume"];

/** Whether a message is an input that starts a new agent turn: exactly
 *  the messages `nativeInputCause` does not call neutral, decided without
 *  the history it needs only to tell learner from unrecognizable. */
export function opensTurn(message: LhMessage): boolean {
	if (message.role === "user") return true;
	if (message.role === "custom") return !NEUTRAL_MARKERS.includes(message.customType);
	if (message.role !== "toolResult") return false;
	if (message.isError) return (message.details as { questionRecovery?: unknown } | null)?.questionRecovery === true;
	return (QUESTION_TOOLS as readonly string[]).includes(message.toolName) && message.details != null && !(message.details as { dismissed?: boolean }).dismissed;
}

/** Native causes only: flattened user roles, IDs' prefixes and prose confer no permission. */
export function nativeInputCause(message: AgentMessage, history: readonly AgentMessage[]): NativeInputCause {
	if (message.role === "user") return "learner";
	if (message.role === "system" || message.role === "assistant") return "neutral";
	if (message.role === "custom") {
		if (["probe-handoff", "mode-handoff", "subagent-steer", "subagent-abort"].includes(message.customType)) return "automatic";
		if (["practice-thinking", "practice-next", "practice-request", "done-tonight", UNGRADED_ANSWER, "dispute", "task-continue"].includes(message.customType)) return "learner";
		return NEUTRAL_MARKERS.includes(message.customType) ? "neutral" : "unrecognizable";
	}
	if (message.role === "toolResult") {
		if (message.isError && (message.details as { questionRecovery?: unknown } | null)?.questionRecovery === true) {
			return questionCallsOf(history as readonly LhMessage[]).some(call => call.status === "malformed" && call.toolCallId === message.toolCallId && call.tool === message.toolName) ? "learner" : "unrecognizable";
		}
		if (!(QUESTION_TOOLS as readonly string[]).includes(message.toolName) || message.isError || message.details == null || (message.details as { dismissed?: boolean }).dismissed) return "neutral";
		const details = message.details as Partial<QuestionAnswerData>;
		if (!["ask", "explain"].includes(details.kind ?? "") || typeof details.questionText !== "string" || !Array.isArray(details.answers) || typeof details.answeredAt !== "string") return "unrecognizable";
		const calls = history.flatMap((m) => m.role === "assistant" ? m.content.filter((b) => b.type === "toolCall" && b.id === message.toolCallId) : []);
		return calls.length === 1 && calls[0]?.type === "toolCall" && calls[0].name === message.toolName ? "learner" : "unrecognizable";
	}
	return "unrecognizable";
}
/** Markers toLlmMessages drops: the model never sees them between a call
 *  and its result. */
export function isUiOnlyMarker(m: LhMessage): boolean {
	return m.role === "custom" && (m.customType === "plan-block" || m.customType === "problem-dismissed" || m.customType === "session-mode");
}

/** The index of the assistant whose call batch ends the record: only its
 *  tool results, UI-only markers and a compaction marker follow it
 *  (contiguous by construction — the agent appends its batch; the question
 *  gate keeps a quiz call and its learner answer adjacent; a compaction run
 *  in his pause lands between them, and the session keeps its own summary,
 *  so the marker is nothing the tutor reads). -1 when model-facing input or
 *  a context marker follows the newest assistant. */
function trailingBatchOwner(messages: readonly LhMessage[]): number {
	let i = messages.length - 1;
	while (i >= 0 && (messages[i]!.role === "toolResult" || isUiOnlyMarker(messages[i]!) || (messages[i]!.role === "custom" && (messages[i] as LhMarkerMessage).customType === "compaction"))) i--;
	return messages[i]?.role === "assistant" ? i : -1;
}

/** Whether the tutor's turn holding the reply at `end` closed what it was
 *  for before its words there, as the turn's own stop reads it: a clean
 *  `conclude` of practice or a clean `lesson_progress` with `close`, called
 *  by the tutor since the input that opened the turn. Pure. */
function closedInTurn(messages: readonly LhMessage[], end: number): boolean {
	for (let i = end; i >= 0; i--) {
		const m = messages[i]!;
		if (m.role !== "assistant") {
			if (nativeInputCause(m as AgentMessage, messages.slice(0, i) as AgentMessage[]) !== "neutral") return false;
			continue;
		}
		if (m.provider === "synthetic") continue;
		const closes = m.content.some((b) =>
			b.type === "toolCall" &&
			(b.name === PRACTICE_CONCLUDE_TOOL || (b.name === LESSON_PROGRESS_TOOL && lessonProgressOf(b.arguments)?.close === true)) &&
			messages.some((r) => r.role === "toolResult" && r.toolCallId === b.id && !r.isError));
		if (closes) return true;
	}
	return false;
}

/** Whether the turn holding the batch at `end` handed the session on
 *  before it: a clean mode handoff or concluded probe since the input
 *  that opened the turn. Pure. */
function handedOffInTurn(messages: readonly LhMessage[], end: number): boolean {
	for (let i = end - 1; i >= 0; i--) {
		const m = messages[i]!;
		if (m.role === "toolResult" && (MODE_HANDOFF_TOOLS[m.toolName] !== undefined || m.toolName === "probe_done") && !m.isError && (m.details as { ok?: unknown } | null)?.ok === true) return true;
		if (m.role !== "assistant" && nativeInputCause(m as AgentMessage, messages.slice(0, i) as AgentMessage[]) !== "neutral") return false;
	}
	return false;
}

export function needsContinuation(record: readonly LhMessage[]): boolean {
	// Context markers written after an answer (the course brief rides every
	// learner input) carry no input of their own: what is owed is read from
	// the input before them. Without this, a turn the app's restart cut
	// right after his answer was never resumed.
	let end = record.length;
	while (end > 0 && record[end - 1]!.role === "custom" && NEUTRAL_MARKERS.includes((record[end - 1] as { customType: string }).customType)) end--;
	const messages = end === record.length ? record : record.slice(0, end);
	const last = messages[messages.length - 1];
	if (!last || (last as { role?: string }).role !== "toolResult") return false;
	// The dismissal rule (A2 + owner ruling 2026-10-03, round-1 incident):
	// the batch's LAST resolution decides. Ending on a dismissal = the
	// user signaled STOP — no wake, no reaction owed now; the answers'
	// reactions ride the user's next plain message. Ending on a real
	// answer = the reaction is owed. One law with the pump's pause
	// (endsInDismissal reads the same last result), so continuation,
	// delivery-holding, and the pause can never disagree.
	if (isDismissedResult(messages[messages.length - 1]!) || endsInQuestionRecovery(messages)) {
		return false;
	}
	const start = trailingBatchOwner(messages);
	if (start < 0) return false;
	const content = (messages[start] as { content?: unknown }).content;
	if (!Array.isArray(content)) return false;
	const results = messages.slice(start + 1).filter((m) => m.role === "toolResult") as ToolResultMessage[];
	// PRACTICE (owner design, 2026-10-04): a batch acking a problem POSE
	// owes nothing — terminate:true ended that turn DELIBERATELY (the
	// learner's next thinking submission is the next turn), and unlike a
	// question's placeholder this ack PERSISTS (the model reads its own
	// "Problem posed" result later). Without this fold a reload after a
	// pose would wake a phantom continuation turn.
	const posedProblem = results.some(
		(m) => m.toolName === PRACTICE_PROBLEM_TOOL && !m.isError && m.details == null,
	);
	if (posedProblem) return false;
	// A mode handoff ends its turn the same way: its wake starts the next
	// agent's run, so a continuation here would run that agent twice. A
	// concluded probe is the same seam: its hand-off starts the teacher.
	const handedOff = results.some(
		(m) => (MODE_HANDOFF_TOOLS[m.toolName] !== undefined || m.toolName === "probe_done") && !m.isError && (m.details as { ok?: unknown } | null)?.ok === true,
	);
	if (handedOff) return false;
	// A handoff beside a message the voice guard refused ends its turn on
	// the rewrite, so the record ends on that message, not on the handoff:
	// a continuation then ran the next agent, and the handoff's wake ran it
	// again (round 15, m14: problem M posed, then "Your rank problem on the
	// matrix M is still open above." under it).
	if (handedOffInTurn(messages, start)) return false;
	// Closing words end their turn on purpose (teacher-agent `endsTurnFor`),
	// so the record ends on their result and nothing is owed (round 14, M1:
	// a continue after the close asked the left question again).
	if (results.some((m) => m.toolName === SEND_TO_USER_TOOL && !m.isError) && closedInTurn(messages, start)) return false;
	const answered = new Set(results.map((m) => m.toolCallId));
	const calls = (content as Array<{ type?: string; id?: string }>).filter(
		(b) => b.type === "toolCall" && typeof b.id === "string",
	);
	return calls.length > 0 && calls.every((b) => answered.has(b.id!));
}
