import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createWebTools } from "../src/agent/tools/web.ts";
import { jobTools } from "../src/agent/tools/jobs.ts";
import { runResearcherAgent } from "../src/agent/subagents/researcher.ts";
import { createJobRunner } from "../src/agent/subagents/runner.ts";
import { createFauxCore, fauxAssistantMessage, fauxText, fauxToolCall, type FauxResponseStep } from "@earendil-works/pi-ai";
import type { JobStore } from "../src/core/ports.ts";
import type { JobRecord } from "../src/core/contracts.ts";
import { fakeEngine, fakeFor, type ScriptedModel } from "./helpers/fake-sdk.ts";

describe("web tools (web.ts)", () => {
	it("offer web_fetch only (search is Claude Code's own WebSearch), and web_fetch rejects an invalid URL", async () => {
		const tools = createWebTools();
		assert.deepEqual(Object.keys(tools), ["web_fetch"]);
		const out = await tools.web_fetch!.execute!("c1", { url: "not a url" });
		assert.match(String(out.details), /web_fetch failed: invalid URL/);
	});

	it("web_fetch ACCEPTS a valid http(s) URL — the protocol gate must not reject everything (the colon bug, 2026-10-07)", async () => {
		// URL.protocol is \"https:\" WITH the colon; the colon-less comparison
		// ported from the py harness (urlparse().scheme has none) made the
		// gate throw for every valid URL — the tool never fetched a page in
		// its life (owner-reported via OpenRouter logs). This pin stubs fetch
		// so the happy path runs hermetically: a VALID url must REACH the
		// fetch stage.
		const { web_fetch } = createWebTools();
		const realFetch = globalThis.fetch;
		globalThis.fetch = (async () =>
			new Response("A plain text page with enough content to matter for the test.", {
				headers: { "content-type": "text/plain" },
			})) as typeof fetch;
		try {
			const ok = await web_fetch!.execute!("c-ok", { url: "https://example.com/page" });
			assert.ok(
				!String(ok.details).includes("invalid URL"),
				"a valid https URL passes the protocol gate and reaches fetch",
			);
			assert.match(String(ok.details), /plain text page/);

			const ftp = await web_fetch!.execute!("c-ftp", { url: "ftp://example.com/file" });
			assert.match(String(ftp.details), /invalid URL/, "non-http(s) schemes still rejected");
		} finally {
			globalThis.fetch = realFetch;
		}
	});
});

function toolsSeenBy() {
	const faux = createFauxCore({});
	const seen: { names: string[]; prompt: string } = { names: [], prompt: "" };
	faux.setResponses([(context) => {
		const system = context.messages.find((m) => m.role === "system");
		assert.ok(system && system.role === "system");
		seen.names = (system.toolsAdded ?? []).map((t) => t.name);
		seen.prompt = system.content as string;
		return fauxAssistantMessage([fauxText("done")]);
	}]);
	const scripted: ScriptedModel = { model: faux.getModel(), streamFn: faux.streamSimple };
	return { seen, scripted, run: () => runResearcherAgent("Check the tools only", { engine: fakeEngine(scripted) }) };
}

describe("researcher tools", () => {
	it("asks Claude Code for its own WebSearch, and the app adds web_fetch", async () => {
		const { seen, scripted, run } = toolsSeenBy();
		await run();
		const [options] = fakeFor(scripted).calls;
		assert.deepEqual(options!.tools, ["WebSearch"], "Claude Code's WebSearch, and none of its other tools");
		assert.ok(options!.allowedTools?.includes("WebSearch"), "WebSearch runs without a permission prompt");
		assert.deepEqual(seen.names, ["web_fetch"], "the app's own tools: web_fetch, no app-side search");
	});

	it("the prompt explains WebSearch summaries and the research process", async () => {
		const { seen, run } = toolsSeenBy();
		await run();
		assert.match(seen.prompt, /Search with WebSearch using varied angles/);
		assert.match(seen.prompt, /WebSearch results come with a short summary/);
		assert.match(seen.prompt, /Break the question into 2-4 searchable facets/);
		assert.match(seen.prompt, /## Gaps/);
		assert.doesNotMatch(seen.prompt, /credentials|API key/);
	});
});

describe("researcher loop", () => {
	it("fetch-only research delivers the brief from the fetched page", async () => {
		const url = "https://example.com/supplied-source";
		const brief = `## Summary\nVerified supplied source. [Source](${url})`;
		const steps: FauxResponseStep[] = [
			fauxAssistantMessage([fauxToolCall("web_fetch", { url }, { id: "fetch1" })], { stopReason: "toolUse" }),
			(context) => {
				const result = context.messages.find((m) => m.role === "toolResult" && m.toolCallId === "fetch1");
				assert.ok(result && result.role === "toolResult");
				assert.equal(result.isError, false);
				assert.match(JSON.stringify(result.content), /Synthetic verified source content/);
				return fauxAssistantMessage([fauxText(brief)]);
			},
		];
		const faux = createFauxCore({});
		faux.setResponses(steps);
		const realFetch = globalThis.fetch;
		const fetched: string[] = [];
		globalThis.fetch = (async (input) => {
			fetched.push(String(input));
			assert.equal(String(input), url, "only the supplied URL is fetched");
			return new Response("Synthetic verified source content", { headers: { "content-type": "text/plain" } });
		}) as typeof fetch;
		try {
			assert.equal(await runResearcherAgent(`Verify ${url}`, { engine: fakeEngine({ model: faux.getModel(), streamFn: faux.streamSimple }) }), brief);
			assert.deepEqual(fetched, [url]);
		} finally {
			globalThis.fetch = realFetch;
		}
	});

	it("a research job's activity line names a WebSearch call as web_search with its query", async () => {
		const faux = createFauxCore({});
		faux.setResponses([
			fauxAssistantMessage([fauxToolCall("WebSearch", { query: "sigma.js latest version" }, { id: "ws1" })], { stopReason: "toolUse" }),
			fauxAssistantMessage([fauxText("## Summary\nSigma.js 3. [Docs](https://www.sigmajs.org)")]),
		]);
		const engine = fakeEngine({ model: faux.getModel(), streamFn: faux.streamSimple });
		const jobStore = fakeJobStore();
		const activities: string[] = [];
		const updateJob = jobStore.updateJob.bind(jobStore);
		jobStore.updateJob = (id, patch) => {
			if (typeof patch.activity === "string") activities.push(patch.activity);
			return updateJob(id, patch);
		};
		const job = jobStore.createJob({ kind: "research", chatId: "chat-activity", toolCallId: "research-call" });
		const chatStore = { getChat: (id: string) => ({ id, messages: [] }) } as unknown as ChatStore;
		const runner = createJobRunner({ chatStore, jobStore, deliver: async () => {}, engineFor: () => engine });
		await runner.runJob(job.id, { question: "Which sigma.js version is current?" });
		assert.ok(activities.includes('web_search: "sigma.js latest version"'), `activity lines: ${JSON.stringify(activities)}`);
		assert.equal(jobStore.getJob(job.id)!.status, "done");
	});
});

/** Minimal in-memory JobStore — registry tests never touch the fs. */
function fakeJobStore(): JobStore {
	const jobs = new Map<string, JobRecord>();
	return {
		createJob(init) {
			const job: JobRecord = {
				id: `job_${jobs.size + 1}`,
				kind: init.kind,
				chatId: init.chatId,
				toolCallId: init.toolCallId,
				status: "running",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				activity: "",
			} as JobRecord;
			jobs.set(job.id, job);
			return job;
		},
		getJob: (id) => jobs.get(id) ?? null,
		updateJob: (id, patch) => {
			const job = jobs.get(id);
			if (!job) return null;
			return Object.assign(job, patch);
		},
		listJobs: () => [...jobs.values()],
		findJobByToolCallId: () => null,
		deleteJobsForChat: () => 0,
	};
}

function fakeCtx() {
	return { chatId: "chat-drop-test", jobStore: fakeJobStore(), spawn: () => {} };
}

describe("research dispatch (jobTools)", () => {
	it("research sits beside the other sub-agents", () => {
		const tools = jobTools(fakeCtx());
		assert.ok(tools.research && tools.demo && tools.visual && tools.pdf);
	});

	it("dispatch preserves the async job acknowledgement and spawn contract", async () => {
		const ctx = fakeCtx();
		const spawned: Array<{ job: JobRecord; input: unknown }> = [];
		const tools = jobTools({ ...ctx, spawn: (job, input) => { spawned.push({ job, input }); } });
		const input = { question: "Verify the supplied URL", context: "https://example.com/source" };
		const out = await tools.research!.execute!("research-call", input);
		assert.match(String(out.details), /^Dispatched \(job job_1\)\./);
		assert.match(String(out.details), /fire-and-forget/);
		assert.equal(spawned.length, 1);
		assert.equal(spawned[0]!.job.kind, "research");
		assert.equal(spawned[0]!.job.toolCallId, "research-call");
		assert.equal(spawned[0]!.job.status, "running");
		assert.deepEqual(spawned[0]!.input, input);
	});
});

import { createProberTools, createTeacherTools } from "../src/agent/tools.ts";
import type { ChatStore } from "../src/core/ports.ts";

/** A chat-store stub — the registry factories only CLOSE OVER it at build
 *  time (quiz/plan superRefines read it at execute time, never here). */
const fakeChatStore = {
	getChat: () => null,
	saveMessages: () => {},
} as unknown as ChatStore;

const ctxBase = { chatId: "chat-gate-test", chatStore: fakeChatStore };

describe("role registries", () => {
	it("createTeacherTools keeps research with the other job tools", () => {
		const tools = createTeacherTools({ ...ctxBase, jobStore: fakeJobStore(), spawn: () => {} });
		assert.ok(tools.research && tools.demo && tools.visual && tools.pdf);
	});

	it("createProberTools: research + pdf are phase-omnipresent", () => {
		const tools = createProberTools({ ...ctxBase, deliver: () => {}, jobStore: fakeJobStore(), spawn: () => {} });
		assert.ok(tools.research && tools.pdf && tools.probe_done, "the owner ruling: research + pdf in the probe phase");
	});
});
