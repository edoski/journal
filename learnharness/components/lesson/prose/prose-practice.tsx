"use client";

import { BookOpenIcon, EyeIcon, FlagIcon, LightbulbIcon, type LucideIcon } from "lucide-react";
import { ToolContentResponse } from "@/components/ai-elements/message";
import { disputeStampWords, LESSON_WORDS } from "@/components/study-words";
import type { Confidence, DisputeDetails, Photo, PracticeRequest, PracticeRequestDetails } from "@/src/core";
import { BubbleMark, LearnerBubble } from "@/components/lesson/prose/learner-bubble";
import { Disclosure, YourTurn } from "@/components/lesson/prose/prose-question";

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

/** A problem's statement as the tutor saw it: the tool boundary turns a
 *  number into its digits, and the record keeps the number. Null when
 *  there is no statement. */
export function problemStatement(input: unknown): string | null {
	const statement = (input as { statement?: unknown } | null)?.statement;
	if (typeof statement === "string") return statement;
	return typeof statement === "number" && Number.isFinite(statement) ? String(statement) : null;
}

/** A posed problem in the tutor's message (spec: prose.md): its statement
 *  as prose, under "Your turn" while it is the one he works on. The
 *  commitment never renders, only the statement. */
export function ProseProblem({ input, active }: { input: unknown; active: boolean }) {
	const statement = problemStatement(input);
	if (statement === null) return null;
	return (
		<div data-testid="prose-problem" data-slot="prose-question" data-open={active ? "" : undefined} className="mt-2">
			{active && <YourTurn />}
			<ToolContentResponse>{statement}</ToolContentResponse>
		</div>
	);
}

/** How a problem ended: the record's mark under the bubble that ended it,
 *  and the model solution behind a disclosure, open when he asked to see
 *  it. A skip is one quiet line. */
export function ProseConclude({ toolCallId, input, output, reveal }: {
	toolCallId: string;
	input: unknown;
	output: unknown;
	reveal: unknown;
}) {
	const { outcome, solutionReveal } = (input ?? {}) as { outcome?: unknown; solutionReveal?: unknown };
	if (outcome === "dismissed") {
		const tonight = (output as { reason?: unknown } | undefined)?.reason === "tonight";
		return (
			<p data-testid="prose-conclude" className="my-1 text-row text-muted-foreground">
				{tonight ? LESSON_WORDS.leftForTonight : LESSON_WORDS.skippedProblem}
			</p>
		);
	}
	const solution = typeof reveal === "string" ? reveal : typeof solutionReveal === "string" ? solutionReveal : "";
	return (
		<div data-testid="prose-conclude">
			<BubbleMark answerId={toolCallId} />
			{solution && (
				<Disclosure label="Model solution" defaultOpen={outcome === "surrendered"}>
					{solution}
				</Disclosure>
			)}
		</div>
	);
}

/** His work on a problem, as his bubble. */
export function ThinkingBubble({ data }: { data: PracticeThinkingData }) {
	return <LearnerBubble testId="prose-thinking" text={data.text} photos={data.photos} />;
}

const REQUEST: Record<PracticeRequest, { label: string; icon: LucideIcon }> = {
	hint: { label: "Hint", icon: LightbulbIcon },
	show: { label: "Show me", icon: EyeIcon },
	explain: { label: "Explain instead", icon: BookOpenIcon },
};

/** What he asked for on a problem, as his bubble: the request's icon and
 *  word, then the work he had written. */
export function RequestBubble({ data }: { data: PracticeRequestDetails }) {
	const request = REQUEST[data.request] ?? REQUEST.hint;
	return <LearnerBubble testId="prose-request" icon={request.icon} label={request.label} text={data.text} />;
}

/** His dispute of a mark, as his bubble. */
export function DisputeBubble({ data }: { data: DisputeDetails }) {
	return <LearnerBubble testId="dispute-row" icon={FlagIcon} label={disputeStampWords(data)} text={data.said} />;
}
