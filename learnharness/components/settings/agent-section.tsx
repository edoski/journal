"use client";
/**
 * The Agent section (settings-app wave): the THREE MODEL SLOTS and the
 * tool toggles — two GROUPS (Models / Tools).
 *
 * Model slots (model-slots wave, 2026-09-20, owner ruling: SLOTS ONLY —
 * the six per-role rows disappeared; per-role overrides remain in the
 * schema for a future advanced surface): Strong = Prober + Teacher, Cheap
 * = the five workhorse roles, Vision = Visual maker + PDF reader. Each
 * slot row carries the shared dropdown (fuzzy search, arrow-walk, Enter
 * pick — ModelMenuList/ThinkingMenuList from ./model-menu.tsx) over the
 * FEDERATED catalog (/api/models serves only keyed providers, fresh per
 * call — saving a key in Keys immediately widens this picker). The
 * vision slot filters to image-capable models (Model.input). The slots
 * live in the `models` settings section (PUT /api/settings/models — slot
 * pins are engine-level, not per-chat); the rest of the section writes
 * the `agent` section as before. Resolution per tier: slot override →
 * factory pin (GET /api/models' `slots` — resolved, cannot drift from
 * what runs). The Default row clears the slot override; a stored id stays
 * VISIBLE even when its provider's key lapsed out of the catalog — a
 * trigger showing "Default" over a live override would lie about the
 * record.
 *
 * Tools — the owner's final list (2026-09-19): research, demo, visual, pdf.
 * Absent key = enabled in the schema; the UI writes explicit booleans for
 * all four (simpler to reason about, sanitize-equivalent).
 */

import { useEffect, useRef, useState } from "react";
import { MenuShell } from "@/components/menu-shell";
import { defaultOrderLevel, populateLevel } from "@/components/thinking-default";
import { useModelCatalog } from "@/components/model-catalog";
import { Hint } from "@/components/ui/hint";
import type React from "react";
import {
	COMPACTION_THRESHOLD_FLOOR,
	MODEL_SLOTS,
	resolveSettings,
	type AgentSettings,
	type CompactionSettings,
	type GraphSettings,
	type ModelCatalogEntry,
	type ModelSlotName,
	type ModelsSettings,
} from "@/src/core";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { prettyModel } from "@/components/usage-format";
import { SettingsGroup, SettingsRow, SettingsMenuTrigger, Toggle, CommitInput } from "./controls.tsx";
import { useSettingsProposed } from "./settings-design";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { MENU_SURFACE } from "@/components/ui/menu";
import { ModelMenuList, ThinkingMenuList } from "./model-menu";
import { ModelCommand, ThinkingMenuItems } from "./model-pickers";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChatGPTBackgroundAccess } from "./chatgpt-connection";

/** One slot's display identity — the tier's roster as the row hint rides
 *  with the resolved default (owner: the hint ALWAYS names the default). */
const SLOT_META: Record<ModelSlotName, { label: string; roster: string }> = {
	strong: { label: "Strong", roster: "The main model for your sessions" },
	cheap: { label: "Cheap", roster: "The assistants that research, build demos, and grade your work" },
	vision: { label: "Vision", roster: "The assistants that draw and read PDFs" },
};

/** The owner's final toggleable-tool list (confirm with the user before
 *  changing — the Teacher stream settled this 2026-09-19). */
export const TOGGLE_TOOLS = ["research", "demo", "visual", "pdf"] as const;

/** The tool rows' names under the Proposed design, where the group already says "Tools". */
const TOOL_LABEL: Record<(typeof TOGGLE_TOOLS)[number], string> = {
	research: "Research",
	demo: "Demos",
	visual: "Figures",
	pdf: "PDF reading",
};

const THINKING_LEVELS: readonly ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

/** Compose: one tool toggled, the rest of the section carried verbatim.
 *  Pure — exported for tests. */
export function composeTool(agent: AgentSettings | undefined, id: string, on: boolean): AgentSettings {
	return { ...agent, tools: { ...agent?.tools, [id]: on } };
}

/** Compose the prober graph-tools toggle (wave 7): its own key in the
 *  agent section — never in the tool-toggles map (owner ruling). Absent =
 *  ON (the toggle discipline); the write is explicit either way, so an
 *  explicit-off record stays visible as stored. Pure — exported for tests. */
export function composeGraphTools(agent: AgentSettings | undefined, on: boolean): AgentSettings {
	return { ...agent, graphTools: { enabled: on } };
}

/** Compose: one slot's model/thinking override. Empty model = absent
 *  override (Default — falls to the factory pin); empty thinking = the
 *  tier keeps its resolved thinking budget. Per-field independence, same
 *  as the schema's ModelSlot. Pure — exported for tests. */
export function composeSlotModel(
	models: ModelsSettings | undefined,
	slot: ModelSlotName,
	provider: string,
	id: string,
	thinking: string,
): ModelsSettings {
	const prev = models?.[slot];
	const next = { ...models };
	if (!provider && !id && !thinking) {
		delete next[slot];
		return next;
	}
	next[slot] = {
		...(provider && id ? { model: { provider, id } } : prev?.model ? { model: prev.model } : {}),
		...(thinking ? { thinkingLevel: thinking as ThinkingLevel } : {}),
	};
	return next;
}

/** The collapsed select look (owner: "the look of the collapsed menu is
 *  good") — now a button that opens the shared model-picker dropdown. */
function MenuTrigger({
	value,
	emptyLabel,
	ariaLabel,
	testid,
	open,
	onClick,
	widthClass,
	hint,
}: {
	value: string;
	hint?: string;
	/** What the trigger shows when there is no override ("Default"). */
	emptyLabel: string;
	ariaLabel: string;
	testid: string;
	open: boolean;
	onClick: () => void;
	/** Owner (2026-09-20): the thinking trigger is FIXED at the width the
	 *  Default state needs (values shifting it mid-edit shifted the row);
	 *  the model trigger takes the same width as a MINIMUM — its values
	 *  genuinely vary in length. */
	widthClass: string;
}) {
	const button = (
		<SettingsMenuTrigger
			value={value || emptyLabel}
			aria-label={ariaLabel}
			aria-expanded={open}
			data-testid={testid}
			onClick={onClick}
			className={widthClass}
		/>
	);
	return hint ? <Hint label={hint}>{button}</Hint> : button;
}

/* The section's dropdowns all mount the shared MenuShell (fix wave chunk
 * B): portaled to document.body, fixed-anchored to the open trigger by
 * testid (the section's one-ref pattern), opening DOWN with the shell's
 * viewport cap and auto-flip. data-lh-menu rides the shell — the
 * outside-click contract's exemption mark. */

export function AgentSection({
	agent,
	models,
	graph,
	compaction,
	onSectionChange,
	onModelsChange,
	onCompactionChange,
}: {
	agent: AgentSettings | undefined;
	/** The `models` section (slot pins — engine-level, PUT /api/settings/models). */
	models: ModelsSettings | undefined;
	/** The `graph` section — READ ONLY here: the graphTools row composes its
	 *  master switch (graph.enabled off dims + disables the row; the
	 *  effective gate is server-side, per-turn fresh). */
	graph: GraphSettings | undefined;
	/** The `compaction` section — its own PUT (the threshold is engine
	 *  behavior, not an agent-section key; owner round 14, Agent tab). */
	compaction: CompactionSettings | undefined;
	/** Writes the composed WHOLE agent section (replace-PUT discipline). */
	onSectionChange: (next: AgentSettings) => void;
	/** Writes the composed models section (slots — replace-PUT discipline). */
	onModelsChange: (next: ModelsSettings) => void;
	/** Writes the whole compaction section (replace-PUT discipline). */
	onCompactionChange: (next: CompactionSettings) => void;
}) {
	const { catalog: body, failed: catalogFailed, refresh: refreshCatalog } = useModelCatalog();
	const catalog = body?.models;
	const slots = body?.slots;
	/** One open dropdown for the whole section: which slot, which kind. */
	const [openMenu, setOpenMenu] = useState<{ target: ModelSlotName; kind: "model" | "thinking" } | null>(null);
	const menuAnchorRef = useRef<HTMLSpanElement>(null);
	const proposed = useSettingsProposed();
	const menuVariant = proposed ? "proposed" : "current";

	// The dropdown contract (the chat model selector's, mirrored): any
	// click outside the open menu — or an Esc — closes it. Esc is CLAIMED
	// with stopPropagation so the settings dialog behind does NOT also
	// close. A pointerdown on the backdrop is left for the dialog (its own
	// click closes everything); a click inside the dialog just closes us.
	useEffect(() => {
		// Proposed: the Radix layers dismiss themselves (overlay.md).
		if (openMenu === null || proposed) return;
		const onPointerDown = (e: PointerEvent) => {
			const target = e.target as Node;
			if (menuAnchorRef.current?.contains(target)) return;
			if (target instanceof Element && target.closest("[data-lh-menu]")) return;
			if (target instanceof Element && target.closest('[role="dialog"]')) {
				setOpenMenu(null);
			}
			// else: outside the dialog — the dialog's own close handles it.
		};
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.stopPropagation();
				setOpenMenu(null);
			}
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [openMenu, proposed]);

	// Resolved through the SAME core resolver the server's effective
	// settings use (the GraphSection precedent): the hint and placeholder
	// report exactly the number the trigger waits for.
	const resolvedCompaction = resolveSettings(
		compaction === undefined ? null : { version: 1, compaction },
	).compaction;

	return (
		<>
			<SettingsGroup label="Models" testid="group-models">
				{catalogFailed && <p role="alert" className={proposed ? "px-4 py-2.5 text-label text-danger" : "text-xs text-red-400"}>Model catalog could not be loaded. Check the connection and retry. <button type="button" className="underline" onClick={refreshCatalog}>Retry</button></p>}
				{MODEL_SLOTS.map((slot) => {
					const override = models?.[slot];
					const modelId = override?.model?.id ?? "";
					const provider = override?.model?.provider ?? "";
					const thinking = override?.thinkingLevel ?? "";
					// The tier's resolved pin is machinery only now (owner, fix
					// wave): the UI never names the factory fallback — the hint
					// carries the roster, the triggers read "—" when unpicked — but
					// the pin still governs the thinking level LIST when no override
					// names a model to read levels from.
					const pin = slots?.[slot];
					// The model whose levels govern the thinking list: the
					// override, else the resolved pin (when it's in the federated
					// catalog); the standard ladder as the last fallback.
					const coord = override?.model ?? pin?.model;
					const chosen = coord ? catalog?.find((m) => m.id === coord.id && m.provider === coord.provider) : undefined;
					const levels = chosen ? chosen.supportedLevels : THINKING_LEVELS;
					const thisMenuOpen = openMenu?.target === slot ? openMenu.kind : null;
					// Vision slots pick from image-capable models only.
					const slotCatalog =
						slot === "vision" ? catalog?.filter((m) => m.input.includes("image")) : catalog;
					const effectiveLevel = thinking || (chosen ? defaultOrderLevel(levels) : undefined);
					const pickModel = (entry: ModelCatalogEntry) => {
						// Auto-populate (chunk 2, owner: "populate everywhere"): the
						// fresh pick writes a level — the stored one rides as-is
						// (the write clamps server-side), else the ordering's level.
						const next = populateLevel(thinking || undefined, entry.supportedLevels);
						onModelsChange(composeSlotModel(models, slot, entry.provider, entry.id, next));
						setOpenMenu(null);
					};
					const pickLevel = (level: string) => {
						onModelsChange(composeSlotModel(models, slot, provider, modelId, level));
						setOpenMenu(null);
					};
					const modelFooter = catalog && catalog.length === 0 ? "No models — sign in to Claude or ChatGPT in Providers" : "Runs every agent of this tier";
					if (proposed) {
						const modelTrigger = (
							<PopoverTrigger asChild>
								<SettingsMenuTrigger value={modelId ? prettyModel(modelId) : "—"} aria-label={`${SLOT_META[slot].label} model`} data-testid={`slot-model-${slot}`} className="w-40" />
							</PopoverTrigger>
						);
						return (
							<SettingsRow key={slot} label={SLOT_META[slot].label} hint={SLOT_META[slot].roster} testid={`slot-row-${slot}`}>
								<span className="flex items-center gap-2">
									{slot !== "strong" && <ChatGPTBackgroundAccess provider={coord?.provider} />}
									<Popover modal open={thisMenuOpen === "model"} onOpenChange={(next) => setOpenMenu(next ? { target: slot, kind: "model" } : null)}>
										{modelId ? <Hint label={`${provider}:${modelId}`}>{modelTrigger}</Hint> : modelTrigger}
										<PopoverContent align="end" className="w-[22rem] p-1" data-testid={`slot-model-menu-${slot}`}>
											<ModelCommand models={slotCatalog ?? undefined} effectiveId={modelId} effectiveProvider={provider} onPick={pickModel} footer={modelFooter} />
										</PopoverContent>
									</Popover>
									<DropdownMenu open={thisMenuOpen === "thinking"} onOpenChange={(next) => setOpenMenu(next ? { target: slot, kind: "thinking" } : null)}>
										<DropdownMenuTrigger asChild>
											<SettingsMenuTrigger value={effectiveLevel ?? "—"} aria-label={`${SLOT_META[slot].label} thinking`} data-testid={`slot-thinking-${slot}`} className="w-24" />
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end" className="w-44" data-testid={`slot-thinking-menu-${slot}`}>
											<ThinkingMenuItems levels={levels.map(String)} effectiveLevel={effectiveLevel} onPick={pickLevel} />
										</DropdownMenuContent>
									</DropdownMenu>
								</span>
							</SettingsRow>
						);
					}
					return (
						<SettingsRow
							key={slot}
							label={SLOT_META[slot].label}
							hint={SLOT_META[slot].roster}
							testid={`slot-row-${slot}`}
						>
							{/* The anchor for the outside-click contract is the
							    span holding BOTH triggers of the open menu. */}
							<span
								ref={thisMenuOpen ? menuAnchorRef : undefined}
								className="relative flex items-center gap-2"
							>
								{slot !== "strong" && <ChatGPTBackgroundAccess provider={coord?.provider} />}
								<MenuTrigger
									value={modelId ? prettyModel(modelId) : ""}
									hint={modelId ? `${provider}:${modelId}` : undefined}
									emptyLabel="—"
									ariaLabel={`${SLOT_META[slot].label} model`}
									testid={`slot-model-${slot}`}
									open={thisMenuOpen === "model"}
									onClick={() => setOpenMenu(thisMenuOpen === "model" ? null : { target: slot, kind: "model" })}
									widthClass={proposed ? "w-40" : "min-w-20"}
								/>
								<MenuTrigger
									// Legacy display (chunk 2 item 4): no stored level + a known
									// model → the RESOLVED level (the ordering's first supported —
									// what the engine build runs). Display-only until a pick writes.
									value={thinking || (chosen ? defaultOrderLevel(levels) : "")}
									emptyLabel="—"
									ariaLabel={`${SLOT_META[slot].label} thinking`}
									testid={`slot-thinking-${slot}`}
									open={thisMenuOpen === "thinking"}
									onClick={() => setOpenMenu(thisMenuOpen === "thinking" ? null : { target: slot, kind: "thinking" })}
									widthClass={proposed ? "w-24" : "w-20"}
								/>
								{thisMenuOpen === "model" && (
									<MenuShell
										preferredSide="down"
											anchorTestid={`slot-model-${slot}`}
										testid={`slot-model-menu-${slot}`}
										menuClass={proposed ? cn(MENU_SURFACE, "w-[22rem]") : "flex w-[22rem] flex-col rounded-xl border border-border bg-card p-2 text-xs shadow-xl"}
									>
										<ModelMenuList
											variant={menuVariant}
											models={slotCatalog ?? undefined}
											effectiveId={modelId}
											effectiveProvider={provider}
											onPick={(entry) => {
												// Auto-populate (chunk 2, owner: "populate everywhere"): the
												// fresh pick writes a level — the stored one rides as-is
												// (the write clamps server-side), else the ordering's level.
												const next = populateLevel(thinking || undefined, entry.supportedLevels);
												onModelsChange(composeSlotModel(models, slot, entry.provider, entry.id, next));
												setOpenMenu(null);
											}}
											footer={
												catalog && catalog.length === 0
													? "No models — sign in to Claude or ChatGPT in Providers"
													: "Runs every agent of this tier"
											}
										/>
									</MenuShell>
								)}
								{thisMenuOpen === "thinking" && (
									<MenuShell
										preferredSide="down"
											anchorTestid={`slot-thinking-${slot}`}
										testid={`slot-thinking-menu-${slot}`}
										menuClass={proposed ? cn(MENU_SURFACE, "w-44") : "flex w-44 flex-col gap-0.5 rounded-xl border border-border bg-card p-2 text-xs shadow-xl"}
									>
										<ThinkingMenuList
											variant={menuVariant}
											levels={levels.map(String)}
											// The ✓ sits on the RESOLVED level for legacy unset records —
											// the same one the trigger shows.
											effectiveLevel={thinking || (chosen ? defaultOrderLevel(levels) : undefined)}
											onPick={(level) => {
												onModelsChange(composeSlotModel(models, slot, provider, modelId, level));
												setOpenMenu(null);
											}}
										/>
									</MenuShell>
								)}
							</span>
						</SettingsRow>
					);
				})}
			</SettingsGroup>

			<SettingsGroup label="Tools" testid="group-tools">
				{/* The prober's graph tools (wave 7, owner ruling 2026-09-23):
				    FIRST row of the group — its subject is the map, its
				    mechanism is agent capability, so it lives in Tools but
				    NOT in the tool-toggles list. Its own agent-section key
				    (agent.graphTools), with a
				    smaller line under it explaining what it is — this
				    connects prior sessions' knowledge into new ones. */}
				{(() => {
					const graphOn = graph?.enabled ?? true;
					return (
						<SettingsRow
							label="Graph tools"
							hint={graphOn ? "Lets the tutor consult your knowledge map between sessions" : "Graph is disabled"}
							testid="graph-tools-row"
							dimmed={!graphOn}
						>
							<Toggle
								checked={agent?.graphTools?.enabled ?? true}
								disabled={!graphOn}
								label="graph tools"
								onChange={(on) => onSectionChange(composeGraphTools(agent, on))}
							/>
						</SettingsRow>
					);
				})()}
				{TOGGLE_TOOLS.map((id) => (
					<SettingsRow
						key={id}
						label={proposed ? TOOL_LABEL[id] : `Tool · ${id}`}
						testid={`tool-row-${id}`}
					>
						<Toggle
							checked={agent?.tools?.[id] ?? true}
							label={`tool ${id}`}
							onChange={(on) => onSectionChange(composeTool(agent, id, on))}
						/>
					</SettingsRow>
				))}
			</SettingsGroup>

			<SettingsGroup label="Context" testid="group-context">
				<SettingsRow
					label="Compaction threshold"
					hint={`${resolvedCompaction.thresholdTokens} tok`}
					testid="compaction-row-threshold"
				>
					<CommitInput
						type="number"
						value={String(compaction?.thresholdTokens ?? "")}
						placeholder={String(resolvedCompaction.thresholdTokens)}
						ariaLabel="compaction threshold"
						testid="input-compaction-threshold"
						onCommit={(v) => {
							// Empty = factory default (the budget row's discipline):
							// absence is the unset for numbers.
							if (v === "") {
								onCompactionChange({ ...compaction, thresholdTokens: undefined });
								return;
							}
							const n = Number(v);
							if (!Number.isFinite(n) || n <= 0) return; // bad input: no write
							// Mirror the server floor (anti-churn: each compaction
							// keeps a ~20k-token tail); no ceiling — the effective
							// trigger is min(threshold, contextWindow − 16k) anyway.
							onCompactionChange({
								...compaction,
								thresholdTokens: Math.max(COMPACTION_THRESHOLD_FLOOR, Math.round(n)),
							});
						}}
					/>
				</SettingsRow>
			</SettingsGroup>

		</>
	);
}
