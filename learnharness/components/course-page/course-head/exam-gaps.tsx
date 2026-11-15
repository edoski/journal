"use client";

import type { CourseMapTopic, StudyCourse } from "@/src/core";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MathText } from "@/components/ui/math-text";
import { EXAM_GAP_WORDS, examGapAsk, examGapPickWords, examGapWhyWords } from "@/components/study-words";
import { topicCreation, useStartSession } from "@/components/unit-inbox/start-unit";
import { examGaps } from "@/components/course-page/course-head/head-facts";

const PRESS = "text-row text-link hover:text-link";

/**
 * Under the head's first line, when the exam's plan leaves topics out
 * (spec: course-head.md, `examGaps`): why, in the engine's reasons, naming
 * the topics the final review leaves out that the first line does not,
 * then a way in (`ways`). Start it (or Review it) today opens a lesson on
 * the topic; with several, the first is the pick, named on its press
 * ("Start Expectation and linearity today"), and Or another opens a menu of
 * the rest; with none he can take today, Ask alone. Ask the tutor opens a lesson that asks, in his
 * words, how to fit them in. Engine facts only; nothing otherwise.
 */
export function ExamGapLine({ course }: { course: StudyCourse }) {
	const { start, starting } = useStartSession();
	const gaps = examGaps(course.map);
	if (!gaps) return null;
	const { workspace } = course.map;
	const titles = (topics: readonly CourseMapTopic[]) => topics.map((t) => t.title);
	const reasoned = (topics: readonly CourseMapTopic[]) => topics.map((t) => ({ title: t.title, reason: course.map.exam?.reasons?.[t.handle] }));
	const why = examGapWhyWords(reasoned(gaps.start), reasoned(gaps.review)) ?? "";
	const { ways } = gaps;
	const named = [...gaps.start, ...gaps.review];
	const open = (topic: CourseMapTopic) => start(`gap:${topic.handle}`, topicCreation(workspace, topic));
	const only = ways.length === 1 ? ways[0]! : null;
	// The pick: the first way, an exam topic never started before a review,
	// in the engine's order (round 8: eight options and no pick).
	const [pick, ...others] = ways;
	return (
		<p data-slot="course-exam-gaps" className="flex min-h-6 min-w-0 flex-wrap items-center gap-x-1 text-row font-normal text-muted-foreground">
			<span data-slot="exam-gaps-why" className="mr-1">
				<MathText>{why}</MathText>
			</span>
			{ways.length === 0 ? null : only ? (
				<Button variant="quiet" size="xs" className={PRESS} disabled={starting !== null} onClick={() => open(only.topic)}>
					{only.starts ? EXAM_GAP_WORDS.start : EXAM_GAP_WORDS.review}
				</Button>
			) : (
				<>
					<Button variant="quiet" size="xs" data-slot="exam-gaps-pick" className={PRESS} disabled={starting !== null} onClick={() => open(pick!.topic)}>
						<MathText>{examGapPickWords(pick!.starts, pick!.topic.title)}</MathText>
					</Button>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="quiet" size="xs" className={PRESS} disabled={starting !== null}>
							{EXAM_GAP_WORDS.another}
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start">
						{others.map(({ topic, starts }) => (
							<DropdownMenuItem key={topic.handle} onSelect={() => open(topic)}>
								<MathText>{`${starts ? EXAM_GAP_WORDS.startTopic : EXAM_GAP_WORDS.reviewTopic} ${topic.title}`}</MathText>
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
				</>
			)}
			<Button
				variant="quiet"
				size="xs"
				className={PRESS}
				disabled={starting !== null}
				onClick={() => start("gap:ask", { title: examGapAsk(titles(named)), course: { workspace }, topics: named.map((t) => t.handle) })}
			>
				{EXAM_GAP_WORDS.ask}
			</Button>
		</p>
	);
}
