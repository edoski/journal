import type { ChatListItem, CourseMapTopic, StudyCourse, TopicHandle } from "@/src/core";
import { slotWords } from "@/components/study-home/needs-you";
import { nowFor, plannedKeys, restTopics, shelfStatus } from "@/components/unit-inbox/now-inbox";
import { claimedKeys, todayTop, type NowItem } from "@/components/unit-inbox/today/today-top";
import { buildInbox, unitKey, type Unit, type UnitStatus } from "@/components/unit-inbox/units";
import type { Why } from "@/components/study-home/agenda-rows/row-facts";
import { lapsedNow, overdueWords, SLIP_WORDS, TUTOR_WRITING, type SlipKey } from "@/components/study-words";

/** The one fact a topic says, in the words the sidebar's row or Today's
 *  card says for it. `kind` picks its icon. */
export type TopicFact =
	/** A session on the topic waits on him: "Your turn". */
	| { kind: "your-turn"; words: string }
	/** The tutor is writing in a session on it: "Tutor writing". */
	| { kind: "working"; words: string }
	/** The tutor stopped mid-reply in a session on it. */
	| { kind: "stopped"; words: string }
	/** The engine calls it weak, and why: "Not right last time", "Sure, but
	 *  wrong"; `slip` picks its own icon (`SLIP_ICON`). */
	| { kind: "slip"; words: string; slip: SlipKey }
	/** Its review is due: "Due today", "3d overdue". */
	| { kind: "review"; words: string }
	/** An open task holds it, and when he left it: "Left off 3d ago". */
	| { kind: "task"; words: string }
	/** Today's plan starts it: "Planned today", "Next up". */
	| { kind: "next"; words: string }
	/** When its next review comes: "Back in 5d", "Due since 21 Oct". */
	| { kind: "back"; words: string }
	/** When he last studied it: "3d ago". */
	| { kind: "studied"; words: string }
	/** The course's current topic: "You are here". */
	| { kind: "here"; words: string };

/** Where a topic stands: on the sidebar's top (Home's Today), being
 *  learned (`restTopics`' working and learning), or on his own (its
 *  known), the course page's groups. */
export type SidebarPlace = "today" | "learning" | "known";

/** Where the sidebar lists one topic and the fact it says for it. */
export interface Said {
	place: SidebarPlace;
	fact: TopicFact | null;
}

const WHY_FACT: Record<Why["kind"], TopicFact["kind"]> = { reply: "your-turn", working: "working", stopped: "stopped", missed: "slip", review: "review", task: "task", next: "next" };

/** A topic Today takes up says Today's reason, as the sidebar's card for
 *  its line does (`slotWords`), except a review's: a line reviewing two
 *  topics gives its most overdue one's days or its lapse, so each topic
 *  says its own (round 5: Random variables read "2d overdue", Binomial's
 *  days, while due today). Pure. */
function todayFact(item: NowItem, topic: CourseMapTopic, today: string): TopicFact | null {
	const { why, status } = item.line;
	// The line's one status (`rowStatus`): a slip it says in place of a plain "Next up" (round 12, 1 m3).
	if (status?.kind === "standing" && status.facts.slip) return { kind: "slip", words: status.facts.slip.words, slip: status.facts.slip.key };
	if (why?.kind === "review" || why?.kind === "missed") {
		if (why.kind === "missed" && lapsedNow(topic.signals)) return { kind: "slip", words: SLIP_WORDS.lapsed, slip: "lapsed" };
		if (topic.review?.kind === "due") return { kind: "review", words: overdueWords(topic.review.overdue, today) };
	}
	const words = slotWords(why, topic);
	if (!why || !words) return null;
	return why.kind === "missed" ? { kind: "slip", words, slip: "lapsed" } : { kind: WHY_FACT[why.kind] as Exclude<TopicFact["kind"], "slip">, words };
}

/** A topic's fact off the top (`shelfStatus`) as a fact. Pure. */
function shelfFact(status: UnitStatus): TopicFact | null {
	switch (status.kind) {
		case "none":
			return null;
		case "your-turn":
			return { kind: "your-turn", words: "Your turn" };
		case "working":
			return { kind: "working", words: TUTOR_WRITING };
		case "returns":
			return { kind: "back", words: status.words };
		case "slip":
			return { kind: "slip", words: status.words, slip: status.slip };
		default:
			return { kind: status.kind, words: status.words };
	}
}

/**
 * What the sidebar says for each topic of one course, in the sidebar's
 * order: the topics Home's Today takes up (`todayTop` over every course,
 * each line's claimed topics) with Today's reason, then the topics being
 * learned, then those on his own (`restTopics`), each with its fact
 * (`shelfStatus`). A topic not started is absent. The one
 * source the course page's list and every map card read, so a topic says
 * one thing wherever it shows. `courses` are every course, since Today
 * weighs them together; `chats` every session. Pure.
 */
export function sidebarSays(courses: readonly StudyCourse[], chats: readonly ChatListItem[], workspace: string): ReadonlyMap<TopicHandle, Said> {
	const course = courses.find((c) => c.map.workspace === workspace);
	const said = new Map<TopicHandle, Said>();
	if (!course) return said;
	const { map } = course;
	const topics = new Map(map.topics.map((t) => [unitKey(map.workspace, t.handle), t]));
	const inbox = buildInbox(courses, chats, null);
	const today = new Map<string, NowItem>();
	for (const item of todayTop(nowFor(courses, chats, null, map.today), inbox, chats)) for (const key of claimedKeys(item)) if (!today.has(key)) today.set(key, item);
	for (const [key, item] of today) {
		const topic = topics.get(key);
		if (topic) said.set(topic.handle, { place: "today", fact: todayFact(item, topic, map.today) });
	}
	const rest = restTopics(inbox, new Set(today.keys()));
	const planned = plannedKeys(courses);
	const shelve = (units: readonly Unit[], place: SidebarPlace) => {
		for (const unit of units) if (topics.has(unit.key)) said.set(unit.topic.handle, { place, fact: shelfFact(shelfStatus(unit, map.today, planned)) });
	};
	shelve([...rest.working, ...rest.learning], "learning");
	shelve(rest.known, "known");
	return said;
}
