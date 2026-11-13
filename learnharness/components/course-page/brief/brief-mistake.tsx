"use client";

import Link from "next/link";
import { CircleXIcon } from "lucide-react";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import type { BriefMistake as Mistake } from "./brief-model";
import { MathText } from "@/components/ui/math-text";

/**
 * The one mistake the engine can name (spec: brief-course.md): its
 * slip icon, the topic's name, then the engine's sentence for the mistake,
 * two lines at most and no wider than 75 characters, across the column
 * rather than in a narrow answer. A click opens the topic's page, where the
 * sentence sits with the rest of its evidence.
 */
export function BriefMistake({ mistake }: { mistake: Mistake }) {
	const { row, sentence } = mistake;
	return (
		<Link
			href={row.href}
			onClick={blurAfterPointerClick}
			data-slot="brief-mistake"
			className="-mx-3 flex shrink-0 items-start gap-4 self-start rounded-md px-3 py-2 outline-none transition-colors duration-150 hover:bg-fill-hover focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
		>
			<CircleXIcon aria-hidden className="mt-px size-4 shrink-0 text-muted-foreground" />
			<span data-slot="brief-mistake-text" className="line-clamp-2 max-w-[75ch] text-row text-muted-foreground">
				<span className="font-medium text-foreground">
					<MathText>{row.topic.title}</MathText>
				</span>
				<span className="sr-only">, a mistake to fix:</span> <MathText>{sentence}</MathText>
			</span>
		</Link>
	);
}
