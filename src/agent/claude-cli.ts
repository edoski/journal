import { accessSync, constants, mkdirSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";

/** The contract with the user's own, unmodified `claude` CLI. LearnHarness
 * never reads, stores or passes a Claude credential: Claude Code signs in
 * through Anthropic's own flow and keeps its credentials to itself. */

/** Removed from the child's environment: the first three would make Claude
 * Code bill an API key instead of the plan, the last is app-private. */
export const CLAUDE_ENV_DENYLIST = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN", "LH_DESKTOP_API_SECRET"] as const;

export const CLAUDE_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type ClaudeEffort = (typeof CLAUDE_EFFORTS)[number];

/** App tools reach the model as MCP tools of this server, so Claude Code names them `mcp__lh__<name>`. */
export const CLAUDE_MCP_SERVER = "lh";
export const CLAUDE_TOOL_PREFIX = `mcp__${CLAUDE_MCP_SERVER}__`;
const TOOLS_ENV = "LH_CLAUDE_TOOLS";

export type ClaudeEnv = Record<string, string | undefined>;

function isExecutableFile(path: string): boolean {
	try {
		if (!statSync(path).isFile()) return false;
		accessSync(path, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

/** A macOS GUI app does not inherit the shell PATH, so the usual install
 * locations are searched after PATH. Returns an absolute path or null. */
export function resolveClaudeBinary({ env = process.env, home = homedir(), executable = isExecutableFile }: { env?: ClaudeEnv; home?: string; executable?: (path: string) => boolean } = {}): string | null {
	const name = process.platform === "win32" ? "claude.exe" : "claude";
	const dirs = [
		...(env.PATH ?? "").split(delimiter).filter((dir) => isAbsolute(dir)),
		join(home, ".local", "bin"),
		"/opt/homebrew/bin",
		"/usr/local/bin",
		join(home, ".claude", "local"),
	];
	for (const dir of dirs) {
		const candidate = join(dir, name);
		if (executable(candidate)) return candidate;
	}
	return null;
}

/** The user's own environment minus the denylist. Tool search stays off so
 * app tools are never deferred, and the user's CLAUDE.md files and auto
 * memory stay out of the tutor's context. */
export function claudeChildEnv(base: ClaudeEnv): NodeJS.ProcessEnv {
	const env: ClaudeEnv = { ...base };
	for (const name of CLAUDE_ENV_DENYLIST) delete env[name];
	env.ENABLE_TOOL_SEARCH = "false";
	env.CLAUDE_CODE_DISABLE_CLAUDE_MDS = "1";
	env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = "1";
	return env as NodeJS.ProcessEnv;
}

export interface ClaudeArgs {
	model: string;
	effort?: ClaudeEffort;
	systemPrompt: string;
	mcpConfig: string;
}

/** `--safe-mode` would drop the --mcp-config server, and `--bare` would skip
 * the user's sign-in, so neither is ever passed. */
export function claudeArgs({ model, effort, systemPrompt, mcpConfig }: ClaudeArgs): string[] {
	return [
		"-p",
		"--input-format", "stream-json",
		"--output-format", "stream-json",
		"--verbose",
		"--include-partial-messages",
		"--tools", "",
		"--strict-mcp-config",
		"--mcp-config", mcpConfig,
		"--allowedTools", `mcp__${CLAUDE_MCP_SERVER}`,
		"--setting-sources", "",
		"--disable-slash-commands",
		"--no-session-persistence",
		"--model", model,
		...(effort ? ["--effort", effort] : []),
		"--system-prompt", systemPrompt,
	];
}

export interface ClaudeToolDeclaration {
	name: string;
	description: string;
	inputSchema: unknown;
}

/** The declaration-only MCP server. It lists the app's tools and never
 * answers tools/call: the stream stops at the model's tool_use and the host
 * kills Claude Code, so Claude Code can never run a tool or make a second
 * model call. Run inline with -e so no extra file has to be packaged. */
export const CLAUDE_MCP_SCRIPT = `
const tools = JSON.parse(process.env.${TOOLS_ENV} || "[]");
const send = (message) => process.stdout.write(JSON.stringify(message) + "\\n");
require("node:readline").createInterface({ input: process.stdin }).on("line", (line) => {
	let message;
	try { message = JSON.parse(line); } catch { return; }
	if (!message || typeof message !== "object" || message.id === undefined || message.id === null) return;
	if (message.method === "initialize") send({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: (message.params && message.params.protocolVersion) || "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "${CLAUDE_MCP_SERVER}", version: "1" } } });
	else if (message.method === "tools/list") send({ jsonrpc: "2.0", id: message.id, result: { tools } });
	else if (message.method !== "tools/call") send({ jsonrpc: "2.0", id: message.id, result: {} });
});
`;

/** The MCP server runs on this process's own runtime: the Electron binary in
 * the desktop app (hence ELECTRON_RUN_AS_NODE), plain node in dev. */
export function claudeMcpEnv(tools: readonly ClaudeToolDeclaration[]): Record<string, string> {
	return { ELECTRON_RUN_AS_NODE: "1", [TOOLS_ENV]: JSON.stringify(tools) };
}

export function claudeMcpConfig(tools: readonly ClaudeToolDeclaration[], runtime = process.execPath): string {
	return JSON.stringify({ mcpServers: { [CLAUDE_MCP_SERVER]: { type: "stdio", command: runtime, args: ["-e", CLAUDE_MCP_SCRIPT], env: claudeMcpEnv(tools) } } });
}

/** An app-owned neutral working directory, never the repo or the data dir. */
export function claudeWorkDir(): string {
	const dir = join(tmpdir(), "learnharness-claude");
	mkdirSync(dir, { recursive: true });
	return dir;
}
