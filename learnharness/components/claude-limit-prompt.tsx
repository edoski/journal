"use client";

import { useEffect, useRef, useState } from "react";
import { nextClaudeAccount, soonestClaudeReset, type ClaudeAccountStatus } from "@/src/core";
import { Button } from "@/components/ui/button";
import { chooseClaudeAccount, claudeResetLabel, readClaudeAccounts } from "@/components/settings/claude-connection";

type Prompt = { state: "checking" } | { state: "ready"; statuses: ClaudeAccountStatus[] } | { state: "failed" };

/** The line for a turn that stopped at a Claude account's plan limit, in
 * the app's words and Settings' time format: "F is out until Tuesday
 * 04:00.", then the account to go on with (round 20, m14: the raw
 * "Your Claude plan's usage limit is reached. It resets at Tue 4:00 AM.
 * See https://claude.ai/settings/usage." stood in red, and the button
 * read "Continue on E (84% left)"). Never switches by itself: the
 * learner clicks, and every agent moves to that account. */
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

	if (prompt.state === "checking") return <span className="text-body text-muted-foreground" data-testid="claude-limit-checking">Checking your other Claude accounts…</span>;
	if (prompt.state === "failed") {
		return <span className="flex flex-wrap items-center gap-2">
			<span className="text-body text-danger" data-testid="claude-limit-out">This Claude account is out for now.</span>
			<Button variant="quiet" size="row" className="text-foreground" data-testid="claude-limit-retry" onClick={onContinue}>Try again</Button>
		</span>;
	}
	const next = nextClaudeAccount(failure.provider, prompt.statuses);
	if (!next) {
		const reset = soonestClaudeReset(prompt.statuses);
		return <span className="text-body text-muted-foreground" data-testid="claude-limit-none">All Claude accounts are at their limit{reset ? ` · the first resets ${claudeResetLabel(reset)}` : ""}</span>;
	}
	const out = prompt.statuses.find((status) => status.account.providerId === failure.provider);
	const until = out?.usage?.resetsAt ? ` until ${claudeResetLabel(out.usage.resetsAt)}` : " for now";

	return <span className="flex flex-wrap items-center gap-2">
		<span className="text-body text-muted-foreground" data-testid="claude-limit-out">{out ? out.account.label : "This Claude account"} is out{until}.</span>
		<Button variant="quiet" size="row" className="text-foreground" data-testid="claude-limit-continue" disabled={busy} onClick={() => void continueOn(next.account.providerId)}>
			Continue on {next.account.label}
		</Button>
		{error && <span role="alert" className="text-body text-danger">{error}</span>}
	</span>;
}
