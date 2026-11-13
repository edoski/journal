"use client";
/**
 * The first-run setup flow (model-slots wave, 2026-09-20, owner design
 * "A — composer CTA + send interception"): chats cannot start until the
 * user has picked all three model slots — there are no defaults. The graph view's new-session dock (the app's home, where
 * chats start) shows a "Set up your models" CTA while unconfigured;
 * submitting a topic — or sending on /chat/new — opens THIS dialog with
 * the draft preserved; Save stores the slots — the draft WAITS in the
 * composer, the learner sends it themselves (owner ruling 2026-10-09:
 * saving models must never send the message).
 *
 * STAGED BY DEPENDENCY (owner, 2026-09-20: there is no point presenting
 * the model picker before there are models to pick):
 *   Unknown catalog — neutral loading (or error/Retry), never a sign-in screen.
 *   Stage 1 — no signed-in subscription: the sign-in screen (the Claude and
 *     ChatGPT connection rows). The dialog STAYS MOUNTED — a connection
 *     change refreshes the shared catalog and the stage flips to the
 *     pickers on its own; the draft lives in the caller's state, untouched.
 *   Stage 2 — Strong → Cheap → Vision pickers over the connected
 *     subscriptions' models, the vision slot filtered to image-capable
 *     models. Saved disconnected selections and edits are retained
 *     internally in the sign-in stage. Connecting with all slots already
 *     saved closes setup; otherwise the pickers require only the missing
 *     slots. All three required (owner: no skip, no defaults); Save PUTs
 *     the models section and reports onDone(models).
 *
 * Closable without configuring (Esc/backdrop/✕) — browsing the app stays
 * possible; the GATE is the send interception, not the dialog. The
 * settings-dialog visual language: dim backdrop, border rounded-md card,
 * CMU title, z-50.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBackdropDismiss } from "@/components/backdrop-dismiss";
import type React from "react";
import { type ModelCatalogEntry, type ModelSlotName, type ModelsSettings } from "@/src/core";
import { prettyModel } from "@/components/usage-format";
import { ModelMenuList } from "@/components/settings/model-menu";
import { MenuShell } from "@/components/menu-shell";
import { notifySettingsSaved } from "@/components/settings-signal";
import { useModelCatalog } from "@/components/model-catalog";
import { savedSlotsConfigured } from "@/components/setup-cta";
import { Hint } from "@/components/ui/hint";
import { ChatGPTBackgroundAccess } from "@/components/settings/chatgpt-connection";
import { SubscriptionConnections } from "@/components/settings/subscription-connections";
import { defaultOrderLevel, populateLevel, THINKING_LABEL } from "@/components/thinking-default";
import { ThinkingMenuList } from "@/components/settings/model-menu";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { useDesignVariant } from "@/components/design-variant";
import { SettingsDesignContext, useSettingsProposed } from "@/components/settings/settings-design";
import { SettingsGroup, SettingsMenuTrigger, SettingsRow } from "@/components/settings/controls";
import { SLOT_META } from "@/components/settings/agent-section";
import { ModelCommand, ThinkingMenuItems } from "@/components/settings/model-pickers";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** The stage's one line under the title (Proposed: the dialog's description). */
const STAGE_LINE = {
	keys: "Sign in to Claude or ChatGPT. You’ll pick your models next.",
	pickers: "Pick a model for each job. Lessons can start once all three are set.",
} as const;

const SLOT_ORDER: readonly ModelSlotName[] = ["strong", "cheap", "vision"];

/** The GET /api/models response fields the flow consumes. */
interface ModelsBody {
	models: ModelCatalogEntry[];
	providers: { id: string; connected: boolean }[];
	/** The three tiers' RESOLVED pins (BYOK: NULL per unset tier) — the
	 *  PREFILL + "needed" marks (owner, 2026-09-22): pinned tiers open
	 *  with their pick, unpinned tiers carry the mark. */
	slots?: Record<ModelSlotName, { model: { provider: string; id: string }; thinkingLevel?: ThinkingLevel } | null>;
}

/** Pure: which stage the flow opens at — no signed-in subscription =
 *  sign-in first (owner's dependency ordering). Exported for tests. */
export function setupStage(
	providers: { id: string; connected: boolean }[] | null,
): "loading" | "keys" | "pickers" {
	if (providers === null) return "loading";
	return providers.some((p) => p.connected) ? "pickers" : "keys";
}

type ModelSelection = Pick<ModelCatalogEntry, "provider" | "id">;

/** Saved identity is independent of selectable metadata. A disconnected
 * pin still prefills; only the menu is restricted to the live catalog. */
export function prefillFromSlots(
	models: ModelCatalogEntry[],
	slots: Record<ModelSlotName, { model: { provider: string; id: string } } | null> | undefined,
): Partial<Record<ModelSlotName, ModelSelection>> {
	const pre: Partial<Record<ModelSlotName, ModelSelection>> = {};
	for (const slot of SLOT_ORDER) {
		const pin = slots?.[slot];
		const entry = pin?.model
			? models.find((m) => m.provider === pin.model!.provider && m.id === pin.model!.id)
			: undefined;
		if (pin?.model) pre[slot] = entry ?? pin.model;
	}
	return pre;
}

/** Level prefill (chunk 2): a pinned tier opens with its STORED level
 *  as-is (Save clamps server-side if the ladder lapsed), else the
 *  ordering's level for that model — the level a fresh pick would
 *  populate (owner: the ordering's only purpose is first assignment).
 *  Exported pure for tests. */
export function prefillLevelFromPin(
	entry: ModelCatalogEntry,
	pin: { thinkingLevel?: ThinkingLevel } | null | undefined,
): ThinkingLevel {
	return populateLevel(pin?.thinkingLevel, entry.supportedLevels);
}

/** Stage 1's pure body — exported for SSR pins: the subscription rows. */
export function SetupKeysBody() {
	if (useSettingsProposed()) {
		return (
			<div className="flex flex-col gap-6" data-testid="setup-stage-keys">
				<SettingsGroup label="Subscriptions">
					<SubscriptionConnections setup />
				</SettingsGroup>
			</div>
		);
	}
	return (
		<div className="flex flex-col gap-3 px-6 py-5" data-testid="setup-stage-keys">
			<p className="text-xs text-muted-foreground">{STAGE_LINE.keys}</p>
			<SubscriptionConnections setup />
		</div>
	);
}

function prefillLevels(body: ModelsBody | undefined): Partial<Record<ModelSlotName, ThinkingLevel>> {
	const levels: Partial<Record<ModelSlotName, ThinkingLevel>> = {};
	for (const slot of SLOT_ORDER) {
		const pin = body?.slots?.[slot];
		const entry = body?.models.find((m) => m.provider === pin?.model.provider && m.id === pin.model.id);
		if (pin?.thinkingLevel !== undefined) levels[slot] = pin.thinkingLevel;
		else if (entry) levels[slot] = prefillLevelFromPin(entry, pin);
	}
	return levels;
}

interface SetupDialogProps {
	open: boolean;
	onClose: () => void;
	/** Saving never sends the caller's draft. */
	onDone: (models: ModelsSettings) => void;
}

export function SetupDialog(props: SetupDialogProps) {
	// An open owns its draft. Mount-time cache seeding avoids a key-screen
	// first frame, and reopening cannot reuse a previous open's edits.
	return props.open ? <OpenSetupDialog {...props} /> : null;
}

function OpenSetupDialog({ onClose, onDone }: SetupDialogProps) {
	const backdropDismiss = useBackdropDismiss(onClose);
	const { catalog, failed, refresh } = useModelCatalog();
	const providerStageSeen = useRef(false);
	const connectionCloseRequested = useRef(false);
	const [picked, setPicked] = useState(() => prefillFromSlots(catalog?.models ?? [], catalog?.slots));
	const [levels, setLevels] = useState(() => prefillLevels(catalog));
	const editedSlots = useRef(new Set<ModelSlotName>());
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [openMenu, setOpenMenu] = useState<{ slot: ModelSlotName; kind: "model" | "thinking" } | null>(null);
	const proposed = useDesignVariant() === "proposed";

	useEffect(() => {
		if (!catalog) return;
		const pre = prefillFromSlots(catalog.models, catalog.slots);
		const preLevels = prefillLevels(catalog);
		// Fresh metadata is always used, but a response cannot reset an
		// edited slot, including a level chosen while the request was pending.
		setPicked((prev) => {
			const next = { ...prev };
			for (const slot of SLOT_ORDER) if (!editedSlots.current.has(slot)) {
				if (pre[slot]) next[slot] = pre[slot]; else delete next[slot];
			}
			return next;
		});
		setLevels((prev) => {
			const next = { ...prev };
			for (const slot of SLOT_ORDER) if (!editedSlots.current.has(slot)) {
				if (preLevels[slot] !== undefined) next[slot] = preLevels[slot]; else delete next[slot];
			}
			return next;
		});
	}, [catalog]);

	const stage = setupStage(catalog?.providers ?? null);
	const closeAfterConnection = stage === "pickers" && providerStageSeen.current && savedSlotsConfigured(catalog?.slots);
	useEffect(() => {
		if (stage === "keys") providerStageSeen.current = true;
		if (closeAfterConnection && !connectionCloseRequested.current) {
			connectionCloseRequested.current = true;
			onClose(); // Connection recovery is not a model-settings save.
		}
	}, [stage, closeAfterConnection, onClose]);

	// Esc + outside-click — layered dismissal, closable WITHOUT
	// configuring (browsing stays possible; the gate is the send
	// interception, not this dialog). An open slot menu eats Esc first
	// (and any click outside it); only a bare Esc closes the dialog.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Escape") return;
			// THE ONE-ESC LAW (owner, keyboard round 2026-10-06): claim at
			// the document level before the layered dismissal — every branch
			// below acts, so the window chain (abort) must never also
			// fire. One Esc, one action.
			e.preventDefault();
			e.stopPropagation();
			if (openMenu !== null) setOpenMenu(null);
			else onClose();
		};
		const onPointerDown = (e: PointerEvent) => {
			if (!(e.target instanceof Element)) return;
			const t = e.target;
			if (openMenu === null) return;
			const triggerTestid =
				openMenu.kind === "model" ? `setup-trigger-${openMenu.slot}` : `setup-thinking-${openMenu.slot}`;
			if (t.closest("[data-lh-menu]") || t.closest(`[data-testid="${triggerTestid}"]`)) return;
			setOpenMenu(null);
		};
		document.addEventListener("keydown", onKey);
		document.addEventListener("pointerdown", onPointerDown);
		return () => {
			document.removeEventListener("keydown", onKey);
			document.removeEventListener("pointerdown", onPointerDown);
		};
	}, [onClose, openMenu]);

	// Do not briefly paint model pickers between successful connection and
	// closing an already-configured setup. No saved model/thinking writes.
	if (closeAfterConnection) return null;

	const allPicked = SLOT_ORDER.every((s) => picked[s]);

	async function save() {
		if (!allPicked || saving) return;
		setSaving(true);
		setError(null);
		const models: ModelsSettings = {};
		for (const slot of SLOT_ORDER) {
			const level = levels[slot];
			models[slot] = {
				model: { provider: picked[slot]!.provider, id: picked[slot]!.id },
				...(level ? { thinkingLevel: level } : {}),
			};
		}
		const res = await fetch("/api/settings/models", {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(models),
		}).catch(() => null);
		if (!res || !res.ok) {
			setSaving(false);
			setError(res ? `Save failed: ${(await res.json().catch(() => ({}))).error ?? res.status}` : "Save failed. Check your connection and try again.");
			return;
		}
		notifySettingsSaved("models");
		onDone(models);
	}

	const keysBody = <SetupKeysBody />;

	if (proposed) {
		return (
			<SettingsDesignContext.Provider value="proposed">
				<Dialog open onOpenChange={(open) => !open && onClose()}>
					<DialogContent data-testid="setup-dialog" className="max-h-[85vh] max-w-xl gap-6 overflow-y-auto">
						<DialogHeader>
							<DialogTitle>Set up your models</DialogTitle>
							{stage !== "loading" && <DialogDescription>{STAGE_LINE[stage]}</DialogDescription>}
						</DialogHeader>
						<Hint label="Close" binding="escape" side="left">
							<DialogClose aria-label="Close setup" data-testid="setup-close" />
						</Hint>
						{failed && (
							<p role="alert" data-testid="setup-catalog-error" className="text-row text-danger">
								Model catalog could not be loaded. Check the connection and retry.{" "}
								<button type="button" data-testid="setup-retry" className="text-link underline-offset-2 hover:underline" onClick={refresh}>
									Retry
								</button>
							</p>
						)}
						{stage === "loading" ? (
							!failed && <p data-testid="setup-stage-loading" role="status" className="text-row text-muted-foreground">Loading models…</p>
						) : stage === "keys" ? (
							keysBody
						) : (
							<>
								<div data-testid="setup-stage-pickers">
									<SettingsGroup label="Models">
										{SLOT_ORDER.map((slot) => {
											const entry = picked[slot];
											const level = levels[slot];
											const metadata = catalog?.models.find((m) => m.id === entry?.id && m.provider === entry.provider);
											const levelsForEntry = metadata?.supportedLevels ?? (entry ? Object.keys(THINKING_LABEL) : []);
											const available = catalog?.models ?? (failed ? [] : undefined);
											const slotCatalog = slot === "vision" ? available?.filter((m) => m.input.includes("image")) : available;
											const modelOpen = openMenu?.slot === slot && openMenu.kind === "model";
											const thinkingOpen = openMenu?.slot === slot && openMenu.kind === "thinking";
											return (
												<SettingsRow key={slot} label={SLOT_META[slot].label} hint={SLOT_META[slot].roster} testid={`setup-slot-${slot}`}>
													<span className="flex shrink-0 items-center gap-2">
														{slot !== "strong" && <ChatGPTBackgroundAccess provider={entry?.provider} />}
														<Popover modal open={modelOpen} onOpenChange={(next) => setOpenMenu(next ? { slot, kind: "model" } : null)}>
															<Hint label={entry ? `${entry.provider}:${entry.id}` : "Pick a model…"}>
																<PopoverTrigger asChild>
																	<SettingsMenuTrigger
																		value={entry ? prettyModel(entry.id) : "Pick a model…"}
																		aria-label={`${SLOT_META[slot].label} model`}
																		data-testid={`setup-trigger-${slot}`}
																		className={cn("w-40", !entry && "text-muted-foreground")}
																	/>
																</PopoverTrigger>
															</Hint>
															<PopoverContent align="start" className="w-[22rem] p-1" data-testid={`setup-menu-${slot}`}>
																<ModelCommand
																	models={slotCatalog}
																	effectiveId={entry?.id}
																	effectiveProvider={entry?.provider}
																	onPick={(m) => {
																		editedSlots.current.add(slot);
																		setPicked((prev) => ({ ...prev, [slot]: m }));
																		setLevels((prev) => ({ ...prev, [slot]: populateLevel(prev[slot], m.supportedLevels) }));
																		setOpenMenu(null);
																	}}
																	footer={slotCatalog && slotCatalog.length === 0 && slot === "vision" ? "No image-capable models. Sign in to Claude or ChatGPT in Settings → Accounts." : undefined}
																/>
															</PopoverContent>
														</Popover>
														<DropdownMenu open={thinkingOpen} onOpenChange={(next) => setOpenMenu(next ? { slot, kind: "thinking" } : null)}>
															<DropdownMenuTrigger asChild>
																<SettingsMenuTrigger
																	value={entry ? (level ? THINKING_LABEL[level] ?? level : "…") : "—"}
																	aria-label={`${SLOT_META[slot].label} thinking`}
																	data-testid={`setup-thinking-${slot}`}
																	disabled={!entry}
																	className="w-24"
																/>
															</DropdownMenuTrigger>
															<DropdownMenuContent align="start" className="w-44" data-testid={`setup-thinking-menu-${slot}`}>
																<ThinkingMenuItems
																	levels={levelsForEntry.map(String)}
																	effectiveLevel={level}
																	onPick={(lv) => {
																		editedSlots.current.add(slot);
																		setLevels((prev) => ({ ...prev, [slot]: lv as ThinkingLevel }));
																		setOpenMenu(null);
																	}}
																/>
															</DropdownMenuContent>
														</DropdownMenu>
													</span>
												</SettingsRow>
											);
										})}
									</SettingsGroup>
								</div>
								<DialogFooter>
									{error && <p className="mr-auto text-row text-danger">{error}</p>}
									<Button data-testid="setup-save" disabled={!allPicked || saving} onClick={() => void save()}>
										{saving ? "Saving…" : "Save models"}
									</Button>
								</DialogFooter>
							</>
						)}
					</DialogContent>
				</Dialog>
			</SettingsDesignContext.Provider>
		);
	}

	return createPortal(
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-background/80"
			data-testid="setup-backdrop"
			{...backdropDismiss}
		>
			<div
				role="dialog"
				aria-modal="true"
				aria-label="Set up your models"
				data-testid="setup-dialog"
				className="settings-dialog-pop flex max-h-[85vh] w-[640px] max-w-[90vw] flex-col overflow-hidden rounded-md border border-border bg-card shadow-xl"
				onClick={(e) => e.stopPropagation()}
			>
				<header className="flex h-15 shrink-0 items-center gap-3 border-b border-border px-5">
					<h2 className="font-title text-2xl tracking-tight">Set up your models</h2>
					<Hint label="Close" binding="escape" side="left">
<button
						type="button"
						aria-label="Close setup"
						data-testid="setup-close"
						onClick={onClose}
						className="ml-auto text-muted-foreground transition-colors hover:text-foreground"
					>
						✕
					</button>
</Hint>
				</header>

				{failed && (
					<p role="alert" data-testid="setup-catalog-error" className="px-6 py-3 text-sm text-foreground">
						Model catalog could not be loaded. Check the connection and retry. <button type="button" data-testid="setup-retry" className="underline" onClick={refresh}>Retry</button>
					</p>
				)}
				{stage === "loading" ? (
					!failed && <p data-testid="setup-stage-loading" role="status" className="px-6 py-5 text-xs text-muted-foreground">Loading models…</p>
				) : stage === "keys" ? (
					<div className="flex flex-col px-6 py-5">{keysBody}</div>
				) : (
					<div className="flex flex-col gap-4 overflow-y-auto px-6 py-5" data-testid="setup-stage-pickers">
						<p className="text-xs text-muted-foreground">
							Pick the model for each tier. All three are required before chats can start.
						</p>
						{SLOT_ORDER.map((slot) => {
							const entry = picked[slot];
							const level = levels[slot];
							const metadata = catalog?.models.find((m) => m.id === entry?.id && m.provider === entry.provider);
							// Unavailable metadata cannot erase or clamp a saved preference.
							const levelsForEntry = metadata?.supportedLevels ?? (entry ? Object.keys(THINKING_LABEL) : []);
							const available = catalog?.models ?? (failed ? [] : undefined);
							const slotCatalog = slot === "vision" ? available?.filter((m) => m.input.includes("image")) : available;
							return (
								<div key={slot} data-testid={`setup-slot-${slot}`} className="flex flex-col gap-1.5">
									<span className="flex items-center gap-1.5">
										<span className="font-ui text-sm text-foreground">{SLOT_META[slot].label}</span>
										{!catalog?.slots?.[slot]?.model && !picked[slot] && (
											<span
												data-testid={`setup-needed-${slot}`}
												className="rounded-sm border border-border px-1 py-0.5 text-[10px] font-normal tracking-wide text-muted-foreground"
											>
												needed
											</span>
										)}
									</span>
									<span className="text-xs text-muted-foreground/70">{SLOT_META[slot].roster}</span>
									{slot !== "strong" && <ChatGPTBackgroundAccess provider={entry?.provider} />}
									<div className="flex items-center gap-2">
										<div className="relative flex-1">
											<Hint label={entry ? `${entry.provider}:${entry.id}` : "Pick a model…"}>
											<button
												type="button"
												aria-label={`${SLOT_META[slot].label} model`}
												data-testid={`setup-trigger-${slot}`}
												aria-expanded={openMenu?.slot === slot && openMenu.kind === "model"}
												onClick={() => setOpenMenu(openMenu?.slot === slot && openMenu.kind === "model" ? null : { slot, kind: "model" })}
												className="flex h-7 min-w-40 w-full items-center gap-1 rounded-sm border border-border bg-background px-1.5 font-ui text-xs text-foreground transition-colors hover:border-muted-foreground/50"
											>
												<span className="min-w-0 flex-1 truncate">{entry ? prettyModel(entry.id) : "Pick a model…"}</span>
												<span aria-hidden className="text-muted-foreground">
													▾
												</span>
											</button>
											</Hint>
											{/* Anchor by TESTID, not a ref (the settings-section pattern):
											    React attaches a host element's ref AFTER its descendants'
											    layout effects run, so a ref freshly attached in this same
											    commit (menu opening = the ref condition turning true) is
											    still null when MenuShell measures — place() gives up, the
											    menu stays invisible, and only a window resize (which re-runs
											    place()) shows it. querySelector at place time has no such
											    ordering hazard. Live-caught by the owner 2026-10-09: every
											    setup picker opened dead until a window resize. */}
											{openMenu?.slot === slot && openMenu.kind === "model" && (
												<MenuShell
													anchorTestid={`setup-trigger-${slot}`}
													testid={`setup-menu-${slot}`}
													preferredSide="down"
													align="left"
													menuClass="flex w-[22rem] flex-col rounded-xl border border-border bg-card p-2 text-xs shadow-xl"
												>
													<ModelMenuList
														models={slotCatalog}
														effectiveId={entry?.id}
														effectiveProvider={entry?.provider}
														onPick={(m) => {
															editedSlots.current.add(slot);
															setPicked((prev) => ({ ...prev, [slot]: m }));
															// Auto-populate (chunk 2, owner: "populate
															// everywhere"): no explicit level → the
															// ordering's level for the fresh pick; an
															// explicit one rides (Save clamps server-side).
															setLevels((prev) => ({
																...prev,
																[slot]: populateLevel(prev[slot], m.supportedLevels),
															}));
															setOpenMenu(null);
														}}
														footer={slotCatalog && slotCatalog.length === 0 && slot === "vision" ? "No image-capable models. Sign in to Claude or ChatGPT in Settings → Accounts." : undefined}
													/>
												</MenuShell>
											)}
										</div>
										{/* Thinking selector (chunk 2): editable, pre-populated from
										    the ordering per picked model — no model, no levels. */}
										<div className="relative">
											<button
												type="button"
												aria-label={`${SLOT_META[slot].label} thinking`}
												data-testid={`setup-thinking-${slot}`}
												aria-expanded={openMenu?.slot === slot && openMenu.kind === "thinking"}
												disabled={!entry}
												onClick={() => setOpenMenu(openMenu?.slot === slot && openMenu.kind === "thinking" ? null : { slot, kind: "thinking" })}
												className="flex h-7 w-24 items-center gap-1 rounded-sm border border-border bg-background px-1.5 font-ui text-xs text-foreground transition-colors hover:border-muted-foreground/50 disabled:cursor-not-allowed disabled:opacity-40"
											>
												<span className="min-w-0 flex-1 truncate text-left">
													{entry ? (level ? THINKING_LABEL[level] ?? level : "…") : "—"}
												</span>
												<span aria-hidden className="text-muted-foreground">
													▾
												</span>
											</button>
											{openMenu?.slot === slot && openMenu.kind === "thinking" && (
												<MenuShell
													anchorTestid={`setup-thinking-${slot}`}
													testid={`setup-thinking-menu-${slot}`}
													preferredSide="down"
													align="left"
													menuClass="flex w-44 flex-col gap-0.5 rounded-xl border border-border bg-card p-2 text-xs shadow-xl"
												>
													<ThinkingMenuList
														levels={levelsForEntry.map(String)}
														effectiveLevel={level}
														onPick={(lv) => {
															editedSlots.current.add(slot);
															setLevels((prev) => ({ ...prev, [slot]: lv as ThinkingLevel }));
															setOpenMenu(null);
														}}
													/>
												</MenuShell>
											)}
										</div>
									</div>
								</div>
							);
						})}
						<div className="flex items-center gap-3">
							<button
								type="button"
								data-testid="setup-save"
								disabled={!allPicked || saving}
								onClick={() => void save()}
								className="rounded-sm border border-border bg-background px-3 py-1.5 font-ui text-xs text-foreground transition-colors hover:border-muted-foreground/50 disabled:cursor-not-allowed disabled:opacity-40"
							>
								{saving ? "Saving…" : "Save models"}
							</button>
							{error && <p className="text-xs text-red-400">{error}</p>}
						</div>
					</div>
				)}
			</div>
		</div>,
		document.body,
	);
}
