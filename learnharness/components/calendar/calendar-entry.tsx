"use client";

import Link from "next/link";
import { CircleDashedIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { CourseMark } from "@/components/unit-inbox/unit-row";
import { unitHref } from "@/components/unit-inbox/unit-href";
import type { Fact } from "@/components/unit-inbox/fact-icon";
import { FactIcon, StatusMark } from "@/components/unit-inbox/status-mark";
import { dayAndNearWords, distanceWords, finalReviewWords, longDayWords, lookOf, lookWords, LOOKS, roadLines, spanWords, type CalendarEntry, type EntryLook } from "@/components/calendar/calendar-facts";
import { FINAL_REVIEW_GAP_WORDS, pressWord } from "@/components/study-words";
import { planDay } from "@/components/study-home/study-facts";
import { MathText } from "@/components/ui/math-text";
import { LineText } from "@/components/line-text";
import { cn } from "@/lib/utils";
import { continueHref } from "@/components/nav/session-state";
import type { ChatListItem } from "@/src/core";

/** A look as the fact it marks, so it wears the icon every surface wears
 *  for it (`FactIcon`): an overdue review the review's History, muted
 *  (round 8: a red alarm here against the history arrow everywhere else),
 *  a new topic Today's arrow, an open task the bookmark. */
export function lookFact(look: EntryLook): Fact {
	return { kind: look === "overdue" ? "review" : look === "new" ? "next" : look };
}

/** What a press on an entry can start: a session whose first message is
 *  `opening`, in `workspace`, on `topics`, picking up the finished lesson
 *  `from`. */
export type StartSession = (opening: string, workspace: string, how: { topics: readonly string[]; from?: string }) => void;


function Mark({ entry }: { entry: CalendarEntry }) {
	return entry.course ? <CourseMark title={entry.course.title} /> : <CircleDashedIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />;
}

/** The entry's face. A week gives the title the column's width, on three
 *  lines at most (round 16, m25: "Review Random variables and
 *  distributions,…" lost its second topic with the column's room below), over its course mark and its look in an icon and a word
 *  (an exam also says how far off it is); a session that waits says Your
 *  turn in the word's place, its icon naming the look. A month keeps the mark and the look's icon beside the title,
 *  still on two lines at most, so the topic reads. */
function Face({ entry, today, compact }: { entry: CalendarEntry; today: string; compact: boolean }) {
	const look = lookOf(entry);
	const waits = entry.kind === "session" && entry.waits;
	if (compact) {
		return (
			<>
				<span className="flex h-4.5 shrink-0 items-center gap-1.5">
					<Mark entry={entry} />
					<FactIcon fact={lookFact(look)} label={LOOKS[look].words} className="size-3.5" />
				</span>
				<span data-slot="calendar-entry-title" className="line-clamp-2 min-w-0 flex-1 text-foreground">
					<LineText>{entry.title}</LineText>
				</span>
			</>
		);
	}
	return (
		<>
			<span data-slot="calendar-entry-title" className="line-clamp-3 min-w-0 text-foreground">
				<LineText>{entry.title}</LineText>
			</span>
			<span className="flex min-w-0 items-center gap-1.5 text-callout text-muted-foreground">
				<Mark entry={entry} />
				{waits ? (
					<>
						<FactIcon fact={lookFact(look)} label={LOOKS[look].words} className="size-3.5" />
						<StatusMark fact={{ kind: "your-turn" }} words="Your turn" whole className="shrink-0 gap-1" />
					</>
				) : (
					<StatusMark fact={lookFact(look)} words={entry.kind === "exam" ? examDayWords(entry.day, today) : lookWords(entry, today)} className="min-w-0" />
				)}
			</span>
		</>
	);
}

/** An exam in the month grid, the one entry that must stand out among a
 *  day's reviews: a tinted chip with its title in weight. */
const EXAM_CHIP = "bg-foreground/10 hover:bg-foreground/15";

/** Every panel the calendar opens, an entry's and a day's, is this wide:
 *  the exam's road reads in it, and one width keeps them one family
 *  (round 5: 318 against 286). */
export const PANEL_WIDTH = "w-80";

const FACE =
	"flex w-full min-w-0 rounded-md px-1.5 text-left text-body outline-none transition-colors hover:bg-fill-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring data-[state=open]:bg-fill-selected motion-reduce:transition-none";

/** One thing on one day (spec: calendar.md). A session opens its lesson;
 *  a review, an open task or an exam opens a popover with what it is and
 *  what to do. */
export function CalendarEntryView({
	entry,
	today,
	compact = false,
	busy = false,
	onStart,
}: {
	entry: CalendarEntry;
	today: string;
	compact?: boolean;
	busy?: boolean;
	onStart: StartSession;
}) {
	const look = lookOf(entry);
	const face = cn(FACE, compact ? "items-start gap-1.5 py-0.75" : "flex-col gap-0.5 py-1", compact && look === "exam" && EXAM_CHIP);
	if (entry.kind === "session") {
		return (
			<Link href={`/chat/${entry.chat.id}`} data-slot="calendar-entry" data-look={look} className={face} onClick={blurAfterPointerClick}>
				<Face entry={entry} today={today} compact={compact} />
			</Link>
		);
	}
	return (
		<Popover>
			<PopoverTrigger data-slot="calendar-entry" data-look={look} className={face}>
				<Face entry={entry} today={today} compact={compact} />
			</PopoverTrigger>
			<PopoverContent data-slot="calendar-entry-detail" align="start" collisionPadding={12} className="flex flex-col gap-3">
				<EntryDetail entry={entry} today={today} busy={busy} onStart={onStart} />
			</PopoverContent>
		</Popover>
	);
}

/** The exam on its own day's cell: "Exam", or "Exam, tomorrow" when it
 *  is that near; never a count of days (round 14, m9). */
function examDayWords(day: string, today: string): string {
	const near = distanceWords(day, today);
	return near ? `Exam, ${near.toLowerCase()}` : "Exam";
}

/** The popover's body: the course, the title, when and why in plain
 *  words, then the actions. */
function EntryDetail({ entry, today, busy, onStart }: { entry: Exclude<CalendarEntry, { kind: "session" }>; today: string; busy: boolean; onStart: StartSession }) {
	const look = lookOf(entry);
	const lines: string[] = [];
	if (entry.kind === "exam") {
		lines.push(dayAndNearWords(entry.day, longDayWords(entry.day), today));
		if (entry.nextSession) lines.push(entry.nextSession);
		if (entry.doesNotFit.length > 0 && entry.line) lines.push(entry.line);
		if (entry.allStarted) lines.push("Every topic started");
	} else if (entry.kind === "review") {
		if (entry.overdue) lines.push(`Was due ${longDayWords(entry.dueOn ?? entry.day)}`);
		else if (entry.day !== today) lines.push(`Planned for ${dayAndNearWords(entry.day, longDayWords(entry.day), today)}`);
		if (entry.since) lines.push(entry.since);
		if (entry.waits) lines.push(entry.waits);
	} else if (entry.kind === "new") {
		lines.push(entry.day === today ? "Planned for today" : `Planned for ${dayAndNearWords(entry.day, longDayWords(entry.day), today)}`);
		if (entry.waits) lines.push(entry.waits);
	} else if (entry.task?.step) {
		lines.push(`Left at: ${entry.task.step}`);
	}
	return (
		<>
			<div className="flex min-w-0 items-center gap-1.5 text-callout text-muted-foreground">
				<CourseMark title={entry.course.title} />
				<span className="truncate">{entry.course.title}</span>
			</div>
			<div className="flex flex-col gap-1">
				<p className="text-headline text-foreground">
					<LineText>{entry.title}</LineText>
				</p>
				<p className="flex">
					<StatusMark fact={lookFact(look)} words={lookWords(entry, today)} whole className="gap-1" />
				</p>
				{lines.map((line) => (
					<p key={line} className="text-callout text-muted-foreground">
						<MathText>{line}</MathText>
					</p>
				))}
			</div>
			{entry.kind === "exam" && <Road entry={entry} today={today} />}
			<EntryActions entry={entry} busy={busy} onStart={onStart} />
		</>
	);
}

/** The road to the exam as the engine planned it: each week's new topics,
 *  then the final review. Nothing when the plan gives neither. */
function Road({ entry, today }: { entry: Extract<CalendarEntry, { kind: "exam" }>; today: string }) {
	const finalReview = finalReviewWords(entry.finalReview, today);
	const unreviewed = entry.unreviewed.length > 0 ? [FINAL_REVIEW_GAP_WORDS] : [];
	if (entry.road.length === 0 && !finalReview) return null;
	return (
		<div data-slot="exam-road" className="flex flex-col gap-1.5 border-t border-border pt-3">
			<p className="text-callout text-muted-foreground">The road to it</p>
			<ol className="flex flex-col gap-1.5">
				{roadLines(entry.road, entry.finalReview).map((line) =>
					line.kind === "week" ? (
						<li key={line.week.from} className="flex gap-2 text-callout">
							<FactIcon fact={{ kind: "next" }} className="mt-0.5 size-3.5" />
							<span className="min-w-0">
								<span className="text-muted-foreground">{spanWords(line.week)}</span>{" "}
								<span className="text-foreground">
									<MathText>{line.week.titles.join(", ")}</MathText>
								</span>
							</span>
						</li>
					) : (
						<li key="final" className="flex gap-2 text-callout text-muted-foreground">
							<FactIcon fact={{ kind: "review" }} className="mt-0.5 size-3.5" />
							<span className="min-w-0">
								{finalReview}
								{unreviewed.map((words) => (
									<span key={words} data-slot="exam-unreviewed" className="block text-foreground">
										<MathText>{words}</MathText>
									</span>
								))}
							</span>
						</li>
					),
				)}
			</ol>
		</div>
	);
}

/** The exam's next step, the one Home's line for its course takes: what it
 *  works on as a line under its own heading, as the road's are, then the
 *  verb alone on the button, as every other panel's action reads. */
function ExamActions({ entry, busy, onStart }: { entry: Extract<CalendarEntry, { kind: "exam" }>; busy: boolean; onStart: StartSession }) {
	const { next } = entry;
	if (!next) return null;
	const { move } = next;
	return (
		<div data-slot="exam-next" className="flex flex-col gap-3">
			<div className="flex flex-col gap-1.5">
				<p className="text-callout text-muted-foreground">Next step</p>
				<p data-slot="exam-next-what" className="text-callout text-foreground">
					<MathText>{next.on ? `${next.verb} ${next.what}, ${planDay(next.on)}` : next.what}</MathText>
				</p>
			</div>
			{next.on ? null : <div className="flex items-center gap-2">
				{move.kind === "open" ? (
					<Button asChild size="sm">
						<Link href={continueHref(move.chat)}>{next.verb}</Link>
					</Button>
				) : (
					<Button
						size="sm"
						disabled={busy}
						onClick={() => onStart(move.opening, entry.course.workspace, { topics: move.topics, ...(move.from ? { from: move.from } : {}) })}
						data-slot="calendar-entry-start"
					>
						{next.verb}
					</Button>
				)}
			</div>}
		</div>
	);
}

/** A start an entry's button makes: its opening, topics and the lesson it continues from. */
type StartArgs = { opening: string; topics: readonly string[]; from?: string };

function EntryActions({ entry, busy, onStart }: { entry: Exclude<CalendarEntry, { kind: "session" }>; busy: boolean; onStart: StartSession }) {
	if (entry.kind === "exam") return <ExamActions entry={entry} busy={busy} onStart={onStart} />;
	const { topic } = entry;
	const workspace = entry.course.workspace;
	const handle = topic?.handle ?? null;
	const words = pressWord(entry.kind === "task" ? "continue" : entry.action.kind);
	const press: StartArgs | ChatListItem =
		entry.kind === "task"
			? entry.move.kind === "open"
				? entry.move.chat
				: { opening: entry.move.opening, topics: entry.move.topics, ...(entry.move.from ? { from: entry.move.from } : {}) }
			: "chat" in entry.action
				? entry.action.chat
				: { opening: entry.action.opening, topics: handle ? [handle] : [] };
	return (
		<div className="flex items-center gap-2">
			{"id" in press ? (
				<Button asChild size="sm">
					<Link href={continueHref(press)}>{words}</Link>
				</Button>
			) : (
				<Button size="sm" disabled={busy} onClick={() => onStart(press.opening, workspace, { topics: press.topics, ...(press.from ? { from: press.from } : {}) })} data-slot="calendar-entry-start">
					{words}
				</Button>
			)}
			{topic && (
				<Button asChild size="sm" variant="quiet">
					<Link href={unitHref(workspace, topic.handle)}>Open topic</Link>
				</Button>
			)}
		</div>
	);
}
