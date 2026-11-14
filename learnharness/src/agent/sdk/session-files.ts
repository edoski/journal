import { randomUUID } from "node:crypto";
import { copyFileSync, cpSync, existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ChatSession, SessionSeed } from "../../core/sdk-session.ts";
import { claudeWorkDir } from "../claude-cli.ts";

/**
 * The app's own copy of a lesson's Claude Code session. Claude Code keeps a
 * session as `<config dir>/projects/<working folder>/<id>.jsonl` and deletes
 * transcripts older than 30 days, and each account has its own config dir.
 * After every turn the app copies the file next to the lesson's record
 * (`<chat>.session.jsonl`, and the session's side folder when it has one)
 * and puts it back before a resume that would not find it. The copy is
 * opaque: the app never parses it. The one file the app writes is a seed
 * (`seedSession`), for a lesson that has no session to resume.
 */
export interface SessionStore {
	/** The folder that holds the app's copies (the chats folder). */
	dir: string;
	chatId: string;
}

/** Claude Code's folder for a working directory: its real path with every
 *  character outside [A-Za-z0-9] replaced by "-". */
function projectDir(configDir: string): string {
	return join(configDir, "projects", realpathSync(claudeWorkDir()).replace(/[^a-zA-Z0-9]/g, "-"));
}

const liveFile = (configDir: string, id: string) => join(projectDir(configDir), `${id}.jsonl`);
const liveSide = (configDir: string, id: string) => join(projectDir(configDir), id);
const keptFile = (store: SessionStore) => join(store.dir, `${store.chatId}.session.jsonl`);
const keptSide = (store: SessionStore) => join(store.dir, `${store.chatId}.session`);

/** Copies the live session over the app's copy. A missing live file leaves
 *  the copy as it was. */
export function keepSession(store: SessionStore, configDir: string, id: string): void {
	const file = liveFile(configDir, id);
	if (!existsSync(file)) return;
	mkdirSync(store.dir, { recursive: true });
	copyFileSync(file, keptFile(store));
	rmSync(keptSide(store), { recursive: true, force: true });
	if (existsSync(liveSide(configDir, id))) cpSync(liveSide(configDir, id), keptSide(store), { recursive: true });
}

/** Makes the session resumable from this account's config dir: true when
 *  the live file is there or the app's copy was put back, false when both
 *  are gone. */
export function restoreSession(store: SessionStore | undefined, configDir: string, id: string): boolean {
	if (existsSync(liveFile(configDir, id))) return true;
	if (!store || !existsSync(keptFile(store))) return false;
	mkdirSync(projectDir(configDir), { recursive: true, mode: 0o700 });
	copyFileSync(keptFile(store), liveFile(configDir, id));
	if (existsSync(keptSide(store))) cpSync(keptSide(store), liveSide(configDir, id), { recursive: true });
	return true;
}

/** Deletes the app's copy (the lesson was deleted). */
export function forgetSession(store: SessionStore): void {
	rmSync(keptFile(store), { force: true });
	rmSync(keptSide(store), { recursive: true, force: true });
}

/**
 * Writes a new session holding a lesson's conversation (`sessionSeed`) in
 * Claude Code's own transcript format, live in this account's config dir and
 * as the app's copy, and returns its map: the seed holds the record through
 * `seed.synced`, and its last entry is the anchor a failed first turn
 * resumes at. Claude Code resumes it like any session it wrote. The format
 * is Claude Code's internal one (the SDK documents no import), kept to the
 * fields a resume reads: each entry's place in the chain, its message, the
 * session and the working folder.
 */
export function seedSession(store: SessionStore | undefined, configDir: string, seed: SessionSeed): ChatSession {
	const id = randomUUID();
	const cwd = realpathSync(claudeWorkDir());
	let parentUuid: string | null = null;
	const lines = seed.turns.map((turn) => {
		const uuid = randomUUID();
		const message = turn.role === "user"
			? { role: "user", content: turn.content }
			: {
				id: `msg_seed_${uuid.replace(/-/g, "")}`, type: "message", role: "assistant", model: turn.model, content: turn.content,
				stop_reason: turn.content.some((block) => block.type === "tool_use") ? "tool_use" : "end_turn", stop_sequence: null,
				usage: turn.usage ?? { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
			};
		const entry = { parentUuid, isSidechain: false, type: turn.role, message, uuid, timestamp: new Date(turn.timestamp).toISOString(), userType: "external", entrypoint: "sdk-ts", cwd, sessionId: id };
		parentUuid = uuid;
		return JSON.stringify(entry);
	});
	const text = `${lines.join("\n")}\n`;
	mkdirSync(projectDir(configDir), { recursive: true, mode: 0o700 });
	writeFileSync(liveFile(configDir, id), text, { mode: 0o600 });
	if (store) {
		mkdirSync(store.dir, { recursive: true });
		writeFileSync(keptFile(store), text, { mode: 0o600 });
		rmSync(keptSide(store), { recursive: true, force: true });
	}
	return { id, synced: seed.synced, ...(parentUuid ? { anchor: parentUuid } : {}) };
}
