"use client";

import { useEffect, useRef, useState } from "react";
import { CLAUDE_ROLE_DEFAULT, MODEL_SLOTS, type ClaudeAccount, type ClaudeAccountStatus, type ClaudeConnection, type ClaudeUsage, type ModelsSettings, type SlotPins } from "@/src/core";
import { Button } from "@/components/ui/button";
import { notifySettingsSaved } from "@/components/settings-signal";
import { useModelCatalog } from "@/components/model-catalog";
import { ConnectionRow } from "./connection-controls";

export const CLAUDE_LABEL = "Claude (your subscription)";
export const CLAUDE_NOTICE = "Prompts and session context go to Anthropic through Claude Code and count toward your Claude plan's usage limits.";
const PATH = "/api/subscriptions/claude";

const METHOD_LABELS: Record<string, string> = {
	api_key: "an API key",
	api_key_helper: "an API key helper",
	oauth_token: "a long-lived access token",
	third_party: "a cloud provider account",
	bedrock: "Amazon Bedrock",
	vertex: "Google Vertex AI",
	foundry: "Microsoft Foundry",
};

function plan(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}

export function claudeAccountLabel(account: Pick<ClaudeAccount, "label">): string {
	return `Claude · ${account.label}`;
}

/** One plain sentence per state. Sign-in always happens in Claude Code or T3 Code itself. */
export function claudeConnectionSentence(connection: ClaudeConnection | null, account?: Pick<ClaudeAccount, "email" | "auth">): string {
	if (!connection) return "Checking Claude Code…";
	switch (connection.state) {
		case "connected": {
			const email = connection.email ?? account?.email;
			const who = email ? `Signed in as ${email}` : "Signed in";
			return `${who}${connection.plan ? ` · ${plan(connection.plan)} plan` : ""} via Claude Code`;
		}
		case "missing":
			return "Claude Code is not installed. Install Claude Code, run `claude` in a terminal and sign in, then press Refresh.";
		case "signed-out":
			return account?.auth === "token"
				? "Claude Code did not accept T3 Code's setup token for this account. Renew it in T3 Code, then press Refresh."
				: "Run `claude` in a terminal and sign in with your Claude account, then press Refresh.";
		case "not-subscription":
			return `Claude Code is signed in with ${METHOD_LABELS[connection.authMethod] ?? connection.authMethod}, which would not use your Claude plan. Run \`claude\`, then \`/login\` with your Claude account, then press Refresh.`;
		case "error":
			return connection.message;
	}
}

/** resetsAt is Unix seconds; reads like "Thu 04:00". */
export function claudeResetLabel(resetsAt: number): string {
	return new Date(resetsAt * 1000).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

export function claudeUsageSentence(usage: ClaudeUsage): string {
	const reset = usage.resetsAt ? ` · resets ${claudeResetLabel(usage.resetsAt)}` : "";
	return usage.limited ? `limit reached${reset}` : `${usage.percentLeft}% left this week${reset}`;
}

export function claudeRoleModels(providerId: string): ModelsSettings {
	const models: ModelsSettings = {};
	for (const slot of MODEL_SLOTS) models[slot] = { model: { provider: providerId, id: CLAUDE_ROLE_DEFAULT.id }, thinkingLevel: CLAUDE_ROLE_DEFAULT.thinkingLevel };
	return models;
}

function holdsAllRoles(slots: SlotPins | undefined, providerId: string): boolean {
	return !!slots && MODEL_SLOTS.every((slot) => slots[slot]?.model.provider === providerId && slots[slot]?.model.id === CLAUDE_ROLE_DEFAULT.id);
}

/** Reads every account's status; `refresh` re-checks sign-ins and probes usage. */
export async function readClaudeAccounts(refresh: boolean): Promise<ClaudeAccountStatus[]> {
	const response = await fetch(refresh ? `${PATH}?refresh=1` : PATH, { cache: "no-store" });
	if (!response.ok) throw new Error(`status ${response.status}`);
	const body = (await response.json()) as { accounts?: ClaudeAccountStatus[] };
	if (!Array.isArray(body.accounts)) throw new Error("malformed");
	return body.accounts;
}

/** Mounted only while signed in, so a signed-out row never reads the catalog. */
function UseForAllRoles({ providerId, busy, onUse }: { providerId: string; busy: boolean; onUse: () => void }) {
	const { catalog } = useModelCatalog();
	if (!catalog || holdsAllRoles(catalog.slots, providerId)) return null;
	return <Button type="button" size="xs" variant="outline" className="cursor-pointer disabled:cursor-not-allowed" data-testid="claude-use-all" disabled={busy} onClick={onUse}>Use for all roles</Button>;
}

function AccountRow({ status, busy, labelClassName, onUse }: { status: ClaudeAccountStatus; busy: boolean; labelClassName?: string; onUse: () => void }) {
	const { account, connection, usage } = status;
	const connected = connection.state === "connected";
	return <div className="flex flex-col gap-0.5" data-testid="claude-account" data-provider={account.providerId}>
		<div className="flex flex-wrap items-center gap-3">
			<span className={labelClassName ?? "font-ui text-xs text-foreground"}>{claudeAccountLabel(account)}</span>
			{connected && <UseForAllRoles providerId={account.providerId} busy={busy} onUse={onUse} />}
		</div>
		<p className="text-xs text-muted-foreground" role="status" data-testid="claude-connection-state">{claudeConnectionSentence(connection, account)}</p>
		{connected && usage && <p className="text-xs text-muted-foreground" data-testid="claude-usage">{claudeUsageSentence(usage)}</p>}
	</div>;
}

export function ClaudeConnectionRow({ labelClassName }: { labelClassName?: string }) {
	const [accounts, setAccounts] = useState<ClaudeAccountStatus[] | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const mounted = useRef(false);

	useEffect(() => {
		mounted.current = true;
		readClaudeAccounts(false)
			.then((value) => { if (mounted.current) setAccounts(value); })
			.catch(() => { if (mounted.current) setError("Claude Code's status could not be loaded. Press Refresh to try again."); });
		return () => { mounted.current = false; };
	}, []);

	async function refresh() {
		setBusy(true); setError(null);
		try {
			const value = await readClaudeAccounts(true);
			if (!mounted.current) return;
			setAccounts(value);
			notifySettingsSaved("keys");
		} catch {
			if (mounted.current) setError("Claude Code's status could not be loaded. Press Refresh to try again.");
		} finally {
			if (mounted.current) setBusy(false);
		}
	}

	async function useForAllRoles(providerId: string) {
		setBusy(true); setError(null);
		try {
			const response = await fetch("/api/settings/models", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(claudeRoleModels(providerId)) });
			if (!response.ok) {
				const body = (await response.json().catch(() => ({}))) as { error?: string };
				throw new Error(body.error ?? `status ${response.status}`);
			}
			notifySettingsSaved("models");
		} catch (err) {
			if (mounted.current) setError(`Could not switch your models to Claude: ${err instanceof Error ? err.message : "try again"}.`);
		} finally {
			if (mounted.current) setBusy(false);
		}
	}

	return <div className="flex flex-col gap-1.5" data-testid="claude-connection">
		<ConnectionRow label={CLAUDE_LABEL} labelClassName={labelClassName} action="Refresh" actionTestid="claude-refresh" disabled={busy} onAction={() => void refresh()} />
		{!accounts && !error && <p className="text-xs text-muted-foreground" role="status" data-testid="claude-connection-state">{claudeConnectionSentence(null)}</p>}
		{accounts?.map((status) => <AccountRow key={status.account.providerId} status={status} busy={busy} labelClassName={labelClassName} onUse={() => void useForAllRoles(status.account.providerId)} />)}
		<p className="text-xs text-muted-foreground">{CLAUDE_NOTICE}</p>
		{error && <p role="alert" className="text-xs text-red-400">{error}</p>}
	</div>;
}
