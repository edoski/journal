"use client";

import { useEffect, useRef, useState } from "react";
import { CLAUDE_ROLE_DEFAULTS, CLAUDE_SUBSCRIPTION, MODEL_SLOTS, type ClaudeConnection, type ModelsSettings, type SlotPins } from "@/src/core";
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

/** One plain sentence per state. Sign-in always happens in Claude Code itself. */
export function claudeConnectionSentence(connection: ClaudeConnection | null): string {
	if (!connection) return "Checking Claude Code…";
	switch (connection.state) {
		case "connected": {
			const who = connection.email ? `Signed in as ${connection.email}` : "Signed in";
			return `${who}${connection.plan ? ` · ${plan(connection.plan)} plan` : ""} via Claude Code`;
		}
		case "missing":
			return "Claude Code is not installed. Install Claude Code, run `claude` in a terminal and sign in, then press Refresh.";
		case "signed-out":
			return "Run `claude` in a terminal and sign in with your Claude account, then press Refresh.";
		case "not-subscription":
			return `Claude Code is signed in with ${METHOD_LABELS[connection.authMethod] ?? connection.authMethod}, which would not use your Claude plan. Run \`claude\`, then \`/login\` with your Claude account, then press Refresh.`;
		case "error":
			return connection.message;
	}
}

export function claudeRoleModels(): ModelsSettings {
	const models: ModelsSettings = {};
	for (const slot of MODEL_SLOTS) models[slot] = { model: { provider: CLAUDE_SUBSCRIPTION.providerId, id: CLAUDE_ROLE_DEFAULTS[slot] } };
	return models;
}

function allClaude(slots: SlotPins | undefined): boolean {
	return !!slots && MODEL_SLOTS.every((slot) => slots[slot]?.model.provider === CLAUDE_SUBSCRIPTION.providerId);
}

async function readConnection(refresh: boolean): Promise<ClaudeConnection> {
	const response = await fetch(refresh ? `${PATH}?refresh=1` : PATH, { cache: "no-store" });
	if (!response.ok) throw new Error(`status ${response.status}`);
	const body = (await response.json()) as { connection?: ClaudeConnection };
	if (!body.connection || typeof body.connection.state !== "string") throw new Error("malformed");
	return body.connection;
}

/** Mounted only while signed in, so a signed-out row never reads the catalog. */
function UseForAllRoles({ busy, onUse }: { busy: boolean; onUse: () => void }) {
	const { catalog } = useModelCatalog();
	if (!catalog || allClaude(catalog.slots)) return null;
	return <Button type="button" size="xs" variant="outline" className="cursor-pointer disabled:cursor-not-allowed" data-testid="claude-use-all" disabled={busy} onClick={onUse}>Use for all roles</Button>;
}

export function ClaudeConnectionRow({ labelClassName }: { labelClassName?: string }) {
	const [connection, setConnection] = useState<ClaudeConnection | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const mounted = useRef(false);

	useEffect(() => {
		mounted.current = true;
		readConnection(false)
			.then((value) => { if (mounted.current) setConnection(value); })
			.catch(() => { if (mounted.current) setError("Claude Code's status could not be loaded. Press Refresh to try again."); });
		return () => { mounted.current = false; };
	}, []);

	async function refresh() {
		setBusy(true); setError(null);
		try {
			const value = await readConnection(true);
			if (!mounted.current) return;
			setConnection(value);
			notifySettingsSaved("keys");
		} catch {
			if (mounted.current) setError("Claude Code's status could not be loaded. Press Refresh to try again.");
		} finally {
			if (mounted.current) setBusy(false);
		}
	}

	async function useForAllRoles() {
		setBusy(true); setError(null);
		try {
			const response = await fetch("/api/settings/models", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(claudeRoleModels()) });
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

	const connected = connection?.state === "connected";
	return <div className="flex flex-col gap-1.5" data-testid="claude-connection">
		<ConnectionRow label={CLAUDE_LABEL} labelClassName={labelClassName} action="Refresh" actionTestid="claude-refresh" disabled={busy} onAction={() => void refresh()}>
			{connected && <UseForAllRoles busy={busy} onUse={() => void useForAllRoles()} />}
		</ConnectionRow>
		{(connection || !error) && <p className="text-xs text-muted-foreground" role="status" data-testid="claude-connection-state">{claudeConnectionSentence(connection)}</p>}
		<p className="text-xs text-muted-foreground">{CLAUDE_NOTICE}</p>
		{error && <p role="alert" className="text-xs text-red-400">{error}</p>}
	</div>;
}
