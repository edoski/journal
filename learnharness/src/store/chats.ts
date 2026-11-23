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
import type { ChatRecord, ChatSummary, CourseLink, DigestLedger, PlanTree, SessionEnd, SessionGoal, TurnUsage } from "../core/contracts.ts";
import { CURRENT_CHAT_VERSION } from "../core/contracts.ts";
import type { LhMessage } from "../core/native-messages.ts";
import type { ChatSession } from "../core/sdk-session.ts";
import { activeProblemOf, danglingQuestionOf, firstProblemTopicsOf, isQuestionRepose, isTaskContinue, opensTurn, savedAnswerTimesOf, savedAnswerTopicsOf, savedTaskTimesOf, startsMovedOf, sessionModeOf, sessionTaskTitleOf, sessionTaskTopicsOf, sessionTasksOf, sessionTopicsOf, studiedIn } from "../core/native-messages.ts";
import { leftQuestionRepose, offersStop, openWorkTopicsOf, sessionEndOf } from "../core/session-end.ts";
import { answeredAsReview, lessonTakenUp, openedAsReview, stepsOnOf } from "../core/session-opening.ts";
import { learnerWords } from "../core/session-markdown.ts";
import { stoppedByHim } from "../core/turn-cut.ts";
import { failedResponseAtEnd } from "../core/input-events.ts";
import { onFirstTurn, sessionTitleOf } from "../core/session-naming.ts";
import { phaseAt3Lh } from "../core/phases.ts";
import { removeLeftoverTemps, writeFileAtomicSync } from "./atomic-write.ts";

function chatFile(id: string): string {
	if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(`Invalid chat id: ${id}`);
	return path.join(PATHS.chats, `${id}.json`);
}

/** THE SILENCE LAW (push S6, 2026-10-02): chats-changed announces ONLY
 *  list-SHAPE mutations — createChat, renameChat, nameSession, takeUpLesson, deleteChat (below,
 *  each emits post-write). The content writers (saveMessages,
 *  appendTurnUsage, saveDigestLedger, saveTree) are
 *  DELIBERATELY SILENT: saveMessages fires per turn-persist and would
 *  spam the bus, and every list-visible change it causes (title, order,
 *  phase, busy, pendingQuestion, pendingProblem) is already announced by
 *  turn-started / turn-settled, or for a turn-less write (a dismissal,
 *  compaction) by record-changed, which the sidebar refetches on. Silence
 *  here is law, not oversight. */
function createChat(title: string, course?: CourseLink, topics: readonly string[] = [], arcCheck?: string, named = false): ChatRecord {
	const now = studyNow().toISOString();
	const record: ChatRecord = {
		id: `chat_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`,
		title: title.trim() || "Untitled session",
		createdAt: now,
		updatedAt: now,
		messages: [],
		...(course ? { course: { workspace: course.workspace, title: course.title } } : {}),
		...(topics.length > 0 ? { topics: [...topics], appOpening: true as const } : {}),
		...(named ? { named: true as const } : {}),
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
		const work = new Map<string, Work>();
		const listed = fs
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
					work.set(summary.id, workOf(messages));
					// Its own topics follow what it did: the task it took up (round 15,
					// m4), else the lesson its plan took up (round 16, M4), else the ones
					// it was started on or named after, else for practice its first
					// problem's; one named with no topic (Ask the tutor) the topics its
					// saved answers were on, never the words of his question (round 16,
					// M3); a lesson none, until its plan names one (round 7).
					const kind = sessionModeOf(messages, summary.kind);
					const tasked = sessionTaskTopicsOf(messages);
					const taken = lessonTakenUp({ ...summary, messages });
					const own = tasked.length > 0 ? tasked : taken ? [taken] : summary.topics?.length ? summary.topics : kind === "practice" ? firstProblemTopicsOf(messages) : summary.named ? savedAnswerTopicsOf(messages) : [];
					const stepsOn = stepsOnOf({ ...summary, messages }, own);
					return {
						// turns stay out of the list payload (list =
						// summaries; usage aggregates ride the full record, the picker
						// never needs them).
						...summary,
						// Its one name on every surface (round 15, m5).
						title: sessionTitleOf({ ...summary, messages }),
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
						// A question Done for today left waits too, though it is posed
						// again only when he opens the session (reposeLeftQuestions).
						pendingQuestion: danglingQuestionOf(messages) !== null || leftQuestionRepose(messages).length > 0,
						// A posed problem with no conclude (the sidebar's "Problem
						// waiting"); only practice poses, and a handoff to teaching
						// is refused while one is active.
						pendingProblem: activeProblemOf(messages) !== null,
						topics: [...new Set([...(summary.topics ?? []), ...sessionTopicsOf(messages), ...own])],
						ownTopics: own,
						// The tutor's offer to go on, one of whose options stops for today, asks nothing of him: left where it is (round 18, m4).
						ended: offersStop(messages) ? "left" : endedBy(sessionEndOf(messages, tree, summary.kind), summary.updatedAt, danglingQuestionOf(messages) !== null || leftQuestionRepose(messages).length > 0 || activeProblemOf(messages) !== null),
						...(stoppedByHim(messages) ? { stopped: true as const } : {}),
						...(failedResponseAtEnd(messages) ? { failed: true as const } : {}),
						...(learnerWords(messages).length <= 1 ? { untouched: true as const } : {}),
						tasks: sessionTasksOf(messages),
						...((t) => (t ? { taskTitle: t } : {}))(sessionTaskTitleOf(messages)),
						// An Ask session that ran his review is that review (round 19, M5).
						review: openedAsReview({ title: summary.title, topics: summary.topics, messages }) || answeredAsReview({ ...summary, kind, messages }),
						...((on) => (on ? { stepsOn: on } : {}))(stepsOn),
						...((on) => (on.length > 0 ? { openOn: on } : {}))(openOn(messages, own, stepsOn)),
						...((moved) => (moved.length > 0 ? { startsMoved: moved } : {}))([...new Set([...startsMovedOf(messages), ...(summary.startsMoved ?? [])])]),
						studied: studiedIn(messages),
						...inputTimes(messages),
					};
				} catch (err) {
					console.error(`[chat ${summary.id}] summary projection failed:`, err);
					return null;
				}
			})
			.filter((s) => s !== null)
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
		return listed.map((s) => closedByNewerWork(s, listed, work));
	} catch {
		return [];
	}
}

/** The topics the work open on him is asked on (`ChatSummary.openOn`): an
 *  open problem's own, else those the tutor tagged its question with that
 *  the session belongs to, else the topic its steps are on (a lesson's
 *  question, or a review's re-teach); else none, so a review's untagged
 *  question still reads on each of its topics. Empty when nothing is open. */
function openOn(messages: readonly LhMessage[], own: readonly string[], stepsOn: string | null): string[] {
	const problem = activeProblemOf(messages) !== null;
	if (!problem && danglingQuestionOf(messages) === null && leftQuestionRepose(messages).length === 0) return [];
	const tagged = openWorkTopicsOf(messages);
	const owned = tagged.filter((topic) => own.includes(topic));
	if (owned.length > 0) return owned;
	if (problem) return tagged;
	return stepsOn ? [stepsOn] : [];
}

/** When a session's work came, on the messages' own clock: its newest
 *  message but a question the app posed again as he opened it (round 17,
 *  M6), and its newest saved answer on each topic. */
interface Work {
	last: number;
	answered: ReadonlyMap<string, number>;
	/** When its saves wrote each task (`savedTaskTimesOf`). */
	tasked: ReadonlyMap<string, number>;
}

/** What the app posed again as he opened a session, his work's own words,
 *  not new work: a left question asked again, or the step of the task he
 *  pressed Continue on (round 21, m7). */
function posedAgain(m: LhMessage): boolean {
	return isQuestionRepose(m) || isTaskContinue(m);
}

function workOf(messages: readonly LhMessage[]): Work {
	const last = messages.reduce((at, m) => (posedAgain(m) || typeof m.timestamp !== "number" ? at : Math.max(at, m.timestamp)), 0);
	return { last, answered: savedAnswerTimesOf(messages), tasked: savedTaskTimesOf(messages) };
}

/** A session left with a question open closes once newer work took its
 *  place: for a review, another session of its course saved an answer on
 *  one of its topics after his last word in this one; for a lesson that
 *  holds a task, another session wrote that task after it, so the lesson
 *  goes on there. Every list reads it closed, so Home, Sessions and the
 *  topic page keep no stale "Left off" row and one open session per lesson
 *  (Edo, 18 Nov 2026, round 17 m10: the 9 Nov review's "1 to 105" question
 *  stayed "Left off 9 Nov" after the 10 Nov review answered its topic;
 *  round 18, m5: after "Yes" to picking up the Expectation lesson, the Ask
 *  session carried it on, and the 10 Nov lesson's lottery question stayed
 *  open as a second "Expectation and linearity lesson"). */
function closedByNewerWork(chat: ChatSummary, all: readonly ChatSummary[], work: ReadonlyMap<string, Work>): ChatSummary {
	if (!chat.pendingQuestion) return chat;
	const since = work.get(chat.id)?.last ?? 0;
	const open = chat.review ? (chat.openOn ?? chat.ownTopics ?? []) : [];
	const tasks = chat.review ? [] : (chat.tasks ?? []);
	const newer = all.some((other) => {
		const theirs = other.id !== chat.id && other.course?.workspace === chat.course?.workspace ? work.get(other.id) : undefined;
		return theirs !== undefined && (open.some((t) => (theirs.answered.get(t) ?? 0) > since) || tasks.some((k) => (theirs.tasked.get(k) ?? 0) > since));
	});
	return newer ? { ...chat, pendingQuestion: false, ended: "closed" } : chat;
}

/** How a session stands in every list: as its tutor's last turn left it,
 *  except one waiting on him since before yesterday, which Home's Today
 *  has let go (`todayRows` lists one waiting since yesterday): it was left
 *  on its day, so every surface says "Left off 8 Nov", never "Your turn"
 *  (round 16, m7: Rank practice left Home on 10 Nov and still read "Your
 *  turn", with its dot, in Sessions and on its topic page). */
function endedBy(ended: SessionEnd, updatedAt: string, waits: boolean): SessionEnd {
	if (ended === "left" || (ended !== "mid-lesson" && !waits)) return ended;
	const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	const yesterday = studyNow();
	yesterday.setDate(yesterday.getDate() - 1);
	return day(new Date(updatedAt)) < day(yesterday) ? "left" : ended;
}

/** When his input in a session came: its newest, and every local day it
 *  came on (`ChatSummary.studiedAt`, `studiedDays`), and the day of its
 *  newest saved answer on each topic (`answeredOn`). */
function inputTimes(messages: readonly LhMessage[]): { studiedAt?: string; studiedDays: string[]; answeredOn?: Record<string, string> } {
	const at = messages.flatMap((m) => (opensTurn(m) && typeof m.timestamp === "number" ? [m.timestamp] : []));
	const day = (ms: number) => {
		const d = new Date(ms);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	};
	const answered = [...savedAnswerTimesOf(messages)];
	return {
		...(at.length > 0 ? { studiedAt: new Date(Math.max(...at)).toISOString() } : {}),
		studiedDays: [...new Set(at.map(day))].sort(),
		...(answered.length > 0 ? { answeredOn: Object.fromEntries(answered.map(([topic, ms]) => [topic, day(ms)])) } : {}),
	};
}

/** Persist the full native message list (the record IS the agent state —
 *  Wave B: replay is state.messages = record.messages). SILENT by the
 *  events law — see the SILENCE LAW comment at createChat. updatedAt moves
 *  only with a message the save adds; the app asking his left question
 *  again as he opens the session is not study, so it keeps the day he left
 *  it (round 17, M6: a view re-stamped a 9 Nov session "Studied today"). */
function saveMessages(id: string, messages: LhMessage[]): void {
	const record = getChat(id);
	if (!record) throw new Error(`Chat not found: ${id}`);
	const had = new Set(record.messages.map((m) => m.id));
	const added = messages.some((m) => !had.has(m.id) && !posedAgain(m));
	record.messages = messages;
	if (added) record.updatedAt = studyNow().toISOString();
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

/** Add the topics a save's receipt moved the start of. Silent, and not
 * conversation activity: updatedAt stays put. */
function saveStartsMoved(id: string, topics: readonly string[]): void {
	const record = getChat(id);
	if (!record) throw new Error(`Chat not found: ${id}`);
	record.startsMoved = [...new Set([...(record.startsMoved ?? []), ...topics])];
	writeChat(record);
}

/** Keep its topics' titles as its course is deleted. Silent, and not
 * conversation activity: updatedAt stays put. */
function saveTopicTitles(id: string, titles: Readonly<Record<string, string>>): void {
	const record = getChat(id);
	if (!record) throw new Error(`Chat not found: ${id}`);
	record.topicTitles = { ...(record.topicTitles ?? {}), ...titles };
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

/** Take the session out of its course: it hands off to setting up
 *  something new, which links it to what it makes. Not conversation
 *  activity: updatedAt stays put. */
function leaveCourse(id: string): void {
	const record = getChat(id);
	if (!record) throw new Error(`Chat not found: ${id}`);
	delete record.course;
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

/** Name a session after the lesson it took up (the port's rule). */
function takeUpLesson(id: string, title: string): void {
	const record = getChat(id);
	if (!record) throw new Error(`Chat not found: ${id}`);
	if (record.renamed || !title.trim() || record.title === title.trim()) return;
	record.title = title.trim();
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
	leaveCourse,
	renameChat,
	nameSession,
	takeUpLesson,
	deleteChat,
	appendTurnUsage,
	saveDigestLedger,
	saveAnswerSaves,
	saveStartsMoved,
	saveTopicTitles,
};
