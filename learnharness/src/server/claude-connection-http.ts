import type { ClaudeAccountStatus } from "../core/contracts/claude.ts";
import { publicClaudeAccount } from "../agent/claude-accounts.ts";
import { refreshClaudeConnections, type RefreshClaudeOptions } from "../agent/claude-connection.ts";
import { claudeUsage, refreshClaudeUsage, type ClaudeProbeDeps } from "../agent/claude-usage.ts";

/** Every account's sign-in and weekly usage. Forced: re-check every sign-in
 * and probe every signed-in account; otherwise probe only stale readings. */
export async function claudeAccountStatuses({ force = false, ...deps }: RefreshClaudeOptions & ClaudeProbeDeps = {}): Promise<ClaudeAccountStatus[]> {
	const accounts = await refreshClaudeConnections({ ...deps, force });
	await refreshClaudeUsage(accounts.filter((entry) => entry.connection.state === "connected").map((entry) => entry.account), { ...deps, force });
	return accounts.map(({ account, connection }) => ({ account: publicClaudeAccount(account), connection, usage: claudeUsage(account.providerId) }));
}

/** GET /api/subscriptions/claude: `{ accounts }`, forced when `?refresh=1`. */
export async function claudeConnectionResponse(request: Request): Promise<Response> {
	const force = new URL(request.url).searchParams.get("refresh") === "1";
	return Response.json({ accounts: await claudeAccountStatuses({ force }) }, { headers: { "Cache-Control": "no-store" } });
}
