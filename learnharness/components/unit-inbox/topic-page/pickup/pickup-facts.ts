import { isPlanned } from "@/components/unit-inbox/topic-page/hybrid/hybrid-facts";
import { ACTION_WORDS, dayOf, dayWords, type BuildsOn, type Press, type SessionEntry, type StartsReason, type TopicAction, type TopicFacts } from "@/components/unit-inbox/topic-page/topic-facts";
import type { TopicRef } from "@/src/core";
import { trailDays, type TrailDay } from "@/components/unit-inbox/topic-page/trail/trail-facts";
import { leftWords } from "@/components/unit-inbox/units";
import { FIRST_LESSON, TUTOR_WRITING, overdueWords, reviewWords, startsAfterWords } from "@/components/study-words";

/**
 * What Pick up draws (spec: pickup.md), pure, from the shared
 * facts: the topic's sessions sorted by what he does with them. Now is the
 * page's one action (`topicAction`, all seven rows); Next is every other
 * place that waits on him; Scheduled is the engine's dated review; Earlier
 * is the rest of the history, by day. While Now starts a topic, Now says
 * the day the plan starts it, and the pane says why it comes now.
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
	 *  title, a task's title, or what to begin ("First lesson"). May hold TeX. */
	words: string;
	/** Where it stands: "Your turn", "Tutor writing", "Left off yesterday", a
	 *  task's "Part (c)"; null when the words say it all. */
	note: string | null;
	/** The press, the head button's word: "Resume", "Start". */
	press: string;
	/** The session the press opens, which the map can show; null when the press starts one. */
	chat: string | null;
	/** While it starts a topic, why the plan starts it then; absent otherwise. */
	why?: StartsReason | null;
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
	/** What the engine's plan dates ahead: the next review, or a topic's
	 *  first lesson; its day, "Fri 13 Nov", and why it waits that long when
	 *  something comes first; null when it dated none ahead. */
	scheduled: { kind: "review" | "start"; day: string; waits: string | null; why?: StartsReason | null } | null;
	/** The sessions neither Now nor Next hold, and every scored attempt, by day. */
	earlier: TrailDay[];
	/** Why the topic comes now, while Now starts it: what it builds on and
	 *  where it is in his material; null on any other Now. */
	why: { builds: readonly BuildsOn[]; refs: readonly TopicRef[] } | null;
}

/** When the plan starts a topic not started, as Now's note: "Planned
 *  today", "Planned Wed 11 Nov", then which courses' new topics come first
 *  when it waits behind them (`startsAfterWords`); for a topic the course
 *  leaves out, which the plan never starts, the reason it is left out;
 *  null when the plan has no day for it. */
export function plannedWords(facts: TopicFacts): string | null {
	const { starts, startsAfter, excluded } = facts.topic;
	// The plan starts no topic the course leaves out; its reason says why (round 5: Covariance read as ordinary work).
	if (!starts) return excluded ?? null;
	const day = starts <= facts.today ? "Planned today" : `Planned ${dayOf(starts)}`;
	const after = startsAfterWords(startsAfter);
	return after ? `${day}, ${after.charAt(0).toLowerCase()}${after.slice(1)}` : day;
}

/** Now's words on a topic with nothing to take up today: nothing is due,
 *  or, for a review memory asked for already that the plan holds for a
 *  later day, since when it is due, as the sidebar and the map's card say
 *  it (round 4: "Nothing due" sat above "Due since 6 Nov"; round 8:
 *  "Nothing planned today" beside the sidebar's "Due since 13 Nov"). */
export const NOTHING_DUE = "Nothing due";

/** Since when a review the plan holds past the day memory asked for it
 *  is due ("Due since 6 Nov", "Due today"); null for any other. */
function heldPastDue(review: TopicFacts["topic"]["review"], today: string): string | null {
	if (review?.kind !== "scheduled" || !review.held || review.held.since > today) return null;
	return review.held.since < today ? reviewWords(review, today) : overdueWords(0, today);
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
			const left = entry?.state === "left";
			return {
				...base,
				icon: action.kind === "open" ? "writing" : left ? "task" : "reply",
				words: stoppedOn(entry) ?? action.chat.title,
				note: action.kind === "open" ? TUTOR_WRITING : left ? leftWords(action.chat, facts.today) : "Your turn",
				chat: action.chat.id,
			};
		}
		case "review":
			return { ...base, icon: "review", words: facts.marks.find((mark) => mark.kind === "review")?.words ?? overdueWords(0, facts.today) };
		case "continue": {
			if ("chat" in action) {
				const entry = facts.sessions.find((e) => e.chat.id === action.chat.id);
				return { ...base, icon: action.task ? "task" : "standing", words: stoppedOn(entry) ?? action.task?.title ?? action.chat.title, note: action.task?.step ?? (entry ? `Left off ${dayWords(entry.day, facts.today).toLowerCase()}` : null), chat: action.chat.id };
			}
			if (action.task) return { ...base, icon: "task", words: action.task.title, note: action.task.step };
			const last = facts.sessions.find((entry) => entry.own && isPlanned(entry));
			const step = stoppedOn(last);
			return step && last
				? { ...base, icon: "standing", words: step, note: `Left off ${dayWords(last.day, facts.today).toLowerCase()}` }
				: { ...base, icon: "standing", words: "Next lesson" };
		}
		case "start":
			return { ...base, icon: "standing", words: FIRST_LESSON, note: plannedWords(facts), why: facts.startsWhy };
		case "study":
			return { ...base, icon: "review", words: heldPastDue(facts.topic.review, facts.today) ?? NOTHING_DUE };
	}
}

/** Every place after Now, most pressing first: another of the topic's own
 *  sessions that waits on him, then one the tutor is writing in, then one
 *  left for next time (a session that only touched the topic stays in
 *  Earlier),
 *  a due review the action does not already start, then each open task
 *  the action does not continue. */
export function nextItems(facts: TopicFacts, now: NowItem): NextItem[] {
	const sessions = facts.sessions.filter((entry) => entry.own && entry.chat.id !== now.chat && entry.state !== "finished");
	const waiting = (["your-turn", "working", "left"] as const).flatMap((state) => sessions.filter((entry) => entry.state === state));
	const review =
		facts.action.kind !== "review" && facts.topic.review?.kind === "due"
			? [{ kind: "review" as const, words: facts.marks.find((mark) => mark.kind === "review")?.words ?? overdueWords(0, facts.today), press: { opening: `Review ${facts.topic.title}` } }]
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
		scheduled:
			review?.kind === "scheduled"
				? { kind: "review", day: dayOf(review.date), waits: facts.waits }
				: facts.starts && now.kind !== "start"
					? { kind: "start", day: dayOf(facts.starts.day), waits: facts.starts.waits, why: facts.startsWhy }
					: null,
		earlier: trailDays(
			facts.sessions.filter((entry) => !held.has(entry.chat.id)),
			facts.attempts,
			facts.today,
		),
		why: now.kind === "start" ? { builds: facts.builds, refs: facts.refs } : null,
	};
}
