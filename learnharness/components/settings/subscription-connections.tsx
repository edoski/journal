"use client";
import { ChatGPTConnection } from "./chatgpt-connection";
import { ClaudeConnectionRow } from "./claude-connection";

export function SubscriptionConnections() {
	return <div className="flex flex-col divide-y" data-testid="subscription-connections"><ChatGPTConnection /><ClaudeConnectionRow /></div>;
}
