"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { ArrowDownIcon } from "lucide-react";
import { useStickToBottomContext } from "use-stick-to-bottom";
import { Button } from "@/components/ui/button";
import { LESSON_WORDS } from "@/components/study-words";
import { isTypingSurface, kbdEventForAction } from "@/src/core";
import { cn } from "@/lib/utils";
import { contentEnd, followTarget, readPastAnchor, replyStart, scrollCueOf, seenThrough, type ReplyAnchor, type ScrollCue, type ScrollGeometry } from "./reading-position";

/** Keys that scroll the lesson up when no field has them. */
const UP_KEYS = new Set(["ArrowUp", "PageUp", "Home"]);

/**
 * The reading position's controller and its cue (reading-position.ts).
 *
 * Following: while his latest action holds an anchor, every growth of the
 * transcript brings the view down toward the reply's start, never past it
 * and never up. Only his own hand lets go: a wheel, a key or a press that
 * scrolls up. A scroll the layout causes (the dock shrinking back to the
 * composer clamps the position) is not his, so it never stops the follow.
 *
 * The cue: "New reply" while any of the tutor's reply sits below what he
 * can see, a plain down arrow while he is above the bottom with nothing
 * new, nothing at the bottom. Pressing it, or ⌘↓, goes to the newest line.
 *
 * Read on scroll, on the transcript's resizes and on his input, never on a
 * timer.
 */
export function ScrollCueButton({ anchorRef, onJump, className }: {
	anchorRef: MutableRefObject<ReplyAnchor>;
	onJump: () => void;
	className?: string;
}) {
	const { scrollRef } = useStickToBottomContext();
	const [cue, setCue] = useState<ScrollCue>(null);
	const cueRef = useRef(cue);
	cueRef.current = cue;

	useEffect(() => {
		const el = scrollRef.current;
		const content = el?.firstElementChild;
		if (!el || !content) return;
		const geometry = (): ScrollGeometry => ({
			scrollTop: el.scrollTop,
			scrollHeight: el.scrollHeight,
			clientHeight: el.clientHeight,
			reserve: el.querySelector<HTMLElement>('[data-testid="dock-spacer"]')?.offsetHeight ?? 0,
		});
		// What the lesson held when it opened counts as read.
		let seen = contentEnd(geometry());
		const update = () => {
			const g = geometry();
			seen = seenThrough(g, seen);
			if (readPastAnchor(g, replyStart(anchorRef.current, el))) anchorRef.current = null;
			setCue(scrollCueOf(g, seen));
		};
		const follow = () => {
			const start = replyStart(anchorRef.current, el);
			if (start !== null) {
				const target = followTarget(el.scrollHeight - el.clientHeight, start);
				if (target > el.scrollTop + 1) el.scrollTop = target;
			}
			update();
		};
		const letGo = () => {
			anchorRef.current = null;
		};
		const onWheel = (e: WheelEvent) => {
			if (e.deltaY < 0) letGo();
		};
		const onKey = (e: KeyboardEvent) => {
			if (UP_KEYS.has(e.key) && !isTypingSurface(e)) letGo();
		};
		el.addEventListener("scroll", update, { passive: true });
		el.addEventListener("wheel", onWheel, { passive: true });
		el.addEventListener("pointerdown", letGo);
		window.addEventListener("keydown", onKey);
		const ro = new ResizeObserver(follow);
		ro.observe(content);
		return () => {
			el.removeEventListener("scroll", update);
			el.removeEventListener("wheel", onWheel);
			el.removeEventListener("pointerdown", letGo);
			window.removeEventListener("keydown", onKey);
			ro.disconnect();
		};
	}, [scrollRef, anchorRef]);

	useEffect(() => {
		const onKey = () => {
			if (cueRef.current !== null) onJump();
		};
		const name = kbdEventForAction("jump-latest");
		window.addEventListener(name, onKey);
		return () => window.removeEventListener(name, onKey);
	}, [onJump]);

	if (cue === null) return null;
	const place = "pointer-events-auto absolute left-1/2 -translate-x-1/2 rounded-full dark:bg-background dark:hover:bg-muted";
	if (cue === "new-reply") {
		return (
			<Button type="button" variant="outline" size="sm" data-testid="new-reply-cue" onClick={onJump} className={cn(place, "h-8 gap-1.5 px-3 text-row", className)}>
				{LESSON_WORDS.newReply}
				<ArrowDownIcon className="size-4" />
			</Button>
		);
	}
	return (
		<Button type="button" variant="outline" size="icon" aria-label="Go to the newest reply" data-testid="scroll-down-cue" onClick={onJump} className={cn(place, className)}>
			<ArrowDownIcon className="size-4" />
		</Button>
	);
}
