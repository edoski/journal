import { CLAUDE_FAILED, CLAUDE_LIMIT_TEXT, CLAUDE_MODEL, CLAUDE_USAGE_URL, NO_KEY } from "../core/contracts/claude.ts";

export { CLAUDE_FAILED, NO_KEY };

export interface ClaudeRateLimit { resetsAt?: number; rateLimitType?: string }

/** Curated, user-facing failure text; every variant says no API key was used. */
export function claudeErrorMessage({ rateLimit, status, code, text = "" }: { rateLimit?: ClaudeRateLimit; status?: number; code?: string; text?: string }): string {
	// Only a rejected rate-limit event proves the plan limit; a bare 429 may pass in a minute.
	if (rateLimit) {
		const reset = rateLimit.resetsAt ? ` It resets ${claudeResetTime(rateLimit.resetsAt)}.` : "";
		return `${CLAUDE_LIMIT_TEXT}${reset} See ${CLAUDE_USAGE_URL}.${NO_KEY}`;
	}
	if (code === "rate_limit" || status === 429 || /usage limit|limit reached|rate.?limit/i.test(text)) {
		return `Claude is limiting requests right now. Wait a minute, then retry. See ${CLAUDE_USAGE_URL}.${NO_KEY}`;
	}
	if (code === "authentication_failed" || code === "oauth_org_not_allowed" || status === 401 || /not logged in|please (run \/)?log ?in|authenticat/i.test(text)) {
		return `Claude Code is not signed in. Run \`claude\` in a terminal, sign in with your Claude account, then press Refresh in Settings → Accounts.${NO_KEY}`;
	}
	if (code === "model_not_found" || status === 404 || /model\b.*\b(not found|not available|unavailable|does not exist)|(invalid|unknown) model/i.test(text)) {
		return CLAUDE_MODEL_MISSING;
	}
	return CLAUDE_FAILED;
}

/** Chiron runs only CLAUDE_MODEL, so there is nothing to fall back to. */
export const CLAUDE_MODEL_MISSING = `${CLAUDE_MODEL.name} is not available on this Claude plan or this Claude Code version, and Chiron runs only ${CLAUDE_MODEL.name}. Update Claude Code, or use an account whose plan includes it.${NO_KEY}`;

/** resetsAt arrives as Unix seconds. */
export function claudeResetTime(resetsAt: number): string {
	const ms = resetsAt < 1e12 ? resetsAt * 1000 : resetsAt;
	return `at ${new Date(ms).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}`;
}

export const CLAUDE_API_KEY_REFUSAL = `Claude Code would bill an API key here, not your Claude plan, so Chiron stopped the request. Remove the API key from Claude Code's settings, then retry.${NO_KEY}`;
export const CLAUDE_MISSING = `Claude Code was not found. Install Claude Code, run \`claude\` in a terminal and sign in, then press Refresh in Settings → Accounts.${NO_KEY}`;
export const CLAUDE_ACCOUNT_GONE = `This Claude account is no longer set up in T3 Code. Choose another one with Use this account in Settings → Accounts.${NO_KEY}`;
export const CLAUDE_TOOLS_MISSING = `Claude Code could not load Chiron's tools, so the turn was stopped.${NO_KEY}`;
export const CLAUDE_ABORTED = "Claude request cancelled.";

/** A loop-level failure on a Claude turn: keep curated text, mask the rest. */
export function claudeTurnError(message: string): string {
	return message.endsWith(NO_KEY) ? message : claudeErrorMessage({});
}
