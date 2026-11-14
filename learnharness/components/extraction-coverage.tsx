"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useActivity } from "@/components/activity-dock";
import { useServerEvent } from "@/components/server-events";
import { formatTokens } from "@/components/usage-format";
import { Hint } from "@/components/ui/hint";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { timeAgo } from "@/components/time-ago";
import { EXTRACTION_CHUNK_TOKENS } from "@/src/core";

/**
 * The extraction-coverage surfaces (extraction-UX redesign, owner-locked
 * dispatch 2026-09-24): the ring meter in the chat top bar and the coverage
 * item in the session menu (unit-inbox/coverage-menu-item.tsx) — the two replacements for
 * the graph view's coverage panel (components/graph-coverage.tsx, retired
 * with this wave). Coverage is the SAME derivation, scoped to one session:
 * GET /api/chats/[id] now carries `coverage` (Platform's eed4b4e).
 *
 * The ring fills with uncoveredTokens / EXTRACTION_CHUNK_TOKENS — the
 * number the extraction trigger waits for: the meter is "how close this
 * session is to firing its next extraction run". It DRAINS as a run folds
 * (coverage re-derives per request) and pulses while a run is in flight.
 *
 * The manual affordance stays POST /api/graph/coverage/extract {chatId}
 * (409 = already running, BENIGN — the trigger raced us; the dock's
 * start-site nudge seam refreshes either way).
 */

/** Client-safe mirror of the server's SessionCoverage (src/server/chats.ts
 *  — the GET /api/chats/[id] `coverage` block). */
export interface SessionCoverage {
	totalMessages: number;
	coveredCount: number;
	uncoveredCount: number;
	coveredTokens: number;
	uncoveredTokens: number;
	running: boolean;
	lastFoldedAt: string | null;
}

/** One session's coverage read — null on transport/404 (callers render
 *  nothing rather than a fake zero; the honest-render doctrine). */
async function fetchCoverage(chatId: string): Promise<SessionCoverage | null> {
	try {
		const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}`);
		if (!res.ok) return null;
		const body = (await res.json()) as { coverage?: SessionCoverage | null };
		return body.coverage ?? null;
	} catch {
		return null;
	}
}

/** The manual-extract seam, shared by both surfaces. 409 is BENIGN (the
 *  run is already in flight) — returns "running" so the caller flips to the
 *  optimistic/running state instead of an error. Returns false only on a
 *  real failure, where the caller reverts. */
async function requestExtract(chatId: string): Promise<boolean> {
	try {
		const res = await fetch("/api/graph/coverage/extract", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ chatId }),
		});
		if (!res.ok && res.status !== 409) return false;
		return true; // 202 started, or 409 already-running — both "running"
	} catch {
		return false;
	}
}

// ─── The session menu's coverage item ──────────────────────────────────────

/** One session's coverage while its menu is open, and the manual Extract:
 *  the menu item's data. `coverage` stays null until the first read lands,
 *  and when it fails (the item then renders nothing — no fake zeros). */
export function useSessionCoverage(chatId: string): {
	coverage: SessionCoverage | null;
	extracting: boolean;
	extract: () => void;
} {
	const refreshActivity = useActivity().refresh;
	const [coverage, setCoverage] = useState<SessionCoverage | null>(null);
	const [extracting, setExtracting] = useState(false); // optimistic until the server says running
	const lastUncoveredRef = useRef<number | null>(null);

	const load = useCallback(async () => {
		const next = await fetchCoverage(chatId);
		if (next === null) return;
		// The optimistic state stands down once the server says running, or
		// once the fold moved coverage (the run finished).
		if (
			next.running ||
			(lastUncoveredRef.current !== null && next.uncoveredTokens !== lastUncoveredRef.current)
		) {
			setExtracting(false);
		}
		lastUncoveredRef.current = next.uncoveredTokens;
		setCoverage(next);
	}, [chatId]);

	// On MENU OPEN (the item mounts with the menu — on-demand, never
	// eagerly): one read, then one per merged batch and per run change.
	useEffect(() => {
		lastUncoveredRef.current = null;
		setExtracting(false);
		void load();
	}, [load]);

	// While a run is in flight the numbers settle live: each merged batch
	// announces coverage-changed, and the run ending announces
	// activity-changed.
	useServerEvent("coverage-changed", (p) => p.chatId === chatId && void load());
	useServerEvent("activity-changed", () => (coverage?.running === true || extracting) && void load());

	const onExtract = async () => {
		setExtracting(true);
		// The dock's start-site nudge (the 202 registers the run before the
		// response; a 409 means one is already in flight) — refresh so the
		// run surfaces at once either way.
		refreshActivity();
		const started = await requestExtract(chatId);
		if (!started) setExtracting(false);
		void load();
	};
	return { coverage, extracting, extract: () => void onExtract() };
}

/** The session menu's one coverage item: its label,
 *  the backlog as its detail while there is one, and whether Extract can
 *  run. Pure. */
export function coverageItem(
	coverage: SessionCoverage,
	extracting: boolean,
): { label: string; detail: string | null; running: boolean; disabled: boolean } {
	const running = coverage.running || extracting;
	const complete = coverage.uncoveredTokens === 0 && coverage.uncoveredCount === 0;
	return {
		label: running ? "Extracting notes…" : complete ? "Notes fully extracted" : "Extract notes",
		detail:
			running || complete
				? null
				: `${formatTokens(coverage.uncoveredTokens)} tok · ${coverage.uncoveredCount} message${coverage.uncoveredCount === 1 ? "" : "s"}`,
		running,
		disabled: running || complete,
	};
}

// ─── The chat top bar's ring meter ──────────────────────────────────────────

/** The donut's geometry (pure, exported for tests): the fill fraction
 *  uncovered/chunk, clamped to [0,1] — at 1 the next run fires. */
export function ringFill(uncoveredTokens: number, chunkTokens: number): number {
	if (!(chunkTokens > 0)) return 0;
	return Math.min(1, Math.max(0, uncoveredTokens / chunkTokens));
}

/**
 * The ring meter (owner-locked: "a donut next to the phase label"): how
 * close this session is to its next extraction run. Click → the exact
 * numbers (covered/uncovered tokens, messages, the threshold, the last
 * fold). Vanishes entirely while the graph is disabled or before the
 * first successful read. While a run is in flight the ring PULSES (the
 * implementer's visual call per the dispatch — motion is the honest
 * state signal in this app's quiet register; no new chrome).
 *
 * Refresh chains: mount + `refreshKey` (the chat view bumps it at turn
 * settle, riding the existing refetch chains) + each merged batch's
 * coverage-changed (the ring drains as the fold lands) + the settings signal (the
 * threshold/kill-switch re-read live).
 */
export function CoverageRing({ chatId, refreshKey = 0 }: {
	chatId: string;
	refreshKey?: number;
}) {
	const [coverage, setCoverage] = useState<SessionCoverage | null>(null);

	// The activity/refresh chain (the dispatch's seam): runs can fire from
	// OTHER surfaces (the sidebar menu's Extract, the turn pipeline, another
	// tab) — no turn-settle bump announces those to this page. The dock's
	// feed knows; a run for THIS session appearing or settling in it
	// re-reads coverage (same runs-empty-transition the graph view rides).
	const feed = useActivity().feed;
	const runHere = feed.extractions.some((run) => run.chatId === chatId);

	useEffect(() => {
		let alive = true;
		void fetchCoverage(chatId).then((c) => alive && setCoverage(c));
		return () => {
			alive = false;
		};
	}, [chatId, refreshKey, runHere]);

	// While a run is in flight the ring DRAINS batch by batch: each merged
	// batch announces coverage-changed for its chat. The run settling at
	// zero rides `runHere` above.
	useServerEvent("coverage-changed", (p) => {
		if (p.chatId !== chatId) return;
		void fetchCoverage(chatId).then((c) => {
			if (c !== null) setCoverage(c);
		});
	});

	// Nothing before the first honest read (no fake zeros — the doctrine).
	if (coverage === null) return null;

	const fill = ringFill(coverage.uncoveredTokens, EXTRACTION_CHUNK_TOKENS);
	return (
		<Popover>
			<Hint label="How much of this session isn't mapped yet" side="bottom">
				<PopoverTrigger asChild>
					<button
						type="button"
						data-testid="coverage-ring"
						className="relative flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
					>
						<CoverageRingGlyph fill={fill} running={coverage.running} />
					</button>
				</PopoverTrigger>
			</Hint>
			<PopoverContent align="end" data-testid="coverage-ring-popover" className="w-64 p-3">
				<CoverageRingDetail coverage={coverage} chunkTokens={EXTRACTION_CHUNK_TOKENS} />
			</PopoverContent>
		</Popover>
	);
}

/** The donut itself (exported for static-render tests): a hairline track
 *  plus the fill arc — uncovered/chunk of the circumference, starting at
 *  12 o'clock. The whole ring pulses while a run is in flight. */
export function CoverageRingGlyph({ fill, running }: { fill: number; running: boolean }) {
	const C = 2 * Math.PI * 6; // r=6 in the 16px viewBox
	return (
		<svg
			viewBox="0 0 16 16"
			className={running ? "size-full animate-pulse" : "size-full"}
			aria-hidden="true"
		>
			<circle cx="8" cy="8" r="6" fill="none" strokeWidth="2.5" className="stroke-border" />
			<circle
				cx="8"
				cy="8"
				r="6"
				fill="none"
				strokeWidth="2.5"
				className="stroke-foreground/70"
				strokeDasharray={`${fill * C} ${C}`}
				strokeLinecap="round"
				transform="rotate(-90 8 8)"
			/>
		</svg>
	);
}

/** The popover body (exported for static-render tests): the exact numbers —
 *  covered/uncovered tokens, message coverage, the threshold, the last
 *  fold's age. */
export function CoverageRingDetail({ coverage, chunkTokens }: {
	coverage: SessionCoverage;
	chunkTokens: number;
}) {
	return (
		<>
			<PopoverTitle className="mb-2">Extraction coverage</PopoverTitle>
			<div className="flex flex-col gap-1 text-row text-muted-foreground">
				<div className="flex justify-between gap-2">
					<span>Uncovered</span>
					<span className="tabular-nums text-card-foreground">
						{formatTokens(coverage.uncoveredTokens)} tokens
					</span>
				</div>
				<div className="flex justify-between gap-2">
					<span>Covered</span>
					<span className="tabular-nums text-card-foreground">
						{formatTokens(coverage.coveredTokens)} tokens
					</span>
				</div>
				<div className="flex justify-between gap-2">
					<span>Messages</span>
					<span className="tabular-nums text-card-foreground">
						{coverage.coveredCount} / {coverage.totalMessages}
					</span>
				</div>
				<div className="flex justify-between gap-2">
					<span>Chunk threshold</span>
					<span className="tabular-nums text-card-foreground">
						{formatTokens(chunkTokens)} tokens
					</span>
				</div>
				<div className="flex justify-between gap-2">
					<span>Last extraction</span>
					<span className="tabular-nums text-card-foreground">
						{coverage.lastFoldedAt ? timeAgo(coverage.lastFoldedAt) : "—"}
					</span>
				</div>
				{coverage.running && (
					<div className="flex justify-between gap-2" data-testid="coverage-ring-running">
						<span>Status</span>
						<span className="text-card-foreground">extracting…</span>
					</div>
				)}
			</div>
		</>
	);
}