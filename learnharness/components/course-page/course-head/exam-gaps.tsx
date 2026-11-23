"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ChatListItem, CourseMapTopic, StudyCourse } from "@/src/core";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MathText } from "@/components/ui/math-text";
import { EXAM_GAP_WORDS, examGapPickWords, examGapWhyWords, finalReviewMissWords, pressWord } from "@/components/study-words";
import { examGapAskCreation, topicPress } from "@/components/unit-inbox/start-unit";
import { useStartScope } from "@/components/start/start-scope";
import { examGaps, type ExamGaps } from "@/components/course-page/course-head/head-facts";
import { continueHref } from "@/components/nav/session-state";
import { misfitWords } from "@/components/calendar/calendar-facts";

/** A way in, as a link in the line: its words start on the body's left
 *  edge and wrap inside the popover (round 15, 1 m7: the first ran past
 *  the popover's edge, 8px right of the line above it). */
const PRESS = "h-auto min-h-6 min-w-0 shrink justify-start px-0 has-[>svg]:px-0 text-left whitespace-normal text-body text-link hover:text-link";

/**
 * What Which topics lists: the topics the exam line leaves unnamed (round
 * 20, M2: the line is one sentence, so the names are here). The topics
 * with no room to start ("No room before the exam to start Martingales
 * and Variance of sums"), then the taught topics the final review leaves
 * out but one the why names, since it starts too late ("Binomial is not
 * revisited in the final review from 14 Nov"; round 18, m7: it repeated
 * the why's late topic). Empty with nothing left out. Pure.
 */
export function examGapWhich(course: StudyCourse, gaps: ExamGaps): string[] {
	const { exam } = course.map;
	if (!exam) return [];
	const start = misfitWords(gaps.start.map((t) => t.title));
	const rest = gaps.review.filter((t) => exam.reasons?.[t.handle] !== "too_late").map((t) => t.title);
	return [...(start ? [start] : []), ...(rest.length > 0 ? [finalReviewMissWords(rest, exam, course.map.today)] : [])];
}

/**
 * What Or another offers, from the line's `ways` (the pick first): the
 * alternatives only, never the pick the line above already offers (round
 * 19, m10: it opened on "Review Random variables and distributions ✓"
 * under "Review Random variables and distributions today"). It opens on
 * the next way, in the same order, and folds the rest behind More, each
 * group by what it is: the plan's own for today, then the topics it
 * leaves out (round 17, m6; round 18, m6: 17 options at once). Pure.
 */
export function anotherWays<W extends { planned: boolean }>(ways: readonly W[]): { next: W | null; more: { label: string; ways: W[] }[] } {
	const [, next = null, ...rest] = ways;
	const groups = [
		{ label: EXAM_GAP_WORDS.planned, ways: rest.filter((way) => way.planned) },
		{ label: EXAM_GAP_WORDS.leftOut, ways: rest.filter((way) => !way.planned) },
	];
	return { next, more: groups.filter((group) => group.ways.length > 0) };
}

/**
 * Under the head's first line, when the exam's plan leaves topics out
 * (spec: course-head.md, `examGaps`): why, in the engine's reasons, naming
 * the topics the final review leaves out that the first line does not,
 * then a way in (`ways`: today's plan for the course first, then the
 * topics left out). The first is the pick, named on its press, since the
 * exam line names no topic left out (round 20, M2) ("Review Binomial
 * distribution today"), and Or another opens a menu
 * of the other ways alone, the next first and the rest behind More
 * (`anotherWays`; round 18, m6; round 19, m10); with
 * none he can take today, Ask alone. A topic he began
 * reads Continue and opens its session, as its topic page does
 * (`topicPress`; round 12, 1 D5). Ask the tutor opens a lesson that asks,
 * in his words, how to fit them in. Each starts through the page's one
 * start (`StartScope`). Engine facts only; nothing otherwise.
 */
export function ExamGapLine({ course, chats }: { course: StudyCourse; chats: readonly ChatListItem[] }) {
	const router = useRouter();
	const { start, starting } = useStartScope();
	const [listed, setListed] = useState(false);
	const gaps = examGaps(course.map);
	if (!gaps) return null;
	const { workspace } = course.map;
	const titles = (topics: readonly CourseMapTopic[]) => topics.map((t) => t.title);
	const reasoned = (topics: readonly CourseMapTopic[]) => topics.map((t) => ({ title: t.title, reason: course.map.exam?.reasons?.[t.handle] }));
	// The one consequence, naming no topic but one that starts too late; the rest are behind Which topics (round 17,
	// m6: a 90-word paragraph listing 11 topics on the exam eve).
	const why = examGapWhyWords(reasoned(gaps.start), reasoned(gaps.review), false);
	const which = examGapWhich(course, gaps);
	const { ways } = gaps;
	const named = [...gaps.start, ...gaps.review];
	const press = (topic: CourseMapTopic) => topicPress(topic, course.map, chats);
	const open = (topic: CourseMapTopic) => {
		const { resume, creation } = press(topic);
		if (resume) router.push(continueHref(resume));
		else start(creation, { key: `gap:${topic.handle}` });
	};
	const verb = (way: { topic: CourseMapTopic; starts: boolean }) => (!way.starts ? "review" : press(way.topic).continues ? "continue" : "start");
	// The pick: the first way, today's plan before the topics left out, a
	// review before a start (round 8: eight options and no pick; rounds 10
	// and 11: the tutor's and Home's order).
	const [pick] = ways;
	const another = anotherWays(ways);
	return (
		<p data-slot="course-exam-gaps" className="flex min-h-6 min-w-0 flex-wrap items-center gap-x-4 text-body font-normal text-muted-foreground">
			{why && (
				<span data-slot="exam-gaps-why" className="w-full">
					<MathText>{why}</MathText>
				</span>
			)}
			{which.length > 0 && (
				<Button variant="quiet" size="xs" data-slot="exam-gaps-which-press" aria-expanded={listed} className={PRESS} onClick={() => setListed((open) => !open)}>
					{EXAM_GAP_WORDS.which}
				</Button>
			)}
			{listed && which.length > 0 && (
				<span data-slot="exam-gaps-which" className="flex w-full flex-col gap-1 text-foreground">
					{which.map((line) => (
						<span key={line}>
							<MathText>{line}</MathText>
						</span>
					))}
				</span>
			)}
			{ways.length === 0 ? null : (
				<>
					<Button variant="quiet" size="xs" data-slot="exam-gaps-pick" className={PRESS} disabled={starting !== null} onClick={() => open(pick!.topic)}>
						<MathText>{examGapPickWords(verb(pick!), pick!.topic.title)}</MathText>
					</Button>
				{another.next && (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="quiet" size="xs" data-slot="exam-gaps-another" className={PRESS} disabled={starting !== null}>
							{EXAM_GAP_WORDS.another}
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start">
						<DropdownMenuItem data-slot="exam-gaps-next" onSelect={() => open(another.next!.topic)}>
							<MathText>{`${pressWord(verb(another.next))} ${another.next.topic.title}`}</MathText>
						</DropdownMenuItem>
						{another.more.length > 0 && (
							<DropdownMenuSub>
								<DropdownMenuSubTrigger data-slot="exam-gaps-more">{EXAM_GAP_WORDS.more}</DropdownMenuSubTrigger>
								<DropdownMenuSubContent>
									{another.more.map((group) => (
										<DropdownMenuGroup key={group.label} data-slot="exam-gaps-group">
											<DropdownMenuLabel>{group.label}</DropdownMenuLabel>
											{group.ways.map((way) => (
												<DropdownMenuItem key={way.topic.handle} onSelect={() => open(way.topic)}>
													<MathText>{`${pressWord(verb(way))} ${way.topic.title}`}</MathText>
												</DropdownMenuItem>
											))}
										</DropdownMenuGroup>
									))}
								</DropdownMenuSubContent>
							</DropdownMenuSub>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
				)}
				</>
			)}
			<Button
				variant="quiet"
				size="xs"
				className={PRESS}
				disabled={starting !== null}
				onClick={() => start(examGapAskCreation(workspace, titles(named)), { key: "gap:ask" })}
			>
				{EXAM_GAP_WORDS.ask}
			</Button>
		</p>
	);
}
