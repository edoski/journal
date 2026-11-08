import { accessSync, chmodSync, constants, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join } from "node:path";
import { AUTH_PROVIDER_ENV_VARS } from "../core/auth-keys.ts";

/** The contract with the user's own, unmodified `claude` CLI. LearnHarness
 * stores no Claude credential. A child runs on the user's own Claude Code
 * sign-in, on another Claude Code config dir, or on one T3 Code setup token
 * (src/agent/claude-accounts.ts), which only that child's environment sees. */

/** Removed from the child's environment: each would make Claude Code use a
 * credential, provider or endpoint other than the user's own plan sign-in. */
export const CLAUDE_ENV_DENYLIST = [
	"ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "ANTHROPIC_FOUNDRY_API_KEY", "ANTHROPIC_AWS_API_KEY",
	"CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_CODE_OAUTH_REFRESH_TOKEN", "CLAUDE_CODE_SESSION_ACCESS_TOKEN",
	"CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY", "AWS_BEARER_TOKEN_BEDROCK",
] as const;

export const CLAUDE_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type ClaudeEffort = (typeof CLAUDE_EFFORTS)[number];

/** App tools reach the model as MCP tools of this server, so Claude Code names them `mcp__lh__<name>`. */
export const CLAUDE_MCP_SERVER = "lh";
export const CLAUDE_TOOL_PREFIX = `mcp__${CLAUDE_MCP_SERVER}__`;
const TOOLS_ENV = "LH_CLAUDE_TOOLS_FILE";

export type ClaudeEnv = Record<string, string | undefined>;

/** Which Claude Code credential a child uses. Absent: the user's own
 * environment decides, as in a terminal. configDir undefined: the default
 * home, even if the parent set CLAUDE_CONFIG_DIR. */
export interface ClaudeLaunch { configDir: string | undefined; token?: string }

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
	];
	for (const dir of dirs) {
		const candidate = join(dir, name);
		if (executable(candidate)) return candidate;
	}
	return null;
}

/** The user's own environment minus the denylist, the app's own provider
 * keys and its private LH_* settings. The binary's directory joins PATH so an
 * npm-installed `claude` (a `#!/usr/bin/env node` script) finds its node in a
 * GUI app's bare PATH. Tool search stays off so app tools are never deferred;
 * the user's CLAUDE.md files, auto memory and Claude Code's own compaction
 * stay out of the tutor's context; the non-streaming fallback is off because
 * its replies never reach the stream mapper. */
export function claudeChildEnv(base: ClaudeEnv, { binary, thinking = true, launch }: { binary?: string; thinking?: boolean; launch?: ClaudeLaunch } = {}): NodeJS.ProcessEnv {
	const env: ClaudeEnv = {};
	for (const [name, value] of Object.entries(base)) {
		if ((CLAUDE_ENV_DENYLIST as readonly string[]).includes(name) || AUTH_PROVIDER_ENV_VARS.has(name) || name.startsWith("LH_")) continue;
		env[name] = value;
	}
	if (launch) {
		delete env.CLAUDE_CONFIG_DIR;
		if (launch.configDir) env.CLAUDE_CONFIG_DIR = launch.configDir;
		if (launch.token) env.CLAUDE_CODE_OAUTH_TOKEN = launch.token;
	}
	if (binary) env.PATH = [dirname(binary), env.PATH].filter(Boolean).join(delimiter);
	env.ENABLE_TOOL_SEARCH = "false";
	env.CLAUDE_CODE_DISABLE_CLAUDE_MDS = "1";
	env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = "1";
	env.DISABLE_AUTO_COMPACT = "1";
	env.CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK = "1";
	if (!thinking) env.CLAUDE_CODE_DISABLE_THINKING = "1";
	return env as NodeJS.ProcessEnv;
}

export interface ClaudeArgs {
	model: string;
	effort?: ClaudeEffort;
	systemPromptFile: string;
	mcpConfigFile: string;
}

/** Shared by every `claude -p` spawn. `--safe-mode` would drop an
 * --mcp-config server, and `--bare` would skip the user's sign-in, so
 * neither is ever passed. The prompt goes by file: with the tool list it
 * outgrows Windows' 32 KiB command line. */
export function claudeBaseArgs({ model, systemPromptFile }: { model: string; systemPromptFile: string }): string[] {
	return [
		"-p",
		"--input-format", "stream-json",
		"--output-format", "stream-json",
		"--verbose",
		"--strict-mcp-config",
		"--setting-sources", "",
		"--disable-slash-commands",
		"--no-session-persistence",
		"--model", model,
		"--system-prompt-file", systemPromptFile,
	];
}

export function claudeArgs({ model, effort, systemPromptFile, mcpConfigFile }: ClaudeArgs): string[] {
	return [
		...claudeBaseArgs({ model, systemPromptFile }),
		"--include-partial-messages",
		"--tools", "",
		"--mcp-config", mcpConfigFile,
		"--allowedTools", `mcp__${CLAUDE_MCP_SERVER}`,
		...(effort ? ["--effort", effort] : []),
	];
}

/** The usage probe: one tiny Haiku reply whose stream carries the account's
 * rate_limit_event. The same isolation as a turn, with no tools at all. */
export function claudeProbeArgs(): string[] {
	return [
		"-p", "hi",
		"--model", "claude-haiku-5-5",
		"--system-prompt", "Reply with one character.",
		"--tools", "",
		"--strict-mcp-config",
		"--setting-sources", "",
		"--disable-slash-commands",
		"--no-session-persistence",
		"--max-turns", "1",
		"--output-format", "stream-json",
		"--verbose",
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
const tools = JSON.parse(require("node:fs").readFileSync(process.env.${TOOLS_ENV}, "utf8"));
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
export function claudeMcpConfig(toolsFile: string, runtime = process.execPath): string {
	return JSON.stringify({ mcpServers: { [CLAUDE_MCP_SERVER]: { type: "stdio", command: runtime, args: ["-e", CLAUDE_MCP_SCRIPT], env: { ELECTRON_RUN_AS_NODE: "1", [TOOLS_ENV]: toolsFile, CLAUDE_CODE_OAUTH_TOKEN: "" } } } });
}

/** Where claudeWorkDir lives, without creating it. */
export function claudeWorkDirPath(): string {
	const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
	return join(tmpdir(), `learnharness-claude${uid === undefined ? "" : `-${uid}`}`);
}

/** An app-owned neutral working directory, private to this OS user: Claude
 * Code reads project settings from its cwd, so nobody else may write here. */
export function claudeWorkDir(): string {
	const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
	const dir = claudeWorkDirPath();
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	const stat = statSync(dir);
	if (uid !== undefined && stat.uid !== uid) throw new Error(`${dir} belongs to another user`);
	if ((stat.mode & 0o077) !== 0) chmodSync(dir, 0o700);
	return dir;
}

export interface ClaudeCallFiles { systemPromptFile: string; mcpConfigFile: string; dispose: () => void }

/** One call's prompt, tool list and MCP config, in a private directory the caller disposes once the child exits. */
export function writeClaudeCallFiles(systemPrompt: string, tools: readonly ClaudeToolDeclaration[], runtime = process.execPath): ClaudeCallFiles {
	const dir = mkdtempSync(join(claudeWorkDir(), "call-"));
	const file = (name: string, content: string) => { const path = join(dir, name); writeFileSync(path, content, { mode: 0o600 }); return path; };
	const toolsFile = file("tools.json", JSON.stringify(tools));
	return {
		systemPromptFile: file("system-prompt.txt", systemPrompt),
		mcpConfigFile: file("mcp.json", claudeMcpConfig(toolsFile, runtime)),
		dispose: () => rmSync(dir, { recursive: true, force: true }),
	};
}
