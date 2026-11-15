import { CalendarClockIcon, MapPinIcon, type LucideIcon } from "lucide-react";
import { SLIP_ICON } from "@/components/slip-icons";
import { WHY_ICON } from "@/components/study-home/agenda-rows/why-mark";
import type { TopicFact } from "@/components/unit-inbox/sidebar-says";

/** The icon each kind of fact leads with, on the course page's rows and
 *  the map's cards: the one the sidebar's row and Today's card use for the
 *  same fact (`WHY_ICON`), a calendar for when a topic comes back, the
 *  map's pin for where he is. Working shows a spinner and when he last
 *  studied it no icon, as on the sidebar. */
export const FACT_ICON: Record<Exclude<TopicFact["kind"], "working" | "studied">, LucideIcon> = {
	"your-turn": WHY_ICON.reply,
	stopped: WHY_ICON.stopped,
	slip: WHY_ICON.missed,
	review: WHY_ICON.review,
	task: WHY_ICON.task,
	next: WHY_ICON.next,
	back: CalendarClockIcon,
	here: MapPinIcon,
};

/** A fact's icon: a slip wears its own (`SLIP_ICON`), so "Sure, but wrong"
 *  and "Fixed, check again later" never share the crossed circle of a
 *  miss; null for a fact drawn without one. */
export function factIcon(fact: TopicFact): LucideIcon | null {
	if (fact.kind === "working" || fact.kind === "studied") return null;
	return fact.kind === "slip" ? SLIP_ICON[fact.slip] : FACT_ICON[fact.kind];
}
