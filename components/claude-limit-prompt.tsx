"use client";

import { useEffect, useRef, useState } from "react";
import { MODEL_SLOTS, nextClaudeAccount, soonestClaudeReset, type ChatSettings, type ClaudeAccountStatus, type ModelsSettings } from "@/src/core";
import { Button } from "@/components/ui/button";
import { notifySettingsSaved } from "@/components/settings-signal";
import { claudeResetLabel, readClaudeAccounts } from "@/components/settings/claude-connection";

/** Every slot that ran on `from` now runs the same model and thinking on `to`; null when none did. */
export function moveClaudeSlots(models: ModelsSettings, from: string, to: string): ModelsSettings | null {
	let moved = false;
	const next: ModelsSettings = { ...models };
	for (const slot of MODEL_SLOTS) {
		const current = models[slot];
		if (current?.model?.provider !== from) continue;
		next[slot] = { ...current, model: { provider: to, id: current.model.id } };
		moved = true;
	}
	return moved ? next : null;
}

async function json<T>(response: Response): Promise<T> {
	if (!response.ok) {
		const body = (await response.json().catch(() => ({}))) as { error?: string };
		throw new Error(body.error ?? `status ${response.status}`);
	}
	return response.json() as Promise<T>;
}

const put = (path: string, body: unknown) => fetch(path, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** Moves this session, then every slot that used the exhausted account, to `to`. */
export async function switchClaudeAccount({ chatId, from, to, modelId }: { chatId: string; from: string; to: string; modelId: string }): Promise<void> {
	const [chat, record] = await Promise.all([
		fetch(`/api/chats/${chatId}`).then((r) => json<{ settings?: ChatSettings }>(r)),
		fetch("/api/settings").then((r) => json<{ settings: { models?: ModelsSettings } | null }>(r)),
	]);
	const models = record.settings?.models ?? {};
	const thinkingLevel = chat.settings?.thinkingLevel ?? models.strong?.thinkingLevel;
	await json(await put(`/api/chats/${chatId}/settings`, { model: { provider: to, id: modelId }, ...(thinkingLevel ? { thinkingLevel } : {}) }));
	const moved = moveClaudeSlots(models, from, to);
	if (moved) await json(await put("/api/settings/models", moved));
	notifySettingsSaved("models");
}

type Prompt = { state: "checking" } | { state: "ready"; statuses: ClaudeAccountStatus[] } | { state: "failed" };

/** Shown under a turn that stopped at a Claude account's plan limit. Never
 * switches by itself: the learner clicks. */
export function ClaudeLimitPrompt({ chatId, failure, onContinue }: { chatId: string; failure: { provider: string; model: string }; onContinue: () => void }) {
	const [prompt, setPrompt] = useState<Prompt>({ state: "checking" });
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const mounted = useRef(false);

	useEffect(() => {
		mounted.current = true;
		readClaudeAccounts(true)
			.then((statuses) => { if (mounted.current) setPrompt({ state: "ready", statuses }); })
			.catch(() => { if (mounted.current) setPrompt({ state: "failed" }); });
		return () => { mounted.current = false; };
	}, []);

	async function continueOn(to: string) {
		setBusy(true); setError(null);
		try {
			await switchClaudeAccount({ chatId, from: failure.provider, to, modelId: failure.model });
			onContinue();
		} catch (err) {
			if (mounted.current) setError(`Could not switch accounts: ${err instanceof Error ? err.message : "try again"}.`);
		} finally {
			if (mounted.current) setBusy(false);
		}
	}

	if (prompt.state === "checking") return <span className="text-xs text-muted-foreground" data-testid="claude-limit-checking">Checking your other Claude accounts…</span>;
	if (prompt.state === "failed") return null;
	const next = nextClaudeAccount(failure.provider, prompt.statuses);
	if (!next) {
		const reset = soonestClaudeReset(prompt.statuses);
		return <span className="text-xs" data-testid="claude-limit-none">All Claude accounts are at their limit{reset ? ` · the first resets ${claudeResetLabel(reset)}` : ""}</span>;
	}
	const left = next.usage ? ` (${next.usage.percentLeft}% left)` : "";

	return <span className="flex flex-wrap items-center gap-2">
		<Button variant="outline" size="xs" data-testid="claude-limit-continue" disabled={busy} onClick={() => void continueOn(next.account.providerId)}>
			Continue on {next.account.label}{left}
		</Button>
		{error && <span role="alert" className="text-xs text-destructive">{error}</span>}
	</span>;
}
