"use client";

import { AlarmClockIcon, HistoryIcon, MessageCircleQuestionIcon } from "lucide-react";
import { BrailleSpinner } from "@/components/braille-spinner";
import { shortTimeAgo } from "@/components/sidebar-next";
import { returnWords, type UnitStatus } from "@/components/unit-inbox/units";

/** A topic row's status (units.ts unitStatus), T3 Code's status label: a
 *  12px icon and word for what needs the learner ("Your turn" in the
 *  accent, "Review"), the spinner while the tutor writes, a known topic's
 *  return by the alarm clock, or how long ago it was studied. */
export function UnitStatusText({ status }: { status: UnitStatus }) {
	switch (status.kind) {
		case "your-turn":
			return (
				<span data-slot="unit-status" className="inline-flex items-center gap-1 font-medium text-link">
					<MessageCircleQuestionIcon aria-hidden className="size-3" />
					<span className="sr-only">, </span>Your turn
				</span>
			);
		case "working":
			return (
				<span data-slot="unit-status" className="inline-flex items-center gap-1">
					<BrailleSpinner />
					<span className="sr-only">, </span>Working
				</span>
			);
		case "review":
			return (
				<span data-slot="unit-status" className="inline-flex items-center gap-1 font-medium text-foreground/80">
					<HistoryIcon aria-hidden className="size-3" />
					<span className="sr-only">, </span>Review
				</span>
			);
		case "returns":
			return (
				<span data-slot="unit-status" className="inline-flex items-center gap-1">
					<AlarmClockIcon aria-hidden className="size-3" />
					<span className="sr-only">, back </span>
					{returnWords(status.days)}
				</span>
			);
		case "studied":
			return (
				<time data-slot="unit-status" dateTime={status.at}>
					{shortTimeAgo(status.at)}
				</time>
			);
		case "none":
			return null;
	}
}
