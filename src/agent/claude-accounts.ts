import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { CLAUDE_SUBSCRIPTION, claudeProviderId, type ClaudeAccount } from "../core/contracts/claude.ts";
import type { ClaudeLaunch } from "./claude-cli.ts";

/** The Claude accounts the user set up in T3 Code (another app on the same
 * machine). The owner chose that LearnHarness reads T3 Code's stored setup
 * tokens; this is the only module that reads T3 Code's files or a Claude
 * Code config dir's `.claude.json`. A token is read at the moment a child
 * starts and goes only into that child's environment. */

const TOKEN_VAR = "CLAUDE_CODE_OAUTH_TOKEN";
const T3_DRIVER = "claudeAgent";

export type LoadedClaudeAccount =
	| (ClaudeAccount & { auth: "token"; instanceId: string; token: () => string })
	| (ClaudeAccount & { auth: "profile"; instanceId: string; configDir: string })
	| (ClaudeAccount & { auth: "default"; instanceId: string | null });

export interface ClaudeAccountPaths { t3Dir?: string; home?: string }

const b64url = (text: string) => Buffer.from(text, "utf8").toString("base64url");

function json(path: string): unknown {
	try { return JSON.parse(readFileSync(path, "utf8")); } catch { return undefined; }
}
const record = (value: unknown): Record<string, unknown> | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;

function readEmail(configDir: string | null, home: string): string | null {
	const file = configDir === null ? join(home, ".claude.json") : join(configDir, ".claude.json");
	return text(record(record(json(file))?.oauthAccount)?.emailAddress);
}

function expandHome(path: string, home: string): string {
	return path === "~" ? home : path.startsWith("~/") ? join(home, path.slice(2)) : path;
}

function synthetic(home: string): LoadedClaudeAccount {
	return { providerId: CLAUDE_SUBSCRIPTION.providerId, label: "Claude Code", email: readEmail(null, home), auth: "default", instanceId: null };
}

/** Enabled `claudeAgent` instances from T3 Code's settings. When T3 Code is
 * absent, unreadable or has no account on the default home, a synthetic
 * default account stands in: the plain signed-in `claude`, as before accounts. */
export function loadClaudeAccounts({ t3Dir, home = homedir() }: ClaudeAccountPaths = {}): LoadedClaudeAccount[] {
	const t3 = t3Dir ?? join(home, ".t3");
	const defaultHome = resolve(home, ".claude");
	const instances = record(record(json(join(t3, "userdata", "settings.json")))?.providerInstances) ?? {};
	const accounts: LoadedClaudeAccount[] = [];
	for (const [instanceId, raw] of Object.entries(instances)) {
		const instance = record(raw);
		if (instance?.driver !== T3_DRIVER || instance.enabled !== true) continue;
		const homePath = text(record(instance.config)?.homePath);
		const configDir = homePath === null ? null : resolve(expandHome(homePath, home));
		const isDefaultHome = configDir === null || configDir === defaultHome;
		const hasToken = Array.isArray(instance.environment) && instance.environment.some((entry) => record(entry)?.name === TOKEN_VAR);
		const base = {
			providerId: claudeProviderId(isDefaultHome ? null : instanceId),
			label: text(instance.displayName) ?? instanceId,
			email: readEmail(isDefaultHome ? null : configDir, home),
			instanceId,
		};
		if (accounts.some((account) => account.providerId === base.providerId)) continue;
		if (hasToken) {
			const secret = join(t3, "userdata", "secrets", `provider-env-${b64url(instanceId)}-${b64url(TOKEN_VAR)}.bin`);
			accounts.push({ ...base, auth: "token", token: () => readToken(secret, base.label) });
		} else if (isDefaultHome) accounts.push({ ...base, auth: "default" });
		else accounts.push({ ...base, auth: "profile", configDir: configDir! });
	}
	if (!accounts.some((account) => account.providerId === CLAUDE_SUBSCRIPTION.providerId)) accounts.unshift(synthetic(home));
	return accounts;
}

function readToken(path: string, label: string): string {
	let token = "";
	try { token = readFileSync(path, "utf8").trim(); } catch { /* reported below */ }
	if (!token) throw new Error(`LearnHarness could not read T3 Code's setup token for ${label}. Check the account in T3 Code, then press Refresh.`);
	return token;
}

/** The client-safe view: no token, no paths. */
export function publicClaudeAccount({ providerId, label, email, auth }: LoadedClaudeAccount): ClaudeAccount {
	return { providerId, label, email, auth };
}

/** How a child runs on this account. A token account gets a private config
 * dir so the token is its only credential; the synthetic default inherits
 * the user's environment untouched (undefined). Throws when a token is unreadable. */
export function claudeLaunch(account: LoadedClaudeAccount, workDir: string): ClaudeLaunch | undefined {
	switch (account.auth) {
		case "token": {
			const token = account.token();
			const configDir = join(workDir, "accounts", b64url(account.instanceId));
			mkdirSync(configDir, { recursive: true, mode: 0o700 });
			return { token, configDir };
		}
		case "profile":
			return { configDir: account.configDir };
		case "default":
			return account.instanceId === null ? undefined : { configDir: undefined };
	}
}
