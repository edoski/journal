import { isPlanned } from "@/components/unit-inbox/topic-page/hybrid/hybrid-facts";
import { ACTION_WORDS, dayOf, dayWords, type Press, type SessionEntry, type TopicAction, type TopicFacts } from "@/components/unit-inbox/topic-page/topic-facts";
import { trailDays, type TrailDay } from "@/components/unit-inbox/topic-page/trail/trail-facts";

/**
 * What Pick up draws (spec: pickup.md), pure, from the shared
 * facts: the topic's sessions sorted by what he does with them. Now is the
 * page's one action (`topicAction`, all seven rows); Next is every other
 * place that waits on him; Scheduled is the engine's dated review; Earlier
 * is the rest of the history, by day.
 */

/** The icon Now leads with, the one the rest of the app uses for the same
 *  thing: the reply mark, the tutor's spinner, the review clock, the task
 *  bookmark, or the topic's pie. */
export type NowIconKind = "reply" | "writing" | "review" | "task" | "standing";

/** The one thing to pick up now, whichever row of the action table holds:
 *  what it is in a few words, where it stands in fewer, and the press. */
export interface NowItem {
	kind: TopicAction["kind"];
	icon: NowIconKind;
	/** What to pick up: the step a lesson stopped on, else the session's
	 *  title, a task's title, or the state in two words ("Not started"). May hold TeX. */
	words: string;
	/** Where it stands: "Your turn", "Tutor writing", "Left off yesterday", a
	 *  task's "Part (c)"; null when the words say it all. */
	note: string | null;
	/** The press, the head button's word: "Resume", "Start". */
	press: string;
	/** The session the press opens, which the map can show; null when the press starts one. */
	chat: string | null;
}

/** A place after Now: another session that waits on him or is being
 *  written, a review that is due, or an open task that holds the topic. */
export type NextItem =
	| { kind: "session"; entry: SessionEntry }
	| { kind: "review"; words: string; press: Press }
	| { kind: "task"; key: string; title: string; step: string | null; press: Press };

export interface PickupSections {
	now: NowItem;
	/** Empty when nothing else waits. */
	next: NextItem[];
	/** The day of the engine's next review, "Fri 13 Nov"; null when it dated none ahead. */
	scheduled: string | null;
	/** The sessions neither Now nor Next hold, and every scored attempt, by day. */
	earlier: TrailDay[];
}

/** The step a lesson stopped on, when its tutor planned. */
function stoppedOn(entry: SessionEntry | undefined): string | null {
	if (!entry || !isPlanned(entry)) return null;
	return entry.plan.tree.nodes.find((node) => node.id === entry.plan.current)?.title ?? null;
}

/** Now, from the page's action (`topicAction`, all seven rows). A session
 *  to open names the step it stopped on; a topic still being learned with
 *  no task names where its newest lesson that planned stopped, which the
 *  new session continues from. */
export function nowItem(facts: TopicFacts): NowItem {
	const { action } = facts;
	const press = ACTION_WORDS[action.kind];
	const base = { kind: action.kind, press, chat: null, note: null };
	switch (action.kind) {
		case "resume":
		case "open": {
			const entry = facts.sessions.find((e) => e.chat.id === action.chat.id);
			return {
				...base,
				icon: action.kind === "resume" ? "reply" : "writing",
				words: stoppedOn(entry) ?? action.chat.title,
				note: action.kind === "resume" ? "Your turn" : "Tutor writing",
				chat: action.chat.id,
			};
		}
		case "review":
			return { ...base, icon: "review", words: facts.marks.find((mark) => mark.kind === "review")?.words ?? "Review due" };
		case "continue": {
			if ("chat" in action) {
				const entry = facts.sessions.find((e) => e.chat.id === action.chat.id);
				return { ...base, icon: action.task ? "task" : "standing", words: stoppedOn(entry) ?? action.task?.title ?? action.chat.title, note: action.task?.step ?? (entry ? `Left off ${dayWords(entry.day, facts.today).toLowerCase()}` : null), chat: action.chat.id };
			}
			if (action.task) return { ...base, icon: "task", words: action.task.title, note: action.task.step };
			const last = facts.sessions.find(isPlanned);
			const step = stoppedOn(last);
			return step && last
				? { ...base, icon: "standing", words: step, note: `Left off ${dayWords(last.day, facts.today).toLowerCase()}` }
				: { ...base, icon: "standing", words: "Next lesson" };
		}
		case "start":
			return { ...base, icon: "standing", words: "Not started" };
		case "study":
			return { ...base, icon: "review", words: "Nothing due" };
	}
}

/** Every place after Now, most pressing first: another session that waits
 *  on him, then one the tutor is writing in, a due review the action does
 *  not already start, then each open task the action does not continue. */
export function nextItems(facts: TopicFacts, now: NowItem): NextItem[] {
	const sessions = facts.sessions.filter((entry) => entry.chat.id !== now.chat && entry.state !== "finished");
	const waiting = [...sessions.filter((entry) => entry.state === "your-turn"), ...sessions.filter((entry) => entry.state === "working")];
	const review =
		facts.action.kind !== "review" && facts.topic.review?.kind === "due"
			? [{ kind: "review" as const, words: facts.marks.find((mark) => mark.kind === "review")?.words ?? "Review due", press: { opening: `Review ${facts.topic.title}` } }]
			: [];
	const taken = facts.action.kind === "continue" ? facts.action.task?.key : undefined;
	const tasks = facts.pickups.flatMap((pickup): NextItem[] =>
		pickup.kind === "task" && pickup.task.key !== taken ? [{ kind: "task", key: pickup.task.key, title: pickup.title, step: pickup.task.step, press: pickup.press }] : [],
	);
	return [...waiting.map((entry): NextItem => ({ kind: "session", entry })), ...review, ...tasks];
}

/** The page's history sorted by what he does with it. */
export function pickupSections(facts: TopicFacts): PickupSections {
	const now = nowItem(facts);
	const next = nextItems(facts, now);
	const held = new Set([now.chat, ...next.flatMap((item) => (item.kind === "session" ? [item.entry.chat.id] : []))]);
	const review = facts.topic.review;
	return {
		now,
		next,
		scheduled: review?.kind === "scheduled" ? dayOf(review.date) : null,
		earlier: trailDays(
			facts.sessions.filter((entry) => !held.has(entry.chat.id)),
			facts.attempts,
			facts.today,
		),
	};
}
