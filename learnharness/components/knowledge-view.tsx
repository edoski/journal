"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { GraphView } from "@/components/graph-view";
import { SidebarToggle } from "@/components/sidebar";
import { useDesignVariant } from "@/components/design-variant";

/** The knowledge graph as its own view: the course's statements and chains
 *  as content, full-bleed, with the graph's own controls top right. The
 *  Proposed design sends this page to Home, where a study home holds the
 *  course map. */
export function KnowledgeView() {
	const variant = useDesignVariant();
	if (variant === "proposed") return <ToHome />;
	return (
		<div className="relative h-dvh">
			{/* Window drag strip, first in the DOM so the graph's carved
			    controls (later in the tree) subtract from it. */}
			<div className="lh-drag absolute inset-x-0 top-0 h-13" aria-hidden="true" />
			<main className="absolute inset-0"><GraphView variant={variant} /></main>
			<header className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 px-3 py-2">
				<div className="pointer-events-auto">
					<SidebarToggle />
				</div>
			</header>
		</div>
	);
}

/** The map lives on Home: an old link or shortcut to `/knowledge` lands there. */
function ToHome() {
	const router = useRouter();
	useEffect(() => router.replace("/"), [router]);
	return null;
}
