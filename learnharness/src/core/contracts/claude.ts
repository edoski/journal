/** Client-safe shapes for the Claude subscription provider. LearnHarness drives
 * the user's own Claude Code CLI, one provider per Claude account; no shape
 * here ever carries a Claude credential. */
export const CLAUDE_SUBSCRIPTION = { providerId: "claude-subscription", label: "Claude" } as const;

const ACCOUNT_PREFIX = `${CLAUDE_SUBSCRIPTION.providerId}-`;

/** The default home's account keeps the original id, so settings and sessions
 * saved before accounts existed still resolve; every other account is suffixed. */
export function claudeProviderId(instanceId: string | null): string {
	return instanceId === null ? CLAUDE_SUBSCRIPTION.providerId : `${ACCOUNT_PREFIX}${instanceId}`;
}

export function isClaudeProvider(provider: string | undefined): boolean {
	return provider === CLAUDE_SUBSCRIPTION.providerId || provider?.startsWith(ACCOUNT_PREFIX) === true;
}

export type ClaudeConnection =
	| { state: "connected"; email: string | null; plan: string | null }
	| { state: "signed-out" }
	/** Logged in some other way (Console or API key, Bedrock, Vertex): turns would not use the plan. */
	| { state: "not-subscription"; authMethod: string }
	| { state: "missing" }
	| { state: "error"; message: string };

/** token: T3 Code's setup token; profile: its own Claude Code config dir; default: the plain signed-in `claude`. */
export interface ClaudeAccount { providerId: string; label: string; email: string | null; auth: "token" | "profile" | "default" }

/** The weekly window as Claude Code last reported it. resetsAt is Unix seconds. */
export interface ClaudeUsage { percentLeft: number; resetsAt: number | null; limited: boolean; checkedAt: number }

export interface ClaudeAccountStatus { account: ClaudeAccount; connection: ClaudeConnection; usage: ClaudeUsage | null }

/** Only Opus 5.5 is offered, by the owner's choice: every role runs on it. */
export const CLAUDE_MODEL_IDS = ["claude-opus-5-5"] as const;
export type ClaudeModelId = (typeof CLAUDE_MODEL_IDS)[number];

/** What "Use for all roles" writes to every model slot. */
export const CLAUDE_ROLE_DEFAULT = { id: "claude-opus-5-5", thinkingLevel: "high" } as const satisfies { id: ClaudeModelId; thinkingLevel: string };

export const CLAUDE_USAGE_URL = "https://claude.ai/settings/usage";

/** The lead of the curated plan-limit failure; the matcher below is the only way to detect it. */
export const CLAUDE_LIMIT_TEXT = "Your Claude plan's usage limit is reached.";

/** Did this failed turn stop at a Claude account's plan limit? */
export function isClaudeLimitFailure(failure: { provider?: string; errorMessage?: string } | undefined): boolean {
	return !!failure && isClaudeProvider(failure.provider) && failure.errorMessage?.startsWith(CLAUDE_LIMIT_TEXT) === true;
}

/** A window whose reset has passed is full again, until the next reading says otherwise. */
function effectiveUsage(usage: ClaudeUsage | null, now: number): ClaudeUsage | null {
	if (!usage || usage.resetsAt === null || usage.resetsAt * 1000 > now) return usage;
	// A limited reading's reset is the blocking window's (often the 5-hour one), so
	// only the block ends; the weekly share left is unknown until the next reading.
	if (usage.limited) return { ...usage, resetsAt: null, limited: false };
	return { ...usage, percentLeft: 100, resetsAt: null, limited: false };
}

/** The account to continue on after `current` hit its limit: connected, not
 * limited, most weekly usage left (ties: the sooner reset, since quota left
 * at a reset is lost). Accounts with no reading come after measured ones. */
export function nextClaudeAccount(current: string, statuses: readonly ClaudeAccountStatus[], now = Date.now()): ClaudeAccountStatus | null {
	const currentEmail = statuses.find((status) => status.account.providerId === current)?.account.email;
	const candidates = statuses
		.map((status) => ({ status, usage: effectiveUsage(status.usage, now) }))
		.filter(({ status, usage }) => status.account.providerId !== current && !(currentEmail && status.account.email === currentEmail) && status.connection.state === "connected" && !usage?.limited && (usage === null || usage.percentLeft > 0));
	candidates.sort((a, b) => {
		if (!a.usage || !b.usage) return a.usage ? -1 : b.usage ? 1 : 0;
		if (a.usage.percentLeft !== b.usage.percentLeft) return b.usage.percentLeft - a.usage.percentLeft;
		return (a.usage.resetsAt ?? Infinity) - (b.usage.resetsAt ?? Infinity);
	});
	return candidates[0]?.status ?? null;
}

/** The soonest weekly reset among connected accounts, for "all at their limit". */
export function soonestClaudeReset(statuses: readonly ClaudeAccountStatus[]): number | null {
	const resets = statuses.flatMap((status) => status.connection.state === "connected" && status.usage?.resetsAt ? [status.usage.resetsAt] : []);
	return resets.length ? Math.min(...resets) : null;
}
