/**
 * name_session: the opening agents name a session in its first reply, so
 * no session is listed by the raw first message he typed (round 3, 14 Nov
 * 2026). A focused question gets a direct answer and never a plan, so the
 * plan's goal could not name it. SERVER-SIDE: it writes the record's title
 * and topic through `ChatStore.nameSession`, whose rule keeps a session
 * started on a topic, renamed by him or already named as it is.
 */

import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { titleFromPrompt } from "../../core/contracts.ts";
import type { ChatStore } from "../../core/ports.ts";
import { onFirstTurn } from "../../core/session-naming.ts";
import { serverExecute } from "../tool-execute.ts";

export const NAME_SESSION_TOOL = "name_session";

const nameSessionInput = Type.Object({
	title: Type.String({
		minLength: 1,
		description: "The session's name in the app's lists and header: 2 to 6 words, literal, what the session is about.",
	}),
	topic: Type.Optional(Type.String({ minLength: 1, description: "The course topic handle the session is about, from the course record; omit when it is about none." })),
});

/** What the tool reads and writes. */
export interface NameSessionContext {
	chatId: string;
	chatStore: Pick<ChatStore, "getChat" | "nameSession">;
}

export function nameSessionTool(ctx: NameSessionContext): Record<string, AgentTool<any>> {
	return {
		[NAME_SESSION_TOOL]: {
			name: NAME_SESSION_TOOL,
			label: NAME_SESSION_TOOL,
			description:
				"Name this session: its title in the learner's session list, Home and the header, and the course topic it is about. " +
				"Takes effect once, on the session's first turn; a session started on a topic, renamed by the learner, already named or past its first turn keeps its name, and the result says so.",
			parameters: nameSessionInput,
			execute: serverExecute(NAME_SESSION_TOOL, nameSessionInput, async ({ title, topic }) => {
				const record = ctx.chatStore.getChat(ctx.chatId);
				if (!record) return { ok: false, error: `Chat not found: ${ctx.chatId}` };
				if ((record.topics ?? []).length > 0 || record.named || !onFirstTurn(record.messages)) return `The session keeps its name: ${record.title}`;
				ctx.chatStore.nameSession(ctx.chatId, { title: titleFromPrompt(title), ...(topic ? { topic } : {}) });
				return record.renamed ? `The session keeps the name he gave it: ${record.title}` : "Named.";
			}),
		},
	};
}
