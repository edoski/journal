import { emit, subscribe } from "../../core/events.ts";

/**
 * The background-run registry: what the activity dock shows while a
 * finished lesson's digest or a course's map build runs. Each run is one
 * row; its controller is the dock's abort.
 *
 * The registry lives on globalThis, not module level: Next dev compiles
 * each route entry as its own module instance, so a module-level Map would
 * be a different object in /api/activity than in the composition root that
 * starts the runs. Every change announces activity-changed.
 */

/** What a run is doing: a lesson's digest, or a course's map build. */
export type RunPhase = "digesting" | "mapping";

/** Which work a run is: a finished lesson's digest into the course record,
 *  or a course's topic map built from its material. */
export type RunKind = "digest" | "course-map";

export interface BackgroundRun {
	/** The registry key, unique per row: "chatId#digest" or "workspace#course-map". */
	id: string;
	/** The key before "#": the chat a digest reads, or the course a map is
	 *  built for. Aborts and the chat-deletion wind-down match on it. */
	chatId: string;
	kind: RunKind;
	/** What the dock row says, when the run names itself (a map build by its course, "Linear algebra"). */
	label?: string;
	phase: RunPhase;
	startedAt: number;
	/** One per run; abort() cancels the run's in-flight model call. */
	controller: AbortController;
}

interface LhBackgroundRunsGlobal {
	__lhBackgroundRuns?: {
		running: Map<string, BackgroundRun>;
		/** Last minted startedAt, kept monotonic so two runs never share one. */
		lastStartedAt: number;
	};
}

function registry(): NonNullable<LhBackgroundRunsGlobal["__lhBackgroundRuns"]> {
	const g = globalThis as typeof globalThis & LhBackgroundRunsGlobal;
	return (g.__lhBackgroundRuns ??= { running: new Map(), lastStartedAt: 0 });
}

/** The runs in flight, oldest first: the dock's rows. */
export function backgroundRuns(): BackgroundRun[] {
	return [...registry().running.values()].sort((a, b) => a.startedAt - b.startedAt);
}

/** Abort every run keyed under `chatId`: the pending model call receives
 *  the signal and the run ends like a failure. False when none is running. */
export function abortRuns(chatId: string): boolean {
	let found = false;
	for (const run of registry().running.values()) {
		if (run.chatId !== chatId) continue;
		run.controller.abort();
		found = true;
	}
	return found;
}

/** Resolves true once no run keyed under `chatId` is left (every removal
 *  announces activity-changed), or false after `limitMs`. */
export function runsEnded(chatId: string, limitMs: number): Promise<boolean> {
	const ended = () => !registry().running.values().some((run) => run.chatId === chatId);
	if (ended()) return Promise.resolve(true);
	return new Promise((resolve) => {
		const finish = (result: boolean) => {
			clearTimeout(limit);
			off();
			resolve(result);
		};
		const off = subscribe((event) => event.type === "activity-changed" && ended() && finish(true));
		const limit = setTimeout(() => finish(false), limitMs);
	});
}

/** Register a run or move it to a new phase; label, start time and
 *  controller survive a phase change. */
export function setRunPhase(jobKey: string, phase: RunPhase, kind: RunKind, label?: string): BackgroundRun {
	const R = registry();
	const prev = R.running.get(jobKey);
	if (!prev) R.lastStartedAt = Math.max(Date.now(), R.lastStartedAt + 1);
	const run: BackgroundRun = {
		id: jobKey,
		chatId: prev?.chatId ?? jobKey.split("#")[0]!,
		kind,
		label: prev?.label ?? label,
		phase,
		startedAt: prev?.startedAt ?? R.lastStartedAt,
		controller: prev?.controller ?? new AbortController(),
	};
	R.running.set(jobKey, run);
	emit("activity-changed", {});
	return run;
}

/** The run is over (done, failed or aborted): its row leaves the dock. */
export function finishRun(jobKey: string): void {
	registry().running.delete(jobKey);
	emit("activity-changed", {});
}
