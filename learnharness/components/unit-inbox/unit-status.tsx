"use client";

import { BrailleSpinner } from "@/components/braille-spinner";
import { shortTimeAgo } from "@/components/sidebar-next";
import { returnWords, type UnitStatus } from "@/components/unit-inbox/units";

/** A unit's one trailing fact (units.ts unitStatus), in the row's trailing
 *  column: "Your turn" in the accent, the spinner, a known unit's return,
 *  or how long ago it was studied. */
export function UnitStatusText({ status }: { status: UnitStatus }) {
	switch (status.kind) {
		case "your-turn":
			return (
				<span data-slot="unit-status" className="font-medium text-link">
					<span className="sr-only">, </span>Your turn
				</span>
			);
		case "working":
			return (
				<span data-slot="unit-status">
					<BrailleSpinner />
					<span className="sr-only">Working</span>
				</span>
			);
		case "returns":
			return (
				<span data-slot="unit-status">
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
