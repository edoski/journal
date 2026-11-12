"use client";

import { useState } from "react";
import { ChevronRightIcon } from "lucide-react";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { NavRow, NavRowLabel, NavRowTrailing } from "@/components/nav/nav-row";
import { SessionItem } from "@/components/unit-inbox/session-item";
import { STUDY_WORDS, useStartUnit } from "@/components/unit-inbox/start-unit";
import { UnitStatusText } from "@/components/unit-inbox/unit-status";
import { unitStatus, type Unit } from "@/components/unit-inbox/units";
import type { UnitCandidate, UnitRowProps } from "@/components/unit-inbox/unit-sidebar";
import { cn } from "@/lib/utils";

const opensSession = (unit: Unit, pathname: string) => unit.sessions.some((c) => pathname === `/chat/${c.id}`);

/**
 * Outline (spec: outline.md): the sidebar is the course's outline. A unit
 * is one 32px row, its sessions folded under it like a project's threads:
 * a click opens or closes them in place, and the last item under them
 * starts a new session on the unit.
 */
function OutlineRow({ unit, today, s }: UnitRowProps) {
	const [open, setOpen] = useState(() => opensSession(unit, s.pathname));
	const { start, starting } = useStartUnit();
	return (
		<div data-slot="unit-outline" className="flex flex-col">
			<NavRow
				data-testid="unit-row"
				aria-expanded={open}
				attention={unit.now === "your-turn"}
				onClick={(e) => {
					setOpen(!open);
					blurAfterPointerClick(e);
				}}
			>
				<ChevronRightIcon
					aria-hidden
					className={cn("text-muted-foreground transition-transform duration-150 motion-reduce:transition-none", open && "rotate-90")}
				/>
				<NavRowLabel>{unit.topic.title}</NavRowLabel>
				<NavRowTrailing>
					<UnitStatusText status={unitStatus(unit, today)} />
				</NavRowTrailing>
			</NavRow>
			{open && (
				<div data-slot="unit-sessions" className="flex flex-col pl-4">
					{unit.sessions.map((c) => (
						<SessionItem key={c.id} chat={c} s={s} />
					))}
					<NavRow
						inset
						data-testid="unit-start"
						disabled={starting !== null}
						onClick={(e) => {
							start(unit);
							blurAfterPointerClick(e);
						}}
						className="text-link hover:text-link"
					>
						<NavRowLabel>{STUDY_WORDS}</NavRowLabel>
					</NavRow>
				</div>
			)}
		</div>
	);
}

export const outline: UnitCandidate = { Row: OutlineRow, isActive: opensSession };
