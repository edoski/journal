/** A quiet one-line note in the sidebar's list (12px muted, centred): an
 *  empty list, a list that could not be read, a search with no match. */
export function SidebarNote({ children }: { children: React.ReactNode }) {
	return (
		<li data-slot="sidebar-note" className="list-none px-2 py-6 text-center text-callout text-muted-foreground">
			{children}
		</li>
	);
}
