"use client";

import { Button } from "@/components/ui/button";
import { useContext } from "react";
import { CircleSlashIcon, SettingsIcon } from "lucide-react";
import { JobsContext } from "@/components/jobs-context";
import { ChatActionsContext } from "@/components/chat";
import { isProviderKeyRefusal, isSubagentFailure, type JobKind, type JobRecord, type PlacedArtifact, type SubagentArtifactData } from "@/src/core";
import { ActivityLine } from "@/components/lesson/activity-line";
import { InlineDemo, InlineVisual } from "@/components/artifacts/inline-figure";

/**
 * The dispatch card (contracts.ts "THE ASYNC PROTOCOL" §4): the tool-call
 * box for a background sub-agent. The tool part's output is the FIRE-AND-
 * FORGET ACK (a string) — never the result. Live status comes from the
 * chat-view jobs feed via JobsContext, matched by toolCallId:
 *
 *   unknown or running → one muted activity line
 *   refused            → the setup deep-link (models or a sign-in)
 *   done, a demo or a figure → the artifact itself, at once: from the
 *                        delivered result the view joined onto the part, else
 *                        from the job, whose delivery may still wait on his
 *                        open question (round 13, 3 N1 and 2 M2)
 *   done, else         → nothing: the result arrives in the steer message
 *   error              → one plain failure line
 */
/** The one muted line while a helper works. */
const KIND_ACTIVITY: Record<JobKind, string> = {
	research: "Checking sources…",
	demo: "Building a demo…",
	visual: "Making a figure…",
	pdf: "Reading the PDF…",
};

/** The one plain line when a helper failed. */
const KIND_FAILED: Record<JobKind, string> = {
	research: "The sources couldn't be checked",
	demo: "The demo couldn't be built",
	visual: "The figure couldn't be made",
	pdf: "The PDF couldn't be read",
};

const KIND_LABEL: Record<JobKind, string> = {
	research: "Research agent",
	demo: "Demo agent",
	visual: "Figure agent",
	pdf: "PDF reader",
};

/** The built demo or figure to draw at the call: the delivered result
 *  first, else the finished job's. Pure. */
export function artifactAtCall(placed: unknown, job: JobRecord | null): PlacedArtifact | null {
	const delivered = placed as PlacedArtifact | undefined;
	if (delivered?.data) return delivered;
	if (!job || job.status !== "done" || !job.result || (job.kind !== "demo" && job.kind !== "visual")) return null;
	const result = job.result as SubagentArtifactData["result"];
	if (isSubagentFailure(job.kind, result)) return null;
	return { messageId: `steer_${job.id}`, data: { kind: job.kind, result } };
}

export function DispatchCard({ toolCallId, kind, artifact }: { toolCallId: string; kind: JobKind; artifact?: unknown }) {
	const jobs = useContext(JobsContext);
	const job = jobs.find((j) => j.toolCallId === toolCallId) ?? null;
	const label = KIND_LABEL[kind];
	const built = artifactAtCall(artifact, job);
	if (built?.data.kind === "demo") return <InlineDemo output={built.data.result} messageId={built.messageId} initialInverted={built.data.ui?.inverted} />;
	if (built?.data.kind === "visual") return <InlineVisual output={built.data.result} messageId={built.messageId} initialInverted={built.data.ui?.inverted ?? true} />;

	if (!job || job.status === "running") return <ActivityLine testId="dispatch-card" label={KIND_ACTIVITY[kind]} />;
	// A job refused because the Claude account is signed out is INFO, not
	// scary-error — gray glyph + "needs a sign-in" + the deep-link into the
	// SetupDialog (the same flow the send interception uses).
	if (isProviderKeyRefusal(job.error)) {
		return <DispatchRefusedCard label={label} line="needs a sign-in" button="Sign in to Claude" />;
	}
	// Delivered: the result arrives in the steer card right below; the
	// lesson marks only a failure.
	if (job.status !== "error") return null;
	return (
		<div className="flex items-center gap-2 text-body text-muted-foreground" data-testid="dispatch-settled">
			<CircleSlashIcon className="size-3.5" />
			<span>{KIND_FAILED[kind]}</span>
		</div>
	);
}

/** The refused card: quiet info tone — nothing red, nothing "failed". */
function DispatchRefusedCard({ label, line, button }: { label: string; line: string; button: string }) {
	const ctx = useContext(ChatActionsContext);
	return (
		<div
			className="flex items-center gap-2 text-subheadline text-muted-foreground"
			data-testid="dispatch-refused"
		>
			<SettingsIcon className="size-3.5" />
			<span className="uppercase tracking-wide">{label}</span>
			<span>{line}</span>
			{ctx && (
				<Button variant="outline" size="xs" data-testid="dispatch-setup-link" onClick={ctx.openSetup} className="ml-1 h-auto px-2 py-0.5 font-ui font-normal normal-case tracking-normal text-foreground">
					{button}
				</Button>
			)}
		</div>
	);
}
