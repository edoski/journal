import type { ComponentType } from "react";
import type { LINK_OPTIONS } from "@/components/design-variant";
import { ConnectedPanes } from "@/components/unit-inbox/topic-page/link/connected-panes";
import type { PanesProps } from "@/components/unit-inbox/topic-page/link/link-panes";
import { SplitPanes } from "@/components/unit-inbox/topic-page/link/split-panes";

/** One way of tying the panes per option of the Link switch (spec: link.md). */
export const LINK_PANES: Record<(typeof LINK_OPTIONS)[number], ComponentType<PanesProps>> = {
	split: SplitPanes,
	connected: ConnectedPanes,
};
