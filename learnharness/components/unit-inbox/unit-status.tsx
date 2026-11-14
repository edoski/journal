"use client";

import { CalendarClockIcon, type LucideIcon } from "lucide-react";
import { BrailleSpinner } from "@/components/braille-spinner";
import { WHY_ICON } from "@/components/study-home/agenda-rows/why-mark";
import { TUTOR_WRITING } from "@/components/study-words";
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
 *  shows while the tutor writes, and every other fact is muted at 400. The
 *  root is `contents`, so the icon and the words are the status slot's own
 *  items (`TRAILING_SLOT`). */
export function UnitStatusText({ status }: { status: UnitStatus }) {
	switch (status.kind) {
		case "none":
			return null;
		case "working":
			return (
				<span data-slot="unit-status" data-kind="working" className="contents">
					<span className="flex h-4 shrink-0 items-center">
						<BrailleSpinner label={TUTOR_WRITING} />
					</span>
					<span className="sr-only">, </span>
					<span className="whitespace-nowrap">{TUTOR_WRITING}</span>
				</span>
			);
		case "studied":
			return (
				<span data-slot="unit-status" data-kind="studied" className="contents">
					<span className="sr-only">, studied </span>
					<span className="whitespace-nowrap">{status.words}</span>
				</span>
			);
		default: {
			const Icon = ICON[status.kind];
			const words = status.kind === "your-turn" ? "Your turn" : status.words;
			return (
				<span
					data-slot="unit-status"
					data-kind={status.kind}
					className={cn("contents", status.kind === "your-turn" && "font-medium text-link")}
				>
					<span className="flex h-4 shrink-0 items-center">
						<Icon aria-hidden className="size-3" />
					</span>
					<span className="sr-only">, </span>
					<span className="whitespace-nowrap">{words}</span>
				</span>
			);
		}
	}
}
