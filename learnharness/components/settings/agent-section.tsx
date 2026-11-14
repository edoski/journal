"use client";
/**
 * The Agent section (settings-app wave): the THREE MODEL SLOTS and the
 * tool toggles — two GROUPS (Models / Tools).
 *
 * Model slots (model-slots wave, 2026-09-20, owner ruling: SLOTS ONLY —
 * the six per-role rows disappeared; per-role overrides remain in the
 * schema for a future advanced surface): Strong = Prober + Teacher, Cheap
 * = the five workhorse roles, Vision = Visual maker + PDF reader. Each
 * slot row carries the shared pickers (ModelCommand's search list and
 * ThinkingMenuItems from ./model-pickers.tsx) over the
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

import { useState } from "react";
import { defaultOrderLevel, populateLevel } from "@/components/thinking-default";
import { useModelCatalog } from "@/components/model-catalog";
import { Hint } from "@/components/ui/hint";
import {
	MODEL_SLOTS,
	type AgentSettings,
	type ModelCatalogEntry,
	type ModelSlotName,
	type ModelsSettings,
} from "@/src/core";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { prettyModel } from "@/components/usage-format";
import { SettingsGroup, SettingsRow, SettingsMenuTrigger, Toggle } from "./controls.tsx";
import { ModelCommand, ThinkingMenuItems } from "./model-pickers";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChatGPTBackgroundAccess } from "./chatgpt-connection";

/** One slot's display identity: what it is for, in the app's words. The
 *  setup dialog's pickers share it. */
export const SLOT_META: Record<ModelSlotName, { label: string; roster: string }> = {
	strong: { label: "Lessons", roster: "Teaches and quizzes you" },
	cheap: { label: "Helpers", roster: "Research, demos and grading" },
	vision: { label: "Pictures", roster: "Draws figures and reads PDFs" },
};

/** The owner's final toggleable-tool list (confirm with the user before
 *  changing — the Teacher stream settled this 2026-09-19). */
export const TOGGLE_TOOLS = ["research", "demo", "visual", "pdf"] as const;

/** The tool rows' names; the group already says "Tools". */
const TOOL_LABEL: Record<(typeof TOGGLE_TOOLS)[number], string> = {
	research: "Research",
	demo: "Interactive demos",
	visual: "Figures",
	pdf: "Reading PDFs",
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

export function AgentSection({
	agent,
	models,
	onSectionChange,
	onModelsChange,
}: {
	agent: AgentSettings | undefined;
	/** The `models` section (slot pins — engine-level, PUT /api/settings/models). */
	models: ModelsSettings | undefined;
	/** Writes the composed WHOLE agent section (replace-PUT discipline). */
	onSectionChange: (next: AgentSettings) => void;
	/** Writes the composed models section (slots — replace-PUT discipline). */
	onModelsChange: (next: ModelsSettings) => void;
}) {
	const { catalog: body, failed: catalogFailed, refresh: refreshCatalog } = useModelCatalog();
	const catalog = body?.models;
	const slots = body?.slots;
	/** One open dropdown for the whole section: which slot, which kind. */
	const [openMenu, setOpenMenu] = useState<{ target: ModelSlotName; kind: "model" | "thinking" } | null>(null);

	return (
		<>
			<SettingsGroup label="Models" testid="group-models">
				{catalogFailed && <p role="alert" className="px-4 py-2.5 text-label text-danger">Model catalog could not be loaded. Check the connection and retry. <button type="button" className="underline" onClick={refreshCatalog}>Retry</button></p>}
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
					const modelFooter = catalog && catalog.length === 0 ? "No models — sign in to Claude or ChatGPT in Settings → Accounts" : SLOT_META[slot].roster;
					// The catalog's own name ("Claude Opus 5.5 · Claude · A"), not the id.
					const modelName = modelId ? chosen?.name ?? prettyModel(modelId) : "—";
					const modelTrigger = (
						<PopoverTrigger asChild>
							<SettingsMenuTrigger value={modelName} aria-label={`${SLOT_META[slot].label} model`} data-testid={`slot-model-${slot}`} className="w-40" />
						</PopoverTrigger>
					);
					return (
						<SettingsRow key={slot} label={SLOT_META[slot].label} hint={SLOT_META[slot].roster} testid={`slot-row-${slot}`}>
							<span className="flex items-center gap-2">
								{slot !== "strong" && <ChatGPTBackgroundAccess provider={coord?.provider} />}
								<Popover modal open={thisMenuOpen === "model"} onOpenChange={(next) => setOpenMenu(next ? { target: slot, kind: "model" } : null)}>
									{modelId ? <Hint label={modelName}>{modelTrigger}</Hint> : modelTrigger}
									<PopoverContent align="end" className="w-[22rem] p-1" data-testid={`slot-model-menu-${slot}`}>
										<ModelCommand models={slotCatalog ?? undefined} effectiveId={modelId} effectiveProvider={provider} onPick={pickModel} footer={modelFooter} />
									</PopoverContent>
								</Popover>
								<DropdownMenu open={thisMenuOpen === "thinking"} onOpenChange={(next) => setOpenMenu(next ? { target: slot, kind: "thinking" } : null)}>
									<Hint label="How hard it thinks">
										<DropdownMenuTrigger asChild>
											<SettingsMenuTrigger value={effectiveLevel ?? "—"} aria-label={`${SLOT_META[slot].label} thinking`} data-testid={`slot-thinking-${slot}`} className="w-24" />
										</DropdownMenuTrigger>
									</Hint>
									<DropdownMenuContent align="end" className="w-44" data-testid={`slot-thinking-menu-${slot}`}>
										<ThinkingMenuItems levels={levels.map(String)} effectiveLevel={effectiveLevel} onPick={pickLevel} />
									</DropdownMenuContent>
								</DropdownMenu>
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
				<SettingsRow
					label="Knowledge map"
					hint="Lets the tutor look back at earlier lessons"
					testid="graph-tools-row"
				>
					<Toggle
						checked={agent?.graphTools?.enabled ?? true}
						label="graph tools"
						onChange={(on) => onSectionChange(composeGraphTools(agent, on))}
					/>
				</SettingsRow>
				{TOGGLE_TOOLS.map((id) => (
					<SettingsRow
						key={id}
						label={TOOL_LABEL[id]}
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
		</>
	);
}
