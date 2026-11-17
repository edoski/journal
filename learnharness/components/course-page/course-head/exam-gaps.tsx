"use client";

import { useRouter } from "next/navigation";
import type { ChatListItem, CourseMapTopic, StudyCourse } from "@/src/core";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MathText } from "@/components/ui/math-text";
import { EXAM_GAP_WORDS, examGapPickWords, examGapWhyWords, pressWord } from "@/components/study-words";
import { examGapAskCreation, topicPress, useStartSession } from "@/components/unit-inbox/start-unit";
import { examGaps } from "@/components/course-page/course-head/head-facts";
import { continueHref } from "@/components/nav/session-state";

const PRESS = "text-body text-link hover:text-link";

/**
 * Under the head's first line, when the exam's plan leaves topics out
 * (spec: course-head.md, `examGaps`): why, in the engine's reasons, naming
 * the topics the final review leaves out that the first line does not,
 * then a way in (`ways`: today's plan for the course first, then the
 * topics left out). Start it (or Review it) today opens a lesson on the one
 * topic the line names; otherwise the first is the pick, named on its press
 * ("Review Binomial distribution today"), and Or another opens a menu of
 * the rest; with none he can take today, Ask alone. A topic he began
 * reads Continue and opens its session, as its topic page does
 * (`topicPress`; round 12, 1 D5). Ask the tutor opens a lesson that asks,
 * in his words, how to fit them in. Engine facts only; nothing otherwise.
 */
export function ExamGapLine({ course, chats }: { course: StudyCourse; chats: readonly ChatListItem[] }) {
	const router = useRouter();
	const { start, starting } = useStartSession();
	const gaps = examGaps(course.map);
	if (!gaps) return null;
	const { workspace } = course.map;
	const titles = (topics: readonly CourseMapTopic[]) => topics.map((t) => t.title);
	const reasoned = (topics: readonly CourseMapTopic[]) => topics.map((t) => ({ title: t.title, reason: course.map.exam?.reasons?.[t.handle] }));
	const why = examGapWhyWords(reasoned(gaps.start), reasoned(gaps.review));
	const { ways } = gaps;
	const named = [...gaps.start, ...gaps.review];
	const press = (topic: CourseMapTopic) => topicPress(topic, course.map, chats);
	const open = (topic: CourseMapTopic) => {
		const { resume, creation } = press(topic);
		if (resume) router.push(continueHref(resume));
		else start(`gap:${topic.handle}`, creation);
	};
	const verb = (way: { topic: CourseMapTopic; starts: boolean }) => (!way.starts ? "review" : press(way.topic).continues ? "continue" : "start");
	// "Start it today" only where "it" is the one topic the line names; with two
	// named, the press names its own (round 12, 1 m2: "No room… for Inner
	// products and Orthogonal projection… Start it today").
	const only = ways.length === 1 && !ways[0]!.planned && named.length === 1 ? ways[0]! : null;
	// The pick: the first way, today's plan before the topics left out, a
	// review before a start (round 8: eight options and no pick; rounds 10
	// and 11: the tutor's and Home's order).
	const [pick, ...others] = ways;
	return (
		<p data-slot="course-exam-gaps" className="flex min-h-6 min-w-0 flex-wrap items-center gap-x-1 text-body font-normal text-muted-foreground">
			{why && (
				<span data-slot="exam-gaps-why" className="mr-1">
					<MathText>{why}</MathText>
				</span>
			)}
			{ways.length === 0 ? null : only ? (
				<Button variant="quiet" size="xs" className={PRESS} disabled={starting !== null} onClick={() => open(only.topic)}>
					{EXAM_GAP_WORDS[verb(only)]}
				</Button>
			) : (
				<>
					<Button variant="quiet" size="xs" data-slot="exam-gaps-pick" className={PRESS} disabled={starting !== null} onClick={() => open(pick!.topic)}>
						<MathText>{examGapPickWords(verb(pick!), pick!.topic.title)}</MathText>
					</Button>
				{others.length > 0 && (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="quiet" size="xs" className={PRESS} disabled={starting !== null}>
							{EXAM_GAP_WORDS.another}
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start">
						{others.map((way) => (
							<DropdownMenuItem key={way.topic.handle} onSelect={() => open(way.topic)}>
								<MathText>{`${pressWord(verb(way))} ${way.topic.title}`}</MathText>
							</DropdownMenuItem>
						))}
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
				onClick={() => start("gap:ask", examGapAskCreation(workspace, titles(named), named.map((t) => t.handle)))}
			>
				{EXAM_GAP_WORDS.ask}
			</Button>
		</p>
	);
}
