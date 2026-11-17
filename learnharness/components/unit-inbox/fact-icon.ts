import { ArrowRightIcon, BookmarkIcon, CalendarClockIcon, CornerDownRightIcon, DumbbellIcon, FastForwardIcon, GraduationCapIcon, HistoryIcon, MapPinIcon, MessageCircleQuestionIcon, MessageSquareIcon, PauseIcon, type LucideIcon } from "lucide-react";
import type { StartsWhy } from "@/src/core";
import type { Standing } from "@/components/course-map/topic-map/topic-standing";
import type { Why } from "@/components/study-home/agenda-rows/row-facts";
import { SLIP_ICON } from "@/components/slip-icons";
import type { SlipKey } from "@/components/study-words";

/** The one icon each kind of fact wears wherever it shows: Home's rows,
 *  the sidebar, the course page, the map's cards, the topic page and the
 *  calendar (spec: status-mark.md). A new topic is the arrow, an open task
 *  the bookmark, and a topic coming back a calendar, since the review's
 *  History means it is due. */
export const FACT_ICON = {
	"your-turn": MessageCircleQuestionIcon,
	stopped: PauseIcon,
	review: HistoryIcon,
	task: BookmarkIcon,
	next: ArrowRightIcon,
	after: CornerDownRightIcon,
	early: FastForwardIcon,
	back: CalendarClockIcon,
	here: MapPinIcon,
	exam: GraduationCapIcon,
	lesson: MessageSquareIcon,
	practice: DumbbellIcon,
} satisfies Record<string, LucideIcon>;

/**
 * One fact as a mark draws it. Most kinds wear their icon (`FACT_ICON`);
 * a slip wears its own (`SLIP_ICON`); the tutor writing is the braille
 * spinner; where he stands is the topic's pie (a dashed ring while there
 * is none); when he last studied it, and a topic not started, have words
 * alone.
 */
export type Fact =
	| { kind: keyof typeof FACT_ICON }
	| { kind: "slip"; slip: SlipKey }
	| { kind: "working" }
	| { kind: "standing"; standing: Standing | null }
	| { kind: "studied" | "unstarted" };

export type FactKind = Fact["kind"];

/** A fact's ink: a turn that waits on him in the accent, an exam in full
 *  ink, every other fact muted. */
export function factInk(kind: FactKind): string {
	return kind === "your-turn" ? "text-link" : kind === "exam" ? "text-foreground" : "text-muted-foreground";
}

/** A fact's icon; null for one drawn without a lucide icon (the spinner,
 *  the pie, words alone). */
export function factIcon(fact: Fact): LucideIcon | null {
	if (fact.kind === "slip") return SLIP_ICON[fact.slip];
	return fact.kind in FACT_ICON ? FACT_ICON[fact.kind as keyof typeof FACT_ICON] : null;
}

/** Why the plan starts a new topic as the fact it states: a lesson he
 *  began is the open task's bookmark, next in its arc the new topic's
 *  arrow. */
export function startsFact(kind: StartsWhy["kind"]): Fact {
	return { kind: kind === "begun" ? "task" : kind };
}

/** Today's reason as the fact it states: a turn that waits is Your turn,
 *  a miss the lapse's slip. */
export function whyFact(kind: Why["kind"]): { kind: "your-turn" | "working" | "stopped" | "review" | "task" | "next" } | { kind: "slip"; slip: "lapsed" } {
	if (kind === "missed") return { kind: "slip", slip: "lapsed" };
	return { kind: kind === "reply" ? "your-turn" : kind };
}

/** Today's reason as a mark says it: `words` (by default a new topic's
 *  reason, else the reason's own short words), led by why the topic starts
 *  when those are the words said. */
export function reasonMark(why: Why, words: string = why.starts?.words ?? why.short): { fact: Fact; words: string } {
	return { fact: why.starts && words === why.starts.words ? startsFact(why.starts.kind) : whyFact(why.kind), words };
}
