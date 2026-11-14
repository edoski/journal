import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { refreshClaudeConnections } from "../src/agent/claude-connection.ts";
import type { LoadedClaudeAccount } from "../src/agent/claude-accounts.ts";

/** The model turn tests pin: a Claude subscription model, the only kind of model the app runs. */
export const TEST_MODEL = { provider: "claude-subscription", id: "claude-opus-5-5" } as const;

/** Marks a fake Claude account signed in for the rest of the process. Its
 * Claude Code config dir is empty, so a stream that escaped a test's
 * injected agent would find no sign-in and draw no one's plan. */
export async function signInTestClaude(): Promise<void> {
	const account: LoadedClaudeAccount = {
		providerId: TEST_MODEL.provider, label: "Claude", email: null, auth: "profile",
		instanceId: "test", configDir: mkdtempSync(path.join(tmpdir(), "lh-test-claude-")),
	};
	await refreshClaudeConnections({
		force: true,
		load: () => [account],
		binary: () => "/nonexistent/claude",
		run: async () => ({ code: 0, stdout: JSON.stringify({ loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", subscriptionType: "max" }), stderr: "" }),
		// Never stale, so no turn re-checks the sign-in with a real `claude`.
		now: () => Number.POSITIVE_INFINITY,
	});
}
