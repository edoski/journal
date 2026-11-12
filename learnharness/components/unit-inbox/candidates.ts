import type { SidebarCandidate } from "@/components/design-variant";
import type { UnitCandidate } from "@/components/unit-inbox/unit-sidebar";
import { outline } from "@/components/unit-inbox/outline/outline-row";
import { page } from "@/components/unit-inbox/page/page-row";

/** Each sidebar candidate's unit row, by its switch value. */
export const UNIT_CANDIDATES: Record<SidebarCandidate, UnitCandidate> = { outline, page };
