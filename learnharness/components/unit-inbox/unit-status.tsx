"use client";

import { CalendarClockIcon, type LucideIcon } from "lucide-react";
import { BrailleSpinner } from "@/components/braille-spinner";
import { WHY_ICON } from "@/components/study-home/agenda-rows/why-mark";
import type { UnitStatus } from "@/components/unit-inbox/units";
import { cn } from "@/lib/utils";

/** Each fact's 12px icon, Home's reason icons where Home gives the same
 *  reason; a known topic's next review wears a calendar, since the
 *  calendar's alarm clock means overdue. How long ago has no icon, as on
 *  Home's rows. */
const ICON: Record<Exclude<UnitStatus["kind"], "working" | "studied" | "none">, LucideIcon> = {
	"your-turn": WHY_ICON.reply,
	slip: WHY_ICON.missed,
	review: WHY_ICON.review,
	task: WHY_ICON.task,
	returns: CalendarClockIcon,
};

/** A row's status (units.ts `unitStatus`), T3 Code's status label: a 12px
 *  icon and a few words. "Your turn" wears the accent at 500, the spinner
 *  shows while the tutor writes, and every other fact is muted at 400. */
export function UnitStatusText({ status }: { status: UnitStatus }) {
	switch (status.kind) {
		case "none":
			return null;
		case "working":
			return (
				<span data-slot="unit-status" data-kind="working" className="inline-flex items-center gap-1">
					<BrailleSpinner />
					<span className="sr-only">, </span>Working
				</span>
			);
		case "studied":
			return (
				<span data-slot="unit-status" data-kind="studied">
					<span className="sr-only">, studied </span>
					{status.words}
				</span>
			);
		default: {
			const Icon = ICON[status.kind];
			const words = status.kind === "your-turn" ? "Your turn" : status.words;
			return (
				<span
					data-slot="unit-status"
					data-kind={status.kind}
					className={cn("inline-flex min-w-0 items-center gap-1", status.kind === "your-turn" && "font-medium text-link")}
				>
					<Icon aria-hidden className="size-3 shrink-0" />
					<span className="sr-only">, </span>
					<span className="truncate">{words}</span>
				</span>
			);
		}
	}
}
