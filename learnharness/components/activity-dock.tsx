"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { BotIcon, FileTextIcon, PenToolIcon, PlayIcon, SearchIcon, SquareIcon, WaypointsIcon } from "lucide-react";
import type { CallUsage, JobKind, JobRecord } from "@/src/core";
import { isProviderKeyRefusal, subscriptionLabel } from "@/src/core";
import { formatTokens, planCostLabel } from "@/components/usage-format";
import { useServerEvent, useServerResync } from "@/components/server-events";
import { NavRow, NavRowLabel, NavRowTrailing } from "@/components/nav/nav-row";
import { NavSection } from "@/components/nav/nav-section";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";

/**
 * THE BACKGROUND-AGENTS SECTION (owner, sidebar round — the successor of
 * the retired bottom-right floating dock): the bottom strip of the LEFT
 * SIDEBAR, one blob per running BACKGROUND process — session sub-agents
 * (research/demo/visual) and global extraction runs. Teaching turns are
 * deliberately NOT here: the section exists to give background processes
 * the observability the learner can't otherwise see; an in-flight teaching
 * turn is fully visible where it happens (user decision, 2026-09).
 *
 * Data: ONE feed of GET /api/activity (jobs across ALL chats, title-joined,
 * oldest-first + extraction runs), fetched when truth moves (events
 * channel, S5) and folded client-side with core/prices.ts.
 * Cost is INFERRED server-side through Pi; the context line is the LAST model call's
 * input+output against the model's limit (JobUsage.lastStep — pending
 * contract) — never a cumulative sum, which would be the wrong number.
 * Absent data renders "—", never zero (the doctrine).
 *
 * Quiet/ambient by design: no entry animations, stable keys, updates land
 * in place — refreshes never flicker. ALWAYS present (owner, sidebar round):
 * empty means EMPTY — the header sits alone, nothing hides; it populates and
 * GROWS when processes run (max-h + internal scroll so a pile never crowds
 * the session list). The sidebar's closed state means the learner opted
 * out — no ambient signal while closed (user decision: invisibility until
 * a clearer observability story wants building). Per blob: kind icon,
 * the session it works for, elapsed, an explicit END button (POST
 * /api/activity/abort — the wave-4 backend is live): 404/409 mean the
 * process is already gone (refresh, no error); real failures degrade to
 * an inline "Abort failed", never a dead control. Detail (context, model,
 * steps, session link) EXPANDS INLINE — the section scrolls, so a
 * floating popover would clip at its bounds.
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

export interface FeedExtraction {
	/** Unique row id (source id, or "src#i" for chunk jobs). */
	id: string;
	chatId: string;
	part?: { i: number; n: number };
	title: string;
	phase: string;
	startedAt: number;
}

export interface ActivityFeed {
	jobs: FeedJob[];
	extractions: FeedExtraction[];
}

const EMPTY_FEED: ActivityFeed = { jobs: [], extractions: [] };

// ─── The activity feed (composition root: the root layout) ───────────────────

const ActivityContext = createContext<{ feed: ActivityFeed; refresh: () => void }>({
	feed: EMPTY_FEED,
	refresh: () => {},
});

/**
 * THE ACTIVITY FEED, PUSH-DRIVEN (architecture S5, 2026-10-02): the
 * adaptive poll is RETIRED — the dock refetches exactly when truth moves.
 * Every cause is announced on the events channel: extraction phase
 * transitions (activity-changed), job writes
 * (jobs-changed — the running-jobs blobs), and channel resync (reconnect /
 * dev-restart catch-up) — plus the one client-local cause that predates
 * the channel: visibility, a tab becoming visible refetches at once.
 * Announced fetches ride a 250ms trailing debounce (extraction phase
 * bursts); resync and visibility are immediate. A failed
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
						setFeed({ jobs: data.jobs ?? [], extractions: data.extractions ?? [] });
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
 *  its refresh nudge. The remaining nudgers are client-visible causes
 *  (the extract button — extraction-coverage); every
 *  server-side cause announces itself on the events channel now. */
export function useActivity(): { feed: ActivityFeed; refresh: () => void } {
	return useContext(ActivityContext);
}

// ─── Pure presentation helpers (exported for tests) ──────────────────────────

/** One dock blob: the unified view of a job or an extraction run. */
export interface ActivityBlob {
	/** job.id, or the extraction job's row id (source id, or "src#i" for
	 *  chunk jobs — unique per row, per-chunk jobs owner 2026-09-28). */
	id: string;
	process: "job" | "extraction";
	/** Sub-agent kind for jobs (extraction blobs have none). */
	jobKind?: JobKind;
	/** Extraction phase (extracting/auditing/merging/embedding); jobs carry none. */
	phase?: string;
	title: string;
	chatId: string;
	/** ms epoch — blobs order oldest-first and elapsed counts from it. */
	startedAt: number;
	/** Inferred USD cost (jobCost) — null renders "—". */
	cost: number | null;
	/** Last model call's footprint vs the model's limit — null renders "—". */
	context: { used: number; limit: number } | null;
	/** Latest human-readable activity line (""). */
	activity: string;
	/** Sub-agent model id, when usage is reported. */
	model?: string;
	/** Model calls made so far, when usage is reported. */
	steps?: number;
}

/** Merge the feed into one oldest-first blob list (the stable blob order). */
export function toBlobs(feed: ActivityFeed): ActivityBlob[] {
	const blobs: ActivityBlob[] = feed.jobs.map((job) => {
		const usage = job.usage;
		let context: ActivityBlob["context"] = null;
		const lastStep = usage?.lastStep;
		// Context-meter amendment (owner 2026-09-23): the limit comes off
		// the FEED (server-joined from pi's live catalog) — no client-side
		// table. Null limit = no context line (usage-only render is the
		// blob shape's call — here the line simply hides).
		const limit = job.contextLimit;
		if (usage && lastStep && limit !== null && lastStep.inputTokens !== undefined) {
			// Same metric as the session meter (four normalized buckets — the
			// context-meter audit, owner 2026-09-23): all four directions.
			// Provider "input" EXCLUDES cacheRead/cacheWrite, so input+output
			// alone reads wildly low on cache-heavy jobs.
			context = {
				used:
					lastStep.inputTokens +
					(lastStep.outputTokens ?? 0) +
					(lastStep.cacheReadTokens ?? 0) +
					(lastStep.cacheWriteTokens ?? 0),
				limit,
			};
		}
		return {
			id: job.id,
			process: "job",
			jobKind: job.kind,
			title: job.title,
			chatId: job.chatId,
			startedAt: Date.parse(job.createdAt) || 0,
			cost: job.costUsd ?? null,
			context,
			// A refusal is info, not failure: a job refused because the
			// Claude account is signed out reads as a sign-in being needed,
			// matching the dispatch card's quiet tone.
			activity: isProviderKeyRefusal(job.error) ? "needs a sign-in" : (job.activity ?? ""),
			model: usage?.model,
			steps: usage?.steps,
		};
	});
	for (const run of feed.extractions) {
		blobs.push({
			id: run.id,
			process: "extraction",
			phase: run.phase,
			title: run.title,
			chatId: run.chatId,
			startedAt: run.startedAt,
			cost: null, // extraction runs don't ride the money channel (v1)
			context: null,
			activity: "",
		});
	}
	blobs.sort((a, b) => a.startedAt - b.startedAt);
	return blobs;
}

/** Elapsed as a compact ticking string: 45s / 3m 04s / 1h 12m. */
export function formatElapsed(ms: number): string {
	const s = Math.max(0, Math.floor(ms / 1000));
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
	return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

// ─── The section (the sidebar's bottom strip) ─────────────────────────────────

/** A 1s heartbeat while the section is populated — elapsed lines tick. */
function useNow(active: boolean): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (!active) return;
		const t = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(t);
	}, [active]);
	return now;
}

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
	const now = useNow(blobs.length > 0);
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
					// Extractions abort by SOURCE id (chatId) — chunk rows share one
					// source and die together.
					id: blob.process === "extraction" ? blob.chatId : blob.id,
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
	// Cost and context live in the detail, not on the row's face.
	return (
		<NavSection data-testid="activity-section" title="Background agents" className="shrink-0 px-2 pt-2">
			<div className="flex max-h-[40dvh] flex-col overflow-y-auto">
				{blobs.map((blob) => (
					<ActivityRow
						key={blob.id}
						blob={blob}
						now={now}
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

/** A run of the shared background registry in words: a finished lesson's
 *  digest, a course's map being built from its material, or the graph
 *  extraction's phase. */
function extractionLabel(phase: string | undefined): string {
	if (phase === "digesting") return "Digesting lesson";
	if (phase === "mapping") return "Building the course map";
	return `Extraction — ${phase ?? "running"}`;
}

/** What a blob is, in words: "Researcher", "Extraction — merging". */
function blobLabel(blob: ActivityBlob): string {
	if (blob.process === "extraction") return extractionLabel(blob.phase);
	switch (blob.jobKind) {
		case "research":
			return "Researcher";
		case "demo":
			return "Demo builder";
		case "visual":
			return "Figure maker";
		case "pdf":
			return "PDF reader";
		default:
			return "Sub-agent";
	}
}

/** One process as a sidebar row: kind icon, what it is doing and the
 *  session it works for, elapsed time, and a stop button at the right
 *  edge; a click opens its detail (what it is doing, cost, context,
 *  model, steps, the session link) under the row. */
function ActivityRow({
	blob,
	now,
	detailOpen,
	onToggleDetail,
	abortState,
	onAbort,
}: {
	blob: ActivityBlob;
	now: number;
	detailOpen: boolean;
	onToggleDetail: () => void;
	abortState: AbortState | undefined;
	onAbort: () => void;
}) {
	const Icon = blob.process === "extraction" ? WaypointsIcon : (blob.jobKind && KIND_ICON[blob.jobKind]) || BotIcon;
	const label = blobLabel(blob);
	const elapsed = formatElapsed(now - blob.startedAt);
	return (
		<div data-testid={`activity-blob-${blob.process}`} className="relative">
			<NavRow aria-expanded={detailOpen} onClick={onToggleDetail} highlighted={detailOpen} className="pr-9">
				<Icon />
				<NavRowLabel>{`${label} · ${blob.title}`}</NavRowLabel>
				<NavRowTrailing data-testid="activity-blob-elapsed">{elapsed}</NavRowTrailing>
			</NavRow>
			<Hint label={abortState === "failed" ? "Abort failed — try again" : "Stop"} side="right">
				<Button
					variant="quiet"
					size="icon-inline"
					data-testid="activity-abort"
					onClick={onAbort}
					disabled={abortState !== undefined}
					aria-label={`End ${label} in ${blob.title}`}
					className="absolute right-1 top-1 hover:text-danger"
				>
					<SquareIcon />
				</Button>
			</Hint>
			{detailOpen && (
				<dl
					data-testid="activity-blob-detail"
					className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 pb-2 pl-8 pr-2 pt-1 text-label text-muted-foreground"
				>
					<dt className="col-span-2 text-foreground">{label}</dt>
					{blob.activity && <dd className="col-span-2 break-words">{blob.activity}</dd>}
					<dt>Cost</dt>
					<dd data-testid="activity-blob-cost" className="text-right tabular-nums text-foreground">
						{planCostLabel(blob.cost, subscriptionLabel(blob.model))}
					</dd>
					<dt>Context</dt>
					<dd data-testid="activity-blob-context" className="text-right tabular-nums text-foreground">
						{blob.context === null ? "—" : `${formatTokens(blob.context.used)} / ${formatTokens(blob.context.limit)}`}
					</dd>
					{blob.model && (
						<>
							<dt>Model</dt>
							<dd className="truncate text-right text-foreground">{blob.model}</dd>
						</>
					)}
					{blob.steps !== undefined && (
						<>
							<dt>Steps</dt>
							<dd className="text-right tabular-nums text-foreground">{blob.steps}</dd>
						</>
					)}
					<dd className="col-span-2">
						<a href={`/chat/${blob.chatId}`} className="text-link underline-offset-2 hover:underline">
							Open session
						</a>
					</dd>
					{abortState && (
						<dd className="col-span-2">{abortState === "failed" ? "Abort failed — try again" : "Stopping…"}</dd>
					)}
				</dl>
			)}
		</div>
	);
}
