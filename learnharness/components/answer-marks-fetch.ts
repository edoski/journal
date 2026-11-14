"use client";

import { useEffect, useState } from "react";
import type { AnswerMark, AnswerMarksResponse } from "@/src/core";

/** The session's marks (`/api/chats/:id/marks`), read again each time
 *  `settled` changes; null while a turn runs, so a read waits for its
 *  save. A failed read keeps the marks it had. */
export function useAnswerMarks(chatId: string, settled: number | null): Readonly<Record<string, AnswerMark>> {
	const [marks, setMarks] = useState<Readonly<Record<string, AnswerMark>>>({});
	useEffect(() => {
		if (settled === null) return;
		const controller = new AbortController();
		fetch(`/api/chats/${encodeURIComponent(chatId)}/marks`, { signal: controller.signal })
			.then((res) => (res.ok ? (res.json() as Promise<AnswerMarksResponse>) : null))
			.then((body) => {
				if (body?.ok) setMarks(body.marks);
			})
			.catch(() => {});
		return () => controller.abort();
	}, [chatId, settled]);
	return marks;
}
