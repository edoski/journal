/**
 * Server-side observability surface — the barrel-approved exports the
 * transport layer (app/api/*) reads for background-process status.
 *
 * THE ACTIVITY FEED (2026-09 observability design): the bottom-right dock is
 * visible in every view, so it needs the complete running-process picture —
 * sub-agent jobs across ALL chats (not just the open one) plus the
 * background runs (lesson digests, course-map builds) — in one poll. The dock is BACKGROUND PROCESSES ONLY
 * (user decision, 2026-09-11): teaching sessions already have their own
 * observability, so in-flight teacher turns are deliberately NOT in the
 * feed. /api/jobs stays chat-scoped untouched: it is the transcript
 * machinery's poll and carries turnInFlight for the re-attach seam
 * (chat-transport); the dock is a different consumer with a different
 * shape, served here. Single sources of truth are unchanged: the job
 * store and the background-run registry — this file only composes them.
 *
 * The runs' side of the dock's controls also surfaces here: abortRuns
 * (true mid-run cancellation) is exported for the abort route to call.
 */

import { backgroundRuns, type RunPhase } from "../agent/subagents/background-runs.ts";
import { chatStore } from "../store/chats.ts";
import { catalogContextLimits } from "./model-catalog.ts";
import { listJobs } from "./jobs.ts";
import { jobCost } from "./pricing.ts";
import type { JobRecord } from "../core/contracts.ts";

export { abortRuns, backgroundRuns, type BackgroundRun, type RunPhase } from "../agent/subagents/background-runs.ts";
export { chatStore } from "../store/chats.ts";

/** A running sub-agent job, joined with its chat's title for the dock.
 *  contextLimit (context-meter amendment, owner 2026-09-23): the model's
 *  live catalog limit, resolved SERVER-SIDE from pi's catalog — the dock
 *  reads it off the feed instead of any client-side table. Null when the
 *  model is missing from the catalog (the blob then renders no context
 *  line — never a fake window). */
export interface ActivityJob extends JobRecord {
	costUsd: number | null;
	title: string;
	contextLimit: number | null;
}

/** One background run (a lesson digest or a course-map build), title
 *  joined, oldest first. id is the registry key; chatId is the key's chat
 *  or course, which the dock's abort sends. The feed keeps the field name
 *  "extractions" the dock reads. */
export interface ActivityExtraction {
	id: string;
	chatId: string;
	title: string;
	phase: RunPhase;
	startedAt: number;
}

/** The dock's whole world in one payload: every running process, every view.
 *  Jobs are RUNNING-ONLY — finished jobs belong to their chat's transcript;
 *  the blob disappears when the process ends. Costs are joined here through
 *  the server-side Pi pricing adapter; clients never reconstruct rates. */
export function activityFeed(): {
	jobs: ActivityJob[];
	extractions: ActivityExtraction[];
} {
	const chats = chatStore.listChats();
	const limits = catalogContextLimits();
	const jobs: ActivityJob[] = [];
	for (const chat of chats) {
		for (const job of listJobs(chat.id)) {
			if (job.status === "running") {
				jobs.push({
					...job,
					costUsd: jobCost(job),
					title: chat.title ?? chat.id,
					contextLimit: job.usage ? (limits.get(job.usage.model) ?? null) : null,
				});
			}
		}
	}
	const extractions: ActivityExtraction[] = backgroundRuns().map((run) => ({
		id: run.id,
		chatId: run.chatId,
		// A map build names itself by its course ("Linear algebra"); a digest
		// takes its lesson's title.
		title: run.label ?? chatStore.getChat(run.chatId)?.title ?? run.chatId,
		phase: run.phase,
		startedAt: run.startedAt,
	}));
	// oldest-first on last activity: the stable blob order (ISO strings sort chronologically)
	jobs.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
	return {
		jobs,
		extractions: extractions.sort((a, b) => a.startedAt - b.startedAt),
	};
}
