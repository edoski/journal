"use client";

import { SidebarToggle } from "@/components/sidebar";

/** The page's chrome with nothing in it: the 52px band with the sidebar
 *  toggle, before the page knows which candidate it draws. */
export function CourseChrome({ children }: { children?: React.ReactNode }) {
	return (
		<div className="relative flex h-dvh min-w-0 flex-col">
			<div className="lh-drag absolute inset-x-0 top-0 h-13" aria-hidden="true" />
			<header className="relative flex h-13 shrink-0 items-center gap-2 px-3">
				<SidebarToggle />
			</header>
			{children}
		</div>
	);
}
