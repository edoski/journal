import type { SidebarCandidate } from "@/components/design-variant";
import type { UnitCandidate } from "@/components/unit-inbox/unit-sidebar";
import { outline } from "@/components/unit-inbox/outline/outline-row";

/** Each sidebar candidate's unit row, by its switch value. */
export const UNIT_CANDIDATES: Record<SidebarCandidate, UnitCandidate> = { outline };
