"use client";

import { CheckIcon, CircleX } from "lucide-react";
import type { PdfResult, ResearchResult, SubagentArtifactData } from "@/src/core";
import type { LhViewMessage } from "@/src/core";
import { isSubagentFailure } from "@/src/core";
import { DemoOutputCard } from "@/components/artifacts/demo-card";
import { PdfBriefCard, ResearchBriefCard } from "@/components/artifacts/job-card";
import { VisualOutputCard } from "@/components/artifacts/visual-card";
import { InlineDemo, InlineVisual } from "@/components/artifacts/inline-figure";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { STOPPED_WORDS } from "@/components/study-words";

/**
 * The sub-agent result delivery card (contracts.ts "THE ASYNC PROTOCOL" §4).
 *
 * When a background job completes, the wake pipeline injects a STEER message
 * into the transcript: a user-role UIMessage whose data part
 * ("data-subagent-artifact") carries the result. It renders as an artifact —
 * NEVER a learner bubble, never wrapped in a message container:
 *
 *   research — a quiet "Research complete" one-liner that expands on demand
 *     to the full persisted brief + sources: the brief is
 *     too long to inline by default and the teacher's wake turn weaves it
 *     into the lesson anyway. Failures keep the failure card (the brief
 *     explains what went wrong).
 *   demo / visual — the artifact itself (sandboxed iframe / sanitized SVG).
 *     The sub-agent's verification notes are model-facing glue and do NOT
 *     render; only a failure note does.
 */
export function SubagentSteerCard({ message, figures = "card" }: {
	message: LhViewMessage;
	/** How a demo or figure shows: today's cards, or in the reply's flow
	 *  (inline-figure.tsx), as the reading lessons draw them. */
	figures?: "card" | "inline";
}) {
	const artifactPart = message.parts.find((p) => p.type === "data-subagent-artifact");
	const data = artifactPart?.data as SubagentArtifactData | undefined;
	// The abort steer (2026-09 dock semantics): its message-type part is
	// data-subagent-aborted (the custom-message scheme — the part, not
	// metadata, is the marker) — a quiet chip, mirroring the complete-badge.
	if (!data) {
		const aborted = message.parts.find((p) => p.type === "data-subagent-aborted") as
			| { data?: { kind?: string } }
			| undefined;
		if (aborted?.data) return <AbortedBadge kind={aborted.data.kind} />;
		return (
				<div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
				A sub-agent finished, but its result could not be displayed.
			</div>
		);
	}
	switch (data.kind) {
		case "research":
			return isSubagentFailure("research", data.result as ResearchResult) ? (
				<ResearchBriefCard output={data.result} />
			) : (
				<ResearchCompleteBadge result={data.result as ResearchResult} />
			);
		case "pdf":
			return isSubagentFailure("pdf", data.result as PdfResult) ? (
				<PdfBriefCard output={data.result} />
			) : (
				<PdfCompleteBadge result={data.result as PdfResult} />
			);
		case "demo":
			if (figures === "inline") return <InlineDemo output={data.result} messageId={message.id} initialInverted={data.ui?.inverted} />;
			return <DemoOutputCard output={data.result} messageId={message.id} initialInverted={data.ui?.inverted ?? false} />;
		case "visual":
			if (figures === "inline") return <InlineVisual output={data.result} messageId={message.id} initialInverted={data.ui?.inverted ?? true} />;
			return <VisualOutputCard output={data.result} messageId={message.id} initialInverted={data.ui?.inverted ?? true} />;
	}
}

/** The aborted-job chip: mirrors the complete-badge one-liner — the
 * teacher's wake turn acknowledges the abort in the lesson itself,
 * this just marks what happened. */
function AbortedBadge({ kind }: { kind?: string }) {
	const words = kind && kind in STOPPED_WORDS ? STOPPED_WORDS[kind as keyof typeof STOPPED_WORDS] : STOPPED_WORDS.unknown;
	return (
		<div data-testid="job-aborted-badge" className="flex items-center gap-2 text-row text-muted-foreground">
			<CircleX aria-hidden className="size-4" />
			<span>{words}</span>
		</div>
	);
}

/** Quiet one-liner, the research-badge idiom ported to PDF: the brief is
 * too long to inline by default and the teacher's wake turn weaves it in;
 * the badge marks delivery, the collapsed brief carries the full text
 * + consulted pages. */
function PdfCompleteBadge({ result }: { result: PdfResult }) {
	// The honest count is READ pages (extract/render — sources v1 split);
	// the ?? is runtime tolerance for pre-split persisted steers.
	const readPages = result.pagesRead ?? result.pagesConsulted;
	return (
		<BriefDisclosure testid="pdf-complete-badge" summary={`PDF reading complete${readPages.length > 0 ? ` · read ${readPages.length} page${readPages.length === 1 ? "" : "s"}` : ""}`}>
			<PdfBriefCard output={result} />
		</BriefDisclosure>
	);
}

/** Quiet one-liner, the dispatch-settled idiom — the lesson lives in the
 * teacher's wake turn; the badge just marks delivery. The persisted brief
 * rides along collapsed (the wave-1 "view full research" affordance): full
 * markdown + sources, one click away, no extra fetch — the artifact part
 * in the record is the single source of truth. */
function ResearchCompleteBadge({ result }: { result: ResearchResult }) {
	return (
		<BriefDisclosure testid="research-complete-badge" summary="Research complete">
			<ResearchBriefCard output={result} />
		</BriefDisclosure>
	);
}

/** The complete badge: a quiet line that discloses the brief. */
function BriefDisclosure({ testid, summary, children }: { testid: string; summary: string; children: React.ReactNode }) {
	return (
		<Collapsible data-testid={testid} className="group w-full text-row text-muted-foreground">
			<CollapsibleTrigger className="-mx-1 flex items-center gap-2 rounded-md px-1 text-left outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none">
				<CheckIcon className="size-4" />
				<span>{summary}</span>
				<span className="group-data-[state=open]:hidden">· View brief</span>
				<span className="hidden group-data-[state=open]:inline">· Hide brief</span>
			</CollapsibleTrigger>
			<CollapsibleContent className="mt-2">{children}</CollapsibleContent>
		</Collapsible>
	);
}
