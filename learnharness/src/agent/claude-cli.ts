import { accessSync, chmodSync, constants, mkdirSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join } from "node:path";

/** The contract with the user's own, unmodified `claude` CLI. LearnHarness
 * stores no Claude credential. A child runs on the user's own Claude Code
 * sign-in, on another Claude Code config dir, or on one T3 Code setup token
 * (src/agent/claude-accounts.ts), which only that child's environment sees. */

/** Removed from the child's environment: each would make Claude Code use a
 * credential, provider or endpoint other than the user's own plan sign-in.
 * Every ANTHROPIC_* variable and every *_API_KEY / *_AUTH_TOKEN goes too
 * (claudeEnvDropped), so no key in the user's shell can reach the child. */
const CLAUDE_ENV_DENYLIST = [
	"CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_CODE_OAUTH_REFRESH_TOKEN", "CLAUDE_CODE_SESSION_ACCESS_TOKEN",
	"CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY", "AWS_BEARER_TOKEN_BEDROCK",
] as const;
export function claudeEnvDropped(name: string): boolean {
	return (CLAUDE_ENV_DENYLIST as readonly string[]).includes(name) || name.startsWith("ANTHROPIC_") || /_(API_KEY|AUTH_TOKEN)$/.test(name) || name.startsWith("LH_");
}

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

/** The user's own environment minus every credential variable
 * (claudeEnvDropped) and the app's private LH_* settings. The binary's directory joins PATH so an
 * npm-installed `claude` (a `#!/usr/bin/env node` script) finds its node in a
 * GUI app's bare PATH. Tool search stays off so app tools are never deferred;
 * the user's CLAUDE.md files and auto memory stay out of the tutor's context;
 * the non-streaming fallback is off because its replies carry no stream events. */
export function claudeChildEnv(base: ClaudeEnv, { binary, thinking = true, launch }: { binary?: string; thinking?: boolean; launch?: ClaudeLaunch } = {}): NodeJS.ProcessEnv {
	const env: ClaudeEnv = {};
	for (const [name, value] of Object.entries(base)) {
		if (claudeEnvDropped(name)) continue;
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
	env.CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK = "1";
	if (!thinking) env.CLAUDE_CODE_DISABLE_THINKING = "1";
	return env as NodeJS.ProcessEnv;
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
