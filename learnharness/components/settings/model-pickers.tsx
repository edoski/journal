"use client";

import { useMemo, useState } from "react";
import type { ModelCatalogEntry } from "@/src/core";
import { fuzzyScore, subscriptionLabel } from "@/src/core";
import { formatTokens } from "@/components/usage-format";
import { cn } from "@/lib/utils";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, MENU_SEPARATOR } from "@/components/ui/dropdown-menu";

/** The Proposed pickers' bodies (spec: model-pickers.md): the model and
 *  provider pickers are a Command inside a picker Popover, the thinking level
 *  a radio group inside a DropdownMenu. One body per picker, shared by the
 *  lesson's details, Settings › Agent and Keys, and setup. */

const NOTE = "px-2 py-1.5 text-label text-muted-foreground";

/** USD per 1M tokens in/out. Proposed keeps two decimals on every price
 *  (one format in a column of figures); Current trims a trailing zero under $1. */
export function priceLabel(cost: ModelCatalogEntry["cost"], variant: "current" | "proposed" = "current"): string {
	const fmt = (n: number) => `$${variant === "proposed" || n >= 1 ? n.toFixed(2) : n.toFixed(2).replace(/0$/, "")}`;
	return `${fmt(cost.input)}/${fmt(cost.output)}`;
}

/** Fuzzy-ranked, best first; ties keep `compare`'s order. */
function ranked<T>(items: readonly T[], query: string, terms: (item: T) => string[], compare: (a: T, b: T) => number): T[] {
	return items
		.map((item) => ({ item, score: fuzzyScore(query, ...terms(item)) }))
		.filter((r) => r.score !== null)
		.sort((a, b) => b.score! - a.score! || compare(a.item, b.item))
		.map((r) => r.item);
}

const optionId = (id: string) => id.replace(/[^a-z0-9-]/gi, "_");

/** The model picker: search, the catalog ranked by the search, each row
 *  the name and price over its provider, id and context size. `models`
 *  undefined is the catalog loading. */
export function ModelCommand({
	models,
	effectiveId,
	effectiveProvider,
	onPick,
	footer,
	error,
}: {
	models: readonly ModelCatalogEntry[] | undefined;
	effectiveId: string | undefined;
	/** Ids can collide across providers: the chosen row matches both. */
	effectiveProvider?: string;
	onPick: (entry: ModelCatalogEntry) => void;
	footer?: string;
	error?: string | null;
}) {
	const [query, setQuery] = useState("");
	const results = useMemo(
		() => ranked(models ?? [], query, (m) => [m.provider, m.id, m.name], (a, b) => a.id.localeCompare(b.id)),
		[models, query],
	);
	return (
		<Command shouldFilter={false} data-testid="model-command">
			<CommandInput data-testid="model-search" placeholder="Search models…" value={query} onValueChange={setQuery} autoFocus />
			{error && <div className={cn(NOTE, "text-danger")}>{error}</div>}
			<CommandList data-testid="model-list">
				{models === undefined ? <div className={NOTE}>Loading models…</div> : <CommandEmpty>No models match.</CommandEmpty>}
				{results.map((m) => {
					const subscription = subscriptionLabel(`${m.provider}:${m.id}`);
					return (
						<CommandItem
							key={`${m.provider}/${m.id}`}
							value={`${m.provider}/${m.id}`}
							size="tall"
							checked={m.id === effectiveId && m.provider === (effectiveProvider ?? m.provider)}
							onSelect={() => onPick(m)}
							data-testid={`model-option-${optionId(m.id)}`}
						>
							<span className="flex items-center justify-between gap-3">
								<span className="truncate">{m.name}</span>
								<CommandShortcut className="shrink-0">{subscription ?? priceLabel(m.cost, "proposed")}</CommandShortcut>
							</span>
							<span className="flex items-center justify-between gap-3 text-label text-muted-foreground tabular-nums">
								<span className="truncate">{subscription ? `${subscription} (subscription)` : m.provider} · {m.id}</span>
								<span className="shrink-0">{formatTokens(m.contextWindow)}</span>
							</span>
						</CommandItem>
					);
				})}
			</CommandList>
			{footer && (
				<>
					<div className={MENU_SEPARATOR} />
					<div className={NOTE}>{footer}</div>
				</>
			)}
		</Command>
	);
}

/** The thinking levels this model supports, for a DropdownMenuContent: the
 *  effective one checked, a quiet note when there are none, a footer. */
export function ThinkingMenuItems({
	levels,
	effectiveLevel,
	onPick,
	empty,
	footer,
}: {
	levels: readonly string[];
	effectiveLevel: string | undefined;
	onPick: (level: string) => void;
	/** Shown instead of the levels when there are none. */
	empty?: string;
	footer?: string;
}) {
	return (
		<>
			{levels.length === 0 ? (
				<div className={NOTE}>{empty ?? "No thinking levels."}</div>
			) : (
				<DropdownMenuRadioGroup value={effectiveLevel ?? ""} onValueChange={onPick}>
					{levels.map((level) => (
						<DropdownMenuRadioItem key={level} value={level} data-testid={`thinking-option-${level}`}>
							{level}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			)}
			{footer && (
				<>
					<div className={MENU_SEPARATOR} />
					<DropdownMenuLabel className="font-normal">{footer}</DropdownMenuLabel>
				</>
			)}
		</>
	);
}
