/**
 * Round 18, m24 (4 minor 5). After Calculus I was deleted, search found
 * none of its sessions by the topics they practised: "chain rule" listed
 * only a Real Analysis topic, and "limit laws" nothing, though the delete
 * dialog says its lessons stay in his history. Search read the topics'
 * titles from the live course, which was gone. Now each session of a
 * course being deleted keeps its topics' titles, and search reads them.
 * On the demo world, with the real engine and the app's own routes.
 */
import { demoWorldMissing, hasDemoSeed, openDemoApp, type DemoApp } from "./helpers/demo-app.tsx";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { filterSessions } from "../components/sidebar-state.ts";
import type { ChatListItem } from "../src/core/index.ts";

const skip = hasDemoSeed() ? demoWorldMissing() ?? false : "no demo world seed here";

describe("a deleted course's sessions in search (round 18, m24)", { skip, concurrency: false, timeout: 600_000 }, () => {
	let app: DemoApp;
	before(async () => {
		app = await openDemoApp("2026-11-08");
	});
	after(() => app?.close());

	it("are found by the topics they practised, as before the course was deleted", async () => {
		const { stores } = await import("../src/server/stores.ts");
		const list = async () => ((await (await fetch("/api/chats")).json()) as { chats: ChatListItem[] }).chats;
		const before = await list();
		const calculus = before.find((c) => c.course?.title?.startsWith("Calculus"))?.course?.workspace;
		assert.ok(calculus, "the demo world has a Calculus course with sessions");
		const map = await stores.courseRecords.map(calculus);
		assert.ok(map.ok, "its map reads before the delete");
		const titleOf = new Map<string, string>(map.map.topics.map((t) => [t.handle, t.title]));
		// Every topic one of its sessions saved an answer on, by title.
		const practised = [...new Set(before.filter((c) => c.course?.workspace === calculus).flatMap((c) => Object.keys(c.answeredOn ?? {})))].filter((h) => titleOf.has(h));
		assert.ok(practised.length > 0, "its sessions practised some topics");
		const live = (chat: ChatListItem, handle: string) => (chat.course?.workspace === calculus ? titleOf.get(handle) : undefined);
		const found = (chats: ChatListItem[], words: string, lookup: typeof live) => filterSessions(chats, words, lookup).filter((c) => c.course?.workspace === calculus).map((c) => c.id);

		const deleted = await fetch("/api/courses", { method: "DELETE", body: JSON.stringify({ workspace: calculus }) });
		assert.equal(deleted.status, 200, await deleted.clone().text());
		const after = await list();
		const gone = () => undefined; // no live map names a deleted course's topics
		const lost = practised.filter((h) => found(after, titleOf.get(h)!, gone).length === 0 && found(before, titleOf.get(h)!, live).length > 0);
		assert.deepEqual(lost.map((h) => titleOf.get(h)), [], "every topic its sessions practised still finds them");
	});
});
