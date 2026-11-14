"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChatSettings, ModelCatalogEntry, ModelCatalogResponse, ModelsSettings, UserSettings } from "@/src/core";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { prettyModel } from "@/components/usage-format";
import { composeSlotModel } from "@/components/settings/agent-section";
import { Hint } from "@/components/ui/hint";
import { ChevronDownIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ModelCommand, ThinkingMenuItems } from "@/components/settings/model-pickers";
import { notifySettingsSaved, useSettingsSaved } from "@/components/settings-signal";
import { useModelCatalog } from "@/components/model-catalog";
export { useModelCatalog } from "@/components/model-catalog";
import { defaultOrderLevel, populateLevel, THINKING_LABEL } from "@/components/thinking-default";

/** provider:id → contextWindow over the cached catalog — the client-side
 *  twin of the server's catalogContextLimits join (context-meter
 *  amendment, owner 2026-09-23: pi's live catalog is the ONLY limit
 *  source — no hardcoded fallback exists anywhere, so a model missing
 *  from the index reads limit-null and the meter renders usage-only,
 *  the honest-render precedent). Consumed by the stats readouts: the same
 *  cached /api/models fetch the picker rides feeds the denominator. */
export function catalogLimits(catalog: Pick<ModelCatalogResponse, "models">): Map<string, number> {
	return new Map(catalog.models.map((m) => [`${m.provider}:${m.id}`, m.contextWindow]));
}

/** The trigger: the settings field look (settings.md), 28px. */
const TRIGGER =
	"flex h-7 items-center gap-1.5 rounded-md border border-input bg-transparent pl-2.5 pr-1.5 text-row text-foreground outline-none transition-colors hover:bg-fill-hover focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none";

/**
 * THE CONVERSATION MODEL CONTROL — dual-bound (owner, per-session models,
 * 2026-09-28). WITH a chatId (the lesson's details menu): the pills bind
 * THE SESSION'S OWN record — reads GET /api/chats/:id (its settings field;
 * a legacy unstamped record falls back to the strong slot's display,
 * exactly what the engine resolves), writes PUT /api/chats/:id/settings
 * (validated + level-clamped server-side). The session owns its model +
 * thinking level from birth; the strong slot never reaches it again.
 *
 * WITHOUT a chatId (the draft surfaces — home + /chat/new): the pills
 * bind the STRONG SLOT (reads the raw models section, GET /api/settings;
 * writes PUT /api/settings/models via composeSlotModel — the same seam
 * the settings Agent section and the SetupDialog write): picking there IS
 * changing the new-session default. Unpicked reads "—" (the
 * no-factory-fallback language: the UI never presents a default model).
 */
export function ModelControl({
	chatId,
	onModelChange,
}: {
	chatId?: string;
	onModelChange?: (model: string | undefined) => void;
}) {
	const { catalog, refresh } = useModelCatalog();
	const [models, setModels] = useState<ModelsSettings | undefined>();
	// A successful read with no settings is a legacy session; undefined
	// means no session record is known yet, not permission to inherit Strong.
	const [session, setSession] = useState<{ settings?: ChatSettings }>();
	const [open, setOpen] = useState<"model" | "thinking" | null>(null);
	const [error, setError] = useState<string | null>(null);

	// The record read — BOTH mount and the cross-surface signal land
	// here (fix wave: another surface's models write re-reads into the
	// pill live; own writes also notify, and the refetch is idempotent).
	// Dual-bound: chat mode reads BOTH the session record (the source of
	// truth) and the models section (the display fallback for a legacy
	// unstamped session — exactly what the engine resolves); draft mode
	// reads the models section alone.
	const readRecord = useCallback(() => {
		if (chatId) {
			fetch(`/api/chats/${chatId}`)
				.then((r) => { if (!r.ok) throw new Error(`session read failed: ${r.status}`); return r.json() as Promise<{ settings?: ChatSettings }>; })
				.then((body) => setSession({ settings: body.settings }))
				.catch(() => {
					/* same read-only posture as a models-section failure */
				});
		}
		fetch("/api/settings")
			.then((r) => r.json() as Promise<{ settings: { models?: ModelsSettings } | null }>)
			.then((body) => setModels(body.settings?.models ?? undefined))
			.catch(() => {
				/* the record fetch failing leaves the control read-only
				   ("—" triggers, closed menus) — same posture as a
				   catalog failure */
			});
	}, [chatId]);

	useEffect(() => {
		readRecord();
	}, [readRecord]);

	useSettingsSaved((section) => {
		if (section === "models") readRecord();
	});

	// Dual-bound truth: chat mode displays the session's own record,
	// falling back to Strong only for a successfully read legacy unstamped
	// session — EXACTLY what resolveConversationSpec runs. An unresolved or
	// failed record read must not report a provisional global preference as
	// this session's identity (including to the Send guard). Draft mode is
	// the strong slot itself.
	const strong = models?.strong;
	const override: ChatSettings | undefined = chatId
		? session ? {
				model: session.settings?.model ?? strong?.model,
				thinkingLevel: session.settings?.thinkingLevel ?? strong?.thinkingLevel,
			} : undefined
		: strong;
	const effectiveId = override?.model?.id;
	const effectiveProvider = override?.model?.provider;
	useEffect(() => {
		onModelChange?.(effectiveProvider && effectiveId ? `${effectiveProvider}:${effectiveId}` : undefined);
	}, [effectiveProvider, effectiveId, onModelChange]);
	const storedLevel = override?.thinkingLevel;
	const entry = catalog?.models.find(
		(m) => m.id === effectiveId && m.provider === effectiveProvider,
	);
	const levels = entry?.supportedLevels ?? [];
	// Legacy display (chunk 2 item 4, owner): a record with a model but no
	// stored level shows the RESOLVED level — the ordering's first supported
	// — because that is exactly what the engine build would run. Display-
	// only: the record stays unset until a fresh pick populates it.
	const effectiveLevel = storedLevel ?? (entry ? defaultOrderLevel(levels) : undefined);

	// One write seam: composeSlotModel preserves the cheap/vision siblings
	// (replace-whole-section discipline) and the per-field independence of
	// model + thinkingLevel within the strong slot.
	const save = useCallback(
		async (next: ModelsSettings) => {
			setError(null);
			try {
				const res = await fetch("/api/settings/models", {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(next),
				});
				if (!res.ok) {
					const body = (await res.json().catch(() => ({}))) as { error?: string };
					setError(body.error ?? `settings rejected (${res.status})`);
					return;
				}
				// Server truth, never the request body (fix wave): a pick
				// that rides an unsupported level lands CLAMPED in the record
				// — the pill must show the stored value in this interaction.
				const stored = (
					(await res.json().catch(() => null)) as { settings?: UserSettings } | null
				)?.settings?.models;
				setModels(stored ?? next);
				setOpen(null);
				notifySettingsSaved("models");
			} catch {
				setError("Could not reach the server — try again.");
			}
		},
		[],
	);

	// The session write seam (chat mode): PUT the per-chat settings route
	// — validated + level-clamped server-side; the response is the stored
	// truth (a pick riding an unsupported level lands CLAMPED — the pill
	// shows the stored value). No notifySettingsSaved: the write touches
	// one session's record, not the slots — no other surface reads it.
	const saveChat = useCallback(
		async (next: ChatSettings) => {
			setError(null);
			try {
				const res = await fetch(`/api/chats/${chatId}/settings`, {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(next),
				});
				if (!res.ok) {
					const body = (await res.json().catch(() => ({}))) as { error?: string };
					setError(body.error ?? `settings rejected (${res.status})`);
					return;
				}
				const stored = (await res.json().catch(() => null)) as { settings?: ChatSettings } | null;
				setSession({ settings: stored?.settings ?? next });
				setOpen(null);
			} catch {
				setError("Could not reach the server — try again.");
			}
		},
		[chatId],
	);

	// One apply seam over both write paths: a pick names provider + id +
	// level; chat mode writes the session's own record (any pick pins it),
	// draft mode composes the strong slot (siblings preserved,
	// replace-whole-section discipline).
	const apply = useCallback(
		(provider: string, id: string, level: ThinkingLevel | undefined) => {
			if (chatId) {
				void saveChat({ model: { provider, id }, thinkingLevel: level });
			} else {
				// composeSlotModel's empty-string convention: no level = unset.
				void save(composeSlotModel(models, "strong", provider, id, level ?? ""));
			}
		},
		[chatId, models, save, saveChat],
	);

	// Shortcut seams (keyboard wave A): ⌘K opens the model menu (the
	// universal command convention); Shift+Tab cycles the thinking level
	// up the ladder (wrapping) — the owner's replacement for browser
	// tab-focus. Both work from any focus, including mid-typing.
	useEffect(() => {
		const onOpenPicker = () => {
			setOpen("model");
			setError(null);
			refresh(); // mid-session key changes widen the menu (cache fix)
		};
		window.addEventListener("lh:kbd-open-model-picker", onOpenPicker);
		return () => window.removeEventListener("lh:kbd-open-model-picker", onOpenPicker);
	}, [refresh]);

	useEffect(() => {
		const onCycleThinking = () => {
			if (levels.length === 0) return;
			const idx = effectiveLevel === undefined ? -1 : levels.indexOf(effectiveLevel);
			const next = levels[(idx + 1) % levels.length];
			if (next === undefined) return;
			apply(effectiveProvider ?? "", effectiveId ?? "", next);
		};
		window.addEventListener("lh:kbd-cycle-thinking", onCycleThinking);
		return () => window.removeEventListener("lh:kbd-cycle-thinking", onCycleThinking);
	}, [levels, effectiveLevel, effectiveProvider, effectiveId, apply]);

	// Selecting a model (click and Enter share one path): keep the
	// thinking level only when the new model supports it — otherwise
	// drop it (a carry-over would 400 at the server's catalog gate).
	const pickModel = (m: ModelCatalogEntry) => {
		// Auto-populate (chunk 2, owner: "populate everywhere"): a fresh pick
		// ALWAYS writes a level — the STORED one rides as-is (the write clamps
		// server-side when the new model doesn't support it; the signal
		// re-reads and the clamped truth displays), and a record with no
		// stored level populates the ordering's level. The unset state can
		// never re-enter through this door. (The DERIVED display level never
		// rides — it belongs to the OLD model; the fresh pick's level comes
		// from the fresh model's own ladder.)
		const nextLevel = populateLevel(storedLevel, m.supportedLevels);
		apply(m.provider, m.id, nextLevel);
	};

	// Stale-while-revalidate on manual open too (⌘K covers the keyboard
	// path above): the cached list shows instantly, the fresh federation
	// swaps in when it lands.
	const openMenu = (kind: "model" | "thinking") => {
		setOpen((o) => (o === kind ? null : kind));
		setError(null);
		if (kind === "model") refresh();
	};

	const modelLabel = effectiveId ? `${effectiveProvider ? `${effectiveProvider}:` : ""}${effectiveId}` : "Model selector";
	const levelLabel = effectiveLevel === undefined ? "—" : (THINKING_LABEL[effectiveLevel] ?? effectiveLevel);
	return (
		<div className="flex items-center gap-1.5" data-testid="model-control">
			<Popover open={open === "model"} onOpenChange={(next) => (next ? openMenu("model") : setOpen(null))}>
				<Hint label={modelLabel} action="open-model-picker" side="bottom">
					<PopoverTrigger asChild>
						<button type="button" data-testid="stats-model" className={TRIGGER}>
							<span>{effectiveId ? prettyModel(effectiveId) : "—"}</span>
							<ChevronDownIcon aria-hidden className="size-3.5 text-muted-foreground" />
						</button>
					</PopoverTrigger>
				</Hint>
				<PopoverContent align="end" className="w-[22rem] p-1" data-testid="model-menu">
					<ModelCommand
						models={catalog?.models}
						effectiveId={effectiveId}
						effectiveProvider={effectiveProvider}
						onPick={pickModel}
						error={error}
						footer={
							catalog && catalog.models.length === 0
								? "No models — sign in to Claude or ChatGPT in Settings → Accounts"
								: chatId
									? "This session's model"
									: "Strong tier — the default for new sessions"
						}
					/>
				</PopoverContent>
			</Popover>
			{/* No model picked: nothing to set a level for, so no menu. */}
			<DropdownMenu open={open === "thinking"} onOpenChange={(next) => (next && entry !== undefined ? openMenu("thinking") : setOpen(null))}>
				<Hint label="Thinking" action="cycle-thinking" side="bottom">
					<DropdownMenuTrigger asChild>
						<button type="button" data-testid="stats-thinking" className={TRIGGER}>
							<span>{levelLabel}</span>
							<ChevronDownIcon aria-hidden className="size-3.5 text-muted-foreground" />
						</button>
					</DropdownMenuTrigger>
				</Hint>
				<DropdownMenuContent align="end" className="w-44" data-testid="thinking-menu">
					<ThinkingMenuItems
						levels={catalog ? levels : []}
						effectiveLevel={effectiveLevel}
						onPick={(level) => apply(effectiveProvider ?? "", effectiveId ?? "", level as ThinkingLevel)}
						empty={catalog ? (effectiveId ? `${prettyModel(effectiveId)} has no thinking levels.` : "Pick a model first.") : "Loading…"}
						footer="Levels this model actually supports"
					/>
					{error && <div className="px-2 py-1.5 text-label text-danger">{error}</div>}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}