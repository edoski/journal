import { randomUUID } from "node:crypto";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { Usage } from "@earendil-works/pi-ai";
import { sessionResume, type ChatSession } from "../../core/sdk-session.ts";
import { claudeErrorMessage, NO_KEY } from "../claude-errors.ts";
import { compactSummary, IDLE_MS, SESSION_GONE } from "./agent.ts";
import type { SdkEngine } from "./engine.ts";
import { keepSession, restoreSession, type SessionStore } from "./session-files.ts";

export interface SessionCompaction {
	/** The compacted copy's session id. */
	sessionId: string;
	summary: string;
	tokensBefore: number;
	/** The session's last entry after compacting. */
	anchor?: string;
	usage?: Usage;
	/** Copies the compacted session over the app's copy, once the lesson
	 *  takes it. */
	keep(): void;
}

/** Asks Claude Code to compact a copy of a lesson's session (a fork) with
 *  the lesson's own instructions (its `/compact` command). The lesson's own
 *  session is never written, so a turn may run on it meanwhile. Throws a user-facing error when
 *  the session is gone, Claude Code reports a failure, or it sends nothing
 *  for IDLE_MS: the lesson's next turn waits on this, so a stall must end. */
export async function compactSession(engine: SdkEngine, session: ChatSession, instructions: string, store?: SessionStore): Promise<SessionCompaction> {
	const launch = engine.launch();
	const { resume, at } = sessionResume(session);
	if (!resume || !restoreSession(store, launch.configDir, resume)) throw new Error(SESSION_GONE);
	const copy = randomUUID();
	const query = engine.query({
		prompt: `/compact ${instructions}`,
		options: { ...launch.options, tools: [], resume, forkSession: true, sessionId: copy, ...(at ? { resumeSessionAt: at } : {}) },
	});
	let forked: string | undefined;
	let tokensBefore: number | undefined;
	let summary: string | undefined;
	let anchor: string | undefined;
	let failure: string | undefined;
	let idle: ReturnType<typeof setTimeout> | undefined;
	let silent = false;
	const watch = () => {
		clearTimeout(idle);
		idle = setTimeout(() => { silent = true; query.close(); }, IDLE_MS);
		idle.unref?.();
	};
	try {
		watch();
		for await (const message of query as AsyncIterable<SDKMessage>) {
			watch();
			const uuid = (message as { uuid?: string }).uuid;
			if (message.type === "system" && message.subtype === "init") forked = message.session_id;
			if (uuid && (message.type === "user" || message.type === "assistant" || message.type === "system")) anchor = uuid;
			if (message.type === "system" && message.subtype === "compact_boundary") tokensBefore = message.compact_metadata.pre_tokens;
			if (message.type === "user" && (message as { isSynthetic?: boolean }).isSynthetic && typeof message.message.content === "string") summary = compactSummary(message.message.content);
			if (message.type === "result") {
				if (message.is_error || message.subtype !== "success") failure = claudeErrorMessage({ text: "errors" in message && Array.isArray(message.errors) ? message.errors.join("\n") : "" });
				break;
			}
		}
	} catch (error) {
		if (!silent) throw error;
	} finally {
		clearTimeout(idle);
		query.close();
	}
	if (silent) throw new Error(`Claude Code sent nothing for ${IDLE_MS / 60_000} minutes while compacting the lesson, so it was stopped.${NO_KEY}`);
	if (failure) throw new Error(failure);
	if (summary === undefined || tokensBefore === undefined) throw new Error(`Claude Code did not compact the lesson.${NO_KEY}`);
	if (forked !== copy) throw new Error(`Claude Code compacted session ${forked ?? "(none)"}, not a copy of the lesson's.${NO_KEY}`);
	const keep = () => {
		if (!store) return;
		try { keepSession(store, launch.configDir, copy); } catch (error) { console.error("[sdk] session copy failed:", error); }
	};
	return { sessionId: copy, summary, tokensBefore, anchor, keep };
}
