"use client";

import { useContext } from "react";
import { CircleSlashIcon, SettingsIcon } from "lucide-react";
import { JobsContext } from "@/components/jobs-context";
import { ChatActionsContext } from "@/components/chat";
import { isProviderKeyRefusal, type JobKind } from "@/src/core";
import { ActivityLine } from "@/components/lesson/activity-line";

/**
 * The dispatch card (contracts.ts "THE ASYNC PROTOCOL" §4): the tool-call
 * box for a background sub-agent. The tool part's output is the FIRE-AND-
 * FORGET ACK (a string) — never the result. Live status comes from the
 * chat-view jobs feed via JobsContext, matched by toolCallId:
 *
 *   unknown or running → one muted activity line
 *   refused            → the setup deep-link (models or a sign-in)
 *   done               → nothing: the artifact itself arrives in the steer
 *                        message right below, so the box must not duplicate it
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

export function DispatchCard({ toolCallId, kind }: { toolCallId: string; kind: JobKind }) {
	const jobs = useContext(JobsContext);
	const job = jobs.find((j) => j.toolCallId === toolCallId) ?? null;
	const label = KIND_LABEL[kind];

	if (!job || job.status === "running") return <ActivityLine testId="dispatch-card" label={KIND_ACTIVITY[kind]} />;
	// A job refused because the Claude account is signed out is INFO, not
	// scary-error — gray glyph + "needs a sign-in" + the deep-link into the
	// SetupDialog (the same flow the send interception uses).
	if (isProviderKeyRefusal(job.error)) {
		return <DispatchRefusedCard label={label} line="needs a sign-in" button="Sign in" />;
	}
	// Delivered: the result arrives in the steer card right below; the
	// lesson marks only a failure.
	if (job.status !== "error") return null;
	return (
		<div className="flex items-center gap-2 text-row text-muted-foreground" data-testid="dispatch-settled">
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
			className="flex items-center gap-2 text-xs text-muted-foreground"
			data-testid="dispatch-refused"
		>
			<SettingsIcon className="size-3.5" />
			<span className="font-medium uppercase tracking-wide">{label}</span>
			<span>{line}</span>
			{ctx && (
				<button
					type="button"
					data-testid="dispatch-setup-link"
					onClick={ctx.openSetup}
					className="ml-1 rounded-sm border border-border bg-card px-2 py-0.5 font-ui normal-case tracking-normal text-foreground transition-colors hover:border-muted-foreground/50"
				>
					{button}
				</button>
			)}
		</div>
	);
}
