import { execFile } from "node:child_process";
import type { ClaudeConnection } from "../core/contracts/claude.ts";
import { claudeChildEnv, claudeWorkDir, resolveClaudeBinary, type ClaudeEnv } from "./claude-cli.ts";

export interface ClaudeRunResult { code: number | null; stdout: string; stderr: string; error?: Error }
/** Runs `<binary> <args>` with the given env; injectable so tests never spawn the real CLI. */
export type ClaudeRunner = (binary: string, args: string[], env: NodeJS.ProcessEnv) => Promise<ClaudeRunResult>;

/** Generous: a freshly updated binary's first launch can wait on macOS verifying it. */
const TIMEOUT_MS = 30_000;
const TTL_MS = 30_000;

const runClaude: ClaudeRunner = (binary, args, env) => new Promise((resolve) => {
	execFile(binary, args, { env, cwd: claudeWorkDir(), timeout: TIMEOUT_MS, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
		const code = error && typeof (error as NodeJS.ErrnoException).code === "number" ? (error as unknown as { code: number }).code : error ? null : 0;
		resolve({ code, stdout: String(stdout), stderr: String(stderr), ...(error && code === null ? { error } : {}) });
	});
});

function text(value: unknown): string | null {
	return typeof value === "string" && value ? value : null;
}

/** Folds `claude auth status --json` into the connection the app shows. Only a
 * claude.ai sign-in on Anthropic's own API runs on the user's plan. */
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
	if (authMethod === "claude.ai" && apiProvider === "firstParty") return { state: "connected", email: text(status.email), plan: text(status.subscriptionType) };
	return { state: "not-subscription", authMethod: apiProvider === "firstParty" ? authMethod : apiProvider };
}

interface ConnectionCache { value: ClaudeConnection | null; checkedAt: number; inflight: Promise<ClaudeConnection> | null }
const KEY = Symbol.for("lh.claude.connection");
function cache(): ConnectionCache {
	const g = globalThis as typeof globalThis & { [KEY]?: ConnectionCache };
	return (g[KEY] ??= { value: null, checkedAt: 0, inflight: null });
}

async function check(run: ClaudeRunner, binary: () => string | null, env: ClaudeEnv): Promise<ClaudeConnection> {
	const bin = binary();
	if (!bin) return { state: "missing" };
	const result = await run(bin, ["auth", "status", "--json"], claudeChildEnv(env, { binary: bin }));
	if (result.error) return { state: "error", message: "Claude Code could not report its sign-in status. Check that `claude` runs in a terminal, then press Refresh." };
	return parseClaudeAuthStatus(result.stdout);
}

/** Re-checks Claude Code's sign-in with the same environment a turn uses
 * (the environment decides which credential Claude Code picks). Cached for
 * a short time unless forced; concurrent callers share one check. */
export async function refreshClaudeConnection({ force = false, run = runClaude, binary = () => resolveClaudeBinary(), env = process.env, now = Date.now }: { force?: boolean; run?: ClaudeRunner; binary?: () => string | null; env?: ClaudeEnv; now?: () => number } = {}): Promise<ClaudeConnection> {
	const state = cache();
	if (state.inflight) return state.inflight;
	if (!force && state.value && now() - state.checkedAt < TTL_MS) return state.value;
	const pending = check(run, binary, env)
		.catch((): ClaudeConnection => ({ state: "error", message: "Claude Code's sign-in status could not be checked. Press Refresh to try again." }))
		.then((value) => {
			state.value = value; state.checkedAt = now(); state.inflight = null;
			return value;
		});
	state.inflight = pending;
	return pending;
}

/** The last known connection; null until the first check completes. */
export function claudeConnection(): ClaudeConnection | null {
	return cache().value;
}

export function claudeConnected(): boolean {
	return cache().value?.state === "connected";
}

export function resetClaudeConnection(): void {
	const state = cache();
	state.value = null; state.checkedAt = 0; state.inflight = null;
}
