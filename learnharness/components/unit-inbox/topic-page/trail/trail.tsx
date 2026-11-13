"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckIcon, ChevronRightIcon, CircleDotIcon, CircleXIcon, DumbbellIcon, MessageSquareIcon } from "lucide-react";
import type { TopicAttempt } from "@/src/core";
import { cn } from "@/lib/utils";
import { PlanMap } from "@/components/lesson/plan-map";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ONE_LINE_ROW } from "@/components/unit-inbox/topic-page/row-classes";
import { attemptMark, type SessionEntry } from "@/components/unit-inbox/topic-page/topic-facts";
import { lessonSteps, type TrailDay } from "@/components/unit-inbox/topic-page/trail/trail-facts";
import { WhyMark } from "@/components/unit-inbox/topic-page/why-mark";

/** The days shown before the rest fold under "Earlier". */
export const SHOWN_DAYS = 5;

const ICON = "size-4 text-muted-foreground";

/* The spine: a 1px line in the map's edge ink down the middle of the 16px
 * icon column, broken 4px above and below each icon on it. Every entry
 * draws its own piece, so a row's hover fill never hides the line. */
const SPINE = "before:absolute before:w-px before:bg-white/33 after:absolute after:w-px after:bg-white/33";
const ABOVE = "before:left-[7.5px] before:top-0 before:h-2";
const BELOW = "after:left-[7.5px] after:top-8 after:bottom-0";
const THROUGH = "before:absolute before:inset-y-0 before:left-[7.5px] before:w-px before:bg-white/33";

/** Where an entry sits on the line: the first has no line above its icon,
 *  the last none below. */
interface Ends {
	above: boolean;
	below: boolean;
}

const spine = ({ above, below }: Ends) => cn("relative", (above || below) && SPINE, above ? ABOVE : "before:hidden", below ? BELOW : "after:hidden");

const RESULT = {
	right: { Icon: CheckIcon, words: "Right" },
	partly: { Icon: CircleDotIcon, words: "Partly right" },
	missed: { Icon: CircleXIcon, words: "Missed" },
} as const;

/** One scored attempt: how it went, the tutor's sentence, and the one
 *  thing worth saying about it. Not a control. */
function AttemptEntry({ attempt, titleOf, ends }: { attempt: TopicAttempt; titleOf: (handle: string) => string; ends: Ends }) {
	const mark = attemptMark(attempt, titleOf);
	const { Icon, words } = RESULT[mark.result];
	return (
		<li
			data-slot="topic-attempt"
			data-result={mark.result}
			className={cn("grid min-h-10 grid-cols-[1rem_minmax(0,1fr)_auto] items-start gap-x-4 py-2.75", spine(ends))}
		>
			<Icon role="img" aria-label={words} className={cn(ICON, "mt-px")} />
			<p className="line-clamp-2 text-row text-muted-foreground">{attempt.text}</p>
			{mark.words ? <span className="mt-px justify-self-end text-label text-muted-foreground">{mark.words}</span> : <span />}
		</li>
	);
}

/** One session: a link to it, its title, and whether it waits on him or
 *  the tutor is writing. A lesson that planned carries a chevron that
 *  shows its steps under it, as the lesson's own Plan list. */
function SessionEntryItem({ entry, opensAtFirst, ends }: { entry: SessionEntry; opensAtFirst: boolean; ends: Ends }) {
	const [open, setOpen] = useState(opensAtFirst);
	const { chat, state, plan } = entry;
	const why = state === "your-turn" ? <WhyMark kind="reply" words="Your turn" /> : state === "working" ? <WhyMark kind="writing" words="The tutor is writing" /> : null;
	const row = (
		<Button
			variant="quiet"
			asChild
			data-testid="unit-page-session"
			className="col-span-full row-start-1 -mx-3 grid h-10 grid-cols-subgrid items-center gap-x-4 rounded-lg px-3 text-left font-normal whitespace-normal"
		>
			<Link href={`/chat/${chat.id}`}>
				{chat.kind === "practice" ? <DumbbellIcon aria-label="Practice" className={ICON} /> : <MessageSquareIcon aria-label="Lesson" className={ICON} />}
				<span className="truncate text-row text-foreground">{chat.title}</span>
				{(plan || why) && (
					<span className="flex items-center gap-2 justify-self-end">
						{plan && <span aria-hidden className="size-6" />}
						{why}
					</span>
				)}
			</Link>
		</Button>
	);
	const item = "grid grid-cols-[1rem_minmax(0,1fr)_auto] gap-x-4";
	if (!plan) return <li className={cn(item, spine(ends))}>{row}</li>;
	return (
		<Collapsible asChild open={open} onOpenChange={setOpen}>
			<li className={cn(item, spine(ends))}>
				{row}
				<CollapsibleTrigger asChild>
					<Button
						variant="quiet"
						size="icon-inline"
						data-slot="topic-steps-toggle"
						aria-label={open ? "Hide this lesson's steps" : "Show this lesson's steps"}
						className="group/steps relative z-10 col-start-3 row-start-1 self-center justify-self-start"
					>
						<ChevronRightIcon aria-hidden className="transition-transform duration-150 group-data-[state=open]/steps:rotate-90 motion-reduce:transition-none" />
					</Button>
				</CollapsibleTrigger>
				<CollapsibleContent className="col-span-full row-start-2 pl-8">
					<PlanMap steps={lessonSteps(plan)} currentWord={state === "paused" || state === "finished" ? "Left off here" : "Now"} />
				</CollapsibleContent>
			</li>
		</Collapsible>
	);
}

/** A day: its words over its sessions, then its attempts. */
function DayItem({ day, opensAtFirst, titleOf, first, last }: { day: TrailDay; opensAtFirst: string | null; titleOf: (handle: string) => string; first: boolean; last: boolean }) {
	const count = day.sessions.length + day.attempts.length;
	const ends = (i: number): Ends => ({ above: !(first && i === 0), below: !(last && i === count - 1) });
	return (
		<li>
			<h2 className={cn("relative flex h-7 items-center pl-8 text-label font-medium text-muted-foreground", !first && THROUGH)}>{day.label}</h2>
			<ul className="flex flex-col">
				{day.sessions.map((entry, i) => (
					<SessionEntryItem key={entry.chat.id} entry={entry} opensAtFirst={entry.chat.id === opensAtFirst} ends={ends(i)} />
				))}
				{day.attempts.map((attempt, i) => (
					<AttemptEntry key={attempt.id} attempt={attempt} titleOf={titleOf} ends={ends(day.sessions.length + i)} />
				))}
			</ul>
		</li>
	);
}

/**
 * The topic's line from now back (spec: trail.md): one day under another,
 * each with its sessions and the engine's scored attempts, on a spine
 * through their icons. Past five days, one more row, "Earlier", unfolds
 * the rest. Nothing when the topic has neither.
 */
export function Trail({ days, opensAtFirst, titleOf }: { days: readonly TrailDay[]; opensAtFirst: string | null; titleOf: (handle: string) => string }) {
	const [earlier, setEarlier] = useState(false);
	if (days.length === 0) return null;
	const shown = days.slice(0, SHOWN_DAYS);
	const rest = days.slice(SHOWN_DAYS);
	return (
		<ol data-slot="topic-trail" aria-label="History" className="flex flex-col">
			{shown.map((day, i) => (
				<DayItem key={day.day} day={day} opensAtFirst={opensAtFirst} titleOf={titleOf} first={i === 0} last={rest.length === 0 && i === shown.length - 1} />
			))}
			{rest.length > 0 && (
				<li>
					<Collapsible open={earlier} onOpenChange={setEarlier}>
						<CollapsibleTrigger asChild>
							<Button
								variant="quiet"
								data-slot="topic-earlier"
								className={cn(
									"group/earlier relative before:absolute before:top-0 before:left-[19.5px] before:h-2 before:w-px before:bg-white/33",
									earlier && "after:absolute after:top-8 after:bottom-0 after:left-[19.5px] after:w-px after:bg-white/33",
									ONE_LINE_ROW,
								)}
							>
								<ChevronRightIcon aria-hidden className={cn(ICON, "transition-transform duration-150 group-data-[state=open]/earlier:rotate-90 motion-reduce:transition-none")} />
								<span className="truncate text-row">Earlier</span>
								<span />
							</Button>
						</CollapsibleTrigger>
						<CollapsibleContent asChild>
							<ol className="flex flex-col">
								{rest.map((day, i) => (
									<DayItem key={day.day} day={day} opensAtFirst={opensAtFirst} titleOf={titleOf} first={false} last={i === rest.length - 1} />
								))}
							</ol>
						</CollapsibleContent>
					</Collapsible>
				</li>
			)}
		</ol>
	);
}
