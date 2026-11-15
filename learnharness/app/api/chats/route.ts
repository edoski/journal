import { derivePlanStatusesLh, newSessionModeMessage, openingTitle, newSessionResumeMessage, sessionResumeText, sessionTasksOf, type LhMessage } from "@/src/core";
import { courseGone, courseLinkFor, createChat, isTurnRunning, listChats, readSettingsRecord, stores, titleFromPrompt } from "@/src/server";
import type { ChatListItem } from "@/src/core";

/** The session picker's list: record-derived summaries (phase, pending
 *  question) + live liveness — a running turn marks the session busy
 *  (contracts.ts ChatListItem; the store can't see liveness, the route is
 *  the merge point). Owner, minimal-color round: background jobs NO LONGER
 *  count — the sidebar's Background agents section is their channel now
 *  (a running spinner per row would double-signal them), so busy means
 *  exactly "a teach turn is in flight". A session whose course was deleted
 *  says so (`courseDeleted`), as its lesson page does. */
export async function GET() {
	const chats: ChatListItem[] = listChats().map((c) => ({
		...c,
		busy: isTurnRunning(c.id),
		courseDeleted: courseGone(c.course),
	}));
	return Response.json({ chats });
}

export async function POST(req: Request) {
	const body = (await req.json().catch(() => ({}))) as { title?: unknown; kind?: unknown; course?: unknown; resume?: unknown; topics?: unknown; arcCheck?: unknown };
	const title = typeof body.title === "string" ? body.title : "";
	// The Current design's Practice switch starts the session in practice;
	// without it the prober routes the opening, and the agents hand the
	// session between teaching and practice from there.
	const practice = body.kind === "practice";
	// Every session belongs to one registered course. A workspace the
	// engine does not list is refused, never guessed.
	const workspace = (body.course as { workspace?: unknown } | undefined)?.workspace;
	if (typeof workspace !== "string" || workspace.length === 0) {
		return Response.json({ error: "Pick a course first", code: "course_required" }, { status: 400 });
	}
	const course = await courseLinkFor(workspace);
	if (!course) return Response.json({ error: "Unknown course", code: "unknown_course" }, { status: 400 });
	// Continue on a finished lesson, when it starts fresh (FINISHED_LESSON):
	// the lesson it picks up must be one of this course's.
	const from = (body.resume as { from?: unknown } | undefined)?.from;
	const resumed = typeof from === "string" ? stores.chatStore.getChat(from) : null;
	if (typeof from === "string" && resumed?.course?.workspace !== workspace) {
		return Response.json({ error: "Unknown lesson", code: "unknown_lesson" }, { status: 400 });
	}
	// The course topics it is started on, by handle: a topic's page, Home's
	// review of those topics. The lists keep only handles the map has.
	const topics = Array.isArray(body.topics) ? body.topics.filter((t): t is string => typeof t === "string" && t.length > 0).slice(0, 32) : [];
	// The arc a session started from Check it checks; the brief reads its check from the engine.
	const arcCheck = typeof body.arcCheck === "string" && body.arcCheck.length > 0 ? body.arcCheck : undefined;
	// A lesson opened on topics is named after them, not the verb that
	// opened it ("Start Poisson distribution" is "Poisson distribution");
	// a review keeps its words (`openingTitle`).
	const chat = createChat(titleFromPrompt(openingTitle(title, topics) || "Untitled session"), course, topics, arcCheck);
	const opening: LhMessage[] = practice ? [newSessionModeMessage("practice") as LhMessage] : [];
	if (resumed) {
		// The lesson's plan carries over as this session's plan map, so the
		// teacher picks it up at the step it stopped on.
		const steps = resumed.tree?.nodes ?? [];
		const at = resumed.tree ? derivePlanStatusesLh(resumed.tree, resumed.messages).current : null;
		if (resumed.tree) stores.chatStore.saveTree(chat.id, resumed.tree);
		const text = sessionResumeText(resumed.title, steps, steps.find((s) => s.id === at)?.title ?? null);
		opening.push(newSessionResumeMessage({ id: resumed.id, title: resumed.title }, text, sessionTasksOf(resumed.messages)) as LhMessage);
	}
	if (opening.length > 0) stores.chatStore.saveMessages(chat.id, opening);
	return Response.json({ id: chat.id, title: chat.title });
}
