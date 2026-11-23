"use client";

import { useEffect, useRef, useState } from "react";
import type { AnswerMark, AnswerMarksResponse } from "@/src/core";
import { useServerEvent } from "@/components/server-events";
import { useSerialRead } from "@/components/serial-read";

/** The session's marks (`/api/chats/:id/marks`), read again each time
 *  `settled` changes (null while this window's turn runs; the transcript's
 *  length and newest id, so the settle sync that swaps the streamed copies
 *  for the record's reads again even at the same length), and each time
 *  the record they come from changes: the course's (`course-changed`, a
 *  save mid-turn included) and the session's own (`turn-settled`,
 *  `record-changed`). A save that lands after this window's stream ended
 *  shows at once, never only after a reload (round 12, 3 D3 and 4 minor
 *  1). Reads never overlap: an event during a read asks for one more read
 *  when it ends (`useSerialRead`), so the burst a turn ends on never throws
 *  away the read under way, and its marks show as soon as it returns. A
 *  failed read keeps the marks it had, and takes the ones the session's
 *  own saves sent for answers it has none for. */
export function useAnswerMarks(chatId: string, workspace: string | undefined, settled: string | null): Readonly<Record<string, AnswerMark>> {
	const [marks, setMarks] = useState<Readonly<Record<string, AnswerMark>>>({});
	const session = useRef(chatId);
	session.current = chatId;
	const read = useSerialRead(async () => {
		const id = session.current;
		const res = await fetch(`/api/chats/${encodeURIComponent(id)}/marks`);
		const body = res.ok || res.status === 503 ? ((await res.json().catch(() => null)) as AnswerMarksResponse | null) : null;
		if (!body || session.current !== id) return;
		if (body.ok) setMarks(body.marks);
		else if (body.marks) {
			const saved = body.marks;
			setMarks((drawn) => ({ ...saved, ...drawn }));
		}
	});
	useServerEvent("course-changed", (p) => p.workspace === workspace && read());
	useServerEvent("turn-settled", (p) => p.chatId === chatId && read());
	useServerEvent("record-changed", (p) => p.chatId === chatId && read());
	useEffect(() => {
		if (settled !== null) read();
	}, [read, chatId, settled]);
	return marks;
}
