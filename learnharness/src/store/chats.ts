/**
 * ChatStore — the fs JSON adapter (one file per chat in data/chats/).
 *
 * Implements core/ports.ts ChatStore; the record shapes live in
 * core/contracts.ts (ChatRecord/ChatSummary). Idioms: sync fs, tiny
 * records, id-guarded filenames, JSON with tab indentation. Wired in the
 * composition root (src/server/stores.ts); nothing else constructs it.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { PATHS } from "../../config.ts";
import { emit } from "../core/events.ts";
import { studyNow } from "../core/day-words.ts";
import type { ChatStore } from "../core/ports.ts";
import type { ChatRecord, ChatSummary, CourseLink, DigestLedger, PlanTree, SessionGoal, TurnUsage } from "../core/contracts.ts";
import { CURRENT_CHAT_VERSION } from "../core/contracts.ts";
import type { LhMessage } from "../core/native-messages.ts";
import type { ChatSession } from "../core/sdk-session.ts";
import { activeProblemOf, danglingQuestionOf, firstProblemTopicsOf, sessionModeOf, sessionTasksOf, sessionTopicsOf } from "../core/native-messages.ts";
import { sessionEndOf } from "../core/session-end.ts";
import { openedAsReview } from "../core/session-opening.ts";
import { stoppedByHim } from "../core/turn-cut.ts";
import { onFirstTurn } from "../core/session-naming.ts";
import { phaseAt3Lh } from "../core/phases.ts";
import { removeLeftoverTemps, writeFileAtomicSync } from "./atomic-write.ts";

function chatFile(id: string): string {
	if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(`Invalid chat id: ${id}`);
	return path.join(PATHS.chats, `${id}.json`);
}

/** THE SILENCE LAW (push S6, 2026-10-02): chats-changed announces ONLY
 *  list-SHAPE mutations — createChat, renameChat, nameSession, deleteChat (below,
 *  each emits post-write). The content writers (saveMessages,
 *  appendTurnUsage, saveDigestLedger, saveTree) are
 *  DELIBERATELY SILENT: saveMessages fires per turn-persist and would
 *  spam the bus, and every list-visible change it causes (title, order,
 *  phase, busy, pendingQuestion, pendingProblem) is already announced by
 *  turn-started / turn-settled, or for a turn-less write (a dismissal,
 *  compaction) by record-changed, which the sidebar refetches on. Silence
 *  here is law, not oversight. */
function createChat(title: string, course?: CourseLink, topics: readonly string[] = [], arcCheck?: string): ChatRecord {
	const now = studyNow().toISOString();
	const record: ChatRecord = {
		id: `chat_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`,
		title: title.trim() || "Untitled session",
		createdAt: now,
		updatedAt: now,
		messages: [],
		...(course ? { course: { workspace: course.workspace, title: course.title } } : {}),
		...(topics.length > 0 ? { topics: [...topics], appOpening: true as const } : {}),
		...(arcCheck ? { arcCheck } : {}),
	};
	fs.mkdirSync(PATHS.chats, { recursive: true });
	writeChat(record);
	emit("chats-changed", {});
	return { ...record, version: CURRENT_CHAT_VERSION }; // the in-memory twin of what landed on disk
}

/** THE WRITE CHOKE POINT (schema-versioning wave, owner 2026-10-10): every
 *  record persist goes through here and carries the CURRENT version stamp —
 *  lazy migration means existing files only get stamped on their next write.
 *  A future-version guard lives on the read side (getChat). */
function writeChat(record: ChatRecord): void {
	writeFileAtomicSync(chatFile(record.id), JSON.stringify({ ...record, version: CURRENT_CHAT_VERSION }, null, "\t"));
}

function getChat(id: string): ChatRecord | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(fs.readFileSync(chatFile(id), "utf-8"));
	} catch {
		return null;
	}
	// Honest refusal (owner ruling 2026-10-10): a record stamped NEWER than
	// this build (the downgrade scenario) reads as absent, never misparsed —
	// the next read-modify-write must not rewrite what it doesn't understand.
	const v = (parsed as { version?: unknown }).version;
	if (typeof v === "number" && v > CURRENT_CHAT_VERSION) {
		console.error(`[chat ${id}] record stamped with schema version ${v} > ${CURRENT_CHAT_VERSION} — this app build is older; refusing to read it`);
		return null;
	}
	return parsed as ChatRecord;
}

function listChats(): ChatSummary[] {
	try {
		fs.mkdirSync(PATHS.chats, { recursive: true });
		return fs
			.readdirSync(PATHS.chats)
			.filter((f) => f.endsWith(".json"))
			.map((f) => getChat(f.slice(0, -5)))
			// Older records may still carry the retired graph extraction's
			// usage log (`extractions`); it stays out of the list too.
			.filter((r): r is ChatRecord & { extractions?: unknown } => r !== null)
			.map(({ messages, tree, turns, extractions: _extractions, digest: _digest, ...summary }) => {
				// Per-record isolation (Wave B): a record whose messages fail the
				// projection (e.g. pre-Wave-B UIMessage-format scratch — the
				// zero-back-compat wipe makes these "corrupt") must not blank the
				// whole sidebar — same isolation getChat's per-file catch gives.
				try {
					// Its own topics: the ones it was started on or named after, else
					// for practice its first problem's.
					const kind = sessionModeOf(messages, summary.kind);
					const own = summary.topics?.length ? summary.topics : kind === "practice" ? firstProblemTopicsOf(messages) : [];
					return {
						// turns stay out of the list payload (list =
						// summaries; usage aggregates ride the full record, the picker
						// never needs them).
						...summary,
						// The mode now, folded over the transcript from the
						// mode an older record stored at creation.
						kind,
						messageCount: messages.length,
						// Record-derived status for the session picker: phase from the
						// transcript's explicit events (probe_done concluded / verdict
						// accepted — docs/probe-teach-split.md §4), pending question
						// from the native dangling-call scan. Wave D: both folds read
						// the NATIVE record (core/phases.ts phaseAt3Lh +
						// native-messages.ts danglingQuestionOf). Liveness (busy) is
						// NOT record-derived — the API route merges it (ChatListItem).
						phase: phaseAt3Lh(messages),
						pendingQuestion: danglingQuestionOf(messages) !== null,
						// A posed problem with no conclude (the sidebar's "Problem
						// waiting"); only practice poses, and a handoff to teaching
						// is refused while one is active.
						pendingProblem: activeProblemOf(messages) !== null,
						topics: [...new Set([...(summary.topics ?? []), ...sessionTopicsOf(messages)])],
						ownTopics: own,
						ended: sessionEndOf(messages, tree, summary.kind, own),
						...(stoppedByHim(messages) ? { stopped: true as const } : {}),
						tasks: sessionTasksOf(messages),
						review: openedAsReview({ topics: summary.topics, messages }),
					};
				} catch (err) {
					console.error(`[chat ${summary.id}] summary projection failed:`, err);
					return null;
				}
			})
			.filter((s) => s !== null)
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	} catch {
		return [];
	}
}

/** Persist the full native message list (the record IS the agent state —
 *  Wave B: replay is state.messages = record.messages). SILENT by the
 *  events law — see the SILENCE LAW comment at createChat. */
function saveMessages(id: string, messages: LhMessage[]): void {
	const record = getChat(id);
	if (!record) throw new Error(`Chat not found: ${id}`);
	record.messages = messages;
	record.updatedAt = studyNow().toISOString();
	writeChat(record);
}

/** Append one usage entry to the record's turn log — idempotent per
 * turn id: each REQUEST carries its own id, so a replay of the same turn's
 * persist appends once, while continuation turns (which share a response
 *  message id) each keep their usage. */
function appendTurnUsage(id: string, entry: TurnUsage): void {
	const record = getChat(id);
	if (!record) throw new Error(`Chat not found: ${id}`);
	record.turns = record.turns?.some((t) => t.id === entry.id)
		? record.turns
		: [...(record.turns ?? []), entry];
	writeChat(record);
}

/** Replace the lesson digest's ledger. Silent, and not conversation
 * activity: updatedAt stays put. */
function saveDigestLedger(id: string, ledger: DigestLedger): void {
	const record = getChat(id);
	if (!record) throw new Error(`Chat not found: ${id}`);
	record.digest = ledger;
	writeChat(record);
}

/** Add a save's links to the record's kept answer saves. Silent, and not
 * conversation activity: updatedAt stays put. */
function saveAnswerSaves(id: string, links: Readonly<Record<string, readonly string[]>>): void {
	const record = getChat(id);
	if (!record) throw new Error(`Chat not found: ${id}`);
	const saves: Record<string, readonly string[]> = { ...(record.answerSaves ?? {}) };
	for (const [key, ids] of Object.entries(links)) {
		const seen = saves[key] ?? [];
		saves[key] = [...seen, ...ids.filter((o) => !seen.includes(o))];
	}
	record.answerSaves = saves;
	writeChat(record);
}

/** Link the session to a course. Not conversation activity, and not a
 * list-shape change: updatedAt stays put and nothing is announced. */
function linkCourse(id: string, course: CourseLink): void {
	const record = getChat(id);
	if (!record) throw new Error(`Chat not found: ${id}`);
	record.course = { workspace: course.workspace, title: course.title };
	writeChat(record);
}

/** Rename a session (the header's click-to-edit title, 2026-09-17). Like
 * saveTree, a rename is NOT conversation activity: updatedAt stays put
 * so sidebar order never churns. Same fallback as createChat — the empty
 * string becomes "Untitled session" (the API gate rejects it first; this
 * is the honest floor for any other caller). */
function renameChat(id: string, title: string): ChatRecord {
	const record = getChat(id);
	if (!record) throw new Error(`Chat not found: ${id}`);
	record.title = title.trim() || "Untitled session";
	record.renamed = true;
	writeChat(record);
	emit("chats-changed", {});
	return record;
}

/** Name a session once (the port's rule): only a session started on no
 *  topic, its topic while it has none, and its title only while the
 *  learner has not renamed it and nothing named it before. Like a rename,
 *  announced and not conversation activity. */
function nameSession(id: string, goal: SessionGoal): void {
	const record = getChat(id);
	if (!record) throw new Error(`Chat not found: ${id}`);
	if ((record.topics ?? []).length > 0) return;
	const topic = goal.topic?.trim();
	if (topic) record.topics = [topic];
	if (!record.renamed && !record.named && onFirstTurn(record.messages) && goal.title.trim()) record.title = goal.title.trim();
	record.named = true;
	writeChat(record);
	emit("chats-changed", { named: { id, title: record.title } });
}

/** Delete the session record file entirely (session-deletion wave 6,
 *  owner 2026-09-22). False when the id is unknown — the route turns that
 *  into a 404. The session's jobs are the caller's choreography
 *  (server/chats.ts), not the store's. */
function deleteChat(id: string): boolean {
	try {
		fs.unlinkSync(chatFile(id));
		removeLeftoverTemps(chatFile(id));
		// The app's copy of the lesson's Claude Code session (agent/sdk/session-files.ts).
		fs.rmSync(path.join(PATHS.chats, `${id}.session.jsonl`), { force: true });
		fs.rmSync(path.join(PATHS.chats, `${id}.session`), { recursive: true, force: true });
		emit("chats-changed", { deleted: id }); // only a real removal — the present-entry law
		return true;
	} catch {
		return false; // never existed, already deleted, or unreadable — same answer
	}
}

/** Persist the session plan tree (plan tools call this in execute). */
function saveTree(id: string, tree: PlanTree): void {
	const record = getChat(id);
	if (!record) throw new Error(`Chat not found: ${id}`);
	record.tree = tree;
	// Deliberately does NOT bump updatedAt: tree mutations piggyback on the
	// turn's saveMessages, and sidebar ordering shouldn't churn on tree edits.
	writeChat(record);
}

/** Persist the record's map to its Claude Code session; silent, like saveTree. */
function saveSession(id: string, session: ChatSession): void {
	const record = getChat(id);
	if (!record) throw new Error(`Chat not found: ${id}`);
	record.session = session;
	writeChat(record);
}

export const chatStore: ChatStore = {
	createChat,
	getChat,
	listChats,
	saveMessages,
	saveTree,
	saveSession,
	linkCourse,
	renameChat,
	nameSession,
	deleteChat,
	appendTurnUsage,
	saveDigestLedger,
	saveAnswerSaves,
};
