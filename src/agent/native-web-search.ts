import type { Api, Model } from "@earendil-works/pi-ai";
import { CLAUDE_SUBSCRIPTION } from "../core/contracts/claude.ts";
import { claudeWebSearch } from "./claude-search.ts";

/** Resolves to the search result text; throws an Error whose message is user-facing. */
export type NativeWebSearch = (query: string, signal?: AbortSignal) => Promise<string>;

const NATIVE_WEB_SEARCH: Readonly<Record<string, NativeWebSearch>> = {
	[CLAUDE_SUBSCRIPTION.providerId]: claudeWebSearch(),
};

export function nativeWebSearchFor(model: Pick<Model<Api>, "provider">): NativeWebSearch | undefined {
	return Object.hasOwn(NATIVE_WEB_SEARCH, model.provider) ? NATIVE_WEB_SEARCH[model.provider] : undefined;
}
