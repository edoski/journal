"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckIcon, CircleDotIcon, CircleXIcon, DumbbellIcon, MessageSquareIcon } from "lucide-react";
import type { TopicAttempt } from "@/src/core";
import { cn } from "@/lib/utils";
import { GUTTER } from "@/components/unit-inbox/topic-page/row-classes";
import { ATTEMPT_WORDS } from "@/components/study-words";
import { Button } from "@/components/ui/button";
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
 * icon column, past the rows' gutter (`GUTTER`), broken 4px above and
 * below each icon on it. Every entry
 * draws its own piece, so a row's fill never hides the line. */
const SPINE = "before:absolute before:w-px before:bg-white/33 after:absolute after:w-px after:bg-white/33";
const ABOVE = "before:left-[25.5px] before:top-0 before:h-2";
const BELOW = "after:left-[25.5px] after:top-8 after:bottom-0";

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
		<span data-slot="topic-history-date" className={cn("col-start-4 justify-self-end text-callout system-current:text-label text-muted-foreground tabular-nums", className)}>
			{date}
		</span>
	) : null;
}

const spine = ({ above, below }: Ends) => cn("relative", (above || below) && SPINE, above ? ABOVE : "before:hidden", below ? BELOW : "after:hidden");

const RESULT = {
	right: { Icon: CheckIcon, words: ATTEMPT_WORDS.right },
	partly: { Icon: CircleDotIcon, words: ATTEMPT_WORDS.partly },
	wrong: { Icon: CircleXIcon, words: ATTEMPT_WORDS.wrong },
} as const;

/** One scored attempt: how it went and the tutor's sentence. Not a
 *  control. The icon sits on the first line, and the sentence and the
 *  date share its baseline. Given `date`, it carries the date column. */
export function AttemptEntry({ attempt, title, titleOf, ends, date }: { attempt: TopicAttempt; title?: string; titleOf: (handle: string) => string; ends: Ends; date?: string | null }) {
	const { result, words: how } = attemptMark(attempt, titleOf);
	const { Icon, words } = RESULT[result];
	return (
		<li data-slot="topic-attempt" data-result={result} className={cn("grid min-h-10 items-baseline gap-x-4 gap-y-0.5 py-2.75", GUTTER, date === undefined ? "grid-cols-[1rem_minmax(0,1fr)]" : DATED, spine(ends))}>
			<Icon role="img" aria-label={how ? `${words}, ${how}` : words} className={cn(ICON, "mt-px self-start")} />
			{/* Each formula is one box (round 13, 2 n1): one that does not fit
			    goes to the hidden line whole, never leaving its exponents
			    above the cut without their bases. */}
			<p data-slot="topic-attempt-text" className={cn("line-clamp-2 text-body system-current:text-row text-muted-foreground [&_.katex]:inline-block", date !== undefined && "col-span-2")}>
				<LineText>{title ?? attempt.text}</LineText>
			</p>
			{date !== undefined && <DateCell date={date} />}
			{how && (
				<span data-slot="topic-attempt-how" className={cn("col-start-2 text-callout system-current:text-label text-muted-foreground", date !== undefined && "col-span-2")}>
					<LineText>{how}</LineText>
				</span>
			)}
		</li>
	);
}

/** One session: a link to it, its title, and whether it waits on him or
 *  the tutor is writing. A lesson that planned puts its steps on the map
 *  when he points at it (pointer or focus), as Home's map follows the row
 *  he points at; the lesson on the map has its row filled. Round 10, 1 m8:
 *  the button that did it was a glyph with no words.
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
		<li data-slot="topic-history-session" data-shown={shown || undefined} data-on-map={planned ? "point" : undefined} className={cn("grid gap-x-4", GUTTER, date === undefined ? "grid-cols-[1rem_minmax(0,1fr)_auto]" : DATED, spine(ends))}>
			<Button
				variant="quiet"
				asChild
				data-testid="unit-page-session"
				className={cn(
					// Its fill reaches back over the row's gutter and 12px past the column, as every row's does (`BLEED`).
					"col-span-full row-start-1 -mr-3 -ml-[1.875rem] grid h-10 grid-cols-subgrid items-center gap-x-4 rounded-lg pr-3 pl-[1.875rem] text-left font-normal system-current:font-normal whitespace-normal has-[>svg]:pr-3 has-[>svg]:pl-[1.875rem]",
					shown && "bg-fill-selected hover:bg-fill-selected",
				)}
			>
				<Link href={`/chat/${chat.id}`} onPointerEnter={planned ? () => onShow(chat.id) : undefined} onFocus={planned ? () => onShow(chat.id) : undefined}>
					{chat.kind === "practice" ? <DumbbellIcon aria-label="Practice" className={ICON} /> : <MessageSquareIcon aria-label="Lesson" className={ICON} />}
					<span className="truncate text-body system-current:text-row text-foreground">
						<LineText>{chat.title}</LineText>
					</span>
					{why && <span className="flex items-center gap-2 justify-self-end">{why}</span>}
					{date !== undefined && <DateCell date={date} />}
				</Link>
			</Button>
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
		<div ref={viewport} data-slot="topic-history" className={cn("-mx-3 min-h-0 overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-ring", className)} style={edgeFade(edges.top, edges.bottom)}>
			<div className="flex flex-col px-3">{children}</div>
		</div>
	);
}
