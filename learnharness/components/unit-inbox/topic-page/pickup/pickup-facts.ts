import { shelfOf } from "@/components/unit-inbox/units";
import { isPlanned, nextSteps, type PlannedEntry } from "@/components/unit-inbox/topic-page/hybrid/hybrid-facts";
import { resumeLine, type ResumeIcon } from "@/components/unit-inbox/topic-page/resume/resume-facts";
import { lessonWords } from "@/components/unit-inbox/topic-page/steps/steps-facts";
import { nextReviewWords, type Press, type SessionEntry, type TopicAction, type TopicFacts } from "@/components/unit-inbox/topic-page/topic-facts";
import { trailDays, type TrailDay } from "@/components/unit-inbox/topic-page/trail/trail-facts";

/**
 * What the Pick up options draw (spec: pickup.md), pure, from the shared
 * facts: the topic's sessions sorted by what he does with them. Now is the
 * page's one action (`topicAction`, all seven rows); Next is every other
 * place that waits on him; Scheduled is the engine's dated review; Earlier
 * is the rest of the history, by day.
 */

/** A step of a lesson's plan, and which lesson it is in when that is not
 *  the one Now opens. */
export interface NowStep {
	/** "Stopped on", "Yesterday's lesson stopped on". */
	lead: string;
	title: string;
}

/** The one thing to pick up now, whichever row of the action table holds. */
export interface NowItem {
	kind: TopicAction["kind"];
	icon: ResumeIcon;
	/** What waits, in a few words: "Your turn in today's lesson". */
	words: string;
	/** The press, the head button's word: "Resume", "Start". */
	press: string;
	/** The session the press opens, which the map can show; null when the press starts one. */
	chat: string | null;
	/** That session's title. */
	title: string | null;
	/** The step a lesson stopped on, when its tutor planned. */
	step: NowStep | null;
	/** Where it stands when no step is known: "Problem waiting", a task's "Part (c)". */
	detail: string | null;
	/** The step right after the one it stopped on. */
	then: string | null;
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
	/** "Next review Fri 13 Nov"; null when the engine dated none ahead. */
	scheduled: string | null;
	/** The sessions neither Now nor Next hold, and every scored attempt, by day. */
	earlier: TrailDay[];
}

/** The step a lesson stopped on, and the first step after it in plan order. */
function planSteps(entry: PlannedEntry): { step: string | null; then: string | null } {
	const { nodes } = entry.plan.tree;
	const after = nextSteps(entry.plan);
	return {
		step: nodes.find((node) => node.id === entry.plan.current)?.title ?? null,
		then: nodes.find((node) => after.has(node.id))?.title ?? null,
	};
}

/** Now, from the page's action: the resume line's words, plus the lesson's
 *  title and its steps when it opens one. A topic still being learned with
 *  no task names where its newest lesson that planned stopped, which the
 *  new session continues from. */
export function nowItem(facts: TopicFacts): NowItem {
	const line = resumeLine(facts);
	const { action } = facts;
	// Study's own words would repeat Scheduled's date; a topic still being
	// learned would repeat the head's standing, which is no action.
	const words = line.kind === "study" ? "Nothing due" : action.kind === "continue" && !action.task ? "Keep learning" : line.words;
	const base = { kind: line.kind, icon: line.icon, words, press: line.press, chat: null, title: null, step: null, detail: line.detail, then: null };
	if ("chat" in action) {
		const entry = facts.sessions.find((e) => e.chat.id === action.chat.id);
		const steps = entry && isPlanned(entry) ? planSteps(entry) : { step: null, then: null };
		return { ...base, chat: action.chat.id, title: action.chat.title, step: steps.step ? { lead: "Stopped on", title: steps.step } : null, detail: steps.step ? null : line.detail, then: steps.then };
	}
	if (action.kind === "continue" && !action.task) {
		const last = facts.sessions.find(isPlanned);
		const steps = last ? planSteps(last) : null;
		if (last && steps?.step) {
			const name = lessonWords(last.day, facts.today, last.chat.kind === "practice" ? "practice" : "lesson");
			return { ...base, step: { lead: `${name} stopped on`, title: steps.step }, then: steps.then };
		}
	}
	return base;
}

/** Every place after Now, most pressing first: another session that waits
 *  on him, then one the tutor is writing in, a due review the action does
 *  not already start, then each open task the action does not continue. */
export function nextItems(facts: TopicFacts, now: NowItem): NextItem[] {
	const sessions = facts.sessions.filter((entry) => entry.chat.id !== now.chat && entry.state !== "finished");
	const waiting = [...sessions.filter((entry) => entry.state === "your-turn"), ...sessions.filter((entry) => entry.state === "working")];
	const review =
		facts.action.kind !== "review" && shelfOf(facts.topic, null) === "review"
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
		scheduled: review?.kind === "scheduled" ? nextReviewWords(review.date) : null,
		earlier: trailDays(
			facts.sessions.filter((entry) => !held.has(entry.chat.id)),
			facts.attempts,
			facts.today,
		),
	};
}
