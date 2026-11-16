import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { SEND_TO_USER_TOOL } from "../../core/native-messages.ts";
import { serverExecute } from "../tool-execute.ts";
import { SENTENCE_BUDGETS, SENTENCE_WORDS } from "../../core/voice-check.ts";

/** The voice rules first drafts break most often, stated where the draft
 *  is written, one line each, so a rule joins the list by adding its line
 *  (round 11: 22 refusals for a sentence opening on a formula or a turn past
 *  its budget; round 12: a point made twice, 18 of the evaluators' 81
 *  refusals, and length 14, each one more model round trip; round 13: 6
 *  length refusals in 35 reading turns, so each budget is given by number). voice-check
 *  holds the examples and the counts to them. */
export const MESSAGE_DRAFT_LINES: readonly string[] = [
	"Every sentence opens with a word, never a symbol or a formula (\"The matrix $A$ takes vectors with 5 entries.\", " +
		"never \"$A$ takes vectors with 5 entries.\").",
	"Its length is the voice's budget for this kind of turn, counted as he reads it: " +
		`a teaching turn ${SENTENCE_BUDGETS.teach} sentences, a right answer ${SENTENCE_BUDGETS.right}, a wrong answer ${SENTENCE_BUDGETS.wrong}, a hint ${SENTENCE_BUDGETS.hint}, ` +
		`a direct answer to his question ${SENTENCE_BUDGETS.direct}, closing words ${SENTENCE_BUDGETS.close}; ` +
		`a clause after a colon or a semicolon is one more sentence, and a sentence over ${SENTENCE_WORDS} words is two.`,
	"A point is made once: what he was told earlier in the session is never said again, in other words, a display or a callout; say only what is new.",
	"A handoff between teaching and practice takes no words of its own (never \"Switching to an explanation of the basis test.\"): go straight to the explanation or the problem.",
	"Words are prose, never maths type: only the maths goes in $…$ (\"$A$ is invertible exactly when $\\det A \\neq 0$.\", never \"$A \\text{ is invertible exactly when } \\det A \\neq 0$.\").",
	"Every answer in the record stays saved, an earlier day's included, so never tell him one is unsaved or not saved.",
];
export const MESSAGE_DRAFT_RULES = MESSAGE_DRAFT_LINES.join(" ");

const sendToUserInput = Type.Object({
	message: Type.String({
		minLength: 1,
		pattern: "\\S",
		description: `The complete content to display to the learner. Markdown and LaTeX are supported. ${MESSAGE_DRAFT_RULES}`,
	}),
});

/** Claude's documented verbatim mid-turn output channel. Availability is
 * model-gated at the shared conversation-agent construction boundary;
 * the native call remains in history, and the view renders its message. */
export const sendToUserTool: AgentTool<typeof sendToUserInput> = {
	name: SEND_TO_USER_TOOL,
	label: SEND_TO_USER_TOOL,
	description:
		"## REQUIRED OUTPUT CHANNEL — ALWAYS USE `send_to_user`\n\n" +
		"**ALL learner-facing messages MUST be sent using `send_to_user`.** This includes explanations, teaching, " +
		"feedback, corrections, hints and final responses. " +
		"There is no exception for short messages or the end of a turn.\n\n" +
		"Ordinary response text may be converted into summarized thinking instead of reaching the learner. " +
		"**Never rely on ordinary response text to communicate with the learner. Thinking is not delivery.**\n\n" +
		"Put the complete message in `message`. Markdown and LaTeX are supported. " +
		"Do not duplicate it in ordinary response text.\n\n" +
		"Question content still belongs in the appropriate question tool; send any accompanying teaching or " +
		"commentary through `send_to_user` before calling that tool.\n\n" +
		"This tool does not pause or end your turn. Continue with other tools when needed. " +
		"After delivering your final message, end the turn without additional ordinary response text.",
	parameters: sendToUserInput,
	executionMode: "sequential",
	execute: serverExecute(SEND_TO_USER_TOOL, sendToUserInput, () => "Message received for display."),
};
