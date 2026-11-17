import { createRef } from "react";
import type { CourseStanding } from "../../src/core/index.ts";
import type { CourseView } from "../../components/course-page/course-model.ts";
import type { CourseColumns } from "../../components/course-page/split/split-course.tsx";

const noop = () => {};

/** What `SplitBody` hands the course head and the road, for a test that
 *  draws one of them alone: the arc he is in shown and open. */
export function columnsOf(view: CourseView, standing: CourseStanding | null = null, over: Partial<CourseColumns> = {}): CourseColumns {
	const shown = view.arcs?.find((s) => s.current) ?? null;
	return {
		view,
		standing,
		busy: false,
		onContinue: noop,
		groups: view.groups,
		shown,
		showArc: noop,
		open: shown ? { [shown.arc.handle]: true } : {},
		onOpenChange: noop,
		onCheck: noop,
		checking: null,
		marked: null,
		onPoint: noop,
		listRef: createRef(),
		onEnterMap: noop,
		onExitTop: noop,
		...over,
	};
}
