"use client";

import { createContext, Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChatSession } from "@/components/session";
import { STREAM_DROPPED, visibleQueuedSteers } from "@/components/session-core";
import { SetupDialog } from "@/components/setup-dialog";
import { Hint } from "@/components/ui/hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useModelSetup, SignInPill } from "@/components/setup-cta";
import { useStickToBottomContext, type StickToBottomContext } from "use-stick-to-bottom";
import {
	Conversation,
	ConversationContent,
	ConversationEmptyState,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { LiveToolCard } from "@/components/artifacts/live-tool-card";
import { AnswerMarksProvider, DisputeDialog, type DisputeDraft } from "@/components/answer-mark";
import { useAnswerMarks } from "@/components/answer-marks-fetch";
import { MalformedQuestion } from "@/components/malformed-question";
import { artifactRenderers } from "@/components/artifacts";
import { SubagentSteerCard } from "@/components/artifacts/steer-card";
import { sentPhotos, usePhotoDraft, type PendingPhoto } from "@/components/photos";
import { useEnterSubmits } from "@/components/enter-submits";
import { clearOpeningPrompt, readOpeningPromptEntry, stashOpeningPrompt, OPENING_PROMPT_FAILURE } from "@/components/opening-prompt";
import { takeLessonMessage } from "@/components/lesson-message";
import { forwardDockWheel, useDockReserve } from "@/components/dock-height";
import { QueuedSteersBody, type QueuedSteerLine } from "@/components/queued-steers";
import { useFieldCycle } from "@/components/field-cycle";
import { JobsContext } from "@/components/jobs-context";
import { useServerEvent, useServerResync } from "@/components/server-events";
import {
	isProviderKeyRefusal,
	firstSourceTextParts,
	messageAnchorId,
	sessionModeOf,
	textPartMessageId,
	kbdEventForAction as kbdEventForChat,
	type ChatInput,
	type LhMessage,
} from "@/src/core";
import { latestTree } from "@/components/lesson/plan-facts";
import { MermaidOverlay, SessionMermaidContext } from "@/components/session-overlay";
import { AbortTurnDialog, type AbortMode } from "@/components/abort-turn-dialog";
import { SessionFind } from "@/components/session-find";
import { SessionMessageNavigation } from "@/components/session-navigation";
import { GraphContextCard, type GraphContextData } from "@/components/graph-context-card";
import { TopBar } from "@/components/top-bar";
import { CourseLinkBanner } from "@/components/course-link-banner";
import type { ArtifactPartProps, Confidence, Photo, JobRecord, LessonPlace, PracticeRequest, PracticeRequestDetails, QuestionAnswerData } from "@/src/core";
import type { AnswerMark, CourseLink, DisputeDetails, LhViewMessage, SessionMode } from "@/src/core";
import { CompactionCutDivider } from "@/components/compaction-divider";
import {
	activeProblemOf,
	pendingQuestionOf,
	malformedQuestionsOf,
	dismissedAnswer,
	endsInFailedTurn,
	failedResponseAtEnd,
	findPendingToolCall,
	isClaudeLimitFailure,
	derivePlanStatuses,
	toolQuestionKind,
	closedTonight,
	doneTonightAtEnd,
	replyCutOf,
	latestMarkedAnswer,
} from "@/src/core";
import { ClaudeLimitPrompt } from "@/components/claude-limit-prompt";
import { ActiveProblemContext } from "@/components/lesson/active-problem";
import { LessonTopBar, topicCrumbShown } from "@/components/lesson/lesson-top-bar";
import { courseHref, unitHref } from "@/components/unit-inbox/unit-href";
import { LessonRoadmap } from "@/components/lesson/lesson-roadmap";
import { partKey, roadmapSteps, stepAnchors } from "@/components/lesson/roadmap-facts";
import { scrollSessionTarget } from "@/components/session-navigation";
import { ActivityLine } from "@/components/lesson/activity-line";
import { TurnError } from "@/components/lesson/turn-error";
import { useSettingsDialog } from "@/components/settings/settings-dialog";
import { SectionBreak } from "@/components/lesson/section-break";
import { LESSON_COLUMN } from "@/components/lesson/lesson-column";
import { followTarget, replyStart, type ReplyAnchor } from "@/components/lesson/reading-position";
import { ScrollCueButton } from "@/components/lesson/scroll-cue";
import { showsWorking } from "@/components/lesson/working-sign";
import { strandedDraft } from "@/components/lesson/stranded-draft";
import { LESSON_WORDS } from "@/components/study-words";
import { forgetClosedBoxes, keepPhotos, keepWords, keptPhotos, keptWords, takeKeptPhotos } from "@/components/lesson/kept-drafts";
import { ReplyCut } from "@/components/lesson/reply-cut";
import { landFocus, readingKeyScroll } from "@/components/lesson/focus-home";
import { DoneTonightButton, DoneTonightLine } from "@/components/lesson/done-tonight";
import { CourseGoneLine } from "@/components/lesson/course-gone";
import { CourseUnreadableLine } from "@/components/lesson/course-unreadable";
import { ProseComposer, proseBox, proseOpenKey, type ProseOpen } from "@/components/lesson/prose/prose-composer";
import { ProseAnswerProvider, useProseAnswer } from "@/components/lesson/prose/prose-answer";
import { ProseQuestion } from "@/components/lesson/prose/prose-question";
import { reaskedAfterHint } from "@/components/lesson/prose/prose-question-data";
import { DisputeBubble, problemStatement, ProseConclude, ProseProblem, RequestBubble, ThinkingBubble, type PracticeThinkingData } from "@/components/lesson/prose/prose-practice";
import { LearnerBubble } from "@/components/lesson/prose/learner-bubble";

/** The chat routes' answer for a deleted lesson: TurnError reads it as
 *  "This lesson was deleted." with Go to Home. */
const LESSON_GONE = JSON.stringify({ error: "Unknown chat" });

/** The transcript's own column inside the scroller. */
const TRANSCRIPT_COLUMN = "[data-transcript-column]";

// The dock overlay's gradient band (h-24) — part of the reserved tail.
const GRADIENT_H = 96;

/**
 * Server-sync channel for artifact renderers: the CENTRAL jobs poll in Chat
 * calls syncFromServer() when a background job settles — the wake turn's
 * steer + response are already persisted by then, so fresh messages replace
 * local state in one pull. sendText feeds the demo error-fix loop.
 * (contracts.ts "THE ASYNC PROTOCOL" §4.)
 */
export const ChatActionsContext = createContext<{
	chatId: string;
	syncFromServer: () => Promise<void>;
	/** Send a user message into the session (demo error-fix loop, W6). */
	sendText: (text: string) => void;
	/** Opens the sign-in dialog: refused job cards deep-link into the same
	 *  SetupDialog the send interception uses. */
	openSetup: () => void;
} | null>(null);

/** The signed-out-account refusal's transport seam (zero-keys wave,
 *  Platform's 66dbea9): the DefaultChatTransport throws the 503 body
 *  VERBATIM as the error message, so the envelope's own matcher
 *  (core, invariant-tail) decides; the wording can never drift client-
 *  side. Exported pure for tests. */
export function parseProviderKeyRefusal(message: string | undefined): boolean {
	if (!message) return false;
	try {
		const body = JSON.parse(message) as { code?: unknown; error?: unknown };
		return body.code === "provider_key_missing" && typeof body.error === "string" && isProviderKeyRefusal(body.error);
	} catch {
		return false;
	}
}

/** Retry sends no composer text. Its refusal must not resurrect the draft
 * from an earlier, already-durable text send over today's unsent composer.
 * Retire that fallback synchronously, never when the async Retry settles:
 * a later ordinary send may own a new recovery draft by then. */
export function retryFailedResponse(
	send: (input: ChatInput) => void,
	submittedDraft: { current: string | null },
): void {
	submittedDraft.current = null;
	void send({ type: "retry" });
}

/** A wake-pipeline steer message: user-role delivery whose metadata marks it
 * as a sub-agent result — rendered as an artifact card, never a bubble. */
function isSubagentSteer(m: LhViewMessage): boolean {
	return (m.metadata as { subagentResult?: unknown } | undefined)?.subagentResult != null;
}

/**
 * The teaching session. All chat state lives in useChat; the server persists
 * the canonical transcript after every turn.
 *
 * The bottom blob is ONE persistent shell whose contents swap (chat composer ↔
 * question dock ↔ collapsed bar). The shell is sticky INSIDE the scroller —
 * never overlapping the transcript at rest, never covering the scrollbar —
 * and DockOverlay animates its height on variant changes.
 */
export function Chat({
	chatId,
	title,
	initialMessages,
	initialError,
	initialPrompt,
	initiallyInFlight,
	initiallyCompacting = false,
	startedIn,
	course,
	place,
	initiallyCourseDeleted = false,
}: {
	chatId: string;
	title: string;
	/** The session's course. Absent on sessions older than the rule that
	 *  every session has one: the link banner replaces the dock. */
	course?: CourseLink;
	/** Where the lesson sits in its course (its topic and arc), read once
	 *  when the page opened; absent when the course map could not say. */
	place?: LessonPlace;
	/** The course was deleted: the lesson is history, with no box to write in. */
	initiallyCourseDeleted?: boolean;
	initialMessages: LhMessage[];
	/** Memory-only settlement notice supplied on reopening. */
	initialError?: string;
	/** The mode an older record stored at creation. The mode now is folded
	 *  over the transcript from it: practice renders a Practice tag in
	 *  place of the phase chip. */
	startedIn?: SessionMode;
	initialPrompt?: string;
	/** A teacher turn is running server-side but attached to no client
	 * (navigated away mid-turn, returned while in flight). */
	initiallyInFlight?: boolean;
	/** A compaction holds the chat's model gate at mount (navigated away
	 * mid-compaction — the registry is live server state, the
	 * compaction-changed event already fired). The transcript spinner
	 * and send gates key on it. */
	initiallyCompacting?: boolean;
}) {
	// Reattach plumbing (background-turn runner wave): the hook holds the
	// settled terminal's callback — a stable ref assigned below, once
	// syncFromServer exists (refs, not closures: no stale capture).
	const reattachSettledRef = useRef<() => void>(() => {});
	const { open: openSettings } = useSettingsDialog();

	// THE SESSION HOOK (Wave D, owner-approved 2026-09-26): the app-owned
	// replacement for useChat + the AI-SDK transport. The record is native
	// history; the VIEW (grouped, golden-master) is derived client-side
	// (core/view.ts projectView); sends are ONE explicit input event each
	// ({chatId, input} — the stash indirection died with the SDK), and the
	// turn stream is the VERBATIM AgentEvent passthrough the server emits.
	const { messages, nativeMessages, hasConfirmedConversation, contextTokens, send: sendInput, continueIfOwed, steer: steerInput, steerQueue, submitAnswer: submitInput, dismissQuestion, dismissProblem, questionDraft, saveQuestionDraft, setMessages, adoptRecord, status, error, stop, clearError, resumeStream, setReattachSettled } =
		useChatSession({ chatId, initialMessages, initialError, initiallyInFlight });

	// The question is the tutor's words and the one composer answers it
	// (components/lesson/prose/prose.md). Esc while something is open turns
	// the composer between answering and asking (prose-composer.tsx binds it).
	const proseToggleRef = useRef<(() => void) | null>(null);
	const column = LESSON_COLUMN;
	const sessionFindScopeRef = useRef<HTMLDivElement | null>(null);
	const scrollContextRef = useRef<StickToBottomContext | null>(null);

	/* THE SCROLL MODEL (components/lesson/reading-position.ts): every action
	 * of his that starts a turn passes here, so the lesson goes to its end
	 * and the reply that follows holds at its own first line. Automatic
	 * continuations go straight to the session and anchor nothing. */
	const replyAnchorRef = useRef<ReplyAnchor>(null);
	/* What he has typed in the open dock (stranded-draft.ts): cleared the
	 * moment this window sends, so words still here when the dock's question
	 * leaves were overtaken by another window. */
	const liveDraftRef = useRef<{ key: string; text: string } | null>(null);
	const [answeredElsewhere, setAnsweredElsewhere] = useState(false);
	// The dock this window last sent from: its question leaving is his doing.
	const dockKeyRef = useRef<string | null>(null);
	const sentFromDockRef = useRef<string | null>(null);
	const followAction = useCallback(() => {
		const context = scrollContextRef.current;
		if (!context) return;
		const kids = Array.from(sessionFindScopeRef.current?.querySelector<HTMLElement>(TRANSCRIPT_COLUMN)?.children ?? []);
		replyAnchorRef.current = (kids.at(-1) as HTMLElement | undefined) ?? null;
		void context.scrollToBottom();
	}, []);
	const followTargetScrollTop = useCallback((bottom: number, { scrollElement }: { scrollElement: HTMLElement }) =>
		followTarget(bottom, replyStart(replyAnchorRef.current, scrollElement)), []);
	const jumpToLatest = useCallback(() => {
		replyAnchorRef.current = null;
		void scrollContextRef.current?.scrollToBottom();
	}, []);
	const send = useCallback<typeof sendInput>((...args) => {
		liveDraftRef.current = null;
		sentFromDockRef.current = dockKeyRef.current;
		setAnsweredElsewhere(false);
		followAction();
		return sendInput(...args);
	}, [sendInput, followAction]);
	const steer = useCallback<typeof steerInput>((...args) => {
		// His overtaken words go out as this steer: the line that says they
		// wait in the box goes with them (round 3: it stayed, box empty).
		setAnsweredElsewhere(false);
		followAction();
		return steerInput(...args);
	}, [steerInput, followAction]);
	const submitAnswer = useCallback<typeof submitInput>((...args) => {
		liveDraftRef.current = null;
		sentFromDockRef.current = dockKeyRef.current;
		followAction();
		return submitInput(...args);
	}, [submitInput, followAction]);
	const sourceTextParts = useMemo(() => firstSourceTextParts(messages), [messages]);

	// The reattach settled terminal → the sync-and-continue seam (below).
	setReattachSettled(() => reattachSettledRef.current());

	// A turn running server-side, attached to no live view of ours (navigate
	// away mid-turn, or a wake turn discovered mid-session): the reattach
	// stream is the primary channel (resumeStream — the same rendering path
	// as a live turn); this flag is the FALLBACK liveness source — it gates
	// the composer, shows the pre-first-chunk shimmer, and drives the 1500ms
	// record poll that adopts at settle if the stream can't attach.
	const [turnInFlight, setTurnInFlight] = useState(initiallyInFlight ?? false);

	// Session title: click-to-rename (owner, 2026-09-17). Clicking the header
	// title opens edit mode with everything selected — typing replaces, arrows
	// move inside. Enter or a click away commits (PUT /api/chats/:id); Escape
	// discards. The server never bumps updatedAt on a rename (sidebar order
	// must not churn), and the sidebar patch is instant via the window event —
	// its 2.5s poll is only a backstop.
	const [titleText, setTitleText] = useState(title);
	const [renaming, setRenaming] = useState(false);
	const [titleDraft, setTitleDraft] = useState("");
	const titleInputRef = useRef<HTMLInputElement | null>(null);

	const commitRename = useCallback(
		async (next: string) => {
			setRenaming(false);
			const t = next.trim();
			if (t === "" || t === titleText) return; // empty commit = discard
			try {
				const res = await fetch(`/api/chats/${chatId}`, {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ title: t }),
				});
				if (!res.ok) throw new Error(`rename failed: ${res.status}`);
				setTitleText(t);
				window.dispatchEvent(
					new CustomEvent("lh:chat-renamed", { detail: { id: chatId, title: t } }),
				);
			} catch (err) {
				console.error("rename failed:", err); // keep the old title
			}
		},
		[chatId, titleText],
	);

	// Select-all when edit mode opens: the click means "replace", so the
	// whole title highlights on entry (owner ask, 2026-09-17).
	useEffect(() => {
		if (renaming) {
			const el = titleInputRef.current;
			if (el) {
					el.focus();
					el.select();
			}
		}
	}, [renaming]);

	// ── Keyboard seams (shortcut wave A, 2026-09-17) ──
	// F2 opens the title rename (the chat header owns the editing state).
	useEffect(() => {
		const onRename = () => {
			setTitleDraft(titleText);
			setRenaming(true);
		};
		window.addEventListener("lh:kbd-rename-session", onRename);
		return () => window.removeEventListener("lh:kbd-rename-session", onRename);
	}, [titleText]);

	// The OTHER rename surface (wave 6: the sidebar's inline rename): its
	// commit dispatches the same lh:chat-renamed event this header's rename
	// does — if it renamed THIS chat, patch the header title in place (the
	// event is the single source of truth; the header is one more listener).
	useEffect(() => {
		const onRenamed = (e: Event) => {
			const { id, title } = (e as CustomEvent<{ id: string; title: string }>).detail;
			if (id === chatId) setTitleText((prev) => (title !== prev ? title : prev));
		};
		window.addEventListener("lh:chat-renamed", onRenamed);
		return () => window.removeEventListener("lh:chat-renamed", onRenamed);
	}, [chatId]);

	// The Esc chain's last link: abort the turn. The background runner
	// decoupled turns from views, so the abort is ALWAYS the remote kill
	// (POST /api/activity/abort — any in-flight turn dies server-side, our
	// view renders the aborted-partial close when the finish arrives). A
	// LOCAL view also detaches first — stop() settles the client instantly
	// and keeps the partial; the server-side partial persists via the
	// abort's own onFinish. Inert when nothing runs (busyRef gate).
	const abortInFlightTurn = useCallback(() => {
		if (localStreamRef.current) stop();
		void fetch("/api/activity/abort", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ kind: "turn", id: chatId }),
		}).catch(() => {
			/* transient — the turn settles on its own; the record poll adopts */
		});
		// 409 not_running is the benign raced-settle: the stream's finish
			// already settled the view (or the poll fallback adopts) — nothing owed.
	}, [chatId, stop]);
	// ESC-abort guard (owner, 2026-10-02): the abort chain opens a confirm
	// popup EVERYWHERE (streams and pending questions alike). Both window
	// listeners fire per Esc, so the state gate here — not stopPropagation
	// ordering — is what keeps the popup's own Esc from chaining.
	// LAYERED ESC (owner, 2026-10-04): an open overlay CLAIMS Esc — closing
	// itself — before the abort chain may open its confirm. A mermaid focus,
	// the plan popup, or the setup dialog over a pending question must not
	// dismiss the question underneath.
	const [abortAsk, setAbortAsk] = useState<AbortMode | null>(null);
	// The lesson was deleted elsewhere (chats-changed `deleted`).
	const [gone, setGone] = useState(false);
	// Its course was deleted: the lesson stays readable as history.
	const [courseGone, setCourseGone] = useState(initiallyCourseDeleted);
	// Bumped when something that held focus goes away (a rename ends, a
	// confirm closes): the dock puts focus back where he types (focus-home.ts).
	const [focusEpoch, setFocusEpoch] = useState(0);
	const settledFocusRef = useRef({ renaming: false, abortAsk: null as AbortMode | null });
	const abortAskRef = useRef<AbortMode | null>(null);
	abortAskRef.current = abortAsk;
	useEffect(() => {
		const was = settledFocusRef.current;
		settledFocusRef.current = { renaming, abortAsk };
		if ((was.renaming && !renaming) || (was.abortAsk !== null && abortAsk === null)) setFocusEpoch((n) => n + 1);
	}, [renaming, abortAsk]);
	useEffect(() => {
		const onAbort = () => {
			const target = escAbortTarget({
				abortAsk: abortAskRef.current !== null,
				mermaidFocus: mermaidFocusRef.current !== null || figureFocusRef.current !== null,
				planOpen: planOpenRef.current,
				setupOpen: setupOpenRef.current,
				pending: pendingRef.current !== null,
				problem: activeProblemRef.current !== null,
				busy: busyRef.current,
			});
			if ((target === "question" || target === "problem") && proseToggleRef.current) proseToggleRef.current();
			else if (target === "question") setAbortAsk("question");
			else if (target === "problem") setAbortAsk("problem");
			else if (target === "turn") setAbortAsk("turn");
			else if (target === "mermaid") setMermaidFocus(null);
			else if (target === "plan") setPlanOpen(false);
			// setup closes itself; null = nothing to do — both claimed.
		};
		window.addEventListener("lh:kbd-abort-turn", onAbort);
		return () => window.removeEventListener("lh:kbd-abort-turn", onAbort);
	}, []);
	const confirmAbort = useCallback(
		(mode: AbortMode) => {
			setAbortAsk(null);
			if (mode === "turn") {
				abortInFlightTurn();
				return;
			}
			// From a pending question the dismiss is silent (A2, 2026-10-03):
			// the skipped toolResult lands via the SILENT route, no turn, no
			// wake — the next plain send is the wake. MID-TURN (owner,
			// 2026-10-04 — the GLM loop): the question can only dangle because a
			// turn is STILL RUNNING, so the discard ALSO kills that turn; the
			// route parks the dismissal (202) and the settle applies it.
			liveDraftRef.current = null;
			sentFromDockRef.current = dockKeyRef.current;
			const p = pendingRef.current;
			if (p) {
				const question = (p.input as { question?: string } | null)?.question ?? "";
				void dismissQuestion(p.toolCallId, dismissedAnswer(toolQuestionKind(p.tool), question), p.key);
				if (busyRef.current) abortInFlightTurn();
				return;
			}
			// The practice discard (owner, 2026-10-04): ask-style — the
			// silent marker route; the conclude synthesis rides the user's
			// next input. The composer returns immediately. Mid-turn the
			// discard also kills the running turn (same park + settle law).
			const problem = activeProblemRef.current;
			if (problem) {
				void dismissProblem(problem.toolCallId);
				if (busyRef.current) abortInFlightTurn();
			}
		},
		[abortInFlightTurn, dismissQuestion, dismissProblem],
	);
	// Mount continuation: if the stored transcript ends with a fulfilled tool
	// (a job result landed while no client was open), resume the lesson — the
	// SDK's sendAutomaticallyWhen only fires inside addToolOutput, so reloads
	// need this nudge. Once per mount; the turn that follows ends in text (or
	// a pending question), so no loop. NEVER while a turn is already running
	// server-side — that would double-run the teacher (the server would 409
	// it; the poll below resumes instead).
	const mountContinuation = useRef(false);
	useEffect(() => {
		if (mountContinuation.current) return;
		mountContinuation.current = true;
		if (!turnInFlight) continueIfOwed(initialMessages);
		// mount-only by design (turnInFlight read at initial value)
	}, []);

	const pending = findPendingToolCall(messages, pendingQuestionOf(nativeMessages));
	const malformedQuestions = malformedQuestionsOf(nativeMessages);
	// The abort handler reads the pending question from a ref (the window
	// listener is mount-scoped; the value it needs is render-scoped).
	const pendingRef = useRef(pending);
	pendingRef.current = pending;

	// THE ACTIVE PRACTICE PROBLEM (practice sessions, 2026-10-04): the
	// same dock-ownership rule as a pending question — an active problem
	// replaces the composer. Computed from the NATIVE record (the fold is
	// the gate the tools themselves read), not the projected view.
	const activeProblem = activeProblemOf(nativeMessages);
	const mode = sessionModeOf(nativeMessages, startedIn);
	const activeProblemRef = useRef(activeProblem);
	activeProblemRef.current = activeProblem;
	// What waits for his answer in the Prose lesson, and its picks,
	// confidence and mode (prose-answer.tsx).
	const proseOpen = useMemo<ProseOpen | null>(() => {
		if (pending) return { kind: "question", key: pending.key, tool: pending.tool, toolCallId: pending.toolCallId, input: pending.input };
		return activeProblem ? { kind: "problem", toolCallId: activeProblem.toolCallId, statement: problemStatement(activeProblem.input) ?? "" } : null;
	}, [pending?.key, pending?.toolCallId, activeProblem?.toolCallId]);
	const proseAnswer = useProseAnswer({
		openKey: proseOpenKey(proseOpen),
		box: proseBox(chatId, proseOpen),
		carry: course ? `carry:${course.workspace}` : undefined,
		draft: pending ? questionDraft(pending.key)?.form : undefined,
	});
	// The Prose composer swaps between the message field and the answer
	// field: focus follows to where he types next (focus-home.ts).
	const proseFocusKey = `${proseOpenKey(proseOpen)}:${proseAnswer.mode}`;
	useEffect(() => {
		setFocusEpoch((n) => n + 1);
	}, [proseFocusKey]);

	const localStream = status === "submitted" || status === "streaming";
	const busy = localStream || turnInFlight;
	const busyRef = useRef(busy);
	busyRef.current = busy;
	// The attach handoff (stream-reattach wave): the moment a resumed
	// stream takes over the rendering — the SDK left "ready", so
	// submitted/streaming means chunks are flowing — localStream covers
	// busy/shimmer/gates on its own. Keeping turnInFlight set would only
	// double-render the shimmer and keep the 1500ms fallback poll fighting
	// the live stream it was a fallback FOR.
	useEffect(() => {
		if (turnInFlight && (status === "submitted" || status === "streaming")) setTurnInFlight(false);
	}, [status, turnInFlight]);

	// Mid-session discovery (jobs poll, handoff watch): a server-side turn
	// exists that none of our views holds — attach to it through the same
	// resume path as mount reattach (live rendering, instant catch-up). The
	// flag stays as the fallback until the stream attaches (watcher above);
	// concurrent resume calls are SDK-guarded (a newer one aborts the older
	// request), so discovery ticks re-firing this are harmless.
	const turnInFlightRef = useRef(turnInFlight);
	turnInFlightRef.current = turnInFlight;
	const attachToRunningTurn = useCallback(() => {
		setTurnInFlight(true);
		void resumeStream();
	}, [resumeStream]);

	// The practice dock's send (ONE lane, owner 2026-10-05): POSTs the
	// thinking against the ACTIVE problem — whether it claims an answer is
	// read from the text by the agent, not declared here. Starts a turn;
	// the dock stays mounted (the problem is still active until the agent
	// concludes).
	const submitThinking = useCallback(
		(text: string, confidence: Confidence, photos?: Photo[]) => {
			const problem = activeProblemRef.current;
			if (!problem) return Promise.resolve(false);
			return send({ type: "thinking", problemCallId: problem.toolCallId, text, confidence, ...(photos?.length ? { photos } : {}) });
		},
		[send],
	);

	// The dock's Hint, Show me and Explain instead: a request on the active
	// problem, never an answer; the field's work rides along.
	const sendPracticeRequest = useCallback(
		(request: PracticeRequest, text: string) => {
			const problem = activeProblemRef.current;
			if (!problem) return;
			void send({ type: "request", problemCallId: problem.toolCallId, request, ...(text ? { text } : {}) });
		},
		[send],
	);

	const recordDockDraft = useCallback((key: string, text: string) => {
		if (liveDraftRef.current === null && text === "") return;
		liveDraftRef.current = { key, text };
	}, []);

	const [composerDraftRevision, setComposerDraftRevision] = useState(0);
	/* The composer draft ref is synchronous, so sends read the latest text
	 * without a parent render per input event. Explicit resets still bump a
	 * revision so the local field can sync. */
	// What he types here is kept per box on this Mac (kept-drafts.ts), so
	// a reload or a restart never empties it.
	const composerScope = `${chatId}:composer`;
	const carryScope = course ? `carry:${course.workspace}` : undefined;
	const textRef = useRef("");
	// His photos waiting in the composer (photos.tsx): they stay while a
	// question or problem holds the dock, and go with the next message.
	const composerPhotos = usePhotoDraft(undefined, composerScope);
	const restoreComposerPhotos = composerPhotos.restore;
	const applyText = useCallback((v: string) => {
		textRef.current = v;
		keepWords(composerScope, { text: v });
		setComposerDraftRevision((revision) => revision + 1);
	}, [composerScope]);
	const recordComposerText = useCallback((v: string) => {
		textRef.current = v;
		keepWords(composerScope, { text: v });
		// An emptied box no longer holds the words another window overtook.
		if (!v.trim()) setAnsweredElsewhere(false);
	}, [composerScope]);
	// What he typed before a reload comes back after mount, so the server's
	// page and the first client render agree.
	useEffect(() => {
		const kept = keptWords(composerScope)?.text;
		if (kept && !textRef.current) applyText(kept);
	}, [composerScope, applyText]);

	// ANSWERED IN ANOTHER WINDOW (stranded-draft.ts): the open question or
	// problem left without this window sending what he typed in it, so the
	// words go to the composer and one line says why.
	const dockKey = pending ? `q:${pending.key}` : activeProblem ? `p:${activeProblem.toolCallId}` : null;
	dockKeyRef.current = dockKey;
	// Boxes of questions and problems that have closed keep nothing.
	useEffect(() => {
		forgetClosedBoxes(chatId, dockKey ? [`${chatId}:${dockKey}`] : []);
	}, [chatId, dockKey]);
	const prevDockKeyRef = useRef(dockKey);
	useEffect(() => {
		const before = prevDockKeyRef.current;
		prevDockKeyRef.current = dockKey;
		if (before === dockKey) return;
		const live = liveDraftRef.current;
		const words = before === sentFromDockRef.current ? null : strandedDraft(before, dockKey, live);
		liveDraftRef.current = null;
		if (words === null) return;
		applyText(textRef.current.trim() ? `${textRef.current.trim()}\n\n${words}` : words);
		setAnsweredElsewhere(true);
	}, [dockKey, applyText]);
	const { unconnected } = useModelSetup();
	const [setupOpen, setSetupOpen] = useState(false);
	/** The last explicitly-sent draft (composer send): the
	 *  refusal flow restores it into the composer, where it waits for the
	 *  learner to re-send (Save never auto-sends, owner 2026-10-09).
	 *  Auto-continuations (probe answers) never set it — their refusal
	 *  opens recovery with no replay. */
	const draftRef = useRef<string | null>(null);
	const openingDraftRef = useRef<string | null>(null);
	const [openingError, setOpeningError] = useState(false);
	const openingMountedRef = useRef(false);
	useEffect(() => {
		openingMountedRef.current = true;
		return () => { openingMountedRef.current = false; };
	}, []);

	const deliverOpeningPrompt = useCallback((prompt: string) => {
		openingDraftRef.current = prompt;
		// Persist uncertainty BEFORE the POST: another mount must restore,
		// not race the still-arriving request. No storage means no auto-send.
		if (!stashOpeningPrompt(chatId, prompt, true)) {
			applyText(prompt);
			setOpeningError(true);
			return;
		}
		setOpeningError(false);
		draftRef.current = prompt; // The existing 503 flow must restore it too.
		applyText("");
		// Photos from the New lesson box go with the first message.
		void takeKeptPhotos(`${chatId}:opening`).then((photos) => send({ type: "text", text: prompt, ...(photos.length ? { photos } : {}) }, () => {
			clearOpeningPrompt(chatId);
			openingDraftRef.current = null;
			if (draftRef.current === prompt) draftRef.current = null;
		}).then(accepted => {
			if (!accepted && photos.length) restoreComposerPhotos(photos.map((photo, i) => ({ id: `opening_${i}`, photo })));
			if (!accepted && openingMountedRef.current && openingDraftRef.current === prompt && !textRef.current) {
				applyText(prompt);
			}
		}));
	}, [chatId, send, applyText, restoreComposerPhotos]);

	const sentInitial = useRef(false);
	useEffect(() => {
		if (sentInitial.current) return;
		sentInitial.current = true;
		const entry = readOpeningPromptEntry(chatId);
		const prompt = initialPrompt || entry?.text; // Legacy links still work.
		if (!initialPromptOwed(initialMessages, prompt)) {
			if (initialMessages.some(m => m.role === "user" || m.role === "assistant")) clearOpeningPrompt(chatId);
			return;
		}
		openingDraftRef.current = prompt!;
		if (entry?.attempted || initiallyInFlight) {
			applyText(prompt!); // Interrupted start: the learner explicitly resends.
			return;
		}
		deliverOpeningPrompt(prompt!);
	}, [chatId, initialPrompt, initialMessages, initiallyInFlight, deliverOpeningPrompt, applyText]);

	useEffect(() => {
		if (!hasConfirmedConversation) return;
		clearOpeningPrompt(chatId);
		// A later canonical read may confirm a lost acknowledgment. Clear
		// only the unchanged recovered draft, never the learner's newer work.
		const opening = openingDraftRef.current;
		if (opening !== null && textRef.current === opening) applyText("");
		if (draftRef.current === opening) draftRef.current = null;
		openingDraftRef.current = null;
		setOpeningError(false);
	}, [chatId, hasConfirmedConversation, applyText]);

	// THE SIGNED-OUT REFUSAL: a send that lands the server's 503
	// provider_key_missing envelope (the Claude account is signed out)
	// renders as the SIGN-IN FLOW, never the error banner. The gate refuses
	// BEFORE the write-ahead persist, so the server record is the truth
	// minus the refused send — the optimistic message is an orphan that
	// goes HOME: refetch the record, drop the orphan, put the draft back in
	// the composer, open the dialog. The draft stays in the composer until
	// the learner re-sends it (owner ruling 2026-10-09).
	useEffect(() => {
		if (!error) return;
		if (!parseProviderKeyRefusal(error.message)) return; // a real error keeps the honest banner
		// ORDER MATTERS: clearError() flips this effect's own dep (`error`)
		// and would cancel the in-flight work below — so the banner dismiss,
		// the draft restore, and the dialog open all land TOGETHER after the
		// record refetch (the honest truth minus the refused send).
		let cancelled = false;
		void (async () => {
			const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}`);
			if (!cancelled && res.ok) {
				const record = (await res.json().catch(() => null)) as { messages?: LhMessage[] } | null;
				if (Array.isArray(record?.messages)) setMessages(record.messages);
			}
			if (cancelled) return;
			if (draftRef.current !== null) {
				applyText(draftRef.current);
				draftRef.current = null;
			}
			clearError();
			setSetupOpen(true);
		})();
		return () => {
			cancelled = true;
		};
		// (setMessages/clearError are stable per useChat instance — the
		//  dep pair [error, chatId] is what the flow actually keys on.)
	}, [error, chatId]);
	// TAB CYCLES THE CHAT'S FIELDS (owner, keyboard round 2026-10-06): the
	// lesson has one, the composer. Gathered from live DOM at event time.
	const cycleChatFields = useCallback((): readonly HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>('[data-testid="composer"] textarea')), []);
	useFieldCycle(cycleChatFields);

	// Jobs never gate the composer (contracts.ts "THE ASYNC PROTOCOL" §4): job
	// tools resolve with an ack mid-turn, so the learner can interject while
	// sub-agents run — a feature, not a race: the wake pipeline queues steers
	// until the current turn ends. Only a QUESTION pending or a turn in
	// flight (client or server-side wake turn) gates sending.
	// Steering (2026-10-03): a turn in flight no longer gates the composer —
	// Enter while a turn runs STEERS it (the quiet queue above the composer);
	// a pending question still owns the interaction (the dock replaces the
	// composer, and there is no live turn to steer anyway — questions end
	// turns).
	// Compaction (owner round 14): the RUNNING state — compaction-changed
	// flips it; the send paths, sendAllowed, and the docks gate on it (the
	// server's registry mutex is the structural gate; this is the
	// affordance).
	const [compacting, setCompacting] = useState(initiallyCompacting);
	// A failed model response (issue #110): Retry keeps the saved input
	// and completed work, without another learner message. Offered from
	// "error" too: a dropped stream leaves the model there, and send()
	// recovers from it. Later compaction requires new input instead.
	const retryable = (status === "ready" || status === "error") && !busy && !compacting && endsInFailedTurn(nativeMessages);
	const retryFailedTurn = () => retryFailedResponse(send, draftRef);
	const failure = failedResponseAtEnd(nativeMessages);
	const claudeLimit = retryable && failure && isClaudeLimitFailure(failure) ? failure : undefined;
	// A turn that ended with no word after his input (a restart, a stop
	// before the reply began) says so, with Try again (turn-cut.ts).
	const replyCut = status === "ready" && !busy && !compacting && !error ? replyCutOf(nativeMessages) : null;
	const sendAllowed = !pending && !activeProblem && !compacting;
	// Try again's key (round 3): Enter on the empty composer, from the field
	// or anywhere outside one, runs the same retry as the button.
	// A question or problem still open owns Enter (its own resend).
	const tryAgain = pending || activeProblem || gone || courseGone ? undefined : replyCut ? () => void send({ type: "continue" }) : retryable && !claudeLimit ? retryFailedTurn : undefined;

	/* THE PRACTICE PAUSE (owner round 16): between problems — practice
	 * kind, nothing active, nothing in flight, and at least one problem
	 * has ever been posed (the fresh session's opening turn is owed, not
	 * the move-on). Enter-on-empty and the Next chip both key on it. */
	// Done for tonight (done-tonight.tsx): stops the session whatever is
	// open; until he writes again, the session waits on nothing.
	const doneTonight = doneTonightAtEnd(nativeMessages);
	// Stopped for today, by him or by the tutor's close, until he writes
	// again: the top bar says so, and has nothing left to stop.
	const closedForToday = closedTonight(nativeMessages);
	const sendTonight = useCallback(() => {
		if (busy || compacting || doneTonight) return;
		// His half-typed answer waits for the same question next time
		// (kept-drafts.ts); the answer itself stays hidden.
		if (pending && carryScope) {
			const box = `${chatId}:q:${pending.key}`;
			const kept = keptWords(box);
			if (kept) keepWords(carryScope, kept);
			void keptPhotos(box).then((photos) => { if (photos.length) void keepPhotos(carryScope, photos); });
		}
		void send({ type: "tonight" });
	}, [busy, compacting, doneTonight, send, pending, carryScope, chatId]);
	const sendTonightRef = useRef(sendTonight);
	sendTonightRef.current = sendTonight;
	useEffect(() => {
		const onTonight = () => sendTonightRef.current();
		window.addEventListener(kbdEventForChat("done-tonight"), onTonight);
		return () => window.removeEventListener(kbdEventForChat("done-tonight"), onTonight);
	}, []);

	// Each answer's mark, as the engine recorded it (answer-mark.tsx): read
	// again whenever a turn settles, since a save or a re-mark may have
	// landed. ⌘⇧M disputes the newest one.
	const marks = useAnswerMarks(chatId, busy ? null : nativeMessages.length);
	const [disputing, setDisputing] = useState<string | null>(null);
	const canDispute = !!course && !busy && !compacting;
	const disputeMark = marks[disputing ?? ""];
	const sendDispute = (answerId: string, mark: AnswerMark, draft: DisputeDraft) => {
		setDisputing(null);
		void send({ type: "dispute", answerId, observations: mark.rows.map((row) => row.id), ...draft });
	};
	const disputeLatestRef = useRef(() => {});
	disputeLatestRef.current = () => {
		const latest = canDispute ? latestMarkedAnswer(nativeMessages, marks) : null;
		if (latest) setDisputing(latest);
	};
	useEffect(() => {
		const onDispute = () => disputeLatestRef.current();
		window.addEventListener(kbdEventForChat("dispute-mark"), onDispute);
		return () => window.removeEventListener(kbdEventForChat("dispute-mark"), onDispute);
	}, []);

	const nextReady =
		!doneTonight &&
		mode === "practice" &&
		!pending &&
		!activeProblem &&
		!compacting &&
		!busy &&
		nativeMessages.some(
			(m) => (m as { role?: string }).role === "assistant" &&
				Array.isArray((m as { content?: unknown[] }).content) &&
				(m as { content: Array<{ type?: string; name?: string }> }).content.some(
					(b) => b.type === "toolCall" && b.name === "problem",
				),
		);
	const sendNext = useCallback(() => {
		if (!nextReady) return;
		void send({ type: "next" });
	}, [nextReady, send]);

	/* ENTER FROM ANYWHERE (owner round 16 refinement, 2026-10-06 —
	 * keyboard-first): the move-on must not require composer focus. The
	 * window-level Enter (typing surfaces and buttons excluded — a
	 * focused composer/button keeps its own lane, so no double fire)
	 * fires the signal from body focus, a scroll, anywhere. sendNext
	 * self-guards on nextReady, so the listener is inert outside the
	 * pause — the dock-mounted listeners are gone by then (docks unmount
	 * when nothing is active; the two never overlap). */
	useEnterSubmits(sendNext);
	useEnterSubmits(() => tryAgain?.());

	const syncFromServer = useCallback(async () => {
		const res = await fetch(`/api/chats/${chatId}`);
		if (!res.ok) return;
		const record = (await res.json()) as { messages?: LhMessage[]; turnError?: string };
		if (!Array.isArray(record.messages)) return;
		setMessages(record.messages, record.turnError);
		// The continuation seam (contracts.ts protocol §4): a job result
		// landing in the record leaves the agent owing a continuation — the
		// record ENDS on un-consumed results, the dock owns no question, and
		// nothing runs. The native fold (needsContinuation) is the old SDK
		// lastAssistantMessageIsCompleteWithToolCalls check.
		// Current model truth also guards retained/live failures: canonical
		// sync must never automatically replace a reply that failed to save.
		continueIfOwed(record.messages);
	}, [chatId, setMessages, continueIfOwed]);

	// The settled terminal's other half (stream-reattach wave): the
	// transport resolved turn-settled — no turn running, the record is
	// current. Drop the fallback busy state and adopt the record (its
	// continuation check fires the owed next turn, exactly as the poll's
	// settle branch always did).
	reattachSettledRef.current = () => {
		setTurnInFlight(false);
		void syncFromServer();
	};

	// ── Append-only record adoption (owner ground rules, 2026-09-15) ──
	// Content delivered into the record server-side — sub-agent
	// artifacts, abort notes — must become visible the
	// moment it persists, mid-turn included: it sits between messages, and
	// nothing about a running turn should hide it. The full snapshot sync
	// mid-stream is forbidden (it breaks the SDK's in-place continuation
	// merge — the stale-snapshot lesson), so adoption here is APPEND-ONLY
	// (the session hook's adoptRecord): insert the record's new ids in their canonical
	// order, never rewrite a local one, keep the in-flight tail last. The
	// full syncFromServer stays the net at idle (reorder, plan blocks, turns).
	const adoptAppendOnly = useCallback(async () => {
		try {
			const res = await fetch(`/api/chats/${chatId}`);
			if (!res.ok) return;
			const record = (await res.json()) as { messages?: LhMessage[] };
			if (!Array.isArray(record.messages)) return;
			adoptRecord(record.messages);
		} catch {
			/* transient — the idle full sync is the net */
		}
	}, [chatId, adoptRecord]);

	// The live plan panel (wave 4): opened by any transcript plan card or
	// the top-bar plan chip.
	const [planOpen, setPlanOpen] = useState(false);
	// The mermaid focus (chrome-melt wave, 2026-09-19): md-blocks' expand
	// button registers the chart source here; the overlay (and the plan
	// popup) mount INSIDE the session-area div — both are session-scoped, so
	// the drag bar stays sharp and draggable while a focus owns the area.
	const [mermaidFocus, setMermaidFocus] = useState<string | null>(null);
	// Figure focus (2026-10-07): the figure card's fullscreen button — same
	// overlay shell as mermaid, but carrying the raw svg + the card's invert
	// state so the fullscreen view stays faithful to the toggled card.
	const [figureFocus, setFigureFocus] = useState<{ svg: string; inverted: boolean } | null>(null);
	// A photo of his working, open large (photos.tsx).
	const [photoFocus, setPhotoFocus] = useState<string | null>(null);

	// Overlay mirrors for the layered-Esc gate (owner 2026-10-04): the
	// lh:kbd-abort-turn handler reads these at EVENT time — declared here
	// beside their states, consumed below wherever the states live.
	const mermaidFocusRef = useRef(mermaidFocus);
	mermaidFocusRef.current = mermaidFocus;
	// The figure focus rides the mermaid layer in the Esc gate — the same
	// overlay class (session-scoped diagram focus, Esc claimed at the
	// document level by the overlay itself); the window chain must stay out.
	const figureFocusRef = useRef(figureFocus);
	figureFocusRef.current = figureFocus;
	const planOpenRef = useRef(planOpen);
	planOpenRef.current = planOpen;
	const setupOpenRef = useRef(setupOpen);
	setupOpenRef.current = setupOpen;
	// The session's live plan: its steps, where he is on them and where each
	// was first taught, for the top bar's roadmap (lesson-roadmap.md).
	const planTree = useMemo(() => latestTree(messages), [messages]);
	const anchors = useMemo(() => (planTree ? stepAnchors(messages, new Set(planTree.nodes.map((n) => n.id))) : new Map<string, string>()), [planTree, messages]);
	const reasked = useMemo(() => reaskedAfterHint(messages), [messages]);
	const steps = useMemo(() => {
		if (!planTree) return [];
		return roadmapSteps(planTree, derivePlanStatuses(planTree, messages as Parameters<typeof derivePlanStatuses>[1]), new Set(anchors.values()));
	}, [planTree, messages, anchors]);
	// A step's place in the transcript: scroll to where it was first taught
	// and mark it as a passage link lands (session-navigation.tsx).
	const jumpToStep = useCallback((stepId: string) => {
		const scope = sessionFindScopeRef.current;
		const target = scope?.querySelector<HTMLElement>(`[data-step-anchor="${CSS.escape(stepId)}"]`);
		if (!scope || !target) return;
		replyAnchorRef.current = null;
		scrollSessionTarget(target, scope, scrollContextRef.current);
		target.classList.add("lh-source-highlight");
		window.setTimeout(() => target.classList.remove("lh-source-highlight"), 2_000);
	}, []);

	// The dock's reserved tail height (DockOverlay reports it; the spacer at
	// the end of the transcript renders it). Lives here because the spacer is
	// inside the scroller while the dock overlays OUTSIDE it — two parents.
	// 208 ≈ gradient(96) + composer block(~112): the SSR/pre-hydration
	// guess so the static paint has a sane tail. The first layout effect
	// replaces it with the measured truth before paint.
	const [dockReserve, setDockReserve] = useState(208);
	// Post-turn settle (the SLIMMED watch — push-architecture S3,
	// 2026-10-02): our own stream just ended. The ADOPTION
	// LOOP and the HANDOFF WATCH that lived here are RETIRED: a
	// server-initiated turn (the probe→teach handoff, a job wake, another
	// tab) is now ANNOUNCED on the events channel — the turn-started
	// subscription (below the jobs poll) attaches to it live. No polling
	// window can expire; the freeze class is gone.
	const prevStatusRef = useRef(status);
	useEffect(() => {
		const transitioned = prevStatusRef.current !== "ready" && status === "ready";
		// Every path (the old early-return skipped this on the transition
		// branch — the re-fire-on-dep-churn wart, fixed S3).
		prevStatusRef.current = status;
		if (!transitioned) return;
		// CANONIZATION (fix B, the duplicate-previous-message bug, 2026-10-02):
		// turn-settled for OUR OWN turn arrives while the stream is still open
		// (endTurn emits from onFinish before the response terminates, so the
		// SSE frame reliably beats [DONE]) — the handler below cannot sync
		// there, it flags instead, and THIS flip consumes the flag: the record
		// reflects durable truth (a failed settlement retains its notice,
		// not its unsaved reply), so replacing the view absorbs the tail's
		// streamed c_-id copies into base under their server ids. Without
		// this the tail kept those copies forever and the next send's
		// steer-adoption window rendered them a second time. The wake handoff
		// cannot be missed by this sync: the wake fires only after the idle
		// gates + grace (≥750ms past this flip), so its turn-started event
		// lands at an idle, already-canonical view and attaches normally.
		if (settleAnnouncedRef.current) {
			settleAnnouncedRef.current = false;
			void syncFromServer();
		}
	}, [status, syncFromServer]);

	// A stream that died MID-FLIGHT (network): the runner decoupled the turn
	// from its view, so the server turn runs ON behind the error banner —
	// re-enter the in-flight watch (the 1500ms fallback poll adopts at
	// settle) instead of leaving the session blind until the next send's
	// 409 merge-retry heals it. One record check per error transition.
	const prevErrorStatusRef = useRef(status);
	useEffect(() => {
		const was = prevErrorStatusRef.current;
		prevErrorStatusRef.current = status;
		if (was === "error" || status !== "error") return;
		let cancelled = false;
		void (async () => {
			try {
				const res = await fetch(`/api/chats/${chatId}`);
				if (!res.ok || cancelled) return;
				const record = (await res.json()) as { turnInFlight?: boolean };
				if (cancelled) return;
				if (record.turnInFlight === true) setTurnInFlight(true);
				else void syncFromServer();
			} catch {
				/* transient — the banner stands; the next send's merge-retry heals */
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [status, chatId, syncFromServer]);

	// ── Central job observability (contracts.ts "THE ASYNC PROTOCOL" §4) ──
	// ONE fetch of /api/jobs drives every job surface (transcript dispatch
	// cards, the sub-agents panel) and re-syncs the transcript exactly once
	// when a job settles. PUSH (architecture S4, 2026-10-02): the store
	// announces every job write on the events channel; the interval poll and
	// its pollMs/jobPartCount gating are RETIRED. The view fetches once on
	// mount, once per jobs-changed announcement (trailing-debounced — a
	// sub-agent run writes activity-line bursts; 250ms coalesces them at or
	// below the old 1s poll cadence), and once on channel resync.
	//
	// A settle no longer implies the record is complete: CONTINUATION
	// COALESCING flips the job done at claim time — while the learner's own
	// answer turn is still streaming (and a settle can race a second job's
	// wake turn). Syncing mid-turn would swap in a stale snapshot
	// mid-stream, which breaks the SDK's in-place continuation merge
	// (duplicate message ids). So: a settle during a busy turn defers the
	// sync; the next idle fetch adopts the finished record.
	const [jobs, setJobs] = useState<JobRecord[]>([]);
	const localStreamRef = useRef(false);
	localStreamRef.current = localStream;
	const jobStatusRef = useRef<Map<string, string>>(new Map());
	// A settle seen during a busy turn — the sync is owed, not dropped.
	const pendingSyncRef = useRef(false);
	// (The dispatch nudge effect that lived here — refreshActivity per new
	// dispatch tool part — died at S5: the store announces jobs-changed at
	// the dispatch write; the dock subscribes.)
	// First-fetch guard (the old first-tick guard): the initial read adopts
	// existing history (jobs recorded before mount) without nudging — a
	// nudge is only owed for a running job the feed hasn't seen THIS session.
	const firstFetchRef = useRef(true);
	// The trailing debounce for jobs-changed announcements (one timer), and
	// the ref the timer fires through (a stale closure must never fetch an
	// old chatId).
	const fetchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const fetchJobsRef = useRef<() => void>(() => {});
	const fetchJobs = useCallback(async () => {
		try {
			const res = await fetch(`/api/jobs?chatId=${encodeURIComponent(chatId)}`);
			if (!res.ok) return;
			const data = (await res.json()) as { jobs?: JobRecord[]; turnInFlight?: boolean };
			const list = data.jobs ?? [];
			for (const j of list) {
				const prev = jobStatusRef.current.get(j.id);
				if (prev === "running" && j.status !== "running") {
					// A settle — the blob leaves the dock via the store's jobs-changed
					// announce at this very write (S5); this handler owns the RECORD.
					// The record is only guaranteed complete when no turn is in
					// flight — locally or server-side (a coalesced settle fires
					// mid-turn by design), so the FULL sync waits for idle.
					// Ground rule (2026-09-15): delivered content shows
					// immediately anyway — adopt append-only NOW; the idle
					// sync still settles the record properly.
					if (localStreamRef.current || data.turnInFlight === true) {
						pendingSyncRef.current = true;
						void adoptAppendOnly();
					} else {
						void syncFromServer();
					}
				}
				jobStatusRef.current.set(j.id, j.status);
			}
			firstFetchRef.current = false;
			if (
				pendingSyncRef.current &&
				!localStreamRef.current &&
				data.turnInFlight !== true
			) {
				pendingSyncRef.current = false;
				void syncFromServer();
			}
			setJobs(list);
			// (Wake-turn adoption that lived here — the turnInFlight attach
			// line — died at S3: turn-started on the events channel owns
			// discovery now. turnInFlight is STILL READ above: the settle
			// logic's idle check needs it.)
		} catch {
			/* transient fetch failure — the next jobs-changed announcement re-fetches */
		}
	}, [chatId, syncFromServer, adoptAppendOnly]);
	fetchJobsRef.current = () => void fetchJobs();
	// Mount + chat switch: the IMMEDIATE (non-debounced) initial read. The
	// firstFetch guard resets with the old rule — true only when this
	// session has never seen a job (a chat switch keeps the map: job ids
	// are unique per chat, and a newly-seen running job may still nudge).
	useEffect(() => {
		firstFetchRef.current = jobStatusRef.current.size === 0;
		void fetchJobs();
	}, [fetchJobs]); // identity changes exactly on chatId
	useServerEvent("jobs-changed", (p) => {
		if (p.chatId != null && p.chatId !== chatId) return; // ours or unattributed
		if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current);
		fetchDebounceRef.current = setTimeout(() => {
			fetchDebounceRef.current = undefined;
			fetchJobsRef.current();
		}, 250);
	});
	// Reconnect catch-up: events missed while the channel was down.
	useServerResync(() => {
		fetchJobsRef.current();
		// The channel came back after the app restarted: a turn the restart
		// cut never settles, so the dropped stream's line would stand
		// forever. Ask the record what is true now.
		if (statusRef.current === "error" && errorMessageRef.current === STREAM_DROPPED) void healDroppedStreamRef.current();
	});
	useEffect(
		() => () => {
			if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current);
		},
		[],
	);

	// ── Server-initiated turn discovery (push-architecture S3, 2026-10-02) ──
	// Every turn THIS chat runs is announced on the events channel — the
	// probe→teach handoff, a job wake, another tab's send, the
	// missed-on-mount case. This replaces the retired watch loop and the
	// 1500ms fallback record poll: discovery is no longer a polling window
	// that can expire. Handlers read REFS, not closure state — events fire
	// between renders, and a ref holds the live value at event time.
	const statusRef = useRef(status);
	statusRef.current = status;
	const errorMessageRef = useRef(error?.message);
	errorMessageRef.current = error?.message;
	const healDroppedStreamRef = useRef(async () => {});
	healDroppedStreamRef.current = async () => {
		try {
			const res = await fetch(`/api/chats/${chatId}`);
			if (!res.ok) return;
			const record = (await res.json()) as { turnInFlight?: boolean };
			if (record.turnInFlight === true) {
				attachToRunningTurn();
				return;
			}
			clearError();
			void syncFromServer();
		} catch {
			/* still unreachable: the next resync asks again */
		}
	};
	/** Fix B (2026-10-02): turn-settled arrived for OUR OWN turn — the
	 * record is durable (endTurn fires only after persistTurn); the ready
	 * flip consumes this flag to canonize the view onto the record. See the
	 * settle effect and the turn-settled handler below. */
	const settleAnnouncedRef = useRef(false);
	useServerEvent("turn-started", (p) => {
		// Known non-issue: beginTurn emits before registerTurn in the same
		// synchronous request flow; a GET /stream inside that sub-ms window
		// gets a settled response — unwinnable by a network round-trip,
		// self-healing via the eventual turn-settled. Do not engineer around.
		if (p.chatId !== chatId) return;
		if (localStreamRef.current) return; // our OWN turn — the 409-race guard
		if (turnInFlightRef.current) return; // already attached
		attachToRunningTurn();
	});
	useServerEvent("turn-settled", (p) => {
		if (p.chatId !== chatId) return;
		if (localStreamRef.current) {
			// Our own [DONE] path owns the BUSY settle — but not a no-op (fix B,
			// 2026-10-02): the event is the record-durable guarantee (endTurn
			// fires only after persistTurn), and it reliably beats [DONE] here
			// (endTurn emits from onFinish before the response terminates). Flag
			// it; the ready flip consumes the flag and canonizes the view onto
			// the record. (If [DONE] somehow won this race instead, this branch
			// didn't run and the fully-idle branch below already synced.)
			settleAnnouncedRef.current = true;
			return;
		}
		if (turnInFlightRef.current) {
			// The attached stream's terminal frame owns the normal settle —
			// syncing HERE would swap a stale snapshot mid-stream (the
			// continuation-coalescing law, see the jobs poll above). Only
			// the error case heals: the attached stream died, and the settle
			// says persistTurn has made the record durable truth.
			if (statusRef.current === "error") {
				setTurnInFlight(false);
				clearError();
				void syncFromServer();
			}
			return;
		}
		// Fully idle — a turn we never saw (every window missed): adopt now.
		void syncFromServer();
	});
	useServerEvent("compaction-changed", (p) => {
		// The settle-kick's background summary: while it runs, sends gate
		// (the next turn's server-side ensureCompacted awaits it anyway —
		// this only keeps the affordance honest). On finish, record-changed
		// (emitted by the compaction write itself) carries the marker in.
		if (p.chatId !== chatId) return;
		setCompacting(p.running);
	});
	useServerEvent("chats-changed", (p) => {
		// The first plan named this session (ChatStore.nameSession): the
		// header takes the name the list now shows.
		if (p.named?.id === chatId) setTitleText(p.named.title);
		// Deleted in another window: say so now, not at his next send.
		if (p.deleted === chatId) {
			setGone(true);
			keepWords(composerScope, null);
			forgetClosedBoxes(chatId, []);
		}
	});
	useServerEvent("courses-changed", () => {
		// A course was deleted or made: is this lesson's still listed?
		const workspace = course?.workspace;
		if (!workspace) return;
		void fetch("/api/courses")
			.then((res) => (res.ok ? res.json() : null))
			.then((listing: { available?: boolean; courses?: { workspace: string }[]; unreadable?: { workspace: string }[] } | null) => {
				if (!listing?.available) return;
				setCourseGone(![...(listing.courses ?? []), ...(listing.unreadable ?? [])].some((c) => c.workspace === workspace));
			})
			.catch(() => {});
	});
	useServerEvent("record-changed", (p) => {
		// A turn-less write (the silent dismissal, A2 2026-10-03), or a wake
		// turn's markers landing at its write-ahead. Idle: adopt the record
		// (our OWN dismissal already rendered its optimistic append — the
		// adoption law swaps local ids for the server's). During a turn the
		// view only takes the new messages, append-only: a full sync
		// mid-stream is forbidden.
		if (p.chatId !== chatId) return;
		if (localStreamRef.current || turnInFlightRef.current) void adoptAppendOnly();
		else void syncFromServer();
	});

	// The problem card reads which problem the dock shows (its transcript
	// card stays out, so the problem reads once).
	const activeProblemCallId = activeProblem?.toolCallId ?? null;

	// The lesson opens at the latest turn (findings 19): math, diagrams and
	// the dock settle after the first paint and leave the scroller short of
	// the bottom; one pass once they have settled.
	useEffect(() => {
		const timers = [150, 600].map((ms) => setTimeout(() => void scrollContextRef.current?.scrollToBottom("instant"), ms));
		return () => timers.forEach(clearTimeout);
	}, [chatId]);

	const onSend = () => {
		if (pending || compacting) return;
		doSteerOrSend();
	};
	// A refused send puts its photos back, as the refusal flow keeps the text.
	const sendWithPhotos = (go: (photos: Photo[] | undefined) => Promise<boolean>) => {
		const taken: PendingPhoto[] = composerPhotos.take();
		void go(sentPhotos(taken)).then((accepted) => {
			if (!accepted) composerPhotos.restore(taken);
		});
	};
	const doSend = () => {
		if (busy || pending || compacting) return;
		const t = textRef.current.trim();
		const withPhotos = composerPhotos.photos.length > 0;
		if (!t && !withPhotos) return;
		if (unconnected) {
			setSetupOpen(true);
			return;
		}
		if (openingDraftRef.current !== null && !withPhotos) {
			deliverOpeningPrompt(t);
			return;
		}
		draftRef.current = t; // the refusal flow's preserve-and-replay seam
		applyText("");
		sendWithPhotos((photos) => send({ type: "text", text: t, ...(photos ? { photos } : {}) }));
	};

	/* STEER VS SEND (owner arc 2026-10-03): a send while a turn runs steers
	 * it — the quiet queue + the live agent's steering rail; the turn's own
	 * stream lands the card when pi drains it. The branch is BUSY, not
	 * turnInFlight: the own-stream case CLEARS turnInFlight (the local
	 * dedup, chat.tsx ~370), so branching there swallowed Enter entirely
	 * during our own turn (owner live report, fixed same day). busy covers
	 * own stream AND foreign/wake turns — both have a live agent by the
	 * time the send's POST resolved, so the steer lands. Idle takes the
	 * plain send; a raced settle 409s and falls back to exactly that. */
	const doSteerOrSend = () => {
		if (pending || compacting) return;
		const t = textRef.current.trim();
		if (!t && composerPhotos.photos.length === 0) return;
		if (busy) {
			applyText("");
			sendWithPhotos((photos) => steer(t, photos));
			return;
		}
		doSend();
	};

	/* ASK INSTEAD (Prose): his message while a question or problem waits.
	 * A question is set aside first through the silent dismissal, so the
	 * record never holds a message after an unanswered call; a problem stays
	 * open and his message reaches the tutor beside it. */
	const askInstead = async () => {
		if (compacting) return;
		const t = textRef.current.trim();
		if (!t && composerPhotos.photos.length === 0) return;
		if (unconnected) {
			setSetupOpen(true);
			return;
		}
		const p = pendingRef.current;
		if (p) {
			liveDraftRef.current = null;
			sentFromDockRef.current = dockKeyRef.current;
			const question = (p.input as { question?: string } | null)?.question ?? "";
			if (!(await dismissQuestion(p.toolCallId, dismissedAnswer(toolQuestionKind(p.tool), question), p.key))) return;
		} else if (busyRef.current) {
			applyText("");
			sendWithPhotos((photos) => steer(t, photos));
			return;
		}
		draftRef.current = t;
		applyText("");
		sendWithPhotos((photos) => send({ type: "text", text: t, ...(photos ? { photos } : {}) }));
	};

	// THE ANSWER IS THE QUESTION CALL'S TOOL RESULT (fork 1, owner
	// 2026-09-26): one input event, one turn — the hook appends the
	// optimistic graded result (the answer shows at once) and the server's
	// write-ahead persists it before the turn; the teacher's reaction
	// streams below it.
	const submitPendingAnswer = (output: QuestionAnswerData, photos?: Photo[]) => {
		if (!pending) return;
		submitAnswer(pending.tool, pending.toolCallId, output, pending.key, photos);
	};

	/* A message the topic page handed this lesson (lesson-message.ts): taken
	 * once on mount and sent as the composer sends it, a steer while the
	 * tutor writes; a lesson that cannot take it now (a question waits)
	 * keeps it as the draft. */
	const steerOrSendRef = useRef(doSteerOrSend);
	steerOrSendRef.current = doSteerOrSend;
	useEffect(() => {
		const message = takeLessonMessage(chatId);
		if (!message) return;
		applyText(message);
		steerOrSendRef.current();
	}, [chatId, applyText]);

	return (
		<ChatActionsContext.Provider
			value={{
				chatId,
				syncFromServer,
				sendText: (t: string) => {
					void send({ type: "text", text: t });
				},
				openSetup: () => setSetupOpen(true),
			}}
		>
		<SessionMermaidContext.Provider
			value={{
				openMermaid: setMermaidFocus,
				openFigure: (svg, inverted) => setFigureFocus({ svg, inverted }),
				openPhoto: setPhotoFocus,
			}}
		>
		<JobsContext.Provider value={jobs}>
		<ActiveProblemContext.Provider value={activeProblemCallId}>
		<AnswerMarksProvider value={{ marks, onDispute: setDisputing, canDispute }}>
		<ProseAnswerProvider value={proseAnswer}>
		{/* The session surface: the transcript column (header + scroller) and
		    the plan-tree panel as full-height SIBLINGS — the panel spans top to
		    bottom exactly like the left sidebar, and the header (name + phase
		    chip) spans from the left sidebar's edge to the panel's edge. The
		    dock overlays the column bottom (outside the scroller); a spacer in
		    the transcript reserves its height. */}
		<div className="flex h-dvh">
			<div className="flex min-w-0 flex-1 flex-col">
				{/* The top bar is its own block (owner, top-fade round 4): in flow
				    above the scroller on the plain page background — no gradient. Its
				    bottom outline (border-b border-border) matches the one that
				    separates the left sidebar — same width, same color (owner, r5).
				    h-15 (60px), not py-2: the toggle (a size-9 icon button) renders
				    only while the sidebar is CLOSED — an auto-height row would
				    collapse when it disappears and slide the title + chip up.
				    60px is an ALIGNMENT, not just a size: it equals the sidebar's
				    LH wordmark band, so the header's border-b continues that
				    band's bottom edge as one line across the app (owner, round 6). */}
				<TopBar
					size="slim"
					// While renaming the bar is NOT a drag surface: app-region:drag
					// would eat the mousedown, so click-to-escape (below) could
					// never fire. Rename mode is interactive mode (owner ask) —
					// TopBar's one escape hatch.
					drag={!renaming}
					onMouseDown={(e) => {
						// Escape hitbox: any mousedown outside the input itself blurs
						// it, running the existing onBlur commit path. The input is
						// shrink-to-fit (field-sizing), so the rest of the bar is
						// this spacer + inert chips — all click-to-exit (owner ask).
						if (renaming && e.target !== titleInputRef.current) titleInputRef.current?.blur();
					}}
				>
					<LessonTopBar
						title={
							renaming ? (
								<Input
									variant="quiet"
									ref={titleInputRef}
									value={titleDraft}
									onChange={(e) => setTitleDraft(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") void commitRename(titleDraft);
										else if (e.key === "Escape") {
											e.stopPropagation();
											setRenaming(false);
										}
									}}
									onBlur={() => void commitRename(titleDraft)}
									spellCheck={false}
									aria-label="Session title"
									className="lh-no-drag -mx-1.5 h-auto w-auto min-w-[8ch] max-w-full shrink-0 bg-fill-hover px-1.5 text-control font-medium text-inherit caret-current focus-visible:ring-0 [field-sizing:content]"
								/>
							) : (
								<Hint label="Rename session" action="rename-session" side="bottom">
									<Button
										variant="quiet"
										onClick={() => {
											setTitleDraft(titleText);
											setRenaming(true);
										}}
										className="lh-no-drag -mx-1.5 block h-auto min-w-4 shrink cursor-text truncate px-1.5 text-left text-control font-medium text-inherit hover:text-inherit"
									>
										{titleText}
									</Button>
								</Hint>
							)
						}
						course={course?.title}
						courseHref={course ? courseHref(course.workspace) : undefined}
						topic={course && place?.topic && topicCrumbShown(place.topic.title, titleText) ? { title: place.topic.title, href: unitHref(course.workspace, place.topic.handle) } : undefined}
						roadmap={
							<LessonRoadmap
								steps={steps}
								place={place}
								course={course ? { title: course.title, workspace: course.workspace } : undefined}
								open={planOpen}
								onOpenChange={setPlanOpen}
								onJump={jumpToStep}
							/>
						}
						tonight={closedForToday ? undefined : <DoneTonightButton onDone={sendTonight} disabled={busy || compacting || doneTonight || gone || courseGone} />}
					/>
				</TopBar>

				<SessionFind scopeRef={sessionFindScopeRef} scrollContextRef={scrollContextRef} />
				<div ref={sessionFindScopeRef} className="relative flex min-h-0 flex-1">
				<Conversation className="h-full min-w-0 flex-1" initial="instant" contextRef={scrollContextRef} targetScrollTop={followTargetScrollTop}>
					<SessionMessageNavigation />
					<ConversationContent className="min-h-full gap-0 p-0" scrollClassName="[scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
						<div data-session-find-root="" data-transcript-column="" className={`${column} flex flex-1 flex-col gap-4 pt-6`}>
							{messages.length === 0 && !busy && (
								<ConversationEmptyState
									title="New session"
									description="Ask one thing for a straight answer, or name a topic for a full lesson."
								/>
							)}

							{messages.map((m, mi) =>
								m.role === "user" && isSubagentSteer(m) ? (
									// Sub-agent delivery (wake-pipeline steer): NO message bubble — the
									// artifact card sits in the transcript column directly, full width
									// and centered like the teacher's artifacts (contracts.ts "THE ASYNC
									// PROTOCOL" §4). Key fallback: legacy transcripts (pre id-hygiene)
									// can still hold empty ids — the index keeps keys unique for them.
									<SubagentSteerCard key={m.id || `m-${mi}`} message={m} figures="inline" />
								) : m.role === "user" && m.parts.some((p) => p.type === "data-session-resume" || p.type === "data-probe-handoff" || p.type === "data-mode-handoff") ? (
								// The seams between the opening questions, planning, teaching
								// and practice draw nothing: the lesson names no phase (Edo,
								// 14 Nov 2026), and where he is in the plan is the top bar's
								// roadmap. Never a user bubble: the markers are scaffolding.
								null
							) : m.role === "user" && m.parts.length > 0 && m.parts.every((p) => p.type.startsWith("data-")) ? (
								// Marker cards (custom messages, 2026-10-04): user-side
								// scaffolding — the graph-context pick, the practice
								// thinking trace — render as cards in the transcript
								// column directly, NO chat bubble (the subagent-steer
								// precedent). The user branch below renders text only;
								// without this hoist a data-only message read as an
								// EMPTY bubble (owner report, 2026-10-04).
								<Fragment key={m.id || `m-${mi}`}>
									{m.parts.map((part, pi) => {
										switch (part.type) {
											case "data-graph-context":
												return <GraphContextCard key={pi} data={part.data as GraphContextData} />;
											case "data-compaction-cut":
												return <CompactionCutDivider key={pi} />;
											case "data-practice-thinking":
												return <ThinkingBubble key={pi} data={part.data as PracticeThinkingData} />;
											case "data-practice-request":
												return <RequestBubble key={pi} data={part.data as PracticeRequestDetails} />;
											case "data-practice-next":
												// The learner's move-on signal (owner round 16).
												return <SectionBreak key={pi} testId="practice-next-line" label="Next problem" />;
											case "data-done-tonight":
												return <DoneTonightLine key={pi} />;
											case "data-dispute":
												return <DisputeBubble key={pi} data={part.data as DisputeDetails} />;
											// data-compaction (the moment the summary ran) stays
											// unmarked: the cut's hairline is enough.
											default:
												return null;
										}
									})}
								</Fragment>
							) : (
									<Fragment key={m.id || `m-${mi}`}>
									{m.role === "user" ? (
										// His words: a bubble on the right.
										<LearnerBubble text={m.parts.filter((p) => p.type === "text").map((p) => p.text).join("\n")} photos={m.parts.filter((p) => p.type === "photos").flatMap((p) => p.data as Photo[])} />
									) : (
									<Message from="assistant" className="max-w-full">
									{/* Visible overflow: a quiet row's hover fill reaches past the
									    text's edge (choice rows, disclosures), and the clip cut its
									    rounded corners square. Wide math and tables scroll in their
									    own boxes. */}
									<MessageContent className="w-full overflow-visible">
											{m.parts.map((part, pi) => {
												// Where a plan step was first taught (roadmap-facts.ts):
												// the roadmap's step opens the transcript here.
												const stepAnchor = anchors.get(partKey(mi, pi));
												// A tool call that errored BACK TO THE AGENT (validation
												// failure, malformed args) is invisible work — the agent
												// reads the error and retries. Owner ruling 2026-09-26:
												// surface the retry loop as one quiet line, any tool,
												// instead of silence (question tools used to render null,
												// so a flailing quiz loop read as a stall). Aborts are
												// terminal — nothing retries — so they stay silent.
												if (
													part.state === "output-error" &&
													part.type.startsWith("tool-") &&
													part.errorText !== "Operation aborted"
												) {
													// The lesson keeps the agent's retry loop out of the
													// column: the turn's own activity line covers it.
													return null;
												}
												switch (part.type) {
													case "text": {
														const sourceId = textPartMessageId(part.id);
														const anchor = sourceId && sourceTextParts.get(sourceId) === part.id ? messageAnchorId(sourceId) : undefined;
														return (
															<div key={part.id || pi} id={anchor} data-source-message-id={sourceId ?? undefined} data-step-anchor={stepAnchor} className="lh-source-passage">
																<MessageResponse>{part.text}</MessageResponse>
															</div>
														);
													}
													case "reasoning":
														// Agent chrome out (owner): the tutor's thinking never
														// shows in the lesson.
														return null;
													case "step-start":
														return null;
													case "data-plan-block":
														// The plan lives in the top bar's roadmap; the
														// tutor's own words introduce it here.
														return null;
													// quiz/probe: the removed multiple-choice tools, drawn as
													// an answered question when an old transcript holds one.
													case "tool-quiz":
													case "tool-probe":
													case "tool-ask_user_question":
													case "tool-explain":
													case "tool-recall": {
														const malformed = !busy && malformedQuestions.find(call => call.messageId === part.sourceMessageId && call.contentIndex === part.sourceContentIndex && call.toolCallId === part.toolCallId);
														if (malformed) return <MalformedQuestion key={pi} disabled={!!pending || compacting}
															reason={pending ? "Answer or discard the remaining question first." : undefined}
															onRetry={() => {
																draftRef.current = null;
																void send({ type: "retry-question", messageId: malformed.messageId, contentIndex: malformed.contentIndex, toolCallId: malformed.toolCallId });
															}} />;
														// The question is the end of the tutor's message, open
														// or answered (prose-question.tsx).
														return (
															<ProseQuestion
																key={pi}
																tool={part.type.slice("tool-".length)}
																toolCallId={part.toolCallId!}
																input={part.input}
																output={part.state === "output-available" ? (part.output as QuestionAnswerData) : undefined}
																photos={part.photos as Photo[] | undefined}
																open={pending?.toolCallId === part.toolCallId && part.state !== "output-available"}
																stepAnchor={stepAnchor}
																repeat={reasked.has(part.toolCallId!)}
															/>
														);
													}
													default: {
														// A tool call being WRITTEN (owner, streaming round 2026-10-01):
														// input-streaming spans the whole execution, and the live line
														// says what the tutor is doing. On settling, the registry's card
														// takes over below.
														if (part.type.startsWith("tool-") && part.state === "input-streaming") {
															return <LiveToolCard key={pi} part={part as ArtifactPartProps["part"]} />;
														}
														// A problem is the tutor's words, its end a mark and a
														// disclosure (prose-practice.tsx).
														if (part.type === "tool-problem") {
															return <ProseProblem key={pi} input={part.input} active={part.toolCallId === activeProblemCallId} />;
														}
														if (part.type === "tool-conclude") {
															return <ProseConclude key={pi} toolCallId={part.toolCallId!} input={part.input} output={part.output} reveal={part.reveal} />;
														}
														// Artifact extension point (contracts.ts): job
														// parts and future artifacts render via the
														// registry — add renderers there, not here.
														if (part.type.startsWith("tool-")) {
															const Renderer = artifactRenderers[part.type.slice("tool-".length)];
															if (Renderer) return <Renderer key={pi} part={part as ArtifactPartProps["part"]} />;
														}
														return null;
													}
												}
											})}
										</MessageContent>
									</Message>
									)}
								</Fragment>
							))}

							{/* THE placeholder, ACTION-gated (owner, optimistic round
							    3, 2026-10-02): spinner + shimmered Thinking… from the
							    instant of any action that produces tokens — send,
							    answer, session start, reattach (status flips to
							    submitted SYNCHRONOUSLY with the action) — until the
							    turn's first APPLIED event, where the stream takes over
							    with the same look: an arrived-but-empty message renders
							    the thinking ROW (view.ts projects one empty reasoning
							    part), so submitted ⟺ placeholder and streaming ⟺ a
							    rendered row, mutually exclusive by construction.
							    Protocol events (agent_start) apply nothing and release
							    nothing — the placeholder covers the whole
							    provider-connect gap. turnInFlight: the same state
							    entered by external discovery (wake) / the poll
							    fallback. Never collapsible itself. */}
							{/* Compaction (owner round 15): the same register as the
						    thinking placeholder — a visible session-wide state while
						    the summarizer holds the model gate. Mutually exclusive with
						    the THINKING placeholder by construction (the gate sits
						    BEFORE beginTurn; the settle kick runs after endTurn). */}
							{compacting && <ActivityLine testId="compacting" label="Compacting the conversation…" />}
							{showsWorking(messages, busy) && <ActivityLine testId="thinking-placeholder" label="Thinking…" />}
							{replyCut && !courseGone && !gone && <ReplyCut byYou={replyCut === "stopped"} onRetry={() => void send({ type: "continue" })} />}
							{openingError && <p role="alert" className="text-row text-danger">{OPENING_PROMPT_FAILURE}</p>}
							{gone && !error && <TurnError message={LESSON_GONE} onOpenSettings={() => openSettings("keys")} />}
							{courseGone && !gone && <CourseGoneLine />}
							{!courseGone && !gone && <CourseUnreadableLine workspace={course?.workspace} />}
							{error && (
								<TurnError message={error.message} onRetry={retryable ? retryFailedTurn : undefined} onOpenSettings={() => openSettings("keys")}>
									{claudeLimit && <ClaudeLimitPrompt key={claudeLimit.id} failure={claudeLimit} onContinue={retryFailedTurn} />}
								</TurnError>
							)}
						</div>

						{/* The dock's reserved tail (DockOverlay reports its height):
						    keeps at-rest transcript content scrolling fully clear of
						    the overlay — the flow-space replacement for the old
						    sticky dock. Zero only pre-measurement (the first layout
						    effect reports before paint). */}
						<div aria-hidden data-testid="dock-spacer" style={{ height: dockReserve }} />
				</ConversationContent>
				{/* The dock: an overlay sibling of the scroller (the
				    use-stick-to-bottom pattern). The scroll-down button lives
				    INSIDE the overlay now (owner refinement round, 2026-09-24):
				    anchored to the dock block's top edge, so it rides every
				    height morph (typing, a question growing the band, the
				    fold) and NEVER overlaps the composer. */}
				{gone || courseGone ? null : !course ? <CourseLinkBanner chatId={chatId} /> : <DockOverlay
					onReserve={setDockReserve}
					busy={busy}
					replyingToDock={busy && sentFromDockRef.current !== null}
					focusEpoch={focusEpoch}
					answeredElsewhere={answeredElsewhere && !proseOpen}
					replyAnchorRef={replyAnchorRef}
					onJumpToLatest={jumpToLatest}
					queuedSteers={visibleQueuedSteers(steerQueue, nativeMessages)}
					setupCta={
						unconnected && <SignInPill onOpen={() => setSetupOpen(true)} />
					}
					column={column}
					composer={
						<ProseComposer
							open={proseOpen}
							answer={proseAnswer}
							message={{
								busy,
								value: textRef.current,
								revision: composerDraftRevision,
								onChange: recordComposerText,
								onSend,
								onStop: () => setAbortAsk("turn"),
								sendAllowed,
								nextProblem: nextReady,
								onNext: sendNext,
								onEmptyEnter: tryAgain,
								placeholder: nextReady ? "Ask anything, or press Enter for the next one." : tryAgain ? LESSON_WORDS.tryAgainPlaceholder : undefined,
								photos: composerPhotos,
							}}
							messageText={{ read: () => textRef.current, write: applyText }}
							onAskInstead={() => void askInstead()}
							toggleRef={proseToggleRef}
							busy={busy}
							compacting={compacting}
							chatId={chatId}
							carryScope={carryScope}
							initialDraft={pending ? questionDraft(pending.key)?.form : undefined}
							onSaveDraft={(form) => { if (pending) saveQuestionDraft(pending.key, { form }); }}
							onSubmitAnswer={submitPendingAnswer}
							onSubmitThinking={submitThinking}
							onRequest={sendPracticeRequest}
							onDraftChange={recordDockDraft}
						/>
					}
				/>}
				</Conversation>

				{/* The session-scoped focuses (chrome-melt wave, 2026-09-19): mounted
				    INSIDE the session area — absolute inset-0 siblings of the scroller,
				    so they own the area below the drag bar, right of the sidebar, and
				    the top bar stays sharp + draggable while a focus is open. */}
				{mermaidFocus !== null && (
					<MermaidOverlay chart={mermaidFocus} onClose={() => setMermaidFocus(null)} />
				)}
				{photoFocus !== null && <MermaidOverlay photo={photoFocus} onClose={() => setPhotoFocus(null)} />}
				{figureFocus !== null && (
					<MermaidOverlay
						svg={figureFocus.svg}
						inverted={figureFocus.inverted}
						onClose={() => setFigureFocus(null)}
					/>
				)}
				<AbortTurnDialog mode={abortAsk} onClose={() => setAbortAsk(null)} onConfirm={confirmAbort} busy={busy} />
				{disputing && disputeMark && (
					<DisputeDialog key={disputing} mark={disputeMark} onClose={() => setDisputing(null)} onSend={(draft) => sendDispute(disputing, disputeMark, draft)} />
				)}
				</div>
			</div>
		</div>
		</ProseAnswerProvider>
		</AnswerMarksProvider>
		</ActiveProblemContext.Provider>
		</JobsContext.Provider>
		</SessionMermaidContext.Provider>
		{/* The sign-in flow: one mount serves the persistent pill, the
		    refused-send interception, and the job cards' deep-link. The
		    draft waits in the composer — signing in never sends (owner ruling
		    2026-10-09); Esc also keeps it (the dialog is closable by design —
		    the gate is the server, not this modal). */}
		<SetupDialog open={setupOpen} onClose={() => setSetupOpen(false)} />
		</ChatActionsContext.Provider>
	);
}

/** The layered-Esc ruling (owner, 2026-10-04): an open overlay claims Esc —
 *  closing itself — before the abort chain may open its confirm. A mermaid
 *  focus, the plan popup, or the setup dialog over a pending question must
 *  close the OVERLAY, never dismiss the question underneath. Priority is
 *  stacking order: the abort confirm (topmost, claims via its own dialog),
 *  then the session overlays (mermaid paints above plan — later in DOM),
 *  then setup (self-closing — the gate only must not fire), then the
 *  2026-10-02 abort chain proper (question before turn). */
export type EscAbortTarget = "mermaid" | "plan" | "setup" | "question" | "problem" | "turn" | null;

/**
 * Does the opening topic still owe its first send? The topic is the
 * server's ?prompt= or the sessionStorage stash. The gate is "no real
 * conversation yet" (no user/assistant message) — NOT emptiness: a
 * session started with map picks carries a graph-context MARKER as
 * message[0], and that scaffolding must never swallow the first send
 * (owner report, 2026-10-04: the turn went dead behind it — the old
 * `length === 0` check saw the marker and refused to fire).
 */
export function initialPromptOwed(messages: readonly { role: string }[], prompt: string | undefined): boolean {
	if (!prompt) return false;
	return !messages.some((m) => m.role === "user" || m.role === "assistant");
}

export function escAbortTarget(s: {
	abortAsk: boolean;
	mermaidFocus: boolean;
	planOpen: boolean;
	setupOpen: boolean;
	pending: boolean;
	/** An active practice problem (practice sessions, 2026-10-04): Esc
	 *  opens the discard confirm — below a pending question (the two
	 *  never coexist, but the layering stays strict), above the turn
	 *  abort (a live turn can be running BEHIND an idle problem only in
	 *  teaching sessions — practice problems end their pose turns). */
	problem: boolean;
	busy: boolean;
}): EscAbortTarget {
	if (s.abortAsk) return null; // the popup's own Esc — claimed by the dialog
	if (s.mermaidFocus) return "mermaid";
	if (s.planOpen) return "plan";
	if (s.setupOpen) return "setup";
	if (s.pending) return "question";
	if (s.problem) return "problem";
	if (s.busy) return "turn";
	return null;
}

/**
 * The composer's block, OVERLAID at the bottom of the column (absolute, a
 * sibling of the scroller: the use-stick-to-bottom pattern), under a
 * gradient band. A spacer at the end of the transcript, sized from its
 * reports, keeps at-rest content scrolling clear of it. The scroll-down
 * disc rides the block's top edge, so it never covers the composer.
 */
function DockOverlay({
	column,
	composer,
	onReserve,
	busy,
	replyingToDock,
	focusEpoch,
	answeredElsewhere,
	replyAnchorRef,
	onJumpToLatest,
	setupCta,
	queuedSteers,
}: {
	/** The reading column the composer sits in (lesson-column.ts). */
	column: string;
	composer: React.ReactNode;
	/** Reports the block's height with its gradient: the transcript's
	 *  spacer is sized from it. */
	onReserve: (h: number) => void;
	/** A turn is running for this lesson. */
	busy: boolean;
	/** The tutor is replying to what he sent from a question or problem:
	 *  focus waits for the reply instead of landing in the composer. */
	replyingToDock: boolean;
	/** Changes when something that held focus went away (focus-home.ts). */
	focusEpoch: number;
	/** Another window answered the question he was typing in. */
	answeredElsewhere: boolean;
	/** Where the reply to his latest action starts (reading-position.ts);
	 *  the cue lets go of it once he reads to the end. */
	replyAnchorRef: React.MutableRefObject<ReplyAnchor>;
	onJumpToLatest: () => void;
	/** The queued-steer indicator's lines (composer steering, 2026-10-03):
	 *  already filtered by visibleQueuedSteers, only undrained steers. */
	queuedSteers: QueuedSteerLine[];
	/** The persistent setup CTA (BYOK, owner 2026-09-22): the same pill
	 *  home and /chat/new carry, above the composer while slots are unset. */
	setupCta?: React.ReactNode;
}) {
	const { scrollRef } = useStickToBottomContext();
	const blockRef = useRef<HTMLDivElement>(null);
	const [sbInset, setSbInset] = useState(0);
	const reportHeight = useCallback((h: number) => onReserve(h + GRADIENT_H), [onReserve]);
	useDockReserve({ scrollRef, blockRef, onHeight: reportHeight, onScrollbarInset: setSbInset });

	// Wheel over the composer still scrolls the transcript (owner, scroll
	// round 2): the overlay is a SIBLING of the scroller, so the browser's
	// native scroll chaining stops at it. Internal scrollers keep native
	// scrolling; only a delta nothing under the cursor can take goes on.
	useEffect(() => {
		const root = blockRef.current;
		const el = scrollRef.current;
		if (!root || !el) return;
		const onWheel = (e: WheelEvent) => forwardDockWheel(e, root, el);
		root.addEventListener("wheel", onWheel, { passive: false });
		return () => root.removeEventListener("wheel", onWheel);
	}, [scrollRef]);

	// FOCUS HOME (focus-home.ts): when the lesson opens, a turn ends, or a
	// rename or confirm lets go, focus lands where he types next, if
	// nothing holds it.
	useEffect(() => {
		const block = blockRef.current;
		if (block) landFocus(document, block, replyingToDock);
	}, [busy, focusEpoch, replyingToDock]);

	// An empty field's arrows and page keys read the lesson (focus-home.ts):
	// the field he was put in must not swallow the keys he reads with.
	useEffect(() => {
		const block = blockRef.current;
		const el = scrollRef.current;
		if (!block || !el) return;
		const onKeyDown = (e: KeyboardEvent) => {
			const field = e.target as HTMLTextAreaElement | null;
			if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
			if (field?.tagName !== "TEXTAREA" || !block.contains(field)) return;
			const by = readingKeyScroll(e.key, field.value.length === 0, el.clientHeight);
			if (by === null) return;
			e.preventDefault();
			if (by < 0) replyAnchorRef.current = null;
			el.scrollBy({ top: by });
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [scrollRef, replyAnchorRef]);

	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-0" style={{ right: sbInset }}>
			<div className="h-24 bg-gradient-to-t from-background via-background/85 to-transparent" />
			<div ref={blockRef} className="relative bg-background pb-5">
				<div className={column}>
					<div className="pointer-events-auto">
						{setupCta}
						{/* The queued-steer indicator (owner spec 2026-10-03): quiet
						    one-liners above the composer. A line dies when its card
						    lands (visibleQueuedSteers). */}
						<QueuedSteersBody steers={queuedSteers} />
						{answeredElsewhere && (
							<p data-testid="answered-elsewhere" className="px-4 pb-2 text-row text-muted-foreground">{LESSON_WORDS.answeredElsewhere}</p>
						)}
						{/* No clip around it: the composer draws its own 16px outline,
						    and a wrapper's larger rounded clip cut its corners. */}
						{composer}
					</div>
					<ScrollCueButton anchorRef={replyAnchorRef} onJump={onJumpToLatest} className="bottom-full mb-2" />
				</div>
			</div>
		</div>
	);
}
