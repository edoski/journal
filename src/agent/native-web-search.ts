import type { Api, Model } from "@earendil-works/pi-ai";
import { isClaudeProvider } from "../core/contracts/claude.ts";
import { claudeAccount } from "./claude-connection.ts";
import { claudeWebSearch } from "./claude-search.ts";

/** Resolves to the search result text; throws an Error whose message is user-facing. */
export type NativeWebSearch = (query: string, signal?: AbortSignal) => Promise<string>;

/** Every Claude account searches through its own login, like its turns. */
export function nativeWebSearchFor(model: Pick<Model<Api>, "provider">): NativeWebSearch | undefined {
	if (!isClaudeProvider(model.provider)) return undefined;
	return (query, signal) => claudeWebSearch({ account: claudeAccount(model.provider) ?? "missing" })(query, signal);
}
