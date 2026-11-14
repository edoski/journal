"use client";

import { ToolContentResponse } from "@/components/ai-elements/message";
import type { ArtifactPartProps, Confidence, Photo, PracticeRequest, PracticeRequestDetails } from "@/src/core";
import { SentPhotos } from "@/components/photos";
import { BookOpenIcon, EyeIcon, LightbulbIcon, type LucideIcon } from "lucide-react";

/**
 * The practice transcript cards (practice sessions, owner design
 * 2026-10-04): three quiet records in the stream —
 *
 * - ProblemCard — a posed problem: the statement, compact-expandable
 *   (like every card here; the dock is the working surface, this is the
 *   record). The commitment NEVER renders — only the call's statement.
 * - ConcludeCard — the conclusion: how it went + verdict + the reveal
 *   (the committed solution, shown when the problem ended). A dismissal
 *   synthesis (outcome:"dismissed") renders as one muted line.
 * - ThinkingCard — the learner's own submission, user-side: the register
 *   is the two buttons' (Nudge = working trace, Commit = answer). The
 *   UNIFIED ThinkingBlock (owner round 2026-10-05): the quiz quote-block
 *   language in a faint user-side shell, never collapsible.
 */

import { ThinkingBlock } from "@/components/thinking-block";
import { useActiveProblemCallId } from "@/components/lesson/active-problem";
import { LessonCard } from "@/components/lesson/lesson-card";
import { AnswerMarkLine } from "@/components/answer-mark";

/** The practice-thinking marker's details (native-messages.ts). */
export interface PracticeThinkingData {
	problemCallId: string;
	/** Legacy records (pre 2026-10-05) carry the old two-lane flag; ignored. */
	commit?: boolean;
	text: string;
	/** Absent on submissions recorded before 7 Nov 2026. */
	confidence?: Confidence;
	/** Photos of his working (the marker's images, joined by the view). */
	photos?: Photo[];
}

export function ProblemCard({ part }: ArtifactPartProps) {
	// Always open, no chevron (owner round, 2026-10-05): the record IS the
	// statement. The commitment never renders — only the call's statement.
	const activeProblemCallId = useActiveProblemCallId();
	const input = (part.input ?? {}) as { statement?: string };
	const statement = typeof input.statement === "string" ? input.statement : "";
	// The problem reads once: while the dock works on it, the dock shows it.
	if (part.toolCallId === activeProblemCallId) return null;
	return (
		<LessonCard data-testid="problem-card" label="Problem" className="my-1">
			<ToolContentResponse>{statement}</ToolContentResponse>
		</LessonCard>
	);
}

/** How a problem ended, in the learner's words. */
const OUTCOME_WORDS: Record<string, string> = {
	solved: "Solved on your own",
	solvedWithHints: "Solved with a hint",
	movedOn: "Moved on",
	surrendered: "You gave up",
};

export function ConcludeCard({ part }: ArtifactPartProps) {
	// The conclusion redesigned (owner round, 2026-10-05): the SOLUTION is
	// the hero — the modelSolution committed at pose time (part.reveal, the
	// view-seam join), shown verbatim, never re-authored. The verdict sits
	// above it, small and muted. Nothing collapsible. Legacy inputs
	// (pre-slim records) that carry their own solutionReveal fall back to it.
	const input = (part.input ?? {}) as { outcome?: string; verdict?: string; solutionReveal?: string };
	const outcome = typeof input.outcome === "string" ? input.outcome : "";
	const verdict = typeof input.verdict === "string" ? input.verdict : "";
	const reveal =
		typeof part.reveal === "string" ? part.reveal : typeof input.solutionReveal === "string" ? input.solutionReveal : "";

	// The dismissal synthesis: no verdict, no reveal — one muted line (the
	// learner clicked; the record needs only the fact).
	if (outcome === "dismissed") {
		return (
			<p data-testid="conclude-card" className="my-1 text-row text-muted-foreground">
				Problem dismissed.
			</p>
		);
	}
	return (
		<LessonCard data-testid="conclude-card" label="How it went" note={OUTCOME_WORDS[outcome]} className="my-1">
			{verdict.length > 0 && (
				<ToolContentResponse className="text-muted-foreground [--lh-prose-leading:calc(18/13)] [--lh-prose-size:13px]">{verdict}</ToolContentResponse>
			)}
			{reveal.length > 0 && (
				<div className="mt-3 border-t pt-3">
					<div className="mb-1 text-row text-muted-foreground">Model solution</div>
					<ToolContentResponse>{reveal}</ToolContentResponse>
				</div>
			)}
			<AnswerMarkLine answerId={part.toolCallId} />
		</LessonCard>
	);
}

export function ThinkingCard({ data }: { data: PracticeThinkingData }) {
	// The unified row (owner rounds, 2026-10-05): one style, one label —
	// 50%-italic quote block on expand. Legacy records' commit flag is
	// deliberately unread (one lane now). A TRANSCRIPT row (owner round,
	// 2026-10-07): full-width band + rail, arriving expanded.
	if (!data.photos?.length) return <ThinkingBlock testId="thinking-card" label="YOUR THINKING" text={data.text} defaultOpen />;
	return (
		<>
			{data.text.trim() && <ThinkingBlock testId="thinking-card" label="YOUR THINKING" text={data.text} defaultOpen />}
			<SentPhotos photos={data.photos} className="my-1" />
		</>
	);
}

const REQUEST_LINE: Record<PracticeRequest, { label: string; icon: LucideIcon }> = {
	hint: { label: "You asked for a hint", icon: LightbulbIcon },
	show: { label: "You asked to see the solution", icon: EyeIcon },
	explain: { label: "You asked to be taught this instead", icon: BookOpenIcon },
};

/** The dock's request in the transcript: what he asked for, and the work he
 *  had written when he asked. Never an answer row. */
export function RequestCard({ data }: { data: PracticeRequestDetails }) {
	const line = REQUEST_LINE[data.request] ?? REQUEST_LINE.hint;
	const Icon = line.icon;
	return (
		<div data-testid="practice-request-card" data-request={data.request} className="my-1 w-full rounded-xl bg-card px-4 py-3">
			<div className="flex items-center gap-2 text-row text-muted-foreground">
				<Icon className="size-4 shrink-0" />
				{line.label}
			</div>
			{data.text ? <p className="lh-prose mt-1 whitespace-pre-wrap italic text-muted-foreground">{data.text}</p> : null}
		</div>
	);
}
