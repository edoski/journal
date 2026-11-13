import type { PICKUP_OPTIONS } from "@/components/design-variant";
import { SectionsPane } from "@/components/unit-inbox/topic-page/pickup/sections";
import type { HybridPaneProps } from "@/components/unit-inbox/topic-page/hybrid/hybrid-topic";

/** One history pane per option of the Pick up switch (spec: pickup.md). */
export const PICKUP_PANES: Record<(typeof PICKUP_OPTIONS)[number], React.ComponentType<HybridPaneProps>> = {
	sections: SectionsPane,
};
