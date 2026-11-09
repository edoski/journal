"use client";

import { GraphView } from "@/components/graph-view";
import { MinimalHome } from "@/components/minimal-home";
import { SidebarToggle } from "@/components/sidebar";
import { useDesignVariant } from "@/components/design-variant";
import { CourseMapView } from "@/components/course-map/course-map-view";

/** The knowledge graph as its own view: the course's statements and chains
 *  as content, full-bleed, with the graph's own controls top right. The
 *  Proposed design shows the course map here instead. */
export function KnowledgeView({ rendering }: { rendering: boolean }) {
	const variant = useDesignVariant();
	if (variant === "proposed") return <CourseMapView />;
	return (
		<div className="relative h-dvh">
			{/* Window drag strip, first in the DOM so the graph's carved
			    controls (later in the tree) subtract from it. */}
			<div className="lh-drag absolute inset-x-0 top-0 h-13" aria-hidden="true" />
			<main className="absolute inset-0">{rendering ? <GraphView variant={variant} /> : <MinimalHome />}</main>
			<header className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 px-3 py-2">
				<div className="pointer-events-auto">
					<SidebarToggle />
				</div>
			</header>
		</div>
	);
}
