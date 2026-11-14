import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { Usage } from "@earendil-works/pi-ai";
import { sessionResume, type ChatSession } from "../../core/sdk-session.ts";
import { claudeErrorMessage, NO_KEY } from "../claude-errors.ts";
import { compactSummary, SESSION_GONE } from "./agent.ts";
import type { SdkEngine } from "./engine.ts";
import { keepSession, restoreSession, type SessionStore } from "./session-files.ts";

export interface SessionCompaction {
	summary: string;
	tokensBefore: number;
	/** The session's last entry after compacting. */
	anchor?: string;
	usage?: Usage;
}

/** Asks Claude Code to compact a lesson's session with the lesson's own
 *  instructions (its `/compact` command). Throws a user-facing error when
 *  the session is gone or Claude Code reports a failure. */
export async function compactSession(engine: SdkEngine, session: ChatSession, instructions: string, store?: SessionStore): Promise<SessionCompaction> {
	const launch = engine.launch();
	const { resume, at } = sessionResume(session);
	if (!resume || !restoreSession(store, launch.configDir, resume)) throw new Error(SESSION_GONE);
	const query = engine.query({
		prompt: `/compact ${instructions}`,
		options: { ...launch.options, tools: [], resume, ...(at ? { resumeSessionAt: at } : {}) },
	});
	let tokensBefore: number | undefined;
	let summary: string | undefined;
	let anchor: string | undefined;
	let failure: string | undefined;
	try {
		for await (const message of query as AsyncIterable<SDKMessage>) {
			const uuid = (message as { uuid?: string }).uuid;
			if (uuid && (message.type === "user" || message.type === "assistant" || message.type === "system")) anchor = uuid;
			if (message.type === "system" && message.subtype === "compact_boundary") tokensBefore = message.compact_metadata.pre_tokens;
			if (message.type === "user" && (message as { isSynthetic?: boolean }).isSynthetic && typeof message.message.content === "string") summary = compactSummary(message.message.content);
			if (message.type === "result") {
				if (message.is_error || message.subtype !== "success") failure = claudeErrorMessage({ text: "errors" in message && Array.isArray(message.errors) ? message.errors.join("\n") : "" });
				break;
			}
		}
	} finally {
		query.close();
	}
	if (failure) throw new Error(failure);
	if (summary === undefined || tokensBefore === undefined) throw new Error(`Claude Code did not compact the lesson.${NO_KEY}`);
	if (store) {
		try { keepSession(store, launch.configDir, resume); } catch (error) { console.error("[sdk] session copy failed:", error); }
	}
	return { summary, tokensBefore, anchor };
}
