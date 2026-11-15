"use client";

import { useEffect, useRef, useState } from "react";
import { nextClaudeAccount, soonestClaudeReset, type ClaudeAccountStatus } from "@/src/core";
import { Button } from "@/components/ui/button";
import { chooseClaudeAccount, claudeResetLabel, readClaudeAccounts } from "@/components/settings/claude-connection";

type Prompt = { state: "checking" } | { state: "ready"; statuses: ClaudeAccountStatus[] } | { state: "failed" };

/** Shown under a turn that stopped at a Claude account's plan limit. Never
 * switches by itself: the learner clicks, and every agent moves to that
 * account. */
export function ClaudeLimitPrompt({ failure, onContinue }: {
	failure: { provider: string };
	onContinue: () => void;
}) {
	const [prompt, setPrompt] = useState<Prompt>({ state: "checking" });
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const mounted = useRef(false);

	useEffect(() => {
		mounted.current = true;
		readClaudeAccounts(false)
			.then((statuses) => { if (mounted.current) setPrompt({ state: "ready", statuses }); })
			.catch(() => { if (mounted.current) setPrompt({ state: "failed" }); });
		return () => { mounted.current = false; };
	}, []);

	async function continueOn(to: string) {
		setBusy(true); setError(null);
		try {
			await chooseClaudeAccount(to);
			onContinue();
		} catch (err) {
			if (mounted.current) setError(`Could not switch accounts: ${err instanceof Error ? err.message : "try again"}.`);
		} finally {
			if (mounted.current) setBusy(false);
		}
	}

	if (prompt.state === "checking") return <span className="text-body system-current:text-row text-muted-foreground" data-testid="claude-limit-checking">Checking your other Claude accounts…</span>;
	if (prompt.state === "failed") return null;
	const next = nextClaudeAccount(failure.provider, prompt.statuses);
	if (!next) {
		const reset = soonestClaudeReset(prompt.statuses);
		return <span className="text-body system-current:text-row text-muted-foreground" data-testid="claude-limit-none">All Claude accounts are at their limit{reset ? ` · the first resets ${claudeResetLabel(reset)}` : ""}</span>;
	}
	const left = next.usage ? ` (${next.usage.percentLeft}% left)` : "";

	return <span className="flex flex-wrap items-center gap-2">
		<Button variant="quiet" size="row" className="text-foreground" data-testid="claude-limit-continue" disabled={busy} onClick={() => void continueOn(next.account.providerId)}>
			Continue on {next.account.label}{left}
		</Button>
		{error && <span role="alert" className="text-body system-current:text-row text-danger">{error}</span>}
	</span>;
}
