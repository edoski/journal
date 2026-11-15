"use client";

import { createContext, useContext, useRef, useState, type KeyboardEvent } from "react";
import { CircleCheckIcon, CircleDashedIcon, CircleHelpIcon, CircleMinusIcon, CircleXIcon, FlagIcon, FlagOffIcon, GaugeIcon, HandHelpingIcon, ScaleIcon, UserIcon, type LucideIcon } from "lucide-react";
import { markHow, type AnswerMark, type DisputeDetails, type DisputedHow, type MarkHow, type MarkResult, type MarkRow } from "@/src/core";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Hint } from "@/components/ui/hint";
import { MathText } from "@/components/ui/math-text";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { disputeStampWords, MARK_HOW_WORDS, MARK_WORDS } from "@/components/study-words";
import { cn } from "@/lib/utils";

/**
 * An answer's mark on its card, and the dispute (spec: answer-mark.md).
 * Everything shown is the engine's record of the attempt that stands; the
 * session fetches it (`/api/chats/:id/marks`) and hands it down here.
 */

export interface AnswerMarks {
	marks: Readonly<Record<string, AnswerMark>>;
	/** Opens the dispute dialog on this answer. */
	onDispute: (answerId: string) => void;
	/** False while a turn runs: a dispute is a message to the tutor. */
	canDispute: boolean;
}

const AnswerMarksContext = createContext<AnswerMarks>({ marks: {}, onDispute: () => {}, canDispute: false });
export const AnswerMarksProvider = AnswerMarksContext.Provider;

/** This answer's mark, when the engine holds one. */
export function useAnswerMark(answerId: string | undefined): AnswerMark | undefined {
	const { marks } = useContext(AnswerMarksContext);
	return answerId ? marks[answerId] : undefined;
}

const RESULT_ICON: Record<MarkResult, LucideIcon> = {
	correct: CircleCheckIcon,
	partial: CircleMinusIcon,
	incorrect: CircleXIcon,
};

const HOW_ICON: Record<MarkHow, LucideIcon> = {
	predicted: CircleDashedIcon,
	gaveUp: FlagOffIcon,
	withHelp: HandHelpingIcon,
	unconfirmed: CircleHelpIcon,
	ownWork: UserIcon,
};

function Fact({ icon: Icon, children, className }: { icon: LucideIcon; children: React.ReactNode; className?: string }) {
	return (
		<span className={cn("inline-flex items-center gap-1.5", className)}>
			<Icon aria-hidden className="size-3.5 shrink-0" />
			{children}
		</span>
	);
}

/** One mark row's facts: its label, the result, how it counted (`markHow`,
 *  the words Earlier says too), the confidence he chose. The card's foot
 *  and the lesson's mark line share it. */
export function RowFacts({ row }: { row: MarkRow }) {
	const how = markHow(row);
	return (
		<span data-testid="mark-row" data-result={row.result} className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
			{row.label && <span className="text-muted-foreground">{row.label}</span>}
			{/* Gave up says the result itself: "Not right · Gave up" was two chips for one fact (round 8). */}
			{how !== "gaveUp" && <Fact icon={RESULT_ICON[row.result]} className="text-foreground">{MARK_WORDS.result[row.result]}</Fact>}
			<Fact icon={HOW_ICON[how]} className={how === "gaveUp" ? "text-foreground" : undefined}>{MARK_HOW_WORDS[how]}</Fact>
			{row.sure && <Fact icon={GaugeIcon}>{MARK_WORDS.sure[row.sure]}</Fact>}
		</span>
	);
}

/** Dispute's press for an answer: whether a dispute can go now, and the
 *  opener of the dialog. */
export function useAnswerMarkActions(): Pick<AnswerMarks, "onDispute" | "canDispute"> {
	const { onDispute, canDispute } = useContext(AnswerMarksContext);
	return { onDispute, canDispute };
}

/** The card's foot: the mark, whether it was disputed, and Dispute. Null
 *  until the engine holds an attempt for the answer. */
export function AnswerMarkLine({ answerId }: { answerId: string }) {
	const { marks, onDispute, canDispute } = useContext(AnswerMarksContext);
	const mark = marks[answerId];
	if (!mark) return null;
	return (
		<div data-testid="answer-mark" className="mt-3 flex items-start gap-3 border-t pt-3 text-row text-muted-foreground">
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				{mark.rows.map((row) => (
					<RowFacts key={row.id} row={row} />
				))}
				{mark.disputed && (
					<span data-testid="mark-disputed" className="flex min-w-0 items-start gap-1.5">
						<ScaleIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
						<span className="min-w-0">
							{MARK_WORDS.disputed}
							{mark.ruling && <span className="text-muted-foreground/80">: <MathText>{mark.ruling}</MathText></span>}
						</span>
					</span>
				)}
			</div>
			<Hint label={MARK_WORDS.disputeTitle} action="dispute-mark">
				<Button variant="quiet" size="row" data-testid="dispute-mark" disabled={!canDispute} onClick={() => onDispute(answerId)} className="-my-1.5 -mr-2 shrink-0">
					<FlagIcon aria-hidden className="size-3.5" />
					{MARK_WORDS.dispute}
				</Button>
			</Hint>
		</div>
	);
}

/** What the dialog sends: his words, the mark he picked, how he thinks it
 *  should count, or any of them. */
export type DisputeDraft = Pick<DisputeDetails, "said" | "proposed" | "proposedHow">;

const PICKS: readonly MarkResult[] = ["correct", "partial", "incorrect"];
const HOW_PICKS: readonly DisputedHow[] = ["ownWork", "withHelp"];

/** The dispute: a sentence on what's wrong, the mark he thinks is right,
 *  or how he thinks it should count (round 6: help could be argued only
 *  in words). ↑ from the start of the field reaches the choices, ↑ ↓ move
 *  between them and back, ← → within one, ⌘↵ sends. */
export function DisputeDialog({ mark, onClose, onSend }: { mark: AnswerMark; onClose: () => void; onSend: (draft: DisputeDraft) => void }) {
	const [said, setSaid] = useState("");
	const [proposed, setProposed] = useState<MarkResult | "">("");
	const [proposedHow, setProposedHow] = useState<DisputedHow | "">("");
	const fieldRef = useRef<HTMLTextAreaElement>(null);
	const groupRef = useRef<HTMLDivElement>(null);
	const howRef = useRef<HTMLDivElement>(null);
	const ready = said.trim().length > 0 || proposed !== "" || proposedHow !== "";
	const send = () => {
		if (!ready) return;
		onSend({ ...(said.trim() ? { said: said.trim() } : {}), ...(proposed ? { proposed } : {}), ...(proposedHow ? { proposedHow } : {}) });
	};
	const marked = mark.rows.map((row) => `${MARK_WORDS.result[row.result]} · ${MARK_HOW_WORDS[markHow(row)]}`).join(", ");
	const focusGroup = (group: HTMLDivElement | null) => (group?.querySelector<HTMLButtonElement>('[data-state="on"]') ?? group?.querySelector<HTMLButtonElement>("[data-pick]"))?.focus();
	const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
		const target = e.target as Node;
		if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			send();
		} else if (e.key === "ArrowUp" && e.target === fieldRef.current && fieldRef.current.selectionStart === 0 && fieldRef.current.selectionEnd === 0) {
			e.preventDefault();
			focusGroup(howRef.current);
		} else if (e.key === "ArrowUp" && howRef.current?.contains(target)) {
			e.preventDefault();
			focusGroup(groupRef.current);
		} else if (e.key === "ArrowDown" && groupRef.current?.contains(target)) {
			e.preventDefault();
			focusGroup(howRef.current);
		} else if (e.key === "ArrowDown" && howRef.current?.contains(target)) {
			e.preventDefault();
			fieldRef.current?.focus();
		}
	};
	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent data-testid="dispute-dialog" className="max-w-md" onKeyDown={onKeyDown} onOpenAutoFocus={(e) => { e.preventDefault(); fieldRef.current?.focus(); }}>
				<DialogHeader>
					<DialogTitle>{MARK_WORDS.disputeTitle}</DialogTitle>
					<DialogDescription>
						Marked {marked}. {MARK_WORDS.disputeLine}
					</DialogDescription>
				</DialogHeader>
				<ToggleGroup
					ref={groupRef}
					type="single"
					variant="segmented"
					size="segment"
					aria-label="The mark you think is right"
					data-testid="dispute-pick"
					value={proposed}
					onValueChange={(next) => setProposed(next as MarkResult | "")}
					className="self-start"
				>
					{PICKS.map((pick) => (
						<ToggleGroupItem key={pick} value={pick} data-pick={pick}>
							{MARK_WORDS.result[pick]}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
				<ToggleGroup
					ref={howRef}
					type="single"
					variant="segmented"
					size="segment"
					aria-label="How you think it should count"
					data-testid="dispute-how"
					value={proposedHow}
					onValueChange={(next) => setProposedHow(next as DisputedHow | "")}
					className="self-start"
				>
					{HOW_PICKS.map((pick) => (
						<ToggleGroupItem key={pick} value={pick} data-pick={pick}>
							{MARK_HOW_WORDS[pick]}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
				<Textarea ref={fieldRef} data-testid="dispute-said" value={said} onChange={(e) => setSaid(e.target.value)} placeholder={MARK_WORDS.disputePlaceholder} rows={3} className="min-h-20" />
				<DialogFooter>
					<Button variant="quiet" size="row" onClick={onClose}>
						Cancel
					</Button>
					<Hint label={MARK_WORDS.disputeSend} binding="mod+enter">
						<Button size="row" data-testid="dispute-send" disabled={!ready} onClick={send}>
							{MARK_WORDS.disputeSend}
						</Button>
					</Hint>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/** His dispute in the transcript: what he said is wrong and the mark he
 *  picked. A learner row, never an answer card. */
export function DisputeRow({ data }: { data: DisputeDetails }) {
	return (
		<div data-testid="dispute-row" className="my-1 w-full rounded-xl bg-card px-4 py-3">
			<div className="flex items-center gap-2 text-row text-muted-foreground">
				<FlagIcon aria-hidden className="size-4 shrink-0" />
				{disputeStampWords(data)}
			</div>
			{data.said ? <p className="lh-prose mt-1 whitespace-pre-wrap italic text-muted-foreground"><MathText>{data.said}</MathText></p> : null}
		</div>
	);
}
