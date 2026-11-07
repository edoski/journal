import type { ClaudeUsage } from "../core/contracts/claude.ts";
import { claudeLaunch, type LoadedClaudeAccount } from "./claude-accounts.ts";
import { claudeChildEnv, claudeProbeArgs, claudeWorkDir, resolveClaudeBinary, type ClaudeEnv } from "./claude-cli.ts";
import { runClaude, type ClaudeRunner } from "./claude-connection.ts";

/** Each account's weekly usage, as Claude Code's own rate_limit_event reports
 * it: on every real call, and from a one-line probe only when someone asks. */

/** A reading this recent needs no probe on an ordinary read. */
export const CLAUDE_USAGE_FRESH_MS = 5 * 60_000;

type Json = Record<string, unknown>;
const record = (value: unknown): Json | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as Json : undefined;
const num = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) ? value : undefined;

/** Folds one rate_limit_event's `rate_limit_info`. While limited, resetsAt is
 * the binding window's reset, which is when the account works again. */
export function claudeUsageFromRateLimit(info: unknown, now: number, previous: ClaudeUsage | null = null): ClaudeUsage | null {
	const limit = record(info);
	if (!limit) return null;
	const week = record(record(limit.unifiedWindows)?.seven_day);
	const utilization = num(week?.utilization);
	const limited = limit.status === "rejected" || week?.status === "rejected";
	if (utilization === undefined && !limited) return null;
	const weekReset = num(week?.resetsAt) ?? null;
	return {
		percentLeft: utilization === undefined ? previous?.percentLeft ?? 0 : Math.round(Math.min(1, Math.max(0, 1 - utilization)) * 100),
		resetsAt: limited ? num(limit.resetsAt) ?? weekReset : weekReset,
		limited,
		checkedAt: now,
	};
}

interface UsageState { readings: Map<string, ClaudeUsage>; attempts: Map<string, number>; inflight: Map<string, Promise<ClaudeUsage | null>> }
const KEY = Symbol.for("lh.claude.usage");
function state(): UsageState {
	const g = globalThis as typeof globalThis & { [KEY]?: UsageState };
	return (g[KEY] ??= { readings: new Map(), attempts: new Map(), inflight: new Map() });
}

export function claudeUsage(providerId: string): ClaudeUsage | null {
	return state().readings.get(providerId) ?? null;
}

/** Records a real call's rate_limit_event for the account that made it. */
export function recordClaudeRateLimit(providerId: string, info: unknown, now = Date.now()): void {
	const usage = claudeUsageFromRateLimit(info, now, claudeUsage(providerId));
	if (usage) state().readings.set(providerId, usage);
}

/** Reads the probe's stream-json. A probe that reports an API key source is discarded: it would not reflect the plan. */
export function parseClaudeProbe(stdout: string, now: number, previous: ClaudeUsage | null = null): ClaudeUsage | null {
	for (const line of stdout.split("\n")) {
		let event: Json | undefined;
		try { event = record(JSON.parse(line)); } catch { continue; }
		if (event?.type === "system" && event.subtype === "init" && event.apiKeySource !== "none") return null;
		if (event?.type === "rate_limit_event") {
			const usage = claudeUsageFromRateLimit(event.rate_limit_info, now, previous);
			if (usage) return usage;
		}
	}
	return null;
}

export interface ClaudeProbeDeps { run?: ClaudeRunner; binary?: () => string | null; env?: ClaudeEnv; now?: () => number }

async function probe(account: LoadedClaudeAccount, { run = runClaude, binary = () => resolveClaudeBinary(), env = process.env, now = Date.now }: ClaudeProbeDeps): Promise<ClaudeUsage | null> {
	const bin = binary();
	if (!bin) return null;
	const launch = claudeLaunch(account, claudeWorkDir());
	const result = await run(bin, claudeProbeArgs(), claudeChildEnv(env, { binary: bin, thinking: false, launch }));
	return parseClaudeProbe(result.stdout, now(), claudeUsage(account.providerId));
}

/** Brings each account's reading up to date: forced probes every account,
 * an ordinary read probes only accounts with no reading or attempt in the
 * last five minutes. One probe per account is ever in flight. */
export async function refreshClaudeUsage(accounts: readonly LoadedClaudeAccount[], { force = false, ...deps }: ClaudeProbeDeps & { force?: boolean } = {}): Promise<void> {
	const usage = state();
	const now = deps.now ?? Date.now;
	await Promise.all(accounts.map((account) => {
		const id = account.providerId;
		const running = usage.inflight.get(id);
		if (running) return running;
		const last = Math.max(usage.readings.get(id)?.checkedAt ?? -Infinity, usage.attempts.get(id) ?? -Infinity);
		if (!force && now() - last < CLAUDE_USAGE_FRESH_MS) return undefined;
		usage.attempts.set(id, now());
		const pending = probe(account, deps)
			.catch(() => null)
			.then((reading) => {
				if (reading) usage.readings.set(id, reading);
				usage.inflight.delete(id);
				return reading;
			});
		usage.inflight.set(id, pending);
		return pending;
	}));
}

export function resetClaudeUsage(): void {
	const usage = state();
	usage.readings.clear(); usage.attempts.clear(); usage.inflight.clear();
}
