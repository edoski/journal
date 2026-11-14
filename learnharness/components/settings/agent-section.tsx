"use client";
/**
 * The Tutor section (settings-app wave): the tool toggles. There is no
 * model choice (owner, 2026-11-14): every agent runs CLAUDE_MODEL at high
 * effort, so the Models group and its pickers are gone.
 *
 * Tools — the owner's final list (2026-09-19): research, demo, visual, pdf.
 * Absent key = enabled in the schema; the UI writes explicit booleans for
 * all four (simpler to reason about, sanitize-equivalent).
 */

import type { AgentSettings } from "@/src/core";
import { SettingsGroup, SettingsRow, Toggle } from "./controls.tsx";

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

/** Compose: one tool toggled, the rest of the section carried verbatim.
 *  Pure — exported for tests. */
export function composeTool(agent: AgentSettings | undefined, id: string, on: boolean): AgentSettings {
	return { ...agent, tools: { ...agent?.tools, [id]: on } };
}

export function AgentSection({
	agent,
	onSectionChange,
}: {
	agent: AgentSettings | undefined;
	/** Writes the composed WHOLE agent section (replace-PUT discipline). */
	onSectionChange: (next: AgentSettings) => void;
}) {
	return (
		<>
			<SettingsGroup label="Tools" testid="group-tools">
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
