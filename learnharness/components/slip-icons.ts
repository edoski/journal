import { ArrowLeftRightIcon, CircleAlertIcon, CircleCheckIcon, CircleXIcon, TriangleAlertIcon, UserCheckIcon, type LucideIcon } from "lucide-react";
import type { SlipKey } from "@/components/study-words";

/**
 * One icon per slip, each meaning what its words say (round 3: "Fixed,
 * check again later" wore the same crossed circle as "Mistake to fix"):
 * a check for a mistake fixed on his own, the crossed circle Home's
 * "Missed …" wears for a miss after he had it, an alert for a mistake still
 * to fix, a person with a check for what is left to check on his own,
 * two arrows for a method mixed up with another, and a warning for a
 * wrong answer he was sure of. The map,
 * the sidebar, the course page and the topic page draw a slip with these.
 */
export const SLIP_ICON: Record<SlipKey, LucideIcon> = {
	repaired: CircleCheckIcon,
	lapsed: CircleXIcon,
	gap: CircleAlertIcon,
	check: UserCheckIcon,
	mixed: ArrowLeftRightIcon,
	confident: TriangleAlertIcon,
};
