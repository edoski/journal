import { chatGPTBackgroundAllowed, chatGPTConnected, chatGPTScopeCurrent, onChatGPTChange } from "./chatgpt-bridge.ts";
import type { AdmissionScope } from "./subscription-request-cycle.ts";

/** ChatGPT is the one connection with an admission cycle and a background-consent gate; Claude runs on the user's own `claude` CLI. */
export function isSubscriptionProvider(provider: string | undefined): boolean { return provider === "chatgpt"; }
export function subscriptionConnected(provider: string): boolean { return provider === "chatgpt" && chatGPTConnected(); }
export function connectionBackgroundAllowed(provider: string | undefined): boolean { return provider === "chatgpt" ? chatGPTBackgroundAllowed() : true; }
export function connectionScopeCurrent(provider: string, scope: AdmissionScope): boolean { return provider === "chatgpt" && chatGPTScopeCurrent(scope); }
export function onSubscriptionChange(listener: () => void): () => void { return onChatGPTChange(listener); }
