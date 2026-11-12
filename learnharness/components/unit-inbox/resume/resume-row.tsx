"use client";

import { ChevronDownIcon, DumbbellIcon, MessageSquareIcon, PlusIcon } from "lucide-react";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { NavRow, NavRowLabel, NavRowTrailing } from "@/components/nav/nav-row";
import { sessionState } from "@/components/nav/session-state";
import { shortTimeAgo } from "@/components/sidebar-next";
import { STUDY_WORDS, useStartUnit } from "@/components/unit-inbox/start-unit";
import { UnitStatusText } from "@/components/unit-inbox/unit-status";
import { resumeTarget, sessionCount, unitStatus, type Unit } from "@/components/unit-inbox/units";
import type { UnitCandidate, UnitRowProps } from "@/components/unit-inbox/unit-sidebar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const opensLatest = (unit: Unit, pathname: string) => unit.sessions.some((c) => pathname === `/chat/${c.id}`);

/** The row's second line: the session a click opens, by its title, or
 *  as a lesson or a practice when its title is the topic's; with every
 *  course listed, the course leads. Null when there is no session yet.
 *  Pure. */
export function resumeLine(unit: Unit, scoped: boolean): string | null {
	const target = resumeTarget(unit);
	if (!target) return null;
	const what = target.title !== unit.topic.title ? target.title : target.kind === "practice" ? "Practice" : "Lesson";
	return scoped ? what : `${unit.course.title} · ${what}`;
}

/** Every session of the unit, newest first, and Study this. */
function SessionsMenu({ unit, s, onStudy }: Pick<UnitRowProps, "unit" | "s"> & { onStudy: () => void }) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				data-testid="unit-sessions-menu"
				aria-label={`${unit.topic.title}: ${sessionCount(unit.sessions.length)}`}
				className="absolute right-1 top-1.5 flex h-6 items-center gap-0.5 rounded-md px-1.5 text-label tabular-nums text-muted-foreground opacity-0 outline-none transition-[opacity,colors] hover:bg-fill-hover hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/resume:opacity-100 data-[state=open]:opacity-100 motion-reduce:transition-none"
			>
				{unit.sessions.length}
				<ChevronDownIcon aria-hidden className="size-3" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-64">
				<DropdownMenuLabel>{sessionCount(unit.sessions.length)}</DropdownMenuLabel>
				{unit.sessions.map((c) => (
					<DropdownMenuItem key={c.id} data-testid="unit-menu-session" onSelect={() => s.openChat(c.id)}>
						{c.kind === "practice" ? <DumbbellIcon aria-label="Practice" /> : <MessageSquareIcon aria-label="Lesson" />}
						<span className="min-w-0 flex-1 truncate">{c.title}</span>
						<DropdownMenuShortcut>{sessionState(c) === "your-turn" ? "Your turn" : shortTimeAgo(c.updatedAt)}</DropdownMenuShortcut>
					</DropdownMenuItem>
				))}
				<DropdownMenuSeparator />
				<DropdownMenuItem data-testid="unit-menu-study" onSelect={onStudy}>
					<PlusIcon />
					{STUDY_WORDS}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/**
 * Resume (spec: resume.md): a unit is a way back in. On Learning and
 * Review the row has two lines, the title with its status and the session
 * a click resumes (one waiting on the learner first, else the newest); a
 * unit with no session starts one. The other sessions
 * and Study this sit one step away, in the count that shows on hover.
 * Known units are one line with their return.
 */
function ResumeRow({ unit, today, s, scoped }: UnitRowProps) {
	const { start, starting } = useStartUnit();
	const target = resumeTarget(unit);
	const open = (e: React.MouseEvent<HTMLButtonElement>) => {
		if (target) s.openChat(target.id);
		else start(unit);
		blurAfterPointerClick(e);
	};
	const active = opensLatest(unit, s.pathname);
	const status = <UnitStatusText status={unitStatus(unit, today)} />;
	if (unit.shelf === "known") {
		return (
			<NavRow inset active={active} data-testid="unit-row" onClick={open} disabled={starting !== null}>
				<NavRowLabel>{unit.topic.title}</NavRowLabel>
				<NavRowTrailing>{status}</NavRowTrailing>
			</NavRow>
		);
	}
	return (
		<div className="group/resume relative">
			<NavRow
				active={active}
				attention={unit.now === "your-turn"}
				data-testid="unit-row"
				disabled={starting !== null}
				onClick={open}
				className="h-auto flex-col items-stretch gap-0.5 py-1.5 pl-8"
			>
				<span className="flex min-w-0 items-center gap-2">
					<NavRowLabel className={cn(unit.now !== "your-turn" && "text-foreground/90")}>{unit.topic.title}</NavRowLabel>
					<NavRowTrailing className={cn("h-5", unit.sessions.length > 0 && "group-hover/resume:opacity-0 group-has-[[data-state=open]]/resume:opacity-0")}>
						{status}
					</NavRowTrailing>
				</span>
				<span data-slot="unit-resume" className="truncate text-label font-normal text-muted-foreground">
					{resumeLine(unit, scoped) ?? (
						<>
							{!scoped && `${unit.course.title} · `}
							<span className="text-link">{STUDY_WORDS}</span>
						</>
					)}
				</span>
			</NavRow>
			{unit.sessions.length > 0 && <SessionsMenu unit={unit} s={s} onStudy={() => start(unit)} />}
		</div>
	);
}

export const resume: UnitCandidate = { Row: ResumeRow, isActive: opensLatest };
