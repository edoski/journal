"use client";

import Link from "next/link";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { NavRow, NavRowLabel, NavRowTrailing } from "@/components/nav/nav-row";
import { UnitStatusText } from "@/components/unit-inbox/unit-status";
import { LEVEL_WORDS, sessionCount, unitStatus, type Unit } from "@/components/unit-inbox/units";
import type { UnitCandidate, UnitRowProps } from "@/components/unit-inbox/unit-sidebar";
import { unitHref } from "@/components/unit-inbox/page/unit-href";
import { cn } from "@/lib/utils";

const isOpen = (unit: Unit, pathname: string) => pathname === unitHref(unit.course.workspace, unit.topic.handle);

/** What a card's second line says: the course when every course is
 *  listed, then why the engine calls it weak, else its standing in words
 *  and how many sessions it holds. Pure. */
export function cardFacts(unit: Unit, scoped: boolean): string {
	const n = unit.sessions.length;
	const fact =
		unit.topic.weak && unit.topic.signals.gap
			? unit.topic.signals.gap
			: n > 0
				? `${LEVEL_WORDS[unit.topic.level]}, ${sessionCount(n)}`
				: LEVEL_WORDS[unit.topic.level];
	return scoped ? fact : `${unit.course.title} · ${fact}`;
}

/**
 * Page (spec: page.md): a unit is a place. On Learning and Review the row
 * is a card: the title with its one status over one line of facts; on
 * Known it is one line with its return. A click opens the unit's page, which lists its sessions and
 * starts the next.
 */
function PageRow({ unit, today, s, scoped }: UnitRowProps) {
	const status = <UnitStatusText status={unitStatus(unit, today)} />;
	const active = isOpen(unit, s.pathname);
	const href = unitHref(unit.course.workspace, unit.topic.handle);
	if (unit.shelf === "known") {
		return (
			<NavRow asChild inset active={active} data-testid="unit-row">
				<Link href={href} onClick={blurAfterPointerClick}>
					<NavRowLabel>{unit.topic.title}</NavRowLabel>
					<NavRowTrailing>{status}</NavRowTrailing>
				</Link>
			</NavRow>
		);
	}
	return (
		<NavRow
			asChild
			active={active}
			attention={unit.now === "your-turn"}
			data-testid="unit-row"
			className="h-auto flex-col items-stretch gap-0.5 py-2 pl-8"
		>
			<Link href={href} onClick={blurAfterPointerClick}>
				<span className="flex min-w-0 items-center gap-2">
					<NavRowLabel className={cn(unit.now !== "your-turn" && "text-foreground/90")}>{unit.topic.title}</NavRowLabel>
					<NavRowTrailing className="h-4">{status}</NavRowTrailing>
				</span>
				<span data-slot="unit-facts" className="truncate text-label font-normal text-muted-foreground">
					{cardFacts(unit, scoped)}
				</span>
			</Link>
		</NavRow>
	);
}

export const page: UnitCandidate = { Row: PageRow, isActive: isOpen };
