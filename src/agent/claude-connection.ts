import { execFile } from "node:child_process";
import type { ClaudeConnection } from "../core/contracts/claude.ts";
import { claudeLaunch, loadClaudeAccounts, type LoadedClaudeAccount } from "./claude-accounts.ts";
import { claudeChildEnv, claudeWorkDir, resolveClaudeBinary, type ClaudeEnv } from "./claude-cli.ts";

export interface ClaudeRunResult { code: number | null; stdout: string; stderr: string; error?: Error }
/** Runs `<binary> <args>` with the given env; injectable so tests never spawn the real CLI. */
export type ClaudeRunner = (binary: string, args: string[], env: NodeJS.ProcessEnv) => Promise<ClaudeRunResult>;

/** Generous: a freshly updated binary's first launch can wait on macOS verifying it. */
const TIMEOUT_MS = 30_000;
const TTL_MS = 30_000;

export const runClaude: ClaudeRunner = (binary, args, env) => new Promise((resolve) => {
	const child = execFile(binary, args, { env, cwd: claudeWorkDir(), timeout: TIMEOUT_MS, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
		const code = error && typeof (error as NodeJS.ErrnoException).code === "number" ? (error as unknown as { code: number }).code : error ? null : 0;
		resolve({ code, stdout: String(stdout), stderr: String(stderr), ...(error && code === null ? { error } : {}) });
	});
	child.stdin?.end();
});

function text(value: unknown): string | null {
	return typeof value === "string" && value ? value : null;
}

/** Folds `claude auth status --json` into the connection the app shows. Only a
 * claude.ai sign-in or a setup token on Anthropic's own API runs on a plan. */
export function parseClaudeAuthStatus(stdout: string): ClaudeConnection {
	let status: Record<string, unknown>;
	try {
		const parsed: unknown = JSON.parse(stdout);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
		status = parsed as Record<string, unknown>;
	} catch {
		return { state: "error", message: "Claude Code returned a sign-in status LearnHarness could not read. Update Claude Code, then press Refresh." };
	}
	if (status.loggedIn !== true) return { state: "signed-out" };
	const authMethod = text(status.authMethod) ?? "unknown";
	const apiProvider = text(status.apiProvider) ?? "unknown";
	if ((authMethod === "claude.ai" || authMethod === "oauth_token") && apiProvider === "firstParty") return { state: "connected", email: text(status.email), plan: text(status.subscriptionType) };
	return { state: "not-subscription", authMethod: apiProvider === "firstParty" ? authMethod : apiProvider };
}

export interface ClaudeAccountConnection { account: LoadedClaudeAccount; connection: ClaudeConnection }

interface ConnectionCache { accounts: ClaudeAccountConnection[]; checkedAt: number | null; inflight: Promise<ClaudeAccountConnection[]> | null }
const KEY = Symbol.for("lh.claude.connections");
function cache(): ConnectionCache {
	const g = globalThis as typeof globalThis & { [KEY]?: ConnectionCache };
	return (g[KEY] ??= { accounts: [], checkedAt: null, inflight: null });
}

async function check(account: LoadedClaudeAccount, run: ClaudeRunner, bin: string | null, env: ClaudeEnv): Promise<ClaudeConnection> {
	if (!bin) return { state: "missing" };
	let launch;
	try { launch = claudeLaunch(account, claudeWorkDir()); } catch (error) { return { state: "error", message: (error as Error).message }; }
	const result = await run(bin, ["auth", "status", "--json"], claudeChildEnv(env, { binary: bin, launch }));
	if (result.error) return { state: "error", message: "Claude Code could not report its sign-in status. Check that `claude` runs in a terminal, then press Refresh." };
	return parseClaudeAuthStatus(result.stdout);
}

export interface RefreshClaudeOptions {
	force?: boolean;
	run?: ClaudeRunner;
	binary?: () => string | null;
	env?: ClaudeEnv;
	now?: () => number;
	/** Reads the account list; tests point it at a fake T3 Code directory. */
	load?: () => LoadedClaudeAccount[];
}

/** Re-reads the account list and re-checks every account's sign-in in
 * parallel, each with the same environment its turns use (the environment
 * decides which credential Claude Code picks). Cached for a short time
 * unless forced; concurrent callers share one round. */
export async function refreshClaudeConnections({ force = false, run = runClaude, binary = () => resolveClaudeBinary(), env = process.env, now = Date.now, load = () => loadClaudeAccounts() }: RefreshClaudeOptions = {}): Promise<ClaudeAccountConnection[]> {
	const state = cache();
	if (state.inflight) return state.inflight;
	if (!force && state.checkedAt !== null && now() - state.checkedAt < TTL_MS) return state.accounts;
	const round = async () => {
		const accounts = load();
		const bin = binary();
		return Promise.all(accounts.map(async (account) => ({
			account,
			connection: await check(account, run, bin, env).catch((): ClaudeConnection => ({ state: "error", message: "Claude Code's sign-in status could not be checked. Press Refresh to try again." })),
		})));
	};
	const pending = round().then((accounts) => {
		state.accounts = accounts; state.checkedAt = now(); state.inflight = null;
		return accounts;
	}, (error: unknown) => { state.inflight = null; throw error; });
	state.inflight = pending;
	return pending;
}

/** The accounts and connections from the last completed check; empty until then. */
export function claudeAccountConnections(): readonly ClaudeAccountConnection[] {
	return cache().accounts;
}

export function claudeAccount(providerId: string): LoadedClaudeAccount | undefined {
	return cache().accounts.find((entry) => entry.account.providerId === providerId)?.account;
}

/** The last known connection of one account; null until the first check completes. */
export function claudeConnection(providerId: string): ClaudeConnection | null {
	return cache().accounts.find((entry) => entry.account.providerId === providerId)?.connection ?? null;
}

export function claudeConnected(providerId: string): boolean {
	return claudeConnection(providerId)?.state === "connected";
}

export function resetClaudeConnections(): void {
	const state = cache();
	state.accounts = []; state.checkedAt = null; state.inflight = null;
}
