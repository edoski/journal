/**
 * Storage ports (the hexagonal seams — vision §1 "storage stays swappable").
 *
 * One port per ENTITY, with domain operations — never one generic
 * key/value interface. Core and the service layer that orbits it code
 * against these types only; concrete adapters live in src/store/ (fs
 * JSON/JSONL today, SQLite drop-in later) and are wired exactly once, in
 * the composition root (src/server/stores.ts). Dependencies point one way:
 * adapters may import core; core NEVER imports an adapter.
 */

import type { ChatSession } from "./sdk-session.ts";
import type { ArcPassLedger } from "./arc-pass.ts";
import type { CourseMapLedger } from "./course-map-build.ts";
import type { LhMessage } from "./native-messages.ts";
import type {
	ChatRecord,
	ChatSummary,
	DigestLedger,
	JobKind,
	JobRecord,
	PlanTree,
	SessionGoal,
	TurnUsage,
} from "./contracts.ts";
import type { UserSettings } from "./settings.ts";
import type { CourseLink, CourseListing, CourseResult, CourseSummary, CourseVerb, NewCourseRecord, UnreadableCourse } from "./contracts/course.ts";
import type { CourseMap } from "./contracts/course-map.ts";

// ─── ChatStore — the session record's home (data/chats) ─────────────────────

export interface ChatStore {
	/** Create a session record; `course` links the session to one
	 *  registered course for its whole life. A session's mode lives in its
	 *  transcript (a session-mode marker, then the agents' handoffs).
	 *  `arcCheck` is the arc a Check it session checks. */
	/** `asked`: its opening is his question, which the app words for him
	 *  (Ask the tutor), so it shows as his message, never as the app's
	 *  opening on its topics. */
	createChat(title: string, course?: CourseLink, topics?: readonly string[], arcCheck?: string, asked?: boolean): ChatRecord;
	/** The full record, or null if unknown id / corrupt file. */
	getChat(id: string): ChatRecord | null;
	/** All sessions, newest activity first (the sidebar's list view). */
	listChats(): ChatSummary[];
	/** Persist the full native message list (the record IS the agent
	 * state — Wave B, owner-approved 2026-09-26). */
	saveMessages(id: string, messages: LhMessage[]): void;
	/** Persist the session plan tree (plan tools call this in execute). */
	saveTree(id: string, tree: PlanTree): void;
	/** Persist the record's map to its Claude Code session. Silent, like saveTree. */
	saveSession(id: string, session: ChatSession): void;
	/** Append one usage entry to the record's turn log (the money channel,
	 * 2026-09): idempotent per turn id — each request carries its own, so
	 * a turn persisted twice appends once while continuation turns (which
	 * share a response message id) each keep their usage. */
	appendTurnUsage(id: string, entry: TurnUsage): void;
	/** Replace the lesson digest's ledger. Silent, like the usage logs, and
	 *  never conversation activity: updatedAt stays put. */
	saveDigestLedger(id: string, ledger: DigestLedger): void;
	/** Add a save's links to the record's `answerSaves`: answer key →
	 *  observation ids. Silent, like the digest ledger. */
	saveAnswerSaves(id: string, links: Readonly<Record<string, readonly string[]>>): void;
	/** Link the session to a registered course (the banner on a session
	 *  that has none, or whose course is gone). Silent, like saveTree. */
	linkCourse(id: string, course: CourseLink): void;
	/** Rename a session (the header's click-to-edit title, 2026-09-17).
	 * Like saveTree: a rename is NOT conversation activity — updatedAt
	 * stays put, so sidebar order never churns on a rename. */
	renameChat(id: string, title: string): ChatRecord;
	/** Name a session, once: its first turn's name or its first plan's
	 *  goal. A session started on no topic takes the goal's topic as its own
	 *  while it has none and, unless the learner renamed it or it was named
	 *  already, the goal's title. A no-op for a session started on a topic.
	 *  Announced like a rename; never conversation activity. */
	nameSession(id: string, goal: SessionGoal): void;
	/** Delete the session record entirely (session-deletion wave 6, owner
	 *  2026-09-22). False when the id is unknown. Job cleanup is the
	 *  caller's choreography (server/chats.ts), not the store's. */
	deleteChat(id: string): boolean;
}

// ─── JobStore — background sub-agent jobs (data/jobs) ─────────────────────────

export interface CreateJobInit {
	kind: JobKind;
	chatId: string;
	toolCallId: string;
	/** First activity line (defaults to "starting"). */
	activity?: string;
	/** Saved on the job before its worker is spawned. */
	input?: unknown;
}

/** Mergeable fields — identity (id, kind, chatId, toolCallId, createdAt) is immutable. */
export type JobPatch = Partial<Omit<JobRecord, "id" | "kind" | "chatId" | "toolCallId" | "createdAt">>;

export interface JobStore {
	/** Create a running job (keyed by toolCallId for spawn dedup). */
	createJob(init: CreateJobInit): JobRecord;
	getJob(id: string): JobRecord | null;
	/** Merge a patch into the record; null if unknown id. */
	updateJob(id: string, patch: JobPatch): JobRecord | null;
	/** All jobs for a chat, newest activity first. */
	listJobs(chatId: string): JobRecord[];
	/** The job fulfilling a given tool part, if any (spawn-hook dedup). */
	findJobByToolCallId(chatId: string, toolCallId: string): JobRecord | null;
	/** Delete every job record for a chat — running or finished (session-
	 *  deletion wave 6). Returns how many files were removed. The deletion
	 *  route refuses while jobs are still running, so by the time this
	 *  fires every record is terminal. */
	deleteJobsForChat(chatId: string): number;
}

// ─── SettingsStore — THE user settings record (settings-storage wave, 2026-09-19) ──

/**
 * The one record for every non-secret product preference (core/settings.ts
 * UserSettings — delta semantics, see that module's doc). The store is
 * replace-whole on the RECORD; per-section scoping is a server-band concern
 * (single process, no stale-client hazard to defend against at this seam).
 * Schema-version lazy migration happens inside readSettings, never in
 * the callers. (The legacy default-settings.json fold died with the chat
 * section — per-session models, owner 2026-09-28.)
 */
export interface SettingsStore {
	/** The sanitized record, or null when none exists yet (first boot). */
	readSettings(): UserSettings | null;
	/** Persist the record (replace-whole). Callers pass a SANITIZED record. */
	writeSettings(settings: UserSettings): void;
}

// ─── CourseMapLedgers — what the course map builder already read ────────────

/** The course map builder's ledger, one per course workspace (app data:
 *  the engine's record holds the map, this only what was read). */
export interface CourseMapLedgers {
	get(workspace: string): CourseMapLedger | undefined;
	/** Replace one course's ledger. */
	save(workspace: string, ledger: CourseMapLedger): void;
	/** Every course that has a ledger. */
	workspaces(): string[];
	/** Drop a deleted course's ledger, so a course made again in its folder
	 *  has its material read afresh. */
	forget(workspace: string): void;
}

// ─── ArcPassLedgers — where each course stands with the grouping pass ───────

/** The grouping pass's ledger, one per course workspace: whether a live run
 *  may form its arcs, and what the last run found. A course without one
 *  never gets a live run. */
export interface ArcPassLedgers {
	get(workspace: string): ArcPassLedger | undefined;
	save(workspace: string, ledger: ArcPassLedger): void;
	workspaces(): string[];
	forget(workspace: string): void;
}

// ─── CourseRecords — the learning engine's course records ───────────────────

/**
 * The learner's course records live in the `learning` engine, outside the
 * app's data dir; the engine is their only writer. The adapter runs the
 * engine's agent CLI, one verb per call. Never throws: every failure comes
 * back as a CourseResult or an unavailable listing.
 */
export interface CourseRecords {
	/** Every registered course, for the chooser, and those it could not read;
	 *  `plan` is the engine's `plan --all --days 1` output they came from,
	 *  each course's entry the one its own `plan` gives. */
	list(): Promise<
		{ available: true; courses: CourseSummary[]; unreadable: UnreadableCourse[]; plan?: unknown } | Extract<CourseListing, { available: false }>
	>;
	/** Run one verb against one course workspace. */
	run(workspace: string, verb: CourseVerb): Promise<CourseResult>;
	/** Whether the course was deleted: its folder is a course whose record
	 *  the engine forgot. A save there would bring the course back as an
	 *  untitled ghost. Absent where nothing keeps records on disk. */
	forgotten?(workspace: string): boolean;
	/** The course map: the engine's read-only `map` verb, parsed. `here`
	 *  is the topic of the lesson in progress, which the engine cannot see:
	 *  its `currentArc` then names that topic's arc. */
	map(workspace: string, here?: string | null): Promise<{ ok: true; map: CourseMap } | Extract<CourseResult, { ok: false }>>;
	/** Make an existing directory a titled, registered course: the engine's
	 *  `init` there, then one save of the title and the exam day. `workspace`
	 *  is the directory as the engine registered it. */
	create(directory: string, course: NewCourseRecord): Promise<{ ok: true; workspace: string } | Extract<CourseResult, { ok: false }>>;
}
