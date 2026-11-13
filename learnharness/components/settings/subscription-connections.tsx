"use client";
import { ChatGPTConnection } from "./chatgpt-connection";
import { ClaudeConnectionRow } from "./claude-connection";
import { useSettingsProposed } from "./settings-design";

export function SubscriptionConnections({ setup = false }: { setup?: boolean }) {
	// Providers uses ordinary settings-label typography. The setup surface
	// keeps its existing compact labels; dialogs and actions are untouched.
	const labelClassName = setup ? undefined : "font-prose text-(length:--lh-prose-size) text-foreground";
	const proposed = useSettingsProposed();
	return <div className={proposed ? "flex flex-col divide-y" : "space-y-3"} data-testid="subscription-connections"><ChatGPTConnection setup={setup} labelClassName={labelClassName} /><ClaudeConnectionRow labelClassName={labelClassName} /></div>;
}
