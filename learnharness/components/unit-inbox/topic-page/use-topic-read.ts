"use client";

import { useEffect, useState } from "react";
import type { SessionPlan, TopicReadResponse, TopicRecord } from "@/src/core";
import { useServerEvent } from "@/components/server-events";

/** What the page keeps of GET /api/topic: the engine's record of the
 *  topic (null when the engine could not be read) and its sessions' plans. */
export interface TopicRead {
	record: TopicRecord | null;
	plans: readonly SessionPlan[];
}

/** The most sessions one read names: the topic's newest. */
const SESSIONS = 20;

/**
 * The topic read (spec: topic-page.md): the engine's attempts and task
 * days for one topic and the plans of its newest sessions. Read again
 * when a turn settles, the list or a record changes, and when the tasks
 * or sessions asked for change. A failed read is `read: null` the first
 * time and keeps the last good one after.
 */
export function useTopicRead(
	workspace: string,
	handle: string,
	taskKeys: readonly string[],
	sessionIds: readonly string[],
): { status: "loading" } | { status: "ready"; read: TopicRead | null } {
	const [state, setState] = useState<{ status: "loading" } | { status: "ready"; read: TopicRead | null }>({ status: "loading" });
	const [attempt, setAttempt] = useState(0);
	useServerEvent("turn-settled", () => setAttempt((n) => n + 1));
	useServerEvent("chats-changed", () => setAttempt((n) => n + 1));
	useServerEvent("record-changed", () => setAttempt((n) => n + 1));
	const query = new URLSearchParams([
		["workspace", workspace],
		["topic", handle],
		...taskKeys.map((key) => ["task", key]),
		...sessionIds.slice(0, SESSIONS).map((id) => ["session", id]),
	]).toString();
	useEffect(() => {
		let live = true;
		const failed = () => live && setState((prev) => (prev.status === "ready" && prev.read ? prev : { status: "ready", read: null }));
		void fetch(`/api/topic?${query}`, { cache: "no-store" })
			.then((r) => r.json() as Promise<TopicReadResponse>)
			.then((body) => {
				if (!body.ok) return failed();
				if (live) setState({ status: "ready", read: { record: body.record, plans: body.plans } });
			})
			.catch(failed);
		return () => {
			live = false;
		};
	}, [query, attempt]);
	return state;
}
