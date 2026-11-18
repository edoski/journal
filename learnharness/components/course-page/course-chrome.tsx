"use client";

import { WindowPage } from "@/components/page-frame/window-page";

/** The page's chrome with nothing in it: the window's page under its 52px
 *  band (`WindowPage`), before the course is read. */
export function CourseChrome({ children }: { children?: React.ReactNode }) {
	return <WindowPage>{children}</WindowPage>;
}
