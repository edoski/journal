import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeBaseArgs, claudeChildEnv, claudeWorkDir, resolveClaudeBinary } from "./claude-cli.ts";
import { claudeLaunch } from "./claude-accounts.ts";
import { CLAUDE_API_KEY_REFUSAL, CLAUDE_MISSING, claudeErrorMessage, type ClaudeStreamDeps } from "./claude-stream.ts";
import type { NativeWebSearch } from "./native-web-search.ts";

/** WebSearch's own nested search runs on Haiku whatever the outer model is,
 * so a Haiku relay is the cheapest and fastest outer turn. */
const RELAY_MODEL = "claude-haiku-5-5";
const RELAY_PROMPT = "You are a search relay. Call the WebSearch tool exactly once, with the user's message verbatim as the query. Do not answer from memory.";

export const CLAUDE_SEARCH_DID_NOT_RUN = "Claude's web search did not run. Retry with a different query.";
const CLAUDE_SEARCH_STOPPED = "Claude's web search was stopped before it finished.";

function claudeSearchArgs(systemPromptFile: string): string[] {
	return [
		...claudeBaseArgs({ model: RELAY_MODEL, systemPromptFile }),
		"--tools", "WebSearch",
		"--allowedTools", "WebSearch",
		"--max-turns", "2",
	];
}

type Json = Record<string, unknown>;
const record = (value: unknown): Json | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as Json : undefined;

function toolResultText(line: Json): string | undefined {
	const content = record(line.message)?.content;
	if (!Array.isArray(content)) return undefined;
	const result = content.map(record).find((block) => block?.type === "tool_result");
	if (!result) return undefined;
	if (typeof result.content === "string") return result.content;
	if (!Array.isArray(result.content)) return "";
	return result.content.map(record).flatMap((block) => block?.type === "text" && typeof block.text === "string" ? [block.text] : []).join("\n");
}

/** Killing the relay at its first WebSearch result keeps it to one model turn. */
export function claudeWebSearch({ binary = () => resolveClaudeBinary(), env = process.env, account }: ClaudeStreamDeps = {}): NativeWebSearch {
	return (query, signal) => new Promise<string>((resolve, reject) => {
		if (signal?.aborted) { reject(new Error(CLAUDE_SEARCH_STOPPED)); return; }
		if (account === "missing") { reject(new Error("This Claude account is no longer set up in T3 Code. Choose another Claude account.")); return; }
		const bin = binary();
		if (!bin) { reject(new Error(CLAUDE_MISSING)); return; }

		let dir: string | undefined;
		const dispose = () => { if (dir) rmSync(dir, { recursive: true, force: true }); };
		let child: ReturnType<typeof spawn>;
		try {
			const launch = account ? claudeLaunch(account, claudeWorkDir()) : undefined;
			dir = mkdtempSync(join(claudeWorkDir(), "search-"));
			const systemPromptFile = join(dir, "system-prompt.txt");
			writeFileSync(systemPromptFile, RELAY_PROMPT, { mode: 0o600 });
			child = spawn(bin, claudeSearchArgs(systemPromptFile), { cwd: claudeWorkDir(), env: claudeChildEnv(env, { binary: bin, thinking: false, launch }), stdio: ["pipe", "pipe", "pipe"] });
		} catch (error) {
			dispose();
			reject(new Error(claudeErrorMessage({ text: error instanceof Error ? error.message : String(error) })));
			return;
		}

		let settled = false;
		let stderr = "";
		let buffer = "";
		let rateLimit: { resetsAt?: number } | undefined;
		let code: string | undefined;
		let status: number | undefined;
		const onAbort = () => settle(new Error(CLAUDE_SEARCH_STOPPED));
		function settle(outcome: string | Error): void {
			if (settled) return;
			settled = true;
			signal?.removeEventListener("abort", onAbort);
			if (child.exitCode === null && child.signalCode === null) {
				child.kill("SIGTERM");
				setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); }, 2000).unref();
			}
			if (typeof outcome === "string") resolve(outcome);
			else reject(outcome);
		}
		const failure = (text = "") => new Error(claudeErrorMessage({ rateLimit, status, code, text }));
		signal?.addEventListener("abort", onAbort, { once: true });

		const feed = (raw: string) => {
			let line: Json | undefined;
			try { line = record(JSON.parse(raw)); } catch { return; }
			if (!line) return;
			if (line.type === "system" && line.subtype === "init" && line.apiKeySource !== "none") return settle(new Error(CLAUDE_API_KEY_REFUSAL));
			if (line.type === "rate_limit_event") {
				const info = record(line.rate_limit_info);
				if (info?.status === "rejected") rateLimit = { resetsAt: typeof info.resetsAt === "number" ? info.resetsAt : undefined };
			}
			if (line.type === "assistant") {
				if (typeof line.error === "string") code = line.error;
				if (typeof line.api_error_status === "number") status = line.api_error_status;
			}
			if (line.type === "user" && !line.parent_tool_use_id) {
				const text = toolResultText(line);
				if (text !== undefined) return settle(text);
			}
			if (line.type === "result") {
				if (line.is_error === true || line.subtype !== "success") {
					if (typeof line.api_error_status === "number") status = line.api_error_status;
					return settle(failure(typeof line.result === "string" ? line.result : ""));
				}
				return settle(new Error(CLAUDE_SEARCH_DID_NOT_RUN));
			}
		};
		const { stdin, stdout, stderr: errors } = child as ReturnType<typeof spawn> & { stdin: NonNullable<ReturnType<typeof spawn>["stdin"]>; stdout: NonNullable<ReturnType<typeof spawn>["stdout"]>; stderr: NonNullable<ReturnType<typeof spawn>["stderr"]> };
		stdout.setEncoding("utf8");
		stdout.on("data", (chunk: string) => {
			buffer += chunk;
			let newline: number;
			while (!settled && (newline = buffer.indexOf("\n")) >= 0) {
				const line = buffer.slice(0, newline).trim();
				buffer = buffer.slice(newline + 1);
				if (line) feed(line);
			}
		});
		errors.setEncoding("utf8");
		errors.on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-4000); });
		stdin.on("error", () => {});
		child.on("error", (error) => { dispose(); settle(failure(error.message)); });
		child.on("close", () => {
			dispose();
			if (!settled && buffer.trim()) feed(buffer.trim());
			settle(failure(stderr));
		});
		stdin.end(`${JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text: query }] } })}\n`);
	});
}
