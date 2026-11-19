"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { notificationsOn, type ChatListItem, type StudyListing, type UserSettings } from "@/src/core";
import { useServerEvent } from "@/components/server-events";
import { needsYouNow } from "@/components/study-home/needs-you";
import { withLessonHere } from "@/components/study-home/study-facts";
import { planNotice, workNotice, type Notice } from "@/components/desktop-notices";

/** The Mac app's notification bridge (electron/preload.cjs): absent in a browser. */
interface NoticeBridge {
	notify?: (notice: Notice) => void;
	onInUse?: (cb: () => void) => () => void;
	onOpen?: (cb: (href: string) => void) => () => void;
}

const bridge = (): NoticeBridge | undefined => (typeof window === "undefined" ? undefined : (window as Window & { lh?: NoticeBridge }).lh);

/** Whether he left the notifications on (Settings, General). */
async function noticesOn(): Promise<boolean> {
	const body = (await fetch("/api/settings", { cache: "no-store" }).then((r) => r.json())) as { settings: UserSettings | null };
	return notificationsOn(body.settings);
}

/** Today's plan from Home's own read and Today's own lines, or null. */
async function todayPlan(): Promise<Notice | null> {
	const [study, chats] = await Promise.all([
		fetch("/api/study", { cache: "no-store" }).then((r) => r.json() as Promise<StudyListing>),
		fetch("/api/chats", { cache: "no-store" }).then((r) => r.json() as Promise<{ chats: ChatListItem[] }>).then((d) => d.chats),
	]);
	if (!study.available || study.courses.length === 0) return null;
	const courses = withLessonHere(study.courses, chats);
	const today = courses[0]!.map.today;
	const { lines } = needsYouNow(courses, chats, today);
	return planNotice(lines.map((line) => line.title), study.hours ?? [], today, new Date());
}

/**
 * The Mac app's side of its notifications (spec: desktop-notices.md):
 * when the app comes into use (this window opening, the Mac waking or
 * unlocking) it offers today's plan, and when work he started finishes it
 * offers that; the shell shows each at most once, the plan once a day, the
 * work only while no window of the app is focused. A click opens the
 * place a notification names here. Renders nothing; inert in a browser.
 */
export function DesktopNoticeBridge() {
	const router = useRouter();
	const offer = useCallback(async (make: () => Promise<Notice | null> | Notice | null) => {
		const notify = bridge()?.notify;
		if (!notify) return;
		try {
			if (!(await noticesOn())) return;
			const notice = await make();
			if (notice) notify(notice);
		} catch {
			/* a notification is never worth an error */
		}
	}, []);

	useEffect(() => {
		const lh = bridge();
		if (!lh?.notify) return;
		void offer(todayPlan);
		const offInUse = lh.onInUse?.(() => void offer(todayPlan));
		const offOpen = lh.onOpen?.((href) => router.push(href));
		return () => {
			offInUse?.();
			offOpen?.();
		};
	}, [offer, router]);

	useServerEvent("work-finished", (work) => void offer(() => workNotice(work)));
	return null;
}
