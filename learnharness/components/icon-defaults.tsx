"use client";

import { LucideProvider } from "lucide-react";
import { useSystemVariant } from "@/components/design-variant";

/** One icon line weight (Edo, 15 Nov 2026; docs/visual-system.md, Icons):
 *  every lucide icon keeps lucide's own stroke and draws it at that width on
 *  screen whatever its size. Icons are sized in CSS, where lucide's
 *  `absoluteStrokeWidth` cannot see the size, so the stroke stops scaling
 *  with the icon instead. Set here once, never per icon. */
const ONE_LINE = "[&_*]:[vector-effect:non-scaling-stroke]";

export function IconDefaults({ children }: { children: React.ReactNode }) {
	const variant = useSystemVariant();
	return <LucideProvider className={variant === "proposed" ? ONE_LINE : undefined}>{children}</LucideProvider>;
}
