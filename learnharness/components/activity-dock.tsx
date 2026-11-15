"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRightIcon, BotIcon, CircleStopIcon, FileTextIcon, PenToolIcon, PlayIcon, SearchIcon, WaypointsIcon } from "lucide-react";
import type { CallUsage, JobKind, JobRecord } from "@/src/core";
import { isProviderKeyRefusal } from "@/src/core";
import { courseHref } from "@/components/unit-inbox/unit-href";
import { useServerEvent, useServerResync } from "@/components/server-events";
import { NavRow } from "@/components/nav/nav-row";
import { BACKGROUND_WORDS, backgroundWorkWords } from "@/components/study-words";
import { NavSection } from "@/components/nav/nav-section";
import { Button } from "@/components/ui/button";
import { MathText, mathPlain } from "@/components/ui/math-text";

/**
 * THE BACKGROUND-AGENTS SECTION (owner, sidebar round — the successor of
 * the retired bottom-right floating dock): the bottom strip of the LEFT
 * SIDEBAR, one blob per running BACKGROUND process — session sub-agents
 * (research/demo/visual) and the background runs (lesson digests,
 * course-map builds). Teaching turns are
 * deliberately NOT here: the section exists to give background processes
 * the observability the learner can't otherwise see; an in-flight teaching
 * turn is fully visible where it happens (user decision, 2026-09).
 *
 * Data: ONE feed of GET /api/activity (jobs across ALL chats, title-joined,
 * oldest-first + background runs), fetched when truth moves (events
 * channel, S5). The dock speaks plain words only: what a process is
 * doing and what it works for, in full; no timer, cost, tokens, model or
 * step counts (round 3: "0s" and "Running for 0s" were counts).
 *
 * Quiet/ambient by design: no entry animations, stable keys, updates land
 * in place — refreshes never flicker. ALWAYS present (owner, sidebar round):
 * empty means EMPTY — the header sits alone, nothing hides; it populates and
 * GROWS when processes run (max-h + internal scroll so a pile never crowds
 * the session list). The sidebar's closed state means the learner opted
 * out — no ambient signal while closed (user decision: invisibility until
 * a clearer observability story wants building). Per blob: kind icon,
 * what it does for which lesson or course, an explicit END button (POST
 * /api/activity/abort — the wave-4 backend is live): 404/409 mean the
 * process is already gone (refresh, no error); real failures read
 * "Couldn't stop" on the button, which stays pressable: never a dead control. Detail (what it is
 * doing, a link to its lesson or course) EXPANDS INLINE —
 * the section scrolls, so a floating popover would clip at its bounds.
 */

// ─── Wire shapes (client-safe mirrors of server/observability.ts) ────────────

/** JobUsage extended by the pending lastStep contract (the context line). */
interface FeedUsage extends NonNullable<JobRecord["usage"]> {
	lastStep?: CallUsage;
}

export interface FeedJob extends JobRecord {
	/** Read-time server estimate; absent on older transport payloads. */
	costUsd?: number | null;
	title: string;
	usage?: FeedUsage;
	/** Server-joined live catalog limit (owner amendment 2026-09-23) —
	 *  null when the model is missing from pi's catalog (no context line). */
	contextLimit: number | null;
}

/** A background run: a lesson digest or a course-map build. */
export interface FeedRun {
	/** Unique row id (the registry key). */
	id: string;
	chatId: string;
	title: string;
	phase: string;
	startedAt: number;
}

export interface ActivityFeed {
	jobs: FeedJob[];
	runs: FeedRun[];
}

const EMPTY_FEED: ActivityFeed = { jobs: [], runs: [] };

// ─── The activity feed (composition root: the root layout) ───────────────────

const ActivityContext = createContext<{ feed: ActivityFeed; refresh: () => void }>({
	feed: EMPTY_FEED,
	refresh: () => {},
});

/**
 * THE ACTIVITY FEED, PUSH-DRIVEN (architecture S5, 2026-10-02): the
 * adaptive poll is RETIRED — the dock refetches exactly when truth moves.
 * Every cause is announced on the events channel: background-run
 * transitions (activity-changed), job writes
 * (jobs-changed — the running-jobs blobs), and channel resync (reconnect /
 * dev-restart catch-up) — plus the one client-local cause that predates
 * the channel: visibility, a tab becoming visible refetches at once.
 * Announced fetches ride a 250ms trailing debounce (event bursts); resync and visibility are immediate. A failed
 * fetch keeps the last feed (the dock never flickers to empty on a blip).
 */
export function ActivityProvider({ children }: { children: React.ReactNode }) {
	const [feed, setFeed] = useState<ActivityFeed>(EMPTY_FEED);
	const [nonce, setNonce] = useState(0);
	const refresh = useCallback(() => setNonce((n) => n + 1), []);
	const refreshRef = useRef(refresh);
	refreshRef.current = refresh;
	const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	useEffect(() => {
		let alive = true;
		void (async () => {
			try {
				const res = await fetch("/api/activity");
				if (res.ok) {
					const data = (await res.json()) as Partial<ActivityFeed>;
					if (alive)
						setFeed({ jobs: data.jobs ?? [], runs: data.runs ?? [] });
				}
			} catch {
				// transport blip: keep the last feed, announce again next event
			}
		})();
		return () => {
			alive = false;
		};
	}, [nonce]);

	// Announcements → one trailing fetch per burst (the S4 debounce law).
	const scheduleAnnouncedFetch = () => {
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => {
			debounceRef.current = undefined;
			refreshRef.current();
		}, 250);
	};
	useServerEvent("activity-changed", scheduleAnnouncedFetch);
	useServerEvent("jobs-changed", scheduleAnnouncedFetch);
	// Reconnect catch-up: events missed while the channel was down.
	useServerResync(() => refreshRef.current());

	// The visibility nudge: returning to the tab refetches immediately —
	// anything missed while hidden lands at once.
	useEffect(() => {
		const onVisibility = () => {
			if (document.visibilityState === "visible") setNonce((n) => n + 1);
		};
		document.addEventListener("visibilitychange", onVisibility);
		return () => document.removeEventListener("visibilitychange", onVisibility);
	}, []);

	// The debounce timer never outlives the provider.
	useEffect(
		() => () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		},
		[],
	);

	return <ActivityContext.Provider value={{ feed, refresh }}>{children}</ActivityContext.Provider>;
}

/** The activity feed seam for the rest of the shell: the dock's data +
 *  its refresh nudge. Every server-side cause announces itself on the
 *  events channel. */
export function useActivity(): { feed: ActivityFeed; refresh: () => void } {
	return useContext(ActivityContext);
}

// ─── Pure presentation helpers (exported for tests) ──────────────────────────

/** One dock blob: the unified view of a job or a background run (process
 *  "run", the feed's `runs` and the abort route's kind). */
export interface ActivityBlob {
	/** job.id, or the background run's registry key. */
	id: string;
	process: "job" | "run";
	/** Sub-agent kind for jobs (background runs have none). */
	jobKind?: JobKind;
	/** A background run's phase (digesting, mapping, grouping); jobs carry none. */
	phase?: string;
	title: string;
	chatId: string;
	/** ms epoch — blobs order oldest-first. */
	startedAt: number;
	/** Latest human-readable activity line (""). */
	activity: string;
}

/** What a background run is doing, in its detail line. */
const RUN_ACTIVITY: Record<string, string> = {
	digesting: "Writing down what you learned in this lesson",
	mapping: "Reading the course's material to build its topic map",
	grouping: "Settling what each topic builds on, then grouping the topics into arcs from the material's chapters",
};

/** Whether a background run shows under Background work: a course-map
 *  build does, since he waits on it and may stop it; saving what a closed
 *  lesson taught does not, since it is the close finishing its own work and
 *  stopping it would lose what he learned (round 8: a "Saving what you
 *  learned… Stop" row after every close). */
export function runShows(run: Pick<FeedRun, "phase">): boolean {
	return run.phase !== "digesting";
}

/** Merge the feed into one oldest-first blob list (the stable blob order),
 *  leaving out the runs that do not show (`runShows`). */
export function toBlobs(feed: ActivityFeed): ActivityBlob[] {
	const blobs: ActivityBlob[] = feed.jobs.map((job) => ({
		id: job.id,
		process: "job",
		jobKind: job.kind,
		title: job.title,
		chatId: job.chatId,
		startedAt: Date.parse(job.createdAt) || 0,
		// A refusal is info, not failure: a job refused because the Claude
		// account is signed out reads as a sign-in being needed, matching
		// the dispatch card's quiet tone.
		activity: isProviderKeyRefusal(job.error) ? "needs a sign-in" : (job.activity ?? ""),
	}));
	for (const run of feed.runs.filter(runShows)) {
		blobs.push({
			id: run.id,
			process: "run",
			phase: run.phase,
			title: run.title,
			chatId: run.chatId,
			startedAt: run.startedAt,
			activity: RUN_ACTIVITY[run.phase] ?? RUN_ACTIVITY.digesting!,
		});
	}
	blobs.sort((a, b) => a.startedAt - b.startedAt);
	return blobs;
}

// ─── The section (the sidebar's bottom strip) ─────────────────────────────────

const KIND_ICON: Record<JobKind, typeof SearchIcon> = {
	research: SearchIcon,
	demo: PlayIcon,
	visual: PenToolIcon,
	pdf: FileTextIcon, // sources v0 — type-forced entry (JobKind grew "pdf")
};

/** Abort states per blob id: pending (fired) / failed (backend absent). */
type AbortState = "pending" | "failed";

export function ActivitySection({ feed: feedProp }: { feed?: ActivityFeed }) {
	const ctx = useContext(ActivityContext);
	const feed = feedProp ?? ctx.feed;
	const refresh = ctx.refresh;
	const blobs = useMemo(() => toBlobs(feed), [feed]);
	const [openBlob, setOpenBlob] = useState<string | null>(null); // detail, inline-expanded
	const [abortStates, setAbortStates] = useState<Record<string, AbortState>>({});
	// Refs for stable abort handlers (no re-created closures per tick).
	const abortRef = useRef({ blobs, refresh, setAbortStates });
	abortRef.current = { blobs, refresh, setAbortStates };

	const abort = useCallback(async (blob: ActivityBlob) => {
		const { setAbortStates: set } = abortRef.current;
		set((s) => ({ ...s, [blob.id]: "pending" }));
		try {
			const res = await fetch("/api/activity/abort", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					kind: blob.process,
					// A background run aborts by its chatId (the registry key's chat or course).
					id: blob.process === "run" ? blob.chatId : blob.id,
				}),
			});
			if (!res.ok) {
				// 404 not_found / 409 not_running: the process is already gone —
				// the desired end state. Refresh and clear; nothing to report.
				if (res.status === 404 || res.status === 409) {
					abortRef.current.refresh();
					set((s) => {
						const { [blob.id]: _drop, ...rest } = s;
						return rest;
					});
					return;
				}
				throw new Error(String(res.status));
			}
			abortRef.current.refresh();
		} catch {
			set((s) => ({ ...s, [blob.id]: "failed" }));
		}
	}, []);

	// The sidebar's own anatomy (nav-section.md, nav-row.md): a quiet
	// header and one 32px row per process, its detail opening under it.
	return (
		<NavSection data-testid="activity-section" title={BACKGROUND_WORDS.name} className="shrink-0 px-2 pt-2">
			<div className="flex max-h-[40dvh] flex-col overflow-y-auto">
				{blobs.map((blob) => (
					<ActivityRow
						key={blob.id}
						blob={blob}
						detailOpen={openBlob === blob.id}
						onToggleDetail={() => setOpenBlob((id) => (id === blob.id ? null : blob.id))}
						abortState={abortStates[blob.id]}
						onAbort={() => void abort(blob)}
					/>
				))}
			</div>
		</NavSection>
	);
}

/** What a blob does, for which lesson or course, in full
 *  (`backgroundWorkWords`): "Drawing a figure for Eigenvalues", "Building
 *  the topic map of Graph Theory". */
function blobWords(blob: ActivityBlob): string {
	if (blob.process === "run") return backgroundWorkWords(blob.phase === "mapping" || blob.phase === "grouping" ? blob.phase : "digest", blob.title);
	return backgroundWorkWords(blob.jobKind ?? "unknown", blob.title);
}

/** Where a process's detail links: a course-map build to its course's
 *  page (its key is the course), anything else to its lesson. */
function openTarget(blob: ActivityBlob): { href: string; words: string } {
	if (blob.process === "run" && (blob.phase === "mapping" || blob.phase === "grouping")) return { href: courseHref(blob.chatId), words: "Open the course" };
	return { href: `/chat/${blob.chatId}`, words: "Open the lesson" };
}

/** What the stop button says: an icon with a word, as the app's other
 *  controls do (round 4: a bare square read as nothing). */
const STOP_WORDS: Record<AbortState | "idle", string> = { idle: "Stop", pending: "Stopping…", failed: "Couldn't stop" };

/** Whether he may stop it: anything but the save of what a lesson taught
 *  him, which keeps his record whole and is over in moments (round 8: a
 *  Stop beside it invited losing what he learned). */
function stoppable(blob: ActivityBlob): boolean {
	return !(blob.process === "run" && blob.phase !== "mapping" && blob.phase !== "grouping");
}

/** One process as a sidebar row: kind icon, what it does for which
 *  lesson or course in full (the words wrap, never cut, its TeX typeset),
 *  and Stop at the right edge; a click opens its detail (what it is doing,
 *  the app's quiet arrow link to its lesson or course) under the row. */
function ActivityRow({
	blob,
	detailOpen,
	onToggleDetail,
	abortState,
	onAbort,
}: {
	blob: ActivityBlob;
	detailOpen: boolean;
	onToggleDetail: () => void;
	abortState: AbortState | undefined;
	onAbort: () => void;
}) {
	const Icon = blob.process === "run" ? WaypointsIcon : (blob.jobKind && KIND_ICON[blob.jobKind]) || BotIcon;
	const words = blobWords(blob);
	const target = openTarget(blob);
	return (
		<div data-testid={`activity-blob-${blob.process}`} className="relative">
			<NavRow aria-expanded={detailOpen} onClick={onToggleDetail} highlighted={detailOpen} className={`h-auto min-h-8 items-start py-1.5 [&>svg]:mt-0.5 ${stoppable(blob) ? "pr-16" : "pr-2"}`}>
				<Icon />
				<span data-slot="nav-row-label" data-testid="activity-blob-label" className="min-w-0 flex-1 text-pretty break-words">
					<MathText>{words}</MathText>
				</span>
			</NavRow>
			{stoppable(blob) && (<Button
				variant="quiet"
				size="xs"
				data-testid="activity-abort"
				onClick={onAbort}
				disabled={abortState === "pending"}
				aria-label={`Stop: ${mathPlain(words)}`}
				className="absolute right-1 top-1 font-normal hover:text-danger"
			>
				<CircleStopIcon aria-hidden />
				{STOP_WORDS[abortState ?? "idle"]}
			</Button>)}
			{detailOpen && (
				<div data-testid="activity-blob-detail" className="flex flex-col gap-1 pb-2 pl-8 pr-2 pt-1 text-label text-muted-foreground">
					{blob.activity && <p className="break-words text-foreground">{blob.activity}</p>}
					<Button variant="quiet" size="xs" asChild className="-ml-1.5 w-fit font-normal">
						<Link href={target.href}>
							{target.words}
							<ArrowRightIcon aria-hidden />
						</Link>
					</Button>
				</div>
			)}
		</div>
	);
}
