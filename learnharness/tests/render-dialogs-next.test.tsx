/**
 * The Proposed settings, dialogs, menus and overlays (polish pass phase 4):
 * what a learner can see and use under the Proposed design. Settings rows
 * that would do nothing there are absent, keys read as glyphs, dialogs keep
 * their actions, the chain table and the background agents read in plain
 * words. Same tsx classic-JSX shim as the other render tests.
 */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { SettingsDesignContext } from "../components/settings/settings-design.ts";
import { AppearanceSection, GraphSection } from "../components/settings/appearance-section.tsx";
import { AgentSection, TOGGLE_TOOLS } from "../components/settings/agent-section.tsx";
import { KeyboardSection } from "../components/settings/keyboard-section.tsx";
import { Toggle } from "../components/settings/controls.tsx";
import { priceLabel, ThinkingMenuList } from "../components/settings/model-menu.tsx";
import { ActivitySection, type ActivityFeed } from "../components/activity-dock.tsx";
import { ChainTableBody, type ChainSort } from "../components/chain-table.tsx";
import { hintBinding, hintText } from "../components/ui/hint.tsx";
import { bindingForAction, formatBinding, KEYBOARD_ACTIONS } from "../src/core/index.ts";
import type { GraphChain, GraphNode } from "../src/core/contracts.ts";

function documentFor(node: React.ReactNode) {
	return parseHTML(`<html><body>${renderToStaticMarkup(node)}</body></html>`).document;
}

const inSettings = (node: React.ReactNode) => (
	<SettingsDesignContext.Provider value="proposed">{node}</SettingsDesignContext.Provider>
);

const testids = (doc: ReturnType<typeof documentFor>) =>
	[...doc.querySelectorAll("[data-testid]")].map((el) => el.getAttribute("data-testid"));

describe("Settings › Appearance under the Proposed design", () => {
	it("offers only what still applies: text size and the emphasis colours, no mode, background, font, serif or heading weight", () => {
		const doc = documentFor(inSettings(<AppearanceSection appearance={undefined} onSectionChange={() => {}} />));
		const ids = testids(doc);
		for (const kept of ["row-prose-size", "row-bold-color", "row-italic-color"]) assert.ok(ids.includes(kept), `keeps ${kept}`);
		for (const gone of ["row-mode", "row-background", "row-font", "font-trigger", "row-session-serif", "row-heading-weight"])
			assert.ok(!ids.includes(gone), `leaves out ${gone}`);
		assert.equal(doc.querySelector('[data-testid="row-prose-size"]')?.textContent?.includes("Text size"), true);
	});

	it("the Current design keeps every appearance row", () => {
		const ids = testids(documentFor(<AppearanceSection appearance={undefined} onSectionChange={() => {}} />));
		for (const row of ["row-mode", "row-background", "row-font", "row-session-serif", "row-heading-weight", "row-prose-size"])
			assert.ok(ids.includes(row), `Current keeps ${row}`);
	});
});

describe("Settings › Graph and Agent under the Proposed design", () => {
	it("says the chains view replaces Knowledge, where the graph lives in this design", () => {
		const doc = documentFor(inSettings(<GraphSection graph={undefined} onSectionChange={() => {}} />));
		assert.match(doc.querySelector('[data-testid="graph-row-rendering"]')?.textContent ?? "", /Knowledge shows the chains view/);
	});

	it("names the tools plainly inside the Tools group, one switch each", () => {
		const html = renderToStaticMarkup(
			inSettings(
				<AgentSection
					agent={undefined}
					models={undefined}
					graph={undefined}
					compaction={undefined}
					onSectionChange={() => {}}
					onModelsChange={() => {}}
					onCompactionChange={() => {}}
				/>,
			),
		);
		const doc = parseHTML(`<html><body>${html}</body></html>`).document;
		assert.ok(!html.includes("Tool · "), "no repeated Tool prefix");
		const labels = TOGGLE_TOOLS.map((id) => doc.querySelector(`[data-testid="tool-row-${id}"]`)?.textContent?.trim());
		assert.deepEqual(labels, ["Research", "Demos", "Figures", "PDF reading"]);
		for (const id of TOGGLE_TOOLS) assert.ok(doc.querySelector(`[data-testid="toggle-tool-${id}"][role="switch"]`), `switch for ${id}`);
	});
});

describe("Settings › Keyboard under the Proposed design", () => {
	it("shows every shortcut as its glyphs, with Change only where the key can be rebound", () => {
		const doc = documentFor(inSettings(<KeyboardSection />));
		for (const def of KEYBOARD_ACTIONS) {
			const row = doc.querySelector(`[data-testid="kbd-row-${def.id}"]`);
			assert.ok(row, `row for ${def.id}`);
			assert.equal(row!.querySelector('[data-slot="kbd"]')?.textContent, formatBinding(bindingForAction(def.id)));
			assert.equal(Boolean(row!.querySelector(`[data-testid="kbd-rebind-${def.id}"]`)), !def.displayOnly, `${def.id} rebindable`);
		}
		assert.ok(doc.querySelector('[data-testid="kbd-reset-all"]'));
	});
});

describe("the Proposed switch", () => {
	it("reports its state to assistive tech", () => {
		const on = documentFor(inSettings(<Toggle checked label="graph tools" onChange={() => {}} />)).querySelector('[role="switch"]');
		const off = documentFor(inSettings(<Toggle checked={false} label="graph tools" onChange={() => {}} />)).querySelector('[role="switch"]');
		assert.equal(on?.getAttribute("aria-checked"), "true");
		assert.equal(off?.getAttribute("aria-checked"), "false");
		assert.equal(on?.getAttribute("aria-label"), "graph tools");
	});
});

describe("the Proposed thinking menu", () => {
	it("lists the levels and marks only the effective one as chosen", () => {
		const doc = documentFor(<ThinkingMenuList variant="proposed" levels={["low", "high"]} effectiveLevel="high" onPick={() => {}} footer="Levels this model actually supports" />);
		const items = [...doc.querySelectorAll("button")];
		assert.deepEqual(items.map((b) => b.textContent), ["low", "high"]);
		assert.equal(items[1]!.querySelector("svg") !== null, true, "the chosen level carries the check");
		assert.equal(items[0]!.querySelector("svg"), null);
		assert.match(doc.body.textContent ?? "", /Levels this model actually supports/);
	});
});

describe("the Proposed model menu's prices", () => {
	it("prints every price with two decimals, beside Current's trimmed form", () => {
		const cost = { input: 0.1, output: 0.5, cacheRead: 0, cacheWrite: 0 };
		assert.equal(priceLabel(cost, "proposed"), "$0.10/$0.50");
		assert.equal(priceLabel({ ...cost, input: 3, output: 15 }, "proposed"), "$3.00/$15.00");
		assert.equal(priceLabel(cost), "$0.1/$0.5");
	});
});

describe("Proposed tooltips", () => {
	it("carry the shortcut as glyphs of their own, the same keys the Current text shows in parentheses", () => {
		const glyphs = hintBinding("open-settings");
		assert.ok(glyphs.length > 0);
		assert.equal(hintText("Settings", "open-settings"), `Settings (${glyphs})`);
		assert.equal(hintBinding(undefined, "escape"), "Esc");
		assert.equal(hintBinding(), "");
	});
});

const NOW = Date.parse("2026-11-08T10:00:00");

describe("Proposed background agents", () => {
	const feed: ActivityFeed = {
		jobs: [
			{
				id: "job-1",
				kind: "research",
				chatId: "c1",
				toolCallId: "t1",
				status: "running",
				activity: 'web_search: "spectral theorem"',
				createdAt: new Date(NOW - 200_000).toISOString(),
				updatedAt: new Date(NOW).toISOString(),
				title: "Eigenvalues and eigenvectors",
				contextLimit: null,
				costUsd: 0.04,
			},
		],
		extractions: [],
	};

	it("one row per process under a quiet header: the session, elapsed time and a named stop button; cost waits in the detail", () => {
		const doc = documentFor(<ActivitySection feed={feed} variant="proposed" />);
		const section = doc.querySelector('[data-testid="activity-section"]');
		assert.equal(section?.querySelector('[data-slot="nav-section-header"]')?.textContent, "Background agents");
		const row = section?.querySelector('[data-testid="activity-blob-job"] [data-slot="nav-row"]');
		assert.equal(row?.querySelector('[data-slot="nav-row-label"]')?.textContent, "Eigenvalues and eigenvectors");
		assert.match(row?.querySelector('[data-testid="activity-blob-elapsed"]')?.textContent ?? "", /^\d+(s|m \d\ds|h \d\dm)$/);
		assert.equal(row?.getAttribute("aria-expanded"), "false");
		assert.equal(doc.querySelector('[data-testid="activity-abort"]')?.getAttribute("aria-label"), "End Researcher in Eigenvalues and eigenvectors");
		assert.equal(doc.querySelector('[data-testid="activity-blob-cost"]'), null, "no cost on the row's face");
		assert.equal(doc.querySelector('[data-testid="activity-total-cost"]'), null, "no running total in the header");
	});
});

describe("the Proposed chain table", () => {
	const node = (id: string, name: string, chatId: string | null) =>
		({ id, name, statement: `${name}.`, aliases: [], state: "new", createdAt: "2026-09-20T10:00:00.000Z", provenance: chatId ? [{ chatId, messageId: `m_${id}` }] : [] }) as unknown as GraphNode;
	const nodes = [node("a", "Premise", "chat1"), node("c", "Conclusion", "chat1"), node("o", "Orphan", null)];
	const chains: GraphChain[] = [{ id: "c", premises: ["a"], conclusion: "c", provenance: [], createdAt: "2026-09-20T10:00:00.000Z" }];
	const props = {
		nodes,
		chains,
		sessions: {},
		fileSources: {},
		query: "",
		onQuery: () => {},
		sort: { col: "name", dir: 1 } as ChainSort,
		onSort: () => {},
		selection: new Set<string>(),
		expandedClusters: new Set<string>(),
		expandedChains: new Set<string>(),
		onToggleCluster: () => {},
		onToggleChain: () => {},
		onToggleNodes: () => {},
		onClear: () => {},
		onDelete: () => {},
		onClose: () => {},
	};

	it("heads its columns in plain words and names a cluster with no label in sentence case", () => {
		const doc = documentFor(<ChainTableBody {...props} variant="proposed" />);
		assert.match(doc.querySelector('[data-testid="sort-props"]')?.textContent ?? "", /^Statements/);
		assert.ok([...doc.querySelectorAll("span")].some((s) => s.textContent === "Unlabeled"));
	});

	it("keeps the Current headings in the Current design", () => {
		const doc = documentFor(<ChainTableBody {...props} />);
		assert.match(doc.querySelector('[data-testid="sort-props"]')?.textContent ?? "", /^Props/);
	});
});
