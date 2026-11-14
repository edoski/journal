"use client";

import { SectionBreak } from "@/components/lesson/section-break";

/** The cut divider (owner round 14): a hairline at the actual compaction
 *  cut, the seam where verbatim history ends and the kept recent tail
 *  begins. The compaction summary stays unrendered (owner, release polish
 *  2026-10-06): it is model-facing plumbing, inspectable only in provider
 *  logs. The moment the compaction ran is left unmarked; the cut is enough. */
export function CompactionCutDivider() {
	return <SectionBreak testId="compaction-cut-divider" />;
}
