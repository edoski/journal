/** The lesson dock's one rounded surface (spec: dock-surface.md): the
 *  composer, the question dock, the practice dock and the course-link
 *  banner all draw exactly this, so the bottom of the lesson is one
 *  family whatever owns it. A field focused inside draws a 1px ring
 *  outline over the edge (an outline: the global border-colour rule
 *  outranks border-colour utilities). */
export const DOCK_SURFACE =
	"rounded-[20px] border bg-card shadow-xs outline-1 -outline-offset-1 outline-transparent transition-[outline-color] has-[textarea:focus]:outline-ring/50 motion-reduce:transition-none";
