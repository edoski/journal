import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { query as sdkQuery, type Options, type SDKMessage, type SDKUserMessage, type SpawnedProcess, type SpawnOptions } from "@anthropic-ai/claude-agent-sdk";
import type { Api, Model, ThinkingLevel } from "@earendil-works/pi-ai";
import { ANTHROPIC_MODELS } from "@earendil-works/pi-ai/providers/anthropic.models";
import { CLAUDE_MODEL, CLAUDE_SUBSCRIPTION } from "../../core/contracts/claude.ts";
import { claudeLaunch, type LoadedClaudeAccount } from "../claude-accounts.ts";
import { claudeChildEnv, claudeWorkDir, resolveClaudeBinary, type ClaudeEnv, type ClaudeLaunch } from "../claude-cli.ts";
import { claudeAccount, claudeAccountConnections } from "../claude-connection.ts";
import { CLAUDE_ACCOUNT_GONE, CLAUDE_MISSING, NO_KEY } from "../claude-errors.ts";
import { spawnTiedChild, stopTiedChild } from "../tied-child.ts";

/** The slice of the Agent SDK's Query the app drives; tests pass a fake. */
export interface SdkQuery extends AsyncIterable<SDKMessage> {
	interrupt(): Promise<void>;
	close(): void;
}
export type SdkPrompt = string | AsyncIterable<SDKUserMessage>;
export type QueryFn = (params: { prompt: SdkPrompt; options: Options }) => SdkQuery;

/** How one call reaches Claude Code: the process options for an account, and
 *  the config folder whose `projects/` holds that account's sessions. */
export interface SdkLaunch { options: Options; configDir: string }

/**
 * The model every agent runs (owner, 2026-11-14): CLAUDE_MODEL at its fixed
 * effort, through the Agent SDK on one Claude account. `model` is the stamp
 * replies carry (the account as provider); `query` is the SDK's, or a test
 * fake; `launch` reads the account fresh and throws a user-facing error when
 * it cannot run.
 */
export interface SdkEngine {
	model: Model<Api>;
	level?: ThinkingLevel;
	query: QueryFn;
	launch: () => SdkLaunch;
}

/** Pi's Anthropic catalog entry for CLAUDE_MODEL, relabelled as one
 * account's plan model: no per-token cost. The default account resolves
 * before the first sign-in check. */
export function claudeSubscriptionModel(providerId: string): Model<Api> | undefined {
	const account = claudeAccount(providerId);
	if (!account && providerId !== CLAUDE_SUBSCRIPTION.providerId) return undefined;
	const base = (ANTHROPIC_MODELS as Record<string, Model<Api> | undefined>)[CLAUDE_MODEL.id];
	if (!base) return undefined;
	return { ...base, provider: providerId, name: account ? `${base.name} · ${account.label}` : base.name, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
}

/** CLAUDE_MODEL once per signed-in account. */
export function claudeSubscriptionModels(): Model<Api>[] {
	return claudeAccountConnections()
		.filter((entry) => entry.connection.state === "connected")
		.flatMap((entry) => claudeSubscriptionModel(entry.account.providerId) ?? []);
}

/** Claude Code runs as a tied child (tied-child.ts): it dies with the app. */
function spawnTied({ command, args, cwd, env, signal }: SpawnOptions): SpawnedProcess {
	const child = spawnTiedChild(command, args, { cwd, env: env as NodeJS.ProcessEnv });
	signal?.addEventListener("abort", () => stopTiedChild(child), { once: true });
	return child as unknown as SpawnedProcess;
}

function expandHome(path: string, home: string): string {
	const expanded = path === "~" ? home : path.startsWith("~/") ? join(home, path.slice(2)) : path;
	return isAbsolute(expanded) ? expanded : resolve(expanded);
}

/** The config folder a launch's sessions live in: the account's own, else
 *  the inherited CLAUDE_CONFIG_DIR, else ~/.claude. */
export function launchConfigDir(launch: ClaudeLaunch | undefined, env: ClaudeEnv = process.env, home = homedir()): string {
	if (launch) return launch.configDir ?? join(home, ".claude");
	const inherited = env.CLAUDE_CONFIG_DIR?.trim();
	return inherited ? expandHome(inherited, home) : join(home, ".claude");
}

/**
 * The options every call shares: the user's own unmodified `claude` on the
 * account's credential (claudeChildEnv drops every other one), in the app's
 * private working folder, with none of the user's settings, CLAUDE.md files,
 * memory or MCP servers. Each caller adds its prompt, tools and session.
 * Replayed user messages tell a turn when a steered message reached the model.
 */
export function claudeSdkOptions(binary: string, launch: ClaudeLaunch | undefined, env: ClaudeEnv = process.env): Options {
	return {
		pathToClaudeCodeExecutable: binary,
		env: claudeChildEnv(env, { binary, launch }) as Record<string, string>,
		cwd: claudeWorkDir(),
		model: CLAUDE_MODEL.id,
		effort: CLAUDE_MODEL.thinkingLevel,
		settingSources: [],
		strictMcpConfig: true,
		permissionMode: "dontAsk",
		includePartialMessages: true,
		extraArgs: { "replay-user-messages": null },
		spawnClaudeCodeProcess: spawnTied,
	};
}

export function claudeSdkLaunch(account: LoadedClaudeAccount | "missing" | undefined, { binary = resolveClaudeBinary(), env = process.env }: { binary?: string | null; env?: ClaudeEnv } = {}): SdkLaunch {
	if (account === "missing") throw new Error(CLAUDE_ACCOUNT_GONE);
	if (!binary) throw new Error(CLAUDE_MISSING);
	let launch: ClaudeLaunch | undefined;
	try { launch = account ? claudeLaunch(account, claudeWorkDir()) : undefined; } catch (error) {
		throw new Error(`${(error as Error).message}${NO_KEY}`);
	}
	return { options: claudeSdkOptions(binary, launch, env), configDir: launchConfigDir(launch, env) };
}

/** The production engine on one Claude account. Throws when the account is
 *  not set up or pi's catalog lacks the model, so a call never runs on a
 *  model or account it was not given. */
export function claudeEngine(providerId: string): SdkEngine {
	const model = claudeSubscriptionModel(providerId);
	if (!model) throw new Error(`no ${CLAUDE_MODEL.id} on Claude account ${providerId}`);
	return {
		model,
		level: CLAUDE_MODEL.thinkingLevel,
		query: sdkQuery as QueryFn,
		launch: () => claudeSdkLaunch(claudeAccount(providerId) ?? "missing"),
	};
}

/** App tools reach the model as MCP tools of this in-process server. */
export const SDK_TOOL_SERVER = "lh";
export const SDK_TOOL_PREFIX = `mcp__${SDK_TOOL_SERVER}__`;
