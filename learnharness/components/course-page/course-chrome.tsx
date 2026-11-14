"use client";

/** The page's chrome with nothing in it: the 52px band, the window's drag
 *  region, before the page knows which candidate it draws. */
export function CourseChrome({ children }: { children?: React.ReactNode }) {
	return (
		<div className="relative flex h-dvh min-w-0 flex-col">
			<div className="lh-drag absolute inset-x-0 top-0 h-13" aria-hidden="true" />
			<div aria-hidden className="h-13 shrink-0" />
			{children}
		</div>
	);
}
