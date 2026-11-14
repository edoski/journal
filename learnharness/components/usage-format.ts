/**
 * Money/token presentation helpers (wave-4 observability UI) — shared by the
 * activity dock, the stats bar and the lesson's details menu. Pure; exported for tests.
 */

import { subscriptionLabels, type SessionPricing, type TurnUsage } from "@/src/core";

/** USD for cent-scale money: >= $1 keeps two decimals, smaller keeps four. */
export function formatUsd(c: number): string {
	return c >= 1 ? `$${c.toFixed(2)}` : `$${c.toFixed(4)}`;
}

export function planCostLabel(dollars: number | null, subscription: boolean | string | readonly string[] | undefined, format = formatUsd): string {
	const labels = subscription === true ? ["ChatGPT"] : typeof subscription === "string" ? [subscription] : Array.isArray(subscription) ? [...new Set(subscription)] : [];
	return [...(dollars === null ? [] : [format(dollars)]), ...labels].join(" + ") || "—";
}

/** 38000 → "38k", 1234567 → "1.2M" — trimmed, never "38.0k". */
export function formatTokens(n: number): string {
	if (n >= 1e6) return `${+(n / 1e6).toFixed(1)}M`;
	if (n >= 1e3) return `${+(n / 1e3).toFixed(1)}k`;
	return String(n);
}

export function formatContextMeasurement(tokens: number | null, limit: number | null): string {
	const numerator = tokens === null ? "?" : formatTokens(tokens);
	return limit === null ? numerator : `${numerator} / ${formatTokens(limit)}`;
}

/** The session's two footprint labels, shared by the stats bar and the
 *  lesson's details menu: context as "used / limit" (catalog denominator
 *  only) and cost, honest "—" until at least one turn priced. */
export function sessionStatLabels({ turns, contextTokens, pricing, limit }: {
	turns: TurnUsage[];
	contextTokens: number | null;
	pricing?: SessionPricing;
	limit: number | null;
}): { contextLabel: string; costLabel: string; providers: string[] } {
	const { cost = 0, unpriced = turns.length, subscription = 0 } = pricing ?? {};
	const pricedCount = turns.length - unpriced - subscription;
	const providers = pricing?.subscriptionProviders ?? subscriptionLabels(turns.map((turn) => turn.model));
	return {
		contextLabel: formatContextMeasurement(contextTokens, limit),
		costLabel: planCostLabel(pricedCount > 0 ? cost : null, providers),
		providers,
	};
}
