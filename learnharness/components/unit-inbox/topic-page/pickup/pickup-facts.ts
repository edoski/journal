import { isPlanned } from "@/components/unit-inbox/topic-page/hybrid/hybrid-facts";
import { dayOf, dayWords, type BuildsOn, type Press, type SessionEntry, type StartsReason, type TopicAction, type TopicFacts } from "@/components/unit-inbox/topic-page/topic-facts";
import type { ChatListItem, TopicRef } from "@/src/core";
import { earlierSessions, trailDays, type TrailDay } from "@/components/unit-inbox/topic-page/trail/trail-facts";
import { daysBetween, leftWords } from "@/components/unit-inbox/units";
import { continueHref, pausedWords } from "@/components/nav/session-state";
import { FIRST_LESSON, TUTOR_WRITING, leftOffWords, movedWords, overdueWords, pressWord, startsAfterWords, type PressWord } from "@/components/study-words";

/**
 * What Pick up draws (spec: pickup.md), pure, from the shared
 * facts: the topic's sessions sorted by what he does with them. Now is the
 * page's one action (`topicAction`, all seven rows); Next is every other
 * place that waits on him; Scheduled is the engine's dated review; Earlier
 * is the rest of the history, by day. While Now starts a topic, Now says
 * the day the plan starts it, and the pane says why it comes now.
 */

/** When a session was left, in the one words function's form ("Left off 6 Nov"). */
const leftDayWords = (day: string, today: string) => leftOffWords(Math.max(0, daysBetween(day, today)), today);

/** The fact Now leads with, in the one icon table's kinds (`FACT_ICON`):
 *  a turn that waits, the tutor writing, a review, an open task, or the
 *  topic's pie. */
export type NowIconKind = "your-turn" | "working" | "review" | "task" | "standing";

/** The one thing to pick up now, whichever row of the action table holds:
 *  what it is in a few words, where it stands in fewer, and the press. */
export interface NowItem {
	kind: TopicAction["kind"];
	icon: NowIconKind;
	/** What to pick up: the step a lesson stopped on, else the session's
	 *  title, a task's title, or what to begin ("First lesson"). May hold TeX. */
	words: string;
	/** Where it stands: "Your turn", "Tutor writing", "Left off 6 Nov", a
	 *  task's "Part (c)"; null when the words say it all. */
	note: string | null;
	/** The press, the head button's word: "Resume", "Start"; null when
	 *  nothing is due, where a press would only compete with Scheduled's
	 *  day (round 15, m9: "Nothing due · Study"). */
	press: PressWord | null;
	/** The session the press opens, which the map can show; null when the press starts one. */
	chat: string | null;
	/** Where the press goes when it opens a session (`continueHref`). */
	href?: string;
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
	/** What the engine's plan dates ahead: the next review, a topic's
	 *  first lesson, or the day a lesson he began goes on; its day, "Fri 13 Nov", and why it waits that long when
	 *  something comes first; null when it dated none ahead. */
	scheduled: { kind: "review" | "start" | "lesson"; day: string; waits: string | null; why?: StartsReason | null } | null;
	/** Under a lesson he began that goes on, the day the plan first reviews
	 *  the topic after it ("Wed 11 Nov"); null otherwise (round 14, m36). */
	review: { day: string } | null;
	/** The sessions neither Now nor Next hold, and every scored attempt, by day. */
	earlier: TrailDay[];
	/** Why the topic comes now, while Now starts it: what it builds on and
	 *  where it is in his material; null on any other Now. */
	why: { builds: readonly BuildsOn[]; refs: readonly TopicRef[] } | null;
}

/** When the plan starts a topic not started, as Now's note: "Planned
 *  today", "Planned Wed 11 Nov", then what the exam ahead means for it,
 *  as the head and the calendar say it ("Planned Sat 28 Nov · Not before
 *  the exam, every study day is full at your pace", "Planned Tue 24 Nov ·
 *  Not on the exam; after it"); else, for a day he was told that his
 *  study moved, what moved it ("Planned Fri 13 Nov · Moved from Mon 9 Nov,
 *  since Binomial distribution is not solid yet"), and once that day is
 *  past, the topic it starts after ("Planned Fri 13 Nov · After Binomial
 *  distribution"; round 15, m2: Poisson moved 9 → 13 Nov with no word
 *  anywhere); else which courses' new topics come first when it waits
 *  behind them (`startsAfterWords`); for a topic the course leaves out,
 *  which the plan never starts, the reason it is left out; null when the
 *  plan has no day for it. */
export function plannedWords(facts: TopicFacts): string | null {
	const { starts, startsAfter, excluded, moved } = facts.topic;
	// The plan starts no topic the course leaves out; its reason says why (round 5: Covariance read as ordinary work).
	// An exam topic the plan has no day for in its window says the exam's words too (round 18, M1's seed:
	// Diagonalization read only "First lesson" while the course head said no room before the exam to start it).
	if (!starts) return excluded ?? facts.exam ?? null;
	const day = starts <= facts.today ? "Planned today" : `Planned ${dayOf(starts)}`;
	// The exam is why it comes when it does, whatever else it waits behind (round 13, 1 N1: Geometric read only
	// "Planned Sat 28 Nov" while the head said no room before the exam to start it).
	if (facts.exam) return `${day} · ${facts.exam}`;
	if (moved) return `${day} · ${movedWords(null, facts.today, moved)}`;
	if (facts.startsWhy?.kind === "after") return `${day} · ${facts.startsWhy.short}`;
	const after = startsAfterWords(startsAfter);
	return after ? `${day}, ${after.charAt(0).toLowerCase()}${after.slice(1)}` : day;
}

/** Now's words on a topic with nothing to take up today, one state in one
 *  phrase on every topic page (round 15, m9: "Nothing due" on one page,
 *  "Nothing today" on another): Scheduled gives the plan's day, and for a
 *  review memory asked for already that the plan holds for a later day the
 *  head says since when ("Due 10 Nov, back 20 Nov"), so Now never
 *  says "Due today" beside "Review Mon 9 Nov" (round 12, 1 m1 and 2 n1). */
export const NOTHING_DUE = "Nothing due today";

/** A session's one name, as Home's line names it: the title of the open
 *  task it holds, else its own title; never a step its tutor planned,
 *  which the lesson map beside marks (round 11, 2 N2: Kernel's Now read
 *  "Which inputs does a matrix send to zero?"). */
function sessionName(chat: ChatListItem, facts: TopicFacts): string {
	const held = new Set(chat.tasks ?? []);
	return facts.pickups.find((pickup) => pickup.kind === "task" && held.has(pickup.task.key))?.title ?? facts.tasks.find((task) => held.has(task.key))?.title ?? chat.title;
}

/** Now, from the page's action (`topicAction`, all seven rows). A session
 *  to open is named as Home names it (`sessionName`); a topic still being
 *  learned with no task names its newest lesson that planned, which the
 *  new session continues from. */
export function nowItem(facts: TopicFacts): NowItem {
	const { action } = facts;
	const press = pressWord(action.kind);
	const base = { kind: action.kind, press, chat: null, note: null };
	switch (action.kind) {
		case "resume":
		case "open": {
			const entry = facts.sessions.find((e) => e.chat.id === action.chat.id);
			const left = entry?.state === "left";
			return {
				...base,
				icon: action.kind === "open" ? "working" : left ? "task" : "your-turn",
				words: sessionName(action.chat, facts),
				note: action.kind === "open" ? TUTOR_WRITING : left ? leftWords(action.chat, facts.today) : entry?.state === "paused" ? pausedWords(action.chat) : "Your turn",
				chat: action.chat.id,
				href: continueHref(action.chat),
			};
		}
		case "review":
			return { ...base, icon: "review", words: facts.marks.find((mark) => mark.kind === "review")?.words ?? overdueWords(0, facts.today), chat: "chat" in action ? action.chat.id : null, ...("chat" in action ? { href: continueHref(action.chat) } : {}) };
		case "continue": {
			if ("chat" in action) {
				const entry = facts.sessions.find((e) => e.chat.id === action.chat.id);
				return { ...base, icon: action.task ? "task" : "standing", words: action.task?.title ?? sessionName(action.chat, facts), note: action.task?.step ?? (entry ? leftDayWords(entry.day, facts.today) : null), chat: action.chat.id, href: continueHref(action.chat) };
			}
			if (action.task) return { ...base, icon: "task", words: action.task.title, note: action.task.step };
			const last = facts.sessions.find((entry) => entry.own && isPlanned(entry));
			return last
				? { ...base, icon: "standing", words: sessionName(last.chat, facts), note: leftDayWords(last.day, facts.today) }
				: { ...base, icon: "standing", words: "Next lesson" };
		}
		case "start":
			return { ...base, icon: "standing", words: FIRST_LESSON, note: plannedWords(facts), why: facts.startsWhy };
		case "study":
			return { ...base, icon: "review", words: NOTHING_DUE, press: null };
	}
}

/** Every place after Now, most pressing first: another of the topic's own
 *  sessions that waits on him, then one the tutor is writing in, then one
 *  left for next time (a session that only touched the topic stays in
 *  Earlier),
 *  a due review the action does not already start, then each open task
 *  the action does not continue and no session listed holds, so a lesson
 *  is listed once (round 10, 1 m5: "Eigenvalues and eigenvectors" beside
 *  its task "Eigenvalues and eigenvectors lesson"). */
export function nextItems(facts: TopicFacts, now: NowItem): NextItem[] {
	const sessions = facts.sessions.filter((entry) => entry.own && entry.chat.id !== now.chat && entry.state !== "finished");
	const waiting = (["your-turn", "working", "left"] as const).flatMap((state) => sessions.filter((entry) => entry.state === state));
	const review =
		facts.action.kind !== "review" && facts.topic.review?.kind === "due"
			? [{ kind: "review" as const, words: facts.marks.find((mark) => mark.kind === "review")?.words ?? overdueWords(0, facts.today), press: { opening: `Review ${facts.topic.title}` } }]
			: [];
	const listed = [...waiting.map((entry) => entry.chat), ...facts.sessions.filter((entry) => entry.chat.id === now.chat).map((entry) => entry.chat)];
	const taken = new Set([...(facts.action.kind === "continue" && facts.action.task ? [facts.action.task.key] : []), ...listed.flatMap((chat) => chat.tasks ?? [])]);
	const tasks = facts.pickups.flatMap((pickup): NextItem[] =>
		pickup.kind === "task" && !taken.has(pickup.task.key) ? [{ kind: "task", key: pickup.task.key, title: pickup.title, step: pickup.task.step, press: pickup.press }] : [],
	);
	return [...waiting.map((entry): NextItem => ({ kind: "session", entry })), ...review, ...tasks];
}

/** A lesson he began that has not introduced the topic yet, which the
 *  plan goes on with (the engine's `starts_why` "begun"): the page still
 *  says why the topic comes now, as for one not started (round 13, 1 n6:
 *  the begun Poisson page was Now and Earlier only). */
export function lessonBegun(facts: TopicFacts): boolean {
	return facts.topic.level === "new" && facts.topic.startsWhy?.kind === "begun";
}

/** The page's history sorted by what he does with it. */
export function pickupSections(facts: TopicFacts): PickupSections {
	const now = nowItem(facts);
	const next = nextItems(facts, now);
	const held = new Set([now.chat, ...next.flatMap((item) => (item.kind === "session" ? [item.entry.chat.id] : []))]);
	const review = facts.topic.review;
	const begun = lessonBegun(facts);
	const scheduled: PickupSections["scheduled"] =
		review?.kind === "scheduled"
			? { kind: "review", day: dayOf(review.date), waits: facts.waits }
			: facts.starts && now.kind !== "start"
				? { kind: begun ? "lesson" : "start", day: dayOf(facts.starts.day), waits: facts.starts.waits, why: facts.startsWhy }
				: begun && facts.topic.starts && facts.topic.starts <= facts.today
					? { kind: "lesson", day: dayWords(facts.topic.starts, facts.today), waits: null, why: facts.startsWhy }
					: null;
	return {
		now,
		next,
		scheduled,
		review: scheduled?.kind === "lesson" && facts.firstReview ? { day: dayOf(facts.firstReview) } : null,
		earlier: trailDays(earlierSessions(facts.sessions, held, facts.attempts), facts.attempts, facts.today),
		why: now.kind === "start" || begun ? { builds: facts.builds, refs: facts.refs } : null,
	};
}
