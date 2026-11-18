/**
 * How many of Earlier's days the history pane shows whole (spec:
 * pickup.md, Earlier): the newest days whose last row ends inside the pane,
 * leaving room for the "Show the rest" row under them, every day when all
 * fit, and always the newest day. `ends` are each day's last row's bottom,
 * from the top of the pane's content; `room` is the pane's height. Round
 * 11, 1 (shot 41): the list ran off the window's bottom edge, its last row
 * cut. Pure.
 */
export function daysThatFit(ends: readonly number[], room: number, more: number): number {
	if (ends.length === 0 || ends[ends.length - 1]! <= room) return ends.length;
	const fit = ends.filter((end) => end <= room - more).length;
	return Math.max(1, fit);
}
