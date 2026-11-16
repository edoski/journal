"use client";

import { useEffect, useState } from "react";
import type { AnswerMark, AnswerMarksResponse } from "@/src/core";
import { useServerEvent } from "@/components/server-events";

/** The session's marks (`/api/chats/:id/marks`), read again each time
 *  `settled` changes (null while this window's turn runs), and each time
 *  the record they come from changes: the course's (`course-changed`, a
 *  save mid-turn included) and the session's own (`turn-settled`,
 *  `record-changed`). A save that lands after this window's stream ended
 *  shows at once, never only after a reload (round 12, 3 D3 and 4 minor
 *  1). A failed read keeps the marks it had. */
export function useAnswerMarks(chatId: string, workspace: string | undefined, settled: number | null): Readonly<Record<string, AnswerMark>> {
	const [marks, setMarks] = useState<Readonly<Record<string, AnswerMark>>>({});
	const [changed, setChanged] = useState(0);
	const reread = () => setChanged((n) => n + 1);
	useServerEvent("course-changed", (p) => p.workspace === workspace && reread());
	useServerEvent("turn-settled", (p) => p.chatId === chatId && reread());
	useServerEvent("record-changed", (p) => p.chatId === chatId && reread());
	useEffect(() => {
		if (settled === null && changed === 0) return;
		const controller = new AbortController();
		fetch(`/api/chats/${encodeURIComponent(chatId)}/marks`, { signal: controller.signal })
			.then((res) => (res.ok ? (res.json() as Promise<AnswerMarksResponse>) : null))
			.then((body) => {
				if (body?.ok) setMarks(body.marks);
			})
			.catch(() => {});
		return () => controller.abort();
	}, [chatId, settled, changed]);
	return marks;
}
