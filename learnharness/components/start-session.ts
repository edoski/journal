import { clearOpeningPrompt, OPENING_PROMPT_FAILURE, stashOpeningPrompt } from "./opening-prompt";

export interface SessionCreation {
	/** Its opening words, and its name unless `name` gives one. */
	title: string;
	/** Its name in the sidebar and the breadcrumb when the opening is a
	 *  long question the app asks for him (round 11, 1 N14). */
	name?: string;
	/** Practice from its first turn; setup: something new to learn, set up
	 *  by conversation, with no course yet. */
	kind?: "practice" | "setup";
	/** The picked course's workspace (the course chooser). */
	course?: { workspace: string };
	/** The course topics it is started on, by handle. */
	topics?: readonly string[];
	/** The arc a Check it session checks, by handle. */
	arcCheck?: string;
	/** The finished lesson a fresh session picks up (FINISHED_LESSON). */
	resume?: { from: string };
}

/** The setup conversation's direction under review (design-variant.ts,
 *  group "setup"), as the Logbook guide marks it on <html>; none in a
 *  production build. */
function setupStyle(): { setupStyle?: string } {
	const style = typeof document === "undefined" ? null : document.documentElement.getAttribute("data-polish-setup");
	return style && style !== "current" ? { setupStyle: style } : {};
}

/** Per source-composer instance. Retain a successful creation if storage
 * fails, so an unchanged retry does not create another empty session.
 * Changed text or context is a different start, not a stale title.
 * A second press while the first is in flight joins it, so a double press
 * creates one session and sends its opening once.
 */
export class SessionStarter {
	private created?: { identity: string; id: string };
	private pending?: { identity: string; href: Promise<string> };

	start(body: SessionCreation, fetchLike: typeof fetch): Promise<string> {
		const identity = JSON.stringify(body);
		if (this.pending?.identity === identity) return this.pending.href;
		const href = this.create(identity, body, fetchLike).finally(() => {
			if (this.pending?.href === href) this.pending = undefined;
		});
		this.pending = { identity, href };
		return href;
	}

	private async create(identity: string, body: SessionCreation, fetchLike: typeof fetch): Promise<string> {
		if (this.created?.identity !== identity) {
			if (this.created) clearOpeningPrompt(this.created.id);
			this.created = undefined;
			const res = await fetchLike("/api/chats", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ ...body, ...setupStyle() }),
			});
			if (!res.ok) throw new Error(OPENING_PROMPT_FAILURE);
			const result = await res.json() as { id?: unknown };
			if (typeof result.id !== "string" || !/^[A-Za-z0-9_-]+$/.test(result.id)) throw new Error(OPENING_PROMPT_FAILURE);
			this.created = { identity, id: result.id };
		}
		if (!stashOpeningPrompt(this.created.id, body.title)) throw new Error(OPENING_PROMPT_FAILURE);
		return `/chat/${this.created.id}`;
	}
}
