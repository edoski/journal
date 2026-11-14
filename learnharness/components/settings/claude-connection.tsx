"use client";

import { useEffect, useRef, useState } from "react";
import { CLAUDE_MODEL, type ClaudeAccount, type ClaudeAccountStatus, type ClaudeConnection, type ClaudeUsage } from "@/src/core";
import { Button } from "@/components/ui/button";
import { notifySettingsSaved } from "@/components/settings-signal";
import { useModelStatus } from "@/components/model-status";
import { CONNECTION_BLOCK, ConnectionRow, connectionNoteClass } from "./connection-controls";

export const CLAUDE_LABEL = "Claude";
export const CLAUDE_NOTICE = "Your lessons run on your Claude plan through Claude Code and count toward its limits.";
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

/** The one line under an account whose plan or Claude Code lacks the model. */
export const CLAUDE_MODEL_MISSING_LINE = `${CLAUDE_MODEL.name} is not available on this account's plan or its Claude Code version, so LearnHarness can't run on it.`;

/** PUTs the account every agent runs on, then tells every reader. */
export async function chooseClaudeAccount(providerId: string): Promise<void> {
	const response = await fetch("/api/settings/claude", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ account: providerId }) });
	if (!response.ok) {
		const body = (await response.json().catch(() => ({}))) as { error?: string };
		throw new Error(body.error ?? `status ${response.status}`);
	}
	notifySettingsSaved("claude");
}

/** Reads every account's status; `refresh` re-checks sign-ins and probes usage. */
export async function readClaudeAccounts(refresh: boolean): Promise<ClaudeAccountStatus[]> {
	const response = await fetch(refresh ? `${PATH}?refresh=1` : PATH, { cache: "no-store" });
	if (!response.ok) throw new Error(`status ${response.status}`);
	const body = (await response.json()) as { accounts?: ClaudeAccountStatus[] };
	if (!Array.isArray(body.accounts)) throw new Error("malformed");
	return body.accounts;
}

/** One account: its sign-in, its usage, and whether every agent runs on it.
 * `current` is undefined until the model status loads. Exported for tests. */
export function AccountRow({ status, current, busy, onUse }: { status: ClaudeAccountStatus; current: string | undefined; busy: boolean; onUse: () => void }) {
	const { account, connection, usage, modelMissing } = status;
	const connected = connection.state === "connected";
	const inUse = current === account.providerId;
	return <div className="flex flex-col gap-0.5 pt-1" data-testid="claude-account" data-provider={account.providerId}>
		<div className="flex min-h-7 items-center gap-3">
			<span className="min-w-0 flex-1 truncate text-row text-foreground">{claudeAccountLabel(account)}</span>
			{inUse
				? <span className="text-label text-muted-foreground" data-testid="claude-in-use">In use</span>
				: connected && current !== undefined && <Button type="button" size="sm" variant="outline" className="h-7 cursor-pointer px-3 disabled:cursor-not-allowed" data-testid="claude-use-account" disabled={busy} onClick={onUse}>Use this account</Button>}
		</div>
		<p className={connectionNoteClass("muted")} role="status" data-testid="claude-connection-state">{claudeConnectionSentence(connection, account)}</p>
		{connected && usage && <p className={connectionNoteClass("muted")} data-testid="claude-usage">{claudeUsageSentence(usage)}</p>}
		{modelMissing && <p className={connectionNoteClass("danger")} data-testid="claude-model-missing">{CLAUDE_MODEL_MISSING_LINE}</p>}
	</div>;
}

export function ClaudeConnectionRow() {
	const current = useModelStatus().status?.account;
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

	async function switchTo(providerId: string) {
		setBusy(true); setError(null);
		try {
			await chooseClaudeAccount(providerId);
		} catch (err) {
			if (mounted.current) setError(`Could not switch to this Claude account: ${err instanceof Error ? err.message : "try again"}.`);
		} finally {
			if (mounted.current) setBusy(false);
		}
	}

	return <div className={CONNECTION_BLOCK} data-testid="claude-connection">
		<ConnectionRow label={CLAUDE_LABEL} action="Refresh" actionTestid="claude-refresh" disabled={busy} onAction={() => void refresh()} />
		{!accounts && !error && <p className={connectionNoteClass("muted")} role="status" data-testid="claude-connection-state">{claudeConnectionSentence(null)}</p>}
		{accounts?.map((status) => <AccountRow key={status.account.providerId} status={status} current={current} busy={busy} onUse={() => void switchTo(status.account.providerId)} />)}
		<p className={connectionNoteClass("muted")}>{CLAUDE_NOTICE}</p>
		{error && <p role="alert" className={connectionNoteClass("danger")}>{error}</p>}
	</div>;
}
