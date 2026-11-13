/**
 * THE SETTINGS RESOLUTION LAYER (settings-storage wave, 2026-09-19): pure
 * projection of the delta record (core/settings.ts UserSettings) into
 * EffectiveSettings — every field CONCRETE, ready for consumers with no
 * delta-walking of their own.
 *
 * Resolution rule (owner decision): explicit value in the record wins;
 * absent key resolves to the compiled factory default — EXCEPT MODELS
 * (BYOK all the way down, owner 2026-09-22): no factory pins exist, so a
 * model chain that ends empty resolves to null/undefined and whatever
 * needs it refuses honestly (503 models_not_configured). This module
 * stays browser-safe/pure, so it imports config TYPES only, never the
 * runtime module (config.ts pulls node:path).
 *
 * Deliberately NOT resolved here (see settings.ts module doc):
 * - per-chat overrides: the chat record's ChatSettings applies via the
 *   conversation chain in chat-handler (chat.model → strong slot) — prober
 *   and teacher stay chat-controlled, never settings-record-controlled;
 * - tool toggles: passed through as the delta map; consumers look up by
 *   tool id with absent → enabled (the honoring lives in the agent band).
 */

import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { ModelRole } from "../../config.ts";
import type { ChatSettings } from "./contracts/chat.ts";
import {
	BACKGROUND_MODEL_ROLES,
	FACTORY_SETTINGS,
	MODEL_SLOTS,
	ROLE_SLOT,
	type AgentSettings,
	type BackgroundModelRole,
	type FactorySettings,
	type ModelSlot,
	type ModelSlotName,
	type RoleModelOverride,
	type UserSettings,
} from "./settings.ts";

/** A configured model slot: the tier's concrete model, with its optional
 *  thinking level. UNSET level is legal — the engine build resolves it
 *  from config.ts's DEFAULT_THINKING_ORDER (first entry the model
 *  supports; owner, 2026-09-22). A slot is CONFIGURED iff its model is
 *  present; a level-only slot is inert (kept on disk, resolved as null). */
export interface EffectiveSlot {
	provider: string;
	id: string;
	thinkingLevel?: ThinkingLevel;
}

/** A fully-resolved model pin for one role — same shape/level semantics
 *  as EffectiveSlot; undefined means the role's whole chain came up
 *  empty and whatever needs it refuses honestly. */
export interface EffectiveModelSpec {
	provider: string;
	id: string;
	thinkingLevel?: ThinkingLevel;
}

/** The concrete appearance view — same shape as the factory's. */
export type EffectiveAppearance = FactorySettings["appearance"];

/** The concrete view: every knob resolved, no absent fields. */
export interface EffectiveSettings {
	agent: {
		models: Record<BackgroundModelRole, EffectiveModelSpec | undefined>;
		/** Delta map as stored — consumers resolve absent key → enabled. */
		tools: Record<string, boolean>;
		/** Prober graph tools (wave 7): passthrough delta as stored —
		 * absent/undefined enabled = ON; consumers use graphToolsEnabled. */
		graphTools: { enabled?: boolean };
	};
	/** The resolved strong/cheap/vision slots: each tier's concrete model or
	 *  NULL when the tier holds no model (no factory floor — BYOK all the
	 *  way down, owner 2026-09-22). These are the tier-level views the
	 *  picker captions and the per-need refusal gates read. */
	models: Record<ModelSlotName, EffectiveSlot | null>;
	appearance: EffectiveAppearance;
}

/** The conversation pair's chain (BYOK, owner 2026-09-22): the chat's own
 *  model override over the STRONG slot, each field independent (a bare
 *  chat thinking level rides the strong slot's model). null = no model
 *  anywhere — the turn gate refuses with the 503 models_not_configured
 *  envelope. */
export function resolveConversationSpec(
	chat: ChatSettings | undefined,
	strong: EffectiveSlot | null,
): EffectiveModelSpec | null {
	const model = chat?.model ?? (strong ? { provider: strong.provider, id: strong.id } : undefined);
	if (!model) return null;
	return {
		provider: model.provider,
		id: model.id,
		thinkingLevel: chat?.thinkingLevel ?? strong?.thinkingLevel,
	};
}

/** Full-chain resolution for ANY role (BYOK, owner 2026-09-22):
 *  per-role override (background roles only) → SLOT → NOTHING. The
 *  conversation pair (prober/teacher) resolves the same chain MINUS the
 *  role override (their override is the chat's own settings — the
 *  chat-handler overlays it itself). undefined = the chain came up
 *  empty; the per-need refusal gates fire on exactly that. This is the
 *  engine wiring's one call. */
export function resolveRoleSpec(role: ModelRole, record: UserSettings | null): EffectiveModelSpec | undefined {
	const bg = BACKGROUND_MODEL_ROLES as readonly string[];
	const override = bg.includes(role) ? record?.agent?.models?.[role as BackgroundModelRole] : undefined;
	return resolveModelSpec(role, override, record?.models);
}

/** Resolve one slot to its configured view, or null when the tier holds
 *  no model (a thinkingLevel-only slot is inert — the level has nothing
 *  to ride without the factory floor). */
export function resolveSlot(slot: ModelSlot | undefined): EffectiveSlot | null {
	if (!slot?.model) return null;
	return { provider: slot.model.provider, id: slot.model.id, thinkingLevel: slot.thinkingLevel };
}

/** Resolve one role's spec — the BYOK chain (owner 2026-09-22): role
 *  override → SLOT → NOTHING, each field independent (an override may
 *  borrow only the slot's model, or only its thinking budget — a level
 *  with no model anywhere stays unset and the engine build resolves it
 *  from DEFAULT_THINKING_ORDER). undefined = no model resolved; the
 *  per-need refusal gates fire on exactly that. */
export function resolveModelSpec(
	role: ModelRole,
	override: RoleModelOverride | undefined,
	slots?: Partial<Record<ModelSlotName, ModelSlot>>,
): EffectiveModelSpec | undefined {
	const slotName = ROLE_SLOT[role] as ModelSlotName | undefined;
	const slot = slotName ? slots?.[slotName] : undefined;
	const model = override?.model ?? slot?.model;
	if (!model) return undefined;
	return {
		provider: model.provider,
		id: model.id,
		thinkingLevel: override?.thinkingLevel ?? slot?.thinkingLevel,
	};
}

/** Resolve the whole record. `record` may be null (first boot) — every
 *  factory-defaulted field lands on its default; MODEL fields resolve to
 *  null/undefined when unset (no factory pins exist — BYOK all the way
 *  down, owner 2026-09-22). */
export function resolveSettings(record: UserSettings | null): EffectiveSettings {
	const agent = record?.agent ?? {};
	const modelsSection = record?.models ?? {};
	const appearance = record?.appearance ?? {};
	const md = appearance.mdRendering ?? {};
	const factoryAppearance = FACTORY_SETTINGS.appearance;
	const factoryMd = factoryAppearance.mdRendering;
	const models = {} as Record<BackgroundModelRole, EffectiveModelSpec | undefined>;
	for (const role of BACKGROUND_MODEL_ROLES) {
		models[role] = resolveModelSpec(role, agent.models?.[role], modelsSection);
	}
	return {
		agent: {
			models,
			tools: agent.tools ?? {},
			graphTools: agent.graphTools ?? {},
		},
		models: {
			strong: resolveSlot(modelsSection.strong),
			cheap: resolveSlot(modelsSection.cheap),
			vision: resolveSlot(modelsSection.vision),
		},
		appearance: {
			mode: appearance.mode ?? factoryAppearance.mode,
			background: appearance.background ?? factoryAppearance.background,
			fontFamily: appearance.fontFamily ?? factoryAppearance.fontFamily,
			proseFontSize: appearance.proseFontSize ?? factoryAppearance.proseFontSize,
			sessionNameSerif: appearance.sessionNameSerif ?? factoryAppearance.sessionNameSerif,
			mdRendering: {
				headingWeight: md.headingWeight ?? factoryMd.headingWeight,
				boldColor: md.boldColor ?? factoryMd.boldColor,
				italicColor: md.italicColor ?? factoryMd.italicColor,
			},
		},
	};
}

/**
 * The PROBER GRAPH TOOLS gate (wave 7, owner ruling 2026-09-23): an
 * agent-capability switch that gates tool registration. Absent = ON.
 */
export function graphToolsEnabled(effective: {
	agent: { graphTools: { enabled?: boolean } };
}): boolean {
	return effective.agent.graphTools.enabled ?? true;
}


