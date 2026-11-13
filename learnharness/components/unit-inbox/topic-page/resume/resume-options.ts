import type { RESUME_OPTIONS } from "@/components/design-variant";
import { ResumeChipsFoot } from "@/components/unit-inbox/topic-page/resume/resume-chips";
import { ResumeLineFoot } from "@/components/unit-inbox/topic-page/resume/resume-line";
import type { ResumeOption } from "@/components/unit-inbox/topic-page/resume/resume-parts";
import { ResumeTargetFoot } from "@/components/unit-inbox/topic-page/resume/resume-target";

/** One composer foot per option of the Resume switch (spec: resume.md). */
export const RESUME_FEET: Record<(typeof RESUME_OPTIONS)[number], ResumeOption> = {
	line: ResumeLineFoot,
	target: ResumeTargetFoot,
	chips: ResumeChipsFoot,
};
