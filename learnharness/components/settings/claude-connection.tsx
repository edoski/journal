"use client";

import { useEffect, useRef, useState } from "react";
import { CLAUDE_MODEL, type ClaudeAccount, type ClaudeAccountStatus, type ClaudeConnection, type ClaudeUsage } from "@/src/core";
import { Button } from "@/components/ui/button";
import { notifySettingsSaved } from "@/components/settings-signal";
import { refreshModelStatus, useModelStatus } from "@/components/model-status";
import { cn } from "@/lib/utils";
import { ConnectionRow, connectionNoteClass } from "./connection-controls";

/** Each part of Claude's block is a row of the Accounts group, padded like
 *  the settings rows, so the group's hairlines part the accounts and the
 *  closing note sits as far from the last account as any row from the next
 *  (round 4: the note was crammed 8px under it). */
const CLAUDE_ROW = "px-4 py-3";

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

/** An account's name in Settings: the email it signs in with, the name
 *  Edo knows it by (round 4: "Claude · A" used T3 Code's one-letter display
 *  name, which meant nothing). Without an email, the name T3 Code gives it. */
export function claudeAccountName(status: Pick<ClaudeAccountStatus, "account" | "connection">): string {
	const live = status.connection.state === "connected" ? status.connection.email : null;
	return live ?? status.account.email ?? status.account.label;
}

/** One plain sentence per state. Sign-in always happens in Claude Code or T3 Code itself. */
export function claudeConnectionSentence(connection: ClaudeConnection | null, account?: Pick<ClaudeAccount, "auth">): string {
	if (!connection) return "Checking Claude Code…";
	switch (connection.state) {
		case "connected":
			return `Signed in through Claude Code${connection.plan ? ` on the ${plan(connection.plan)} plan` : ""}`;
		case "missing":
			return "Claude Code is not installed. Install Claude Code, run `claude` in a terminal and sign in, then press Refresh.";
		case "signed-out":
			return account?.auth === "token"
				? "This account isn't signed in. Sign in to it again in T3 Code, then press Refresh."
				: "Run `claude` in a terminal and sign in with your Claude account, then press Refresh.";
		case "not-subscription":
			return `Claude Code is signed in with ${METHOD_LABELS[connection.authMethod] ?? connection.authMethod}, which would not use your Claude plan. Run \`claude\`, then \`/login\` with your Claude account, then press Refresh.`;
		case "error":
			return connection.message;
	}
}

/** resetsAt is Unix seconds; reads like "Thursday 04:00". */
export function claudeResetLabel(resetsAt: number): string {
	return new Date(resetsAt * 1000).toLocaleString(undefined, { weekday: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

/** How much of the week is left, in words that need no number (Edo's
 *  ruling: no percentages). Three even bands of the share Claude Code
 *  reports, the coarsest split that still tells "carry on" from "keep an
 *  eye on it" from "switch soon"; nothing finer is worth a word. */
function leftWords(percentLeft: number): string {
	if (percentLeft <= 0) return "Nothing left this week";
	if (percentLeft * 3 > 200) return "Plenty left this week";
	if (percentLeft * 3 >= 100) return "About half left this week";
	return "Little left this week";
}

export function claudeUsageSentence(usage: ClaudeUsage): string {
	const reset = usage.resetsAt ? claudeResetLabel(usage.resetsAt) : null;
	if (usage.limited) return reset ? `At its limit until ${reset}` : "At its limit for now";
	return reset ? `${leftWords(usage.percentLeft)}, resets ${reset}` : leftWords(usage.percentLeft);
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

/** One account, as a settings row: its name, its sign-in and usage under
 *  it, and Use this account (or In use) at the right. `current` is
 *  undefined until the model status loads. `alias` names the account as T3
 *  Code does when another row signs in with the same email. Exported for tests. */
export function AccountRow({ status, current, busy, onUse, alias, checking = false }: { status: ClaudeAccountStatus; current: string | undefined; busy: boolean; onUse: () => void; alias?: string; checking?: boolean }) {
	const { account, connection, usage, modelMissing } = status;
	const connected = connection.state === "connected";
	const inUse = current === account.providerId;
	return <div className={cn(CLAUDE_ROW, "flex flex-col gap-0.5")} data-testid="claude-account" data-provider={account.providerId}>
		<div className="flex min-h-7 items-center gap-3">
			<span className="min-w-0 flex-1 truncate text-body system-current:text-row text-foreground" data-testid="claude-account-name">
				{claudeAccountName(status)}
				{alias && <span className="text-muted-foreground">, named {alias} in T3 Code</span>}
			</span>
			{inUse
				? <span className="text-callout system-current:text-label text-muted-foreground" data-testid="claude-in-use">In use</span>
				: connected && current !== undefined && <Button type="button" size="compact" variant="outline" className="cursor-pointer disabled:cursor-not-allowed" data-testid="claude-use-account" disabled={busy} onClick={onUse}>Use this account</Button>}
		</div>
		<p className={connectionNoteClass("muted")} role="status" data-testid="claude-connection-state">{claudeConnectionSentence(checking ? null : connection, account)}</p>
		{!checking && connected && usage && <p className={connectionNoteClass("muted")} data-testid="claude-usage">{claudeUsageSentence(usage)}</p>}
		{modelMissing && <p className={connectionNoteClass("danger")} data-testid="claude-model-missing">{CLAUDE_MODEL_MISSING_LINE}</p>}
	</div>;
}

/** T3 Code's name for each account whose email another row shares, so two
 *  rows never read the same. */
function aliases(statuses: readonly ClaudeAccountStatus[]): Map<string, string> {
	const rows = new Map<string, number>();
	for (const status of statuses) rows.set(claudeAccountName(status), (rows.get(claudeAccountName(status)) ?? 0) + 1);
	return new Map(statuses.filter((status) => rows.get(claudeAccountName(status))! > 1 && status.account.label !== claudeAccountName(status)).map((status) => [status.account.providerId, status.account.label]));
}

export function ClaudeConnectionRow() {
	const current = useModelStatus().status?.account;
	const [accounts, setAccounts] = useState<ClaudeAccountStatus[] | null>(null);
	const [busy, setBusy] = useState(false);
	const [checking, setChecking] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const mounted = useRef(false);
	// Refresh is disabled while it checks, and the browser drops focus from
	// a disabled button: focus comes back to it once the check is done
	// (round 12, 4 minor 6: focus fell to the page while still signed out).
	const refreshButton = useRef<HTMLButtonElement>(null);
	const refocus = useRef(false);
	useEffect(() => {
		if (busy || !refocus.current) return;
		refocus.current = false;
		const active = document.activeElement;
		if (!active || active === document.body) refreshButton.current?.focus();
	}, [busy]);

	useEffect(() => {
		mounted.current = true;
		readClaudeAccounts(false)
			.then((value) => { if (mounted.current) setAccounts(value); })
			.catch(() => { if (mounted.current) setError("Claude Code's status could not be loaded. Press Refresh to try again."); });
		return () => { mounted.current = false; };
	}, []);

	// Refresh (round 10, 4 minor 1): every row reads "Checking" until the
	// fresh reading lands, the account in use is re-checked at once apart
	// from the slower usage probes, so the dialog closes and the line
	// clears as soon as it is signed in, and every reader hears the result
	// even once the dialog has closed.
	async function refresh() {
		refocus.current = document.activeElement === refreshButton.current;
		setBusy(true); setChecking(true); setError(null);
		refreshModelStatus(true);
		try {
			const value = await readClaudeAccounts(true);
			notifySettingsSaved("keys");
			if (mounted.current) setAccounts(value);
		} catch {
			if (mounted.current) setError("Claude Code's status could not be loaded. Press Refresh to try again.");
		} finally {
			if (mounted.current) { setBusy(false); setChecking(false); }
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

	const alias = aliases(accounts ?? []);
	return <>
		<div className={CLAUDE_ROW} data-testid="claude-connection">
			<ConnectionRow label={CLAUDE_LABEL} action="Refresh" actionTestid="claude-refresh" actionRef={refreshButton} disabled={busy} onAction={() => void refresh()} />
			{!accounts && !error && <p className={connectionNoteClass("muted")} role="status" data-testid="claude-connection-state">{claudeConnectionSentence(null)}</p>}
			{error && <p role="alert" className={connectionNoteClass("danger")}>{error}</p>}
		</div>
		{accounts?.map((status) => <AccountRow key={status.account.providerId} status={status} current={current} busy={busy} checking={checking} alias={alias.get(status.account.providerId)} onUse={() => void switchTo(status.account.providerId)} />)}
		<p className={cn(CLAUDE_ROW, connectionNoteClass("muted"))} data-testid="claude-notice">{CLAUDE_NOTICE}</p>
	</>;
}
