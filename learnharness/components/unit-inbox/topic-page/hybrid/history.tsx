"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckIcon, CircleDotIcon, CircleXIcon, DumbbellIcon, MessageSquareIcon, WaypointsIcon } from "lucide-react";
import type { TopicAttempt } from "@/src/core";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { ScrollArea } from "@/components/ui/scroll-area";
import { attemptMark, type SessionEntry } from "@/components/unit-inbox/topic-page/topic-facts";
import { isPlanned } from "@/components/unit-inbox/topic-page/hybrid/hybrid-facts";
import { WhyMark } from "@/components/unit-inbox/topic-page/why-mark";
import { LineText } from "@/components/line-text";

const ICON = "size-4 text-muted-foreground";

/** How far an edge fades when more of the history lies past it. */
const EDGE = 32;

/** The history's edges fade into the page only where more of it lies
 *  past them, so at rest its first day is never dimmed. */
function edgeFade(top: boolean, bottom: boolean): React.CSSProperties | undefined {
	if (!top && !bottom) return undefined;
	const mask = `linear-gradient(to bottom, ${top ? "transparent" : "#000"}, #000 ${EDGE}px, #000 calc(100% - ${EDGE}px), ${bottom ? "transparent" : "#000"})`;
	return { maskImage: mask, WebkitMaskImage: mask };
}

/* The spine: a 1px line in the map's edge ink down the middle of the 16px
 * icon column, broken 4px above and below each icon on it. Every entry
 * draws its own piece, so a row's fill never hides the line. */
const SPINE = "before:absolute before:w-px before:bg-white/33 after:absolute after:w-px after:bg-white/33";
const ABOVE = "before:left-[7.5px] before:top-0 before:h-2";
const BELOW = "after:left-[7.5px] after:top-8 after:bottom-0";

/** Where an entry sits on the line: the first has no line above its icon, the last none below. */
export interface Ends {
	above: boolean;
	below: boolean;
}

/** The trailing date column a dated row adds (Pick up's Earlier): the
 *  day on its first row, empty on the rest, so the days line up. */
const DATED = "grid-cols-[1rem_minmax(0,1fr)_auto_4.5rem]";

/** The day in the date column, or its room. */
function DateCell({ date, className }: { date: string | null; className?: string }) {
	return date ? (
		<span data-slot="topic-history-date" className={cn("col-start-4 justify-self-end text-label text-muted-foreground tabular-nums", className)}>
			{date}
		</span>
	) : null;
}

const spine = ({ above, below }: Ends) => cn("relative", (above || below) && SPINE, above ? ABOVE : "before:hidden", below ? BELOW : "after:hidden");

const RESULT = {
	right: { Icon: CheckIcon, words: "Right" },
	partly: { Icon: CircleDotIcon, words: "Partly right" },
	missed: { Icon: CircleXIcon, words: "Missed" },
} as const;

/** One scored attempt: how it went and the tutor's sentence. Not a
 *  control. The icon sits on the first line, and the sentence and the
 *  date share its baseline. Given `date`, it carries the date column. */
export function AttemptEntry({ attempt, titleOf, ends, date }: { attempt: TopicAttempt; titleOf: (handle: string) => string; ends: Ends; date?: string | null }) {
	const { result } = attemptMark(attempt, titleOf);
	const { Icon, words } = RESULT[result];
	return (
		<li data-slot="topic-attempt" data-result={result} className={cn("grid min-h-10 items-baseline gap-x-4 py-2.75", date === undefined ? "grid-cols-[1rem_minmax(0,1fr)]" : DATED, spine(ends))}>
			<Icon role="img" aria-label={words} className={cn(ICON, "mt-px self-start")} />
			<p className={cn("line-clamp-2 text-row text-muted-foreground", date !== undefined && "col-span-2")}>
				<LineText>{attempt.text}</LineText>
			</p>
			{date !== undefined && <DateCell date={date} />}
		</li>
	);
}

/** One session: a link to it, its title, and whether it waits on him or
 *  the tutor is writing. A lesson that planned carries the button that
 *  puts its steps on the map; the lesson on the map has its row filled.
 *  Given `date`, it carries the date column; `writing` is what it says
 *  while the tutor writes. */
export function SessionItem({
	entry,
	shown,
	onShow,
	ends,
	date,
	writing = "The tutor is writing",
}: {
	entry: SessionEntry;
	shown: boolean;
	onShow: (id: string) => void;
	ends: Ends;
	date?: string | null;
	writing?: string;
}) {
	const { chat, state } = entry;
	const planned = isPlanned(entry);
	const why = state === "your-turn" ? <WhyMark kind="reply" words="Your turn" /> : state === "working" ? <WhyMark kind="writing" words={writing} /> : null;
	return (
		<li data-slot="topic-history-session" data-shown={shown || undefined} className={cn("grid gap-x-4", date === undefined ? "grid-cols-[1rem_minmax(0,1fr)_auto]" : DATED, spine(ends))}>
			<Button
				variant="quiet"
				asChild
				data-testid="unit-page-session"
				className={cn(
					"col-span-full row-start-1 -mx-3 grid h-10 grid-cols-subgrid items-center gap-x-4 rounded-lg px-3 text-left font-normal whitespace-normal",
					shown && "bg-fill-selected hover:bg-fill-selected",
					// Linked columns: ringed while the tie's step on the map is pointed at.
					"in-data-[lit]:in-data-shown:ring-1 in-data-[lit]:in-data-shown:ring-ring/60 in-data-[lit]:in-data-shown:ring-inset",
				)}
			>
				<Link href={`/chat/${chat.id}`}>
					{chat.kind === "practice" ? <DumbbellIcon aria-label="Practice" className={ICON} /> : <MessageSquareIcon aria-label="Lesson" className={ICON} />}
					<span className="truncate text-row text-foreground">
						<LineText>{chat.title}</LineText>
					</span>
					{(planned || why) && (
						<span className="flex items-center gap-2 justify-self-end">
							{why}
							{planned && <span aria-hidden className="size-6" />}
						</span>
					)}
					{date !== undefined && <DateCell date={date} />}
				</Link>
			</Button>
			{planned && (
				<Hint label={shown ? "Its steps are on the map" : "Show its steps on the map"} side="left">
					<Button
						variant="quiet"
						size="icon-inline"
						data-slot="topic-map-toggle"
						aria-label="Show its steps on the map"
						aria-pressed={shown}
						onClick={() => onShow(chat.id)}
						className={cn("relative z-10 col-start-3 row-start-1 self-center justify-self-end", shown && "text-foreground")}
					>
						<WaypointsIcon aria-hidden />
					</Button>
				</Hint>
			)}
		</li>
	);
}

/**
 * The history's bounded pane (spec: hybrid.md): it scrolls inside with no
 * bar and fades the edge more of it lies past. It reaches 12px past the
 * column on each side and its content pads them back, so a row's bleed
 * keeps its rounded fill inside the clip.
 */
export function HistoryPane({ className, children }: { className?: string; children: React.ReactNode }) {
	const viewport = useRef<HTMLDivElement>(null);
	const [edges, setEdges] = useState({ top: false, bottom: false });
	const measure = useCallback(() => {
		const el = viewport.current;
		if (!el) return;
		const top = el.scrollTop > 0;
		const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
		setEdges((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
	}, []);
	useLayoutEffect(() => {
		const el = viewport.current;
		if (!el) return;
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(el);
		if (el.firstElementChild) observer.observe(el.firstElementChild);
		el.addEventListener("scroll", measure, { passive: true });
		return () => {
			observer.disconnect();
			el.removeEventListener("scroll", measure);
		};
	}, [measure]);
	return (
		<ScrollArea bar={false} viewportRef={viewport} viewportClassName="min-h-0" data-slot="topic-history" className={cn("-mx-3 flex min-h-0 flex-col", className)} style={edgeFade(edges.top, edges.bottom)}>
			<div className="flex flex-col px-3">{children}</div>
		</ScrollArea>
	);
}
