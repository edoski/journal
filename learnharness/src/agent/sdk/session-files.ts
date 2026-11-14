import { copyFileSync, cpSync, existsSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { claudeWorkDir } from "../claude-cli.ts";

/**
 * The app's own copy of a lesson's Claude Code session. Claude Code keeps a
 * session as `<config dir>/projects/<working folder>/<id>.jsonl` and deletes
 * transcripts older than 30 days, and each account has its own config dir.
 * After every turn the app copies the file next to the lesson's record
 * (`<chat>.session.jsonl`, and the session's side folder when it has one)
 * and puts it back before a resume that would not find it. The copy is
 * opaque: the app never parses it.
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
