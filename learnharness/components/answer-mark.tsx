"use client";

import { createContext, useContext, useRef, useState, type KeyboardEvent } from "react";
import { CircleCheckIcon, CircleDashedIcon, CircleHelpIcon, CircleMinusIcon, CircleXIcon, FlagIcon, FlagOffIcon, GaugeIcon, HandHelpingIcon, ScaleIcon, UserIcon, type LucideIcon } from "lucide-react";
import { markHow, type AnswerMark, type DisputeDetails, type DisputedHow, type MarkHow, type MarkResult, type MarkRow } from "@/src/core";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Hint } from "@/components/ui/hint";
import { useDialogSubject } from "@/components/ui/overlay";
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
	/** Opens the dispute dialog on this answer, on one of its tries when
	 *  its card has several (`rowId`, the try's attempt). */
	onDispute: (answerId: string, rowId?: string) => void;
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

/** What a dispute is on: an answer, and on a card of several tries the
 *  one he pressed Dispute beside (round 16, m19: "Marked Partly right · On
 *  your own, Right · With help" never said which try a pick would set). */
export interface DisputeTarget {
	answerId: string;
	rowId?: string;
}

/** The rows a dispute names: the one try he pressed it on, else every row
 *  of the answer. */
export function disputedRows(mark: AnswerMark, target: DisputeTarget): MarkRow[] {
	const row = target.rowId ? mark.rows.find((r) => r.id === target.rowId) : undefined;
	return row ? [row] : mark.rows;
}

/** The dialog's first words: the mark it disputes, and on one try of
 *  several the try, "First try: marked Partly right · On your own". */
export function markedWords(rows: readonly MarkRow[]): string {
	const facts = (row: MarkRow) => `${MARK_WORDS.result[row.result]} · ${MARK_HOW_WORDS[markHow(row)]}`;
	return rows.length === 1 && rows[0]!.label ? `${rows[0]!.label}: marked ${facts(rows[0]!)}` : `Marked ${rows.map(facts).join(", ")}`;
}

/** What the dialog sends: his words, the mark he picked, how he thinks it
 *  should count, or any of them. */
export type DisputeDraft = Pick<DisputeDetails, "said" | "proposed" | "proposedHow">;

const PICKS: readonly MarkResult[] = ["correct", "partial", "incorrect"];
const HOW_PICKS: readonly DisputedHow[] = ["ownWork", "withHelp"];

/** Where the dialog's choices start: on one try, the card's own mark and
 *  how it counted, so a change shows as one; on several, nothing picked. */
export function disputeStart(rows: readonly MarkRow[]): { result: MarkResult | ""; how: DisputedHow | "" } {
	if (rows.length !== 1) return { result: "", how: "" };
	const how = markHow(rows[0]!);
	return { result: rows[0]!.result, how: how === "ownWork" || how === "withHelp" ? how : "" };
}

/** What Send sends: his words, and each choice he moved off the card's;
 *  null while nothing differs from the card, so Send waits (round 18, m20:
 *  Send on an untouched dialog did nothing, silently). Pure. */
export function disputeDraft(start: { result: MarkResult | ""; how: DisputedHow | "" }, said: string, proposed: MarkResult | "", proposedHow: DisputedHow | ""): DisputeDraft | null {
	const words = said.trim();
	const result = proposed && proposed !== start.result ? proposed : null;
	const how = proposedHow && proposedHow !== start.how ? proposedHow : null;
	if (!words && !result && !how) return null;
	return { ...(words ? { said: words } : {}), ...(result ? { proposed: result } : {}), ...(how ? { proposedHow: how } : {}) };
}

/** The dispute: a sentence on what's wrong, the mark he thinks is right,
 *  or how he thinks it should count (round 6: help could be argued only
 *  in words). ↑ from the start of the field reaches the choices, ↑ ↓ move
 *  between them and back, ← → within one, ⌘↵ sends. */
export function DisputeDialog({ rows, ...props }: { rows: readonly MarkRow[] | null; onClose: () => void; onSend: (draft: DisputeDraft) => void }) {
	const { open, shown, opening } = useDialogSubject(rows);
	return shown && <DisputeForm key={opening} open={open} rows={shown} {...props} />;
}

/** One opening of the dispute: its own draft, so the next opening starts
 *  clean. */
function DisputeForm({ open, rows, onClose, onSend }: { open: boolean; rows: readonly MarkRow[]; onClose: () => void; onSend: (draft: DisputeDraft) => void }) {
	const start = disputeStart(rows);
	const [said, setSaid] = useState("");
	const [proposed, setProposed] = useState<MarkResult | "">(start.result);
	const [proposedHow, setProposedHow] = useState<DisputedHow | "">(start.how);
	const fieldRef = useRef<HTMLTextAreaElement>(null);
	const groupRef = useRef<HTMLDivElement>(null);
	const howRef = useRef<HTMLDivElement>(null);
	const draft = disputeDraft(start, said, proposed, proposedHow);
	const ready = draft !== null;
	const send = () => {
		if (draft) onSend(draft);
	};
	const marked = markedWords(rows);
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
		<Dialog open={open} onOpenChange={(next) => !next && onClose()}>
			<DialogContent data-testid="dispute-dialog" className="max-w-md" onKeyDown={onKeyDown} onOpenAutoFocus={(e) => { e.preventDefault(); fieldRef.current?.focus(); }}>
				<DialogHeader>
					<DialogTitle>{MARK_WORDS.disputeTitle}</DialogTitle>
					<DialogDescription>
						{marked}. {MARK_WORDS.disputeLine}
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
			<div className="flex items-center gap-2 text-body text-muted-foreground">
				<FlagIcon aria-hidden className="size-4 shrink-0" />
				{disputeStampWords(data)}
			</div>
			{data.said ? <p className="lh-prose mt-1 whitespace-pre-wrap italic text-muted-foreground"><MathText>{data.said}</MathText></p> : null}
		</div>
	);
}
