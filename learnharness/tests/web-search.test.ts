import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createWebTools } from "../src/agent/tools/web.ts";
import { jobTools } from "../src/agent/tools/jobs.ts";
import { runResearcherAgent } from "../src/agent/subagents/researcher.ts";
import { createFauxCore, fauxAssistantMessage, fauxText, fauxToolCall, type Api, type FauxResponseStep, type Model } from "@earendil-works/pi-ai";
import type { JobStore } from "../src/core/ports.ts";
import type { JobRecord } from "../src/core/contracts.ts";
import { CLAUDE_SUBSCRIPTION } from "../src/core/contracts/claude.ts";

describe("web_search (web.ts)", () => {
	it("returns the native search's result text", async () => {
		const seen: string[] = [];
		const { web_search } = createWebTools(async (query) => { seen.push(query); return "Links: [...]\n\nSummary."; });
		const out = await web_search!.execute!("c1", { query: "sigma.js latest version" });
		assert.deepEqual(seen, ["sigma.js latest version"]);
		assert.deepEqual(out.content, [{ type: "text", text: "Links: [...]\n\nSummary." }]);
	});

	it("returns the thrown error text as its output instead of throwing", async () => {
		const { web_search } = createWebTools(async () => { throw new Error("Your Claude plan's usage limit is reached."); });
		const out = await web_search!.execute!("c1", { query: "q" });
		assert.deepEqual(out.content, [{ type: "text", text: "Your Claude plan's usage limit is reached." }]);
		assert.notEqual(out.isError, true);
	});

	it("is absent without a native search, while web_fetch stays", async () => {
		const tools = createWebTools();
		assert.equal("web_search" in tools, false);
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

function toolsSeenBy(model: Model<Api>, faux: ReturnType<typeof createFauxCore>) {
	const seen: { names: string[]; prompt: string } = { names: [], prompt: "" };
	faux.setResponses([(context) => {
		const system = context.messages.find((m) => m.role === "system");
		assert.ok(system && system.role === "system");
		seen.names = (system.toolsAdded ?? []).map((t) => t.name);
		seen.prompt = system.content as string;
		return fauxAssistantMessage([fauxText("done")]);
	}]);
	return { seen, run: () => runResearcherAgent("Check the tools only", { engine: { model, streamFn: faux.streamSimple } }) };
}

describe("researcher tools follow the engine's provider", () => {
	it("a Claude subscription model gets web_search", async () => {
		const faux = createFauxCore({});
		const { seen, run } = toolsSeenBy({ ...faux.getModel(), provider: CLAUDE_SUBSCRIPTION.providerId }, faux);
		await run();
		assert.ok(seen.names.includes("web_search"));
		assert.ok(seen.names.includes("web_fetch"));
	});

	it("another provider gets no web_search but keeps web_fetch", async () => {
		const faux = createFauxCore({});
		const { seen, run } = toolsSeenBy(faux.getModel(), faux);
		await run();
		assert.equal(seen.names.includes("web_search"), false);
		assert.ok(seen.names.includes("web_fetch"));
	});

	it("the prompt explains search summaries and research without web_search", async () => {
		const faux = createFauxCore({});
		const { seen, run } = toolsSeenBy(faux.getModel(), faux);
		await run();
		assert.match(seen.prompt, /If you have no web_search tool, research with web_fetch on URLs you can name with confidence/);
		assert.match(seen.prompt, /web_search results come with a short summary/);
		assert.match(seen.prompt, /Break the question into 2-4 searchable facets/);
		assert.match(seen.prompt, /## Gaps/);
		assert.doesNotMatch(seen.prompt, /credentials|API key/);
	});
});

describe("researcher loop", () => {
	for (const searchFirst of [true, false]) {
		it(searchFirst ? "recovers from a failed search by fetching a supplied URL" : "fetch-only research runs without web_search", async () => {
			const url = "https://example.com/supplied-source";
			const brief = `## Summary\nVerified supplied source. [Source](${url})`;
			const steps: FauxResponseStep[] = [];
			const fetchCall = () => fauxAssistantMessage(
				[fauxToolCall("web_fetch", { url }, { id: "fetch1" })], { stopReason: "toolUse" },
			);
			if (searchFirst) {
				steps.push(
					() => fauxAssistantMessage(
						[fauxToolCall("web_search", { query: "supplied source" }, { id: "search1" })], { stopReason: "toolUse" },
					),
					(context) => {
						const result = context.messages.find((m) => m.role === "toolResult" && m.toolCallId === "search1");
						assert.ok(result && result.role === "toolResult");
						assert.equal(result.isError, false, "a failed search does not abort the native loop");
						assert.match(JSON.stringify(result.content), /search did not run/);
						return fetchCall();
					},
				);
			} else steps.push(fetchCall());
			steps.push((context) => {
				const result = context.messages.find((m) => m.role === "toolResult" && m.toolCallId === "fetch1");
				assert.ok(result && result.role === "toolResult");
				assert.equal(result.isError, false);
				assert.match(JSON.stringify(result.content), /Synthetic verified source content/);
				return fauxAssistantMessage([fauxText(brief)]);
			});
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
				assert.equal(await runResearcherAgent(`Verify ${url}`, {
					engine: { model: faux.getModel(), streamFn: faux.streamSimple },
					search: searchFirst ? async () => { throw new Error("Claude's web search did not run."); } : null,
				}), brief);
				assert.deepEqual(fetched, [url]);
			} finally {
				globalThis.fetch = realFetch;
			}
		});
	}
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

	it("createProberTools: the user toggle drops research", () => {
		const tools = createProberTools(
			{ ...ctxBase, deliver: () => {}, jobStore: fakeJobStore(), spawn: () => {} },
			{ research: false },
		);
		assert.equal("research" in tools, false, "toggle-filtered like the teacher side");
		assert.ok(tools.pdf, "pdf unaffected by a research toggle");
	});

	it("createTeacherTools: the user toggle drops research", () => {
		const tools = createTeacherTools(
			{ ...ctxBase, jobStore: fakeJobStore(), spawn: () => {} },
			{ research: false },
		);
		assert.equal("research" in tools, false);
		assert.ok(tools.pdf && tools.demo && tools.visual);
	});
});
