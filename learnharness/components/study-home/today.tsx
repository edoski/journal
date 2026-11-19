"use client";

import { useState } from "react";
import { CalendarIcon, CircleCheckIcon, TriangleAlertIcon } from "lucide-react";
import { DayHeading } from "@/components/study-home/day-heading";
import { doneWords, type NearExam, type SessionAsk } from "@/components/study-home/day-record";
import { HybridRows } from "@/components/study-home/agenda-rows/hybrid/hybrid-rows";
import type { RowsProps } from "@/components/study-home/agenda-rows/row-facts";
import { MathLine } from "@/components/ui/math-line";
import { MathText } from "@/components/ui/math-text";
import { Button } from "@/components/ui/button";
import { misfitWords } from "@/components/calendar/calendar-facts";
import { EXAM_GAP_WORDS, EXAM_SESSION_WORDS } from "@/components/study-words";
import { examGapAskCreation } from "@/components/unit-inbox/start-unit";
import { useStartScope } from "@/components/start/start-scope";

/**
 * Today (spec: today.md): the page's title, what he finished today once he
 * has, then each session to pick up and every step each course's plan
 * holds today, each its course and its lesson; the whole line opens it.
 * The title names an exam in the coming week (`nearExam`), and says when
 * nothing is left today; under it, the exam's topics with no room before
 * it, by name, with Ask the tutor (`ExamMisfit`): the coming week's exam,
 * else one further off on the day a topic fell past it (`misfitExam`). The lines are agenda's
 * hybrid rows (agenda-rows/hybrid/hybrid.md).
 */
export function Today({ done, exam = null, misfit = exam, asks = [], ...props }: RowsProps & { done: readonly string[]; exam?: NearExam | null; misfit?: NearExam | null; asks?: readonly SessionAsk[] }) {
	const words = doneWords(done);
	return (
		<section aria-labelledby="today-heading" data-slot="today" className="flex shrink-0 flex-col gap-2">
			<DayHeading id="today-heading" studied={words !== null} exam={exam} empty={props.rows.length === 0} />
			{asks.map((ask) => (
				<ExamSessionAsk key={ask.workspace} ask={ask} />
			))}
			{misfit && <ExamMisfit exam={misfit} />}
			{words && (
				<p data-slot="today-done" className="-mt-1 flex h-5 min-w-0 items-center gap-1.5 text-callout text-muted-foreground">
					<CircleCheckIcon aria-hidden="true" className="size-3.5 shrink-0" />
					<MathLine className="min-w-0">{words}</MathLine>
				</p>
			)}
			<HybridRows {...props} />
		</section>
	);
}

/** Under the exam's question, the topics its plan has no room to start
 *  before it, named as the course head names them ("No room before the
 *  exam to start Poisson distribution, Geometric distribution and
 *  Variance"), never counted, with Ask the tutor, which opens the session
 *  the head's opens (round 17, M2: nine exam topics fell after the exam,
 *  and Home never said so). Nothing while every topic fits. */
function ExamMisfit({ exam }: { exam: NearExam }) {
	const { start, starting } = useStartScope();
	const words = misfitWords(exam.wontFit ?? []);
	if (!words || !exam.workspace) return null;
	const workspace = exam.workspace;
	return (
		<p data-slot="today-exam-misfit" className="-mt-1 flex min-w-0 flex-wrap items-start gap-x-3 text-callout text-warning">
			<span className="flex min-w-0 items-start gap-1.5">
				<TriangleAlertIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
				<span className="min-w-0 text-pretty">
					<MathText>{words}</MathText>
				</span>
			</span>
			<Button variant="quiet" size="xs" className="h-5 px-0 text-callout text-link hover:text-link" disabled={starting !== null} onClick={() => start(examGapAskCreation(workspace, exam.wontFit ?? []), { key: "gap:ask" })}>
				{EXAM_GAP_WORDS.ask}
			</Button>
		</p>
	);
}

/** Once an exam session has gone by while a later one is listed, the plan
 *  aims at the next session and Home asks, once, how the one gone by went,
 *  saying what moved the plan (Edo, 19 Nov 2026). Passed ends the exam's
 *  run-up; Not this time confirms the next session. Either answer is saved
 *  to the record, and the line leaves; with no answer the plan keeps
 *  aiming at the next session. */
export function ExamSessionAsk({ ask }: { ask: SessionAsk }) {
	const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
	if (state === "saved") return null;
	const answer = (outcome: "passed" | "not-this-time") => {
		setState("saving");
		void fetch("/api/courses/exam", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspace: ask.workspace, outcome }) })
			.then((r) => setState(r.ok ? "saved" : "failed"))
			.catch(() => setState("failed"));
	};
	return (
		<div data-slot="today-exam-session" className="-mt-1 flex min-w-0 flex-wrap items-start gap-x-3 text-callout text-foreground">
			<span className="flex min-w-0 items-start gap-1.5">
				<CalendarIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
				<span className="min-w-0 text-pretty">{ask.words}</span>
			</span>
			<span className="flex items-center gap-3">
				<Button variant="quiet" size="xs" className="h-5 px-0 text-callout text-link hover:text-link" disabled={state === "saving"} onClick={() => answer("passed")}>
					{EXAM_SESSION_WORDS.passed}
				</Button>
				<Button variant="quiet" size="xs" className="h-5 px-0 text-callout text-link hover:text-link" disabled={state === "saving"} onClick={() => answer("not-this-time")}>
					{EXAM_SESSION_WORDS.notThisTime}
				</Button>
			</span>
			{state === "failed" && (
				<p role="alert" className="w-full text-callout text-danger">
					Couldn’t save that. Try again.
				</p>
			)}
		</div>
	);
}
