/**
 * Chat-session contracts — records, summaries, UI extension points
 *
 * Part of the domain-split contracts (src/core/contracts/): each domain file
 * is owned outright by its stream — cross-domain schema changes go through
 * master. Pure types + protocol docs + tiny pure helpers. See docs/vision.md.
 */
import type { LhMessage } from "../native-messages.ts";
import type { Phase3 } from "../phases.ts";
import type { PlanNodeStatus, PlanTree } from "./plan.ts";
import type { CourseLink } from "./course.ts";
import type { MarkResult } from "./marks.ts";
import type { ChatSession } from "../sdk-session.ts";
import { SENTENCE_WORDS } from "../voice-check.ts";

// ─── Chat records (the session store's on-disk format) ───────────────────────

/** One persisted session: data/chats/<id>.json. Wave B (owner-approved
 * 2026-09-26): the stored messages are pi-NATIVE history (LhMessage — the
 * agent loop's own shapes, provider/model/usage/thinkingSignature stamped
 * by pi) — the canonical session record IS the agent state; replay is
 * `state.messages = record.messages` + continue(). The client-shaped view
 * is the client's own grouping fold (core/view.ts, Wave D) — a pending quiz
 * is an unanswered question tool call, which is exactly what makes
 * resume-mid-question free. */
/** What a session is doing: teaching (the prober, then the teacher) or
 *  practice (the practice agent). It follows the transcript: the agents
 *  hand the session to each other (core/native-messages.ts sessionModeOf). */
export type SessionMode = "teach" | "practice";

export interface ChatRecord {
	id: string;
	title: string;
	createdAt: string;
	updatedAt: string;
	messages: LhMessage[];
	/** The mode the session started in, on records made before the mode
	 *  followed the transcript; never written now. Absent = teach. */
	kind?: SessionMode;
	/** The registered course this session studies, set at creation.
	 *  Absent only on sessions older than that rule: they stay readable and
	 *  take no learner turn until the learner links a course. */
	course?: CourseLink;
	/** The session's own topics, the topic it belongs to first: the course
	 *  topics it was started on (a topic's page, Home's review of those
	 *  topics), set at creation, else the topic its first plan's goal names
	 *  (`SessionGoal`). Set once; the step the lesson is on never moves it. */
	topics?: readonly string[];
	/** Started by a press on its topics (a topic's page, Home, the
	 *  calendar), so its first message is the app's instruction to the
	 *  tutor, never his words: the transcript draws no bubble for it
	 *  (`appOpeningAt`; round 9: "Poisson distribution" as his first
	 *  message). Set at creation. */
	appOpening?: true;
	/** The arc this session checks, by handle: set at creation when he
	 *  starts it from an arc's Check it on the course page, so the course
	 *  brief carries that arc's check (`arcs_ready`). */
	arcCheck?: string;
	/** The learner renamed the session: a plan's goal no longer names it. */
	renamed?: true;
	/** The session was named once (`ChatStore.nameSession`): only its first
	 *  turn may change the title, so a later turn or its first plan gives
	 *  at most the topic it lacked, and nothing names it again. */
	named?: true;
	/** The session's plan tree (vision §2) — written by plan tools via saveTree. */
	tree?: PlanTree;
	/** The lesson's Claude Code session, the model's memory of it
	 *  (core/sdk-session.ts); absent until its first turn reached Claude. */
	session?: ChatSession;
	/** Append-only usage log (observability, 2026-09): one entry per model
	 * turn. DELIBERATELY a parallel log, not per-message metadata — the client
	 * re-POSTs its message list every turn and its copies never carry
	 * server-stamped fields, so anything inside message objects gets clobbered
	 * by the next persist. Keyed by messageId so the transcript view can fold
	 * each entry onto its message. */
	turns?: TurnUsage[];
	/** The lesson digest's ledger: what the background digest already carried
	 *  into the course record from this session. */
	digest?: DigestLedger;
	/** The attempts each answer's saves recorded, kept the moment the
	 *  engine took the save (round 8: the app died between the engine's
	 *  write and the transcript's, so the answer showed no mark and the
	 *  resumed tutor could save it again). Keyed as the marks key an
	 *  answer: a graded question's call, or his message's id. */
	answerSaves?: AnswerSaves;
	/** The topics whose start its saves moved, kept the moment the engine
	 *  took each save, as `answerSaves` is: the transcript is written when
	 *  the turn ends, and Home dropped the start in between (round 18, M4,
	 *  integration). */
	startsMoved?: readonly string[];
	/** Its topics' titles, by handle, kept when its course is deleted, so
	 *  search still finds it by the topics it practised once no live map
	 *  names them (round 18, m24). */
	topicTitles?: Readonly<Record<string, string>>;
	/** SCHEMA STAMP (schema-versioning wave, owner 2026-10-10): LAZY v1 —
	 *  existing records stay unstamped (absence reads as v1); every write
	 *  stamps the current version. A record stamped NEWER than this build
	 *  (the downgrade scenario) is REFUSED on read: a read-modify-write
	 *  store must never rewrite what it doesn't understand. */
	version?: number;
}

/** One finished digest: the session's messages through `throughMessageId`,
 *  hashed as `fingerprint`, were read and their result saved to the engine. */
export interface LessonDigest {
	throughMessageId: string;
	fingerprint: string;
	at: string;
	/** What the save changed, in one line, or why nothing was saved. */
	outcome: string;
}

/** The digest ledger. `pending` is written before a digest starts and
 *  cleared when it ends, so the app's next start finishes one a quit cut
 *  short. */
export interface DigestLedger {
	done: LessonDigest[];
	pending?: { fingerprint: string; throughMessageId: string };
}

/** Answer key → the observation ids its saves recorded, in save order. */
export type AnswerSaves = Readonly<Record<string, readonly string[]>>;

/** The chat record format this build writes and understands. */
export const CURRENT_CHAT_VERSION = 1;

// ─── Usage accounting (the money channel) ─────────────────────────────────────

/** One model call's token accounting — the SDK's LanguageModelUsage
 * flattened to the fields we persist (undefined = provider didn't report;
 * renderers show absent, never zero). */
export interface CallUsage {
	/** Pi-normalized fresh input tokens; cache buckets are disjoint. */
	inputTokens: number | undefined;
	outputTokens: number | undefined;
	/** Cached input tokens READ (billed at the cache-read rate, if any). */
	cacheReadTokens: number | undefined;
	/** Input tokens written to the cache this call (OpenRouter bills writes
	 * for some providers; undefined = not reported/not billed). */
	cacheWriteTokens: number | undefined;
	/** Subset of cacheWriteTokens written with one-hour retention. Missing
	 * on older logs; new native captures explicitly record zero if absent. */
	cacheWrite1hTokens?: number;
	/** The reasoning portion of the output tokens. */
	reasoningTokens: number | undefined;
}

/** One billing turn: one full invocation of the teacher (a client turn or a
 * wake turn — same handler, same log). A turn with tool calls spans several
 * agent steps, and each step bills separately. Capture lands at the persist
 * seam (server). */
export interface TurnUsage {
	/** Unique per REQUEST (turn): one invocation of the handler — the
	 *  idempotency key for the append-only log. Continuation turns share a
	 *  response message id (the SDK coalesces them); keying on messageId
	 *  would swallow their usage. */
	id: string;
	/** The assistant message the turn produced — provenance, keys this
	 *  entry to the transcript (the block this turn "belongs" to). */
	messageId: string;
	at: string;
	/** The model that ran the turn, provider-qualified ("provider:id")
	 * for key-independent Pi catalog lookup at read time. */
	model: string;
	/** One entry per agent step (model call) in this turn. */
	steps: CallUsage[];
}

// ─── Plan blocks (the plan lives in the chat) ────────────────────────────────

/** Payload of the persisted `data-plan-block` UI part (2026-09 design): a
 * SNAPSHOT of the plan at the moment it changed, rendered as a block in the
 * chat flow. Attached to the assistant message that carries the plan_init
 * tool call (kind "full") or the answered check quiz part (kind
 * "neighborhood"). Data parts never reach the model (convertToModelMessages
 * drops them) — the block is pure UI history, reappearing identically on
 * reload because it lives in the record.
 *
 * Rendering contract: a "full" block renders the whole DAG borderless,
 * horizontally filling the chat column, natural height; a "neighborhood"
 * block renders current node + direct parents + direct children in its own
 * small container, the current node glowing — clearly a fragment, not the
 * whole plan. Clicking either opens the full plan in a popup. */

/** The model-facing text of the probe→teach handoff wake (the custom-message
 *  scheme): the wake message carries only the data-probe-handoff part, and
 *  the adapter flattens it to THIS. Single-sourced so the prober's seam, the
 *  tests, and reality can't drift apart.
 *
 *  REASONING-FIRST PACING (owner, 2026-09-26): the wake is the one per-turn
 *  cue on the launch turn — the old one-liner read as a dispatch order
 *  ("author now") and the teacher skipped the deliberation the planning
 *  fragment asks for. So the wake paces it: reason out the optimal way to
 *  teach THIS person THIS thing BEFORE plan_init. Honest to the machinery
 *  — plan_init is still the first tool and the plan map the first
 *  artifact; then the first step, in the same turn (Edo, 14 Nov 2026: no
 *  approval of a map of material he doesn't know yet; he interrupts when
 *  he wants). No goal line (round 8: "Today: …" previewed the lesson), and
 *  the step builds on the probe's feedback, which he already read (round
 *  8: the first step re-taught it on the same matrix). Its length is the
 *  voice's own count (round 15, M9: three of the six measured first steps
 *  came back refused, each four sentences with one over the word limit,
 *  and the rewrite cost a high-effort reply of 5 to 8 s). */
export const HANDOFF_TEXT =
	"Next: plan the full teaching arc from my current understanding to the goal understanding. " +
	"Apply the teaching methodology in your system prompt, and find the optimal way to teach me this. " +
	"Find the unconditional truths, plan the motivated derivations/discoveries, so every reasoning step has to land as obviously true. " +
	"Take your time here and really think this through. " +
	"When it's genuinely reasoned out, call plan_init and, in that same reply, start teaching with the first step alone: one idea in two to four sentences, " +
	`each of ${SENTENCE_WORDS} words or fewer, since a longer one counts as two, ` +
	"then its question, never waiting for plan_init's result; I'll interrupt if I want something else.";

/** What the wake says of the probe's last answer, read from the record
 *  once the probe's turn has landed (round 15, m13: the first step opened
 *  "Your answer took the limit of the base alone…" under the feedback
 *  "The base and the exponent change together…", since the wake said only
 *  "the probe's feedback above"): the feedback he read after it, quoted as
 *  already said; or that it got only its mark (round 14); or nothing when
 *  the probe asked nothing. */
export function probeFeedbackText(said: readonly string[] | null): string {
	if (said === null) return "";
	if (said.length === 0) return "My last probe answer got only its mark, with no words: when it was not right, the first step's first sentence names the part it missed, and the step builds from there.";
	return `I have already read the probe's feedback on my last answer: ${said.map((t) => `"${t.trim()}"`).join(" ")} That is said: the first step builds on it with something new, and never says its point again, in any words.`;
}

/** The wake in a session that continues an open task (round 11, 2 N2: the
 *  lesson's wake turned Problem sheet 4, answered right at part (c), into a
 *  nine-step rank–nullity lesson from its basics put in front of part (d),
 *  which he had just been asked to type). The task's next step is the plan;
 *  a gap the assessment names may come before it; a step that needs his
 *  material waits for it. */
export const TASK_HANDOFF_TEXT =
	"Next: carry on with my open task at the step the assessment says comes next. It is my task, not a lesson: plan only that step with plan_init, one node named for the part it is, with a node before it only for a gap the assessment names, never a lesson on the topic from its basics. " +
	"If the step needs something from me first, such as a part's text, ask me for it in one plain line, unless that is already asked above, and end your turn; work the step once I send it. Otherwise pose the step straight away.";

/** The model-facing words of Continue pressed on an open task this session
 *  holds, when nothing in it waits on him (round 13, 2 M1): Continue
 *  Problem sheet 4 opened the sheet's finished chat with no turn, and his
 *  "let us continue the sheet" was planned as a lesson from the basics, so
 *  part (c) was put off to next time. The task's step is the record's, in
 *  the course brief above. */
export function taskContinueText(tasks: readonly string[]): string {
	const named = tasks.map((key) => `\`${key}\``).join(" and ");
	return (
		`[CONTINUE MY TASK] I pressed Continue on my open task ${named}. Carry on at its saved step, as the course record above gives it. ` +
		"It is my task, not a lesson: never a lesson on the topic from its basics, and a step before it only for a gap the record names. If you plan, plan only that step with plan_init, one node named for the part it is. " +
		"If the step needs something from me first, such as a part's text, ask me for it in one plain line and end your turn; otherwise pose the step straight away. Never say this message."
	);
}

/** What a review's wake adds (round 9, 2 m4): a review that turns into
 *  teaching closed on "the lesson", since the wake asked only to start
 *  teaching. The step opens on its content (round 16, m10: the line this
 *  wake asked for, "Let's re-teach the counting step.", told him nothing
 *  his step strip did not). */
export const REVIEW_HANDOFF_TEXT =
	"This session is my review. Where its answers show I need part of the topic taught again, teach that part as the first step, opening on its content with no line announcing it, and call the session my review to its close, never the lesson.";

/** The model-facing opening of a fresh session that picks up a finished
 *  lesson: its plan carries over, so the teacher neither probes nor plans
 *  again, and reconnects in one sentence from where it stopped. */
export function sessionResumeText(title: string, steps: readonly { id: string; title: string }[], stoppedAt: string | null): string {
	const plan = steps.length > 0 ? ` Its plan carries over, as this session's plan map: ${steps.map((s) => `${s.id} (${s.title})`).join("; ")}.` : "";
	const where = stoppedAt ? ` It stopped at ${stoppedAt}.` : "";
	return (
		`[CONTINUING] This session picks up the lesson "${title}" from an earlier session.${plan}${where} ` +
		"Do not probe and do not present a new plan. Reconnect in one sentence to where it stopped, from the course record's task step when there is one, " +
		"then carry on with the next step, tagging its questions with the plan's node ids."
	);
}

/** The model-facing text of a mode handoff's wake, by the mode it starts.
 *  The new agent reads what to do from the handoff call above it: the
 *  scope to practise, or the topic to teach. */
export const MODE_HANDOFF_TEXT: Readonly<Record<"teach" | "practice", string>> = {
	practice:
		"[PRACTICE] — the session moves to practice, on the scope the handoff above names (a whole lesson when it lists `topics`). Choose the material as your system prompt says and pose the first problem, with no line before it about what you chose or why.",
	teach:
		"[TEACHING] — the session moves back to teaching, on what the handoff above names. Carry on from there as your system prompt says: what you explain is one teaching step, in two to four sentences and at most one display, then its check.",
};

/** The handoff tools' ack: the turn ends at the handoff, and the next
 *  agent's run starts from the wake. */
export const MODE_HANDOFF_ACK_TEXT = "Handoff recorded. Say nothing more and end your turn: the next agent takes over from here.";

// ─── Practice sessions (owner, 2026-10-04) — marker + ack texts ──────────────
// Single-sourced here per the marker law: the model-facing text of every
// custom marker lives in core/contracts, never in the flattening seam.

/** The model-facing register of a thinking submission (newThinkingMessage
 *  prefixes the learner's text with this label). Hints and commits ride
 *  one channel — the label is the ONLY difference the model sees. */
/** The single submission label (owner round, 2026-10-05): one send
 *  lane — whether a submission claims an answer is read from the text,
 *  not declared by a button. */
export const THINKING_LABEL = "Your thinking";

/** The conclude tool's ack — shared by the executed call (agent layer) and
 *  the dismissal-synthesized pair (input-events), so a concluded problem
 *  reads identically to the model however it concluded. Owner round 16:
 *  the turn ENDS after concluding (a system-prompt law, no tool-level
 *  terminate — the model may speak its closing words first, then must
 *  stop calling tools); the next problem waits for the learner's
 *  explicit go-ahead. */
export const CONCLUDE_ACK_TEXT =
	"Problem concluded. Say your closing words about the learner's work if useful, then END YOUR TURN — no further tool calls, except `teach` when he asked to be taught. The next problem is NEVER posed here: it waits for the learner's explicit go-ahead (a *Next problem* message, or their own words asking for the next one). Between problems, answer their questions about the concluded one.";

/** The learner's explicit move-on signal (owner round 16, 2026-10-06):
 *  the model-facing text of the practice-next marker — single-sourced
 *  like THINKING_LABEL. The button/Enter-on-empty path appends the
 *  marker; the model reads this and poses (or wraps) per the doctrine. */
export const NEXT_PROBLEM_TEXT =
	"[NEXT PROBLEM] — the learner's explicit go-ahead: pose the next problem now per the selection rules, or, if the arc is complete, close in at most two sentences: the one move the session showed was not obvious yet, or what comes next.";

/** What the agent reads when he presses Done for today: the
 *  done-tonight marker's content, per answering agent (only the teacher
 *  has `lesson_progress`). Anything he left open arrives just before it
 *  already resolved: a question as a dismissal with reason "tonight", a
 *  problem as a dismissed conclude. */
/** How every agent closes on Done for today, in the voice's budget for a
 *  close. What he left open comes back as it was, so the close says only
 *  what he picks up and when: a cue toward its answer would make the
 *  pick-up count as helped (round 5, 14 Nov 2026). */
const DONE_LIMITS = "Never a step, cue, method or hint toward anything he left open, and no praise or summary of the session.";
/** An answer he sent just before pressing Done is graded in the closing
 *  turn; its card said "Partly right" with no reason, straight before the
 *  close (round 11, 4 minor 1). */
const DONE_GRADED = "An answer he sent before pressing it is still graded and saved as usual; when it was not fully right, first say in one sentence what it missed, as its own message, then close.";
/** Every topic he answered in the session has a next day, and the close
 *  names it (round 17, 2 m2: a four-topic review's close named only
 *  Conditional probability's, and Binomial, Random variables and
 *  Inclusion-exclusion got none). */
const DONE_DAYS = "and the day each topic he answered in this session comes back, by its topic: topics on one day together, and with three days or more, the soonest and that the rest are on his calendar";
/** A start planned for today that the session's saves moved is named,
 *  with its new day and its cause (round 18, M4: a hinted, then partly
 *  right, answer moved Expectation off today, every receipt carried it in
 *  `starts_moved`, and the close named only the review days). */
const DONE_MOVED = "a start planned for today that his answers moved (a save's `starts_moved` whose `moved.from` is today) is named too, by its title, with its new day and its cause, its day said even when the other days are left to his calendar";
/** Where his half answer waits, and a start's title inside a sentence
 *  (round 18, m15: "…is waiting for you there. Because that lesson is
 *  unfinished, Any matrix represents a linear map moved …, and later
 *  starts moved too."). */
const DONE_HALF = 'a question he left a half answer on (`draftKept`) is his half answer, waiting in this session by its name (your Invertible matrices lesson, your Probability review), never "there"; a start named inside a sentence has its title set off in quotes (Starting “Any matrix represents a linear map” moves to Tuesday 10 November), and every move he is told is named with its day, never as "later starts moved too"';
const DONE_CLOSE = `Then close in at most two sentences: what he picks up next, named by its topic or its place (the kernel question, part (c) of the sheet), never by what it asks, and its day when the plan gives one, ${DONE_DAYS}; ${DONE_MOVED}; a topic not started is one he starts, never a review; ${DONE_HALF}. ${DONE_LIMITS}`;
/** Practice keeps nothing of a problem dropped at Done for today, so its
 *  close names only what the record keeps (round 9, 3 m7: "You still have
 *  the kernel problem you closed … to pick up"), and only this session's:
 *  another session's open work is Home's to name (round 12, 3 D7: Rank
 *  practice closed on "Part (c) of Problem sheet 4 is still open"). The
 *  problem he left open is named once, as set aside (round 14, m31: "Your
 *  Rank and the column space review is on Wednesday 11 November." left the
 *  4 × 6 system unnamed). */
const DONE_CLOSE_PRACTICE = `Then close in at most two sentences: a problem he left open, named once by what it is on (the 4 × 6 system), as set aside, never as something he picks up; then only what his record keeps for next time from this session, an open task this session worked on at its place (part (c) of the sheet), never another session's open work, and the day of his next review when the plan gives one, never by what it asks, ${DONE_DAYS}; ${DONE_MOVED}; a topic not started is one he starts, never a review. ${DONE_LIMITS}`;

export const DONE_TONIGHT_TEXT = {
	prober:
		"[DONE FOR TODAY] — the learner pressed Done for today. He is stopping now. A question he left open was never answered and its answer was never shown: don't grade it, record no attempt for it, and don't ask anything more today. " +
		`${DONE_GRADED} ${DONE_CLOSE}`,
	teacher:
		"[DONE FOR TODAY] — the learner pressed Done for today. He is stopping now. A question he left open was never answered and its answer was never shown: don't grade it, record no attempt for it, and don't ask anything more today. Close the session now: call `lesson_progress` with `close: true` (and `done` for any step he finished). " +
		`${DONE_GRADED} ${DONE_CLOSE}`,
	practice:
		"[DONE FOR TODAY] — the learner pressed Done for today. He is stopping now. A problem he left open was dropped with nothing recorded, and nothing keeps it, so name it only as set aside, never as something he picks up or still has; a question he left open was never answered: don't grade either, and pose nothing more today. " +
		`${DONE_GRADED} ${DONE_CLOSE_PRACTICE}`,
} as const;

/** The mark he thinks is right, in the record's words and his. */
const PROPOSED_WORDS: Readonly<Record<MarkResult, string>> = {
	correct: "right (correct)",
	partial: "partly right (partial)",
	incorrect: "not right (incorrect)",
};

/** How his answer card words an attempt (study-words.ts `MARK_HOW_WORDS`,
 *  the rule `markHow`), so a ruling says what the card says (round 5: "it
 *  already counts as your own work, with no help" sat on a card that said
 *  otherwise). */
const CARD_WORDS_FOR_RULING =
	'His card says how each attempt went: help given reads "With help"; a prediction before its step was taught reads "Prediction, not counted"; an answer he gave up on reads "Gave up"; a right answer recorded as uncertain reads "Not yet confirmed"; any other attempt with no help reads "On your own", a guess or a partly right one included, with his confidence beside it as "Guessing" or "Confident", never "sure" or "guess". In your ruling and in `ruling`, say how it went in the card\'s words for the attempt as you re-mark it, lowercase inside a sentence ("it stays with help").';

/** The longest question excerpt a dispute quotes. */
const DISPUTE_QUOTE = 400;

/** What the agent reads when he disputes a mark (Edo, 14 Nov 2026): the
 *  dispute marker's content. The rules for judging it live in the course
 *  record's doctrine; this names the answer, its attempts and what he
 *  said. Pure. */
/** How he thinks a disputed answer should count, in the card's words and
 *  the record's. */
const PROPOSED_HOW_WORDS: Readonly<Record<"ownWork" | "withHelp", string>> = {
	ownWork: 'on his own ("On your own": help "none")',
	withHelp: 'with help ("With help": the help he had)',
};

export function disputeText(
	dispute: { observations: readonly string[]; row?: string; said?: string; proposed?: MarkResult; proposedHow?: "ownWork" | "withHelp" },
	question: string,
): string {
	const quoted = question.length > DISPUTE_QUOTE ? `${question.slice(0, DISPUTE_QUOTE)}…` : question;
	return [
		`[MARK DISPUTED] — the learner pressed Dispute on the mark recorded for his answer to: "${quoted}".`,
		dispute.row
			? `He disputes one try on its card, "${dispute.row}"; the attempt that stands for that try: ${dispute.observations.join(", ")}. Re-judge that try only.`
			: `The attempts that stand for it: ${dispute.observations.join(", ")}.`,
		dispute.said ? `What he says is wrong with the mark: "${dispute.said}"` : null,
		dispute.proposed ? `The mark he thinks is right: ${PROPOSED_WORDS[dispute.proposed]}.` : null,
		dispute.proposedHow ? `How he thinks it should count: ${PROPOSED_HOW_WORDS[dispute.proposedHow]}.` : null,
		"Re-judge it now, as the course record says for a disputed mark: read those attempts whole, judge his response against the question and its committed answer, record the re-marked attempt with `course_save` whether you agree or not, then give him your ruling in one or two lines.",
		CARD_WORDS_FOR_RULING,
		"A question he had open when he disputed was set aside unanswered, its answer not shown: after your ruling, ask it again as it was. An active problem stays active.",
	]
		.filter(Boolean)
		.join("\n");
}

/** The practice dock's request buttons: a hint, the rest of the
 *  solution, or teaching instead of this problem. A request is never an
 *  answer: it rides its own marker (`practice-request`), so the agent and
 *  the record both read what was asked, never a claimed answer. */
export const PRACTICE_REQUESTS = ["hint", "show", "explain"] as const;
export type PracticeRequest = (typeof PRACTICE_REQUESTS)[number];

export function isPracticeRequest(value: unknown): value is PracticeRequest {
	return typeof value === "string" && (PRACTICE_REQUESTS as readonly string[]).includes(value);
}

/** What the agent reads for each request (the marker's content head). */
export const PRACTICE_REQUEST_TEXT: Readonly<Record<PracticeRequest, string>> = {
	hint: "[HINT] — the learner pressed Hint on the active problem. This is a request, not an answer: give the next rung of the hint ladder, one rung only, above what his work so far and your last message already give him: one move or fact neither says, never his work or your nudge said again in other words, and never his own idea handed back for him to check. Then wait for his work.",
	show: "[SHOW ME] — the learner pressed Show me on the active problem. This is a request, not an answer: he stops working on it. Conclude it now (surrendered with rung R5, unless his work already solved it) so the committed solution shows, then point at the step where his work stopped.",
	explain:
		"[EXPLAIN INSTEAD] — the learner pressed Explain instead on the active problem. This is a request, not an answer: he wants teaching, not this problem. Conclude it with outcome movedOn (no attempt is recorded unless he already submitted work on it), then hand the session to teaching with `teach`, with no words between: the problem's card shows how it ended, and the teaching follows.",
};

/** Which rung a Hint request asks for, by how many hints this problem has
 *  had: the first says where to look, unless he was already told where
 *  (round 16, m12: after "What does R3 − R1 − R2 give you?", the first hint
 *  could only say "Your suspicion about row 3 is something you can check
 *  yourself"), the second a nudge, the third and later one step. Show me
 *  reveals the rest. Every rung is a statement:
 *  the first asked "one question that points at where to look", and the
 *  hint only rephrased the problem (round 15, m16: "Does a row of A with
 *  nonzero entries still have to be nonzero once elimination is done?"). */
export function hintRungText(nth: number): string {
	if (nth <= 1) return "This is his first hint on this problem: say where to look (R0 or R1), as one statement in this problem's own terms of what it did not give him, never a question and never the problem in other words. No method, no step, no answer. When his work or your last message already says where to look, that rung is given: name the pattern or the idea instead (R2 or R3).";
	if (nth === 2) return "This is his second hint on this problem: one nudge that names the pattern or the idea (R2 or R3). Carrying it out stays his.";
	return `This is hint ${nth} on this problem: one step, worked or outlined (R4 or R5), never the rest of the solution. Show me is how he sees the rest.`;
}

/** The compaction marker's model-facing header (owner round 14,
 *  2026-10-05). The marker's content is this header + the summary — the
 *  single text the provider sees in place of the dropped span. Wording
 *  law: it must tell the model (a) a cut happened and is routine, (b) the
 *  summary replaces everything before it, (c) what follows is verbatim
 *  recent transcript — so the model neither re-asks covered ground nor
 *  distrusts the seam. */
export const COMPACTED_HISTORY_HEADER =
	"[SESSION HISTORY COMPACTED] The transcript before this point was summarized to fit the context window; the summary below replaces it. Everything after this message is the verbatim recent transcript.";


export interface PlanBlockData {
	/** Only "full" survives (the 2026-09-11 pivot): the plan renders IN
	 *  FLOW once, at authoring. The neighborhood fragments are retired —
	 *  position derives live from the transcript (the persistent DAG
	 *  window is the successor). */
	kind: "full";
	at: string;
	/** The current node at snapshot time (the glow target; null = none). */
	current: string | null;
	/** All nodes of the authored tree. Statuses are the snapshot's,
	 * derived at emission time — the block never re-derives at render. */
	nodes: Array<{ id: string; title: string; status: PlanNodeStatus }>;
	edges: Array<{ from: string; to: string }>;
}

/** What a session is for, as its first turn (`name_session`) or its first
 *  plan names it: a short `title`, and the course `topic` it is about when
 *  it is about one. It names a session started on no topic, once
 *  (`ChatStore.nameSession`). */
export interface SessionGoal {
	title: string;
	topic?: string;
}

/** How the tutor's last turn left a session that waits on no question or
 *  problem it posed: its words asked him something, or it wrote the plan
 *  but taught no step, partway through a lesson ("mid-lesson"), its turn stopped before it finished, so the next word is
 *  the tutor's ("cut"), his Done for today stopped it with work still open
 *  ("left", left for next time), or it ended the lesson, a practice round
 *  or a one-off answer ("closed"). */
export type SessionEnd = "mid-lesson" | "cut" | "left" | "closed";

/** The list view's shape (messageCount instead of full messages) + the
 *  per-session status the picker renders. `phase` and `pendingQuestion`
 *  derive from the stored record (tree + messages); the store computes
 *  them in listChats. Liveness (`busy`) is NOT record-derived — the API
 *  route merges it in (see ChatListItem).
 *
 *  Phase semantics (three phases, event-driven — docs/probe-teach-split.md
 *  §4): probe ends at the concluded probe_done, plan ends at the successful
 *  plan_init; derived from the transcript (core/phases.ts phaseAt3).
 */
export interface ChatSummary {
	id: string;
	title: string;
	createdAt: string;
	updatedAt: string;
	/** The session's current mode (sessionModeOf over the transcript). */
	kind: SessionMode;
	messageCount: number;
	/** The session's current phase, derived from the stored plan tree. */
	phase: Phase3;
	/** An unanswered quiz/ask question is waiting for the learner. */
	pendingQuestion: boolean;
	/** Practice sessions (2026-10-04): a posed problem with no conclude —
	 *  the sidebar meta's "Problem waiting". False on teaching sessions. */
	pendingProblem: boolean;
	/** The course the session studies (the record's own field, carried by
	 *  the summary spread); absent on sessions older than the course rule. */
	course?: CourseLink;
	/** The course topics the session was started on, then those its
	 *  transcript worked on (sessionTopicsOf): candidates a caller checks
	 *  against the course map.
	 *  The list always sets it; a summary made elsewhere may leave it out. */
	topics?: readonly string[];
	/** The session's own topics (the record's `topics`), the topic it
	 *  belongs to first: fixed once, never the step the lesson is on. The
	 *  list always sets it; a summary made elsewhere may leave it out. */
	ownTopics?: readonly string[];
	/** How the tutor's last turn left the session (sessionEndOf); a summary
	 *  made elsewhere may leave it out, which reads as closed. */
	ended?: SessionEnd;
	/** The tutor's last turn ended because he stopped it (`stoppedByHim`),
	 *  not because the app restarted: a cut session then says he stopped it. */
	stopped?: true;
	/** The tutor's last turn failed (Claude Code refused or broke off), so
	 *  it never replied: a paused session says it couldn't reply. */
	failed?: true;
	/** He has said nothing in it past the words it opened with, so it
	 *  holds nothing of his to pick up (`currentSessions`). */
	untouched?: true;
	/** The engine tasks the session last saved as open, by key
	 *  (sessionTasksOf): the work it holds at a step the engine keeps. */
	tasks?: readonly string[];
	/** The title its saves gave the first task they opened, kept once the
	 *  task closes (sessionTaskTitleOf), so it is named one way all day. */
	taskTitle?: string;
	/** It is a review of course topics: opened on topics with a review's
	 *  words (`openedAsReview`), whatever it is named now. The list always
	 *  sets it; a summary made elsewhere may leave it out. */
	review?: boolean;
	/** The one of a review's topics its plan re-teaches (`retaughtTopicOf`):
	 *  its map and what it left are that topic's alone, never its other
	 *  topics' (round 18, M2). Absent otherwise. */
	retaught?: string;
	/** The topics whose start its saves moved (`startsMovedOf`): while it
	 *  is open, Home keeps a start it moved off today (round 18, M4).
	 *  Absent when none. */
	startsMoved?: readonly string[];
	/** He studied in it (`studiedIn`): he answered something, or wrote
	 *  after its opening. The list always sets it; a summary made elsewhere
	 *  may leave it out, which reads as not studied. */
	studied?: boolean;
	/** When his newest input in it came (`opensTurn`: a message, an
	 *  answer, a handoff), ISO; absent before any. A write that was not his
	 *  (a left question posed again on opening it) never moves it. */
	studiedAt?: string;
	/** The local days, YYYY-MM-DD and in order, on which his input came:
	 *  every day he worked in it, a lesson begun one day and left the next
	 *  included (round 16, m8). */
	studiedDays?: readonly string[];
	/** The local day, YYYY-MM-DD, of its newest saved answer on each topic:
	 *  a review he left today keeps Home's line for the topics it did not
	 *  answer today (round 17, M4). Absent with no saved answer. */
	answeredOn?: Readonly<Record<string, string>>;
	/** Its topics' titles kept when its course was deleted (`ChatRecord.topicTitles`). */
	topicTitles?: Readonly<Record<string, string>>;
}

/** The sidebar's session row: a summary + live liveness. The chats list
 *  route attaches `busy` from the turn-liveness registry ONLY — a running
 *  teach turn (owner, minimal-color round: background jobs no longer
 *  count; the sidebar's Background agents section is their channel, and
 *  the row spinner means exactly "a turn is in flight"). The store itself
 *  can't see liveness (import law: store never imports server), hence the
 *  split at exactly the record/liveness seam. */
export interface ChatListItem extends ChatSummary {
	busy: boolean;
	/** Its course was deleted (the record is gone, `courseDeleted` on the
	 *  server): the session is history, off Today, kept in search and the
	 *  calendar. The route attaches it; absent reads as not deleted. */
	courseDeleted?: boolean;
}

// ─── Artifact renderer registry (client extension point) ────────────────────

/**
 * components/chat.tsx renders any tool part it doesn't specially handle via
 * components/artifacts/index.ts's registry, keyed by tool name ("research",
 * "demo", "visual", …). Workers add renderers there — chat.tsx is off-limits
 * to artifact work. Renderer receives the raw tool part; it typically renders
 * an activity card while state is input-available (poll /api/jobs) and the
 * artifact (iframe / svg) when output-available.
 */
export interface ArtifactPartProps {
	part: {
		type: string;
		state: string;
		toolCallId: string;
		input?: unknown;
		output?: unknown;
		/** The pose-side fold (owner round 17): the whole problem-call
		 * arguments joined onto the conclude part by projectView — the
		 * observability drawer's data. */
		problemInput?: unknown;
		/** The view-seam join for conclude cards (owner round, 2026-10-05):
		 *  the modelSolution committed at POSE time, folded onto the part by
		 *  projectView — the reveal is never re-authored. */
		reveal?: unknown;
		/** A demo or figure call's delivered result, joined onto the part
		 *  by projectView (view.ts `PlacedArtifact`): drawn at the call. */
		artifact?: unknown;
	};
}

// ─── Titles ──────────────────────────────────────────────────────────────────

/** The auto-title's character cap (owner, 2026-10-06): long enough to
 *  stay informative in the sidebar and the top bar, short enough that a
 *  first message never reads as a paragraph. Tunable — one number, one
 *  place. */
export const TITLE_MAX_CHARS = 72;

/** Derive a short chat title from the learner's first message (pure).
 *  Smart truncation (owner, 2026-10-06): the cut snaps to a word boundary
 *  AT OR UNDER the cap — a title never ends mid-word. The one exception
 *  is a single word longer than the cap (rare, but real: identifiers,
 *  URLs): it cuts at the cap, splitting the word. Whitespace collapses to
 *  single spaces first, so boundaries are always single-space boundaries.
 *  Used on chat creation; deterministic so tests can pin it. */
export function titleFromPrompt(prompt: string): string {
	const oneLine = prompt.replace(/\s+/g, " ").trim();
	if (oneLine.length <= TITLE_MAX_CHARS) return oneLine;
	// Last space among the first TITLE_MAX_CHARS characters; the cut sits
	// before it so no trailing space rides into the title.
	let cut = -1;
	for (let i = TITLE_MAX_CHARS; i > 0; i--) {
		if (oneLine[i - 1] === " ") {
			cut = i - 1;
			break;
		}
	}
	// One long word: no boundary exists under the cap — split it (owner's
	// special case). This also lands correctly when the first word exactly
	// fills the cap: cutting at the cap IS the boundary.
	if (cut < 0) cut = TITLE_MAX_CHARS;
	return `${oneLine.slice(0, cut)}…`;
}
