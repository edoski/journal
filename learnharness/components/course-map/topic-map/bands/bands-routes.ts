/**
 * Bands' lines (bands.md, Lines): every prerequisite's lines leave its card
 * as one trunk that runs down and parts only in the gap just above a row of
 * its topics (an orthogonal bus), dropping into each of them there and
 * running on down to the next row it feeds. Where a card stands in the
 * trunk's way, it steps aside in the gap above that card, to a free
 * column or the gutter between two, so it passes beside the card and never
 * through it. Among the ways to step aside and to stack the brackets in a
 * gap, the one that crosses the fewest lines wins. Pure.
 */

/** One card on the grid: its row, and the x of its centre. */
export interface GridCard {
	id: string;
	row: number;
	x: number;
}

/** A row's cards, as the stretches of x they cover. */
export type RowSpans = ReadonlyMap<number, readonly (readonly [number, number])[]>;

/** One prerequisite's bracket in a gap: where its trunk arrives (`up`), what leaves the lane downwards (`downs`: its
 *  topics in the row below, and its trunk running on), and the lane's stretch. */
interface Bracket {
	parent: string;
	gap: number;
	up: number;
	downs: number[];
	/** The x the trunk runs on below this gap, when it runs on. */
	on: number | null;
	low: number;
	high: number;
}

/** A trunk's way down: per gap from its card to its last topic's row, where it arrives and where it runs on. */
interface Way {
	parent: string;
	brackets: Bracket[];
	/** Straight runs through a gap with no bracket: the trunk passing, or a single drop. */
	passes: { gap: number; x: number }[];
	/** The x the trunk passes each row on, between its card and its last topic's row. */
	through: { row: number; x: number }[];
}

/** Every line, as its corners, with each gap's lanes: what `routeTrunks` returns. */
export interface Trunks {
	/** `parent>child` → its points, given each gap's lane heights. */
	lines: (laneY: (gap: number, lane: number) => number, rowTop: (row: number) => number, rowBottom: (row: number) => number) => Map<string, [number, number][]>;
	/** How many lanes each gap needs. */
	lanes: Map<number, number>;
	/** What the lines cost as laid: a crossing 1, a stretch two trunks share where the eye can't tell them apart a half. */
	cost: number;
}

/** Up to this many ways to step aside are weighed for each trunk. */
const STEP_OPTIONS = 3;
/** Up to this many brackets in a gap, every order of their lanes is tried. */
const EXACT_LANES = 6;
/** The most trunks' choices weighed together; past it, one trunk at a time, until none improves. */
const EXACT_PLANS = 4096;

const inside = (x: number, low: number, high: number) => x > low + 0.5 && x < high - 0.5;
const same = (a: number, b: number) => Math.abs(a - b) < 0.5;

/** Whether a vertical line at `x` passes a row's cards clear. */
function clear(spans: RowSpans, row: number, x: number): boolean {
	return (spans.get(row) ?? []).every(([l, r]) => x <= l - 0.5 || x >= r + 0.5);
}

/** Every way a trunk can run from `parent` down to each of its topics, the first the most direct. */
function waysOf(parent: GridCard, children: readonly GridCard[], spans: RowSpans, channels: readonly number[]): Way[] {
	const last = Math.max(...children.map((c) => c.row));
	const ways: Way[] = [];
	const walk = (gap: number, x: number, brackets: Bracket[], passes: Way["passes"], through: Way["through"]) => {
		if (ways.length >= 64) return;
		if (gap >= last) {
			ways.push({ parent: parent.id, brackets, passes, through });
			return;
		}
		const kids = children.filter((c) => c.row === gap + 1).map((c) => c.x);
		const runsOn = last > gap + 1;
		const finish = (on: number | null) => {
			const downs = [...kids, ...(on === null ? [] : [on])];
			const xs = [x, ...downs];
			const low = Math.min(...xs);
			const high = Math.max(...xs);
			const nextThrough = on === null ? through : [...through, { row: gap + 1, x: on }];
			if (high - low < 0.5) walk(gap + 1, on ?? x, brackets, [...passes, { gap, x }], nextThrough);
			else walk(gap + 1, on ?? x, [...brackets, { parent: parent.id, gap, up: x, downs, on, low, high }], passes, nextThrough);
		};
		if (!runsOn) return finish(null);
		if (clear(spans, gap + 1, x) && !kids.some((k) => same(k, x))) return finish(x);
		// The trunk steps aside here: to the channels clear of this row, those clear of every row to its last first,
		// then the nearest, then the side its later topics are on.
		const blocked = (at: number) => {
			let n = 0;
			for (let row = gap + 1; row < last; row++) if (!clear(spans, row, at)) n++;
			return n;
		};
		const later = children.filter((c) => c.row > gap + 1).map((c) => c.x);
		const towards = later.reduce((t, v) => t + v, 0) / later.length;
		const options = channels
			.filter((c) => clear(spans, gap + 1, c) && !kids.some((k) => same(k, c)))
			.sort((a, b) => blocked(a) - blocked(b) || Math.abs(a - x) - Math.abs(b - x) || Math.abs(a - towards) - Math.abs(b - towards) || a - b)
			.slice(0, STEP_OPTIONS);
		for (const on of options) finish(on);
	};
	walk(parent.row, parent.x, [], [], []);
	return ways;
}

/** The cost of stacking bracket `a` above `b` in one gap: the lines one crosses of the other's, and half a crossing
 *  for a stretch they would run down together, where the eye can't tell which way each goes. */
function stackCost(a: Bracket, b: Bracket): number {
	let cost = 0;
	if (inside(b.up, a.low, a.high)) cost += 1;
	for (const d of a.downs) if (inside(d, b.low, b.high)) cost += 1;
	for (const d of a.downs) if (same(d, b.up)) cost += 0.5;
	// Two trunks running on down the same x.
	if (a.on !== null && b.on !== null && same(a.on, b.on)) cost += 1;
	return cost;
}

/** One gap's brackets in lanes: the order that crosses the fewest lines (every order up to `EXACT_LANES`), each lane
 *  shared by brackets that sit apart. Returns each bracket's lane, the lane count and the crossings. */
function laneGap(brackets: readonly Bracket[], passes: readonly number[], room: number): { lane: Map<Bracket, number>; count: number; cost: number } {
	const total = (order: readonly Bracket[]) => order.reduce((n, a, i) => n + order.slice(i + 1).reduce((m, b) => m + stackCost(a, b), 0), 0);
	let order = [...brackets].sort((a, b) => a.low - b.low || a.high - b.high);
	if (order.length <= EXACT_LANES) {
		const orders = (left: readonly Bracket[]): Bracket[][] => (left.length <= 1 ? [[...left]] : left.flatMap((s, i) => orders(left.filter((_, k) => k !== i)).map((rest) => [s, ...rest])));
		let best = total(order);
		for (const candidate of orders(order)) {
			const cost = total(candidate);
			if (cost < best) {
				best = cost;
				order = candidate;
			}
		}
	} else {
		const sorted = order;
		order = [];
		for (const s of sorted) {
			let at = order.length;
			while (at > 0 && stackCost(s, order[at - 1]!) < stackCost(order[at - 1]!, s)) at--;
			order.splice(at, 0, s);
		}
	}
	const lane = new Map<Bracket, number>();
	const placed: { b: Bracket; lane: number }[] = [];
	for (const b of order) {
		const beside = placed.filter((p) => p.b.low < b.high + room && b.low < p.b.high + room);
		const n = Math.max(-1, ...beside.map((p) => p.lane)) + 1;
		placed.push({ b, lane: n });
		lane.set(b, n);
	}
	// A line passing straight through the gap crosses every lane whose stretch it passes inside.
	const passed = passes.reduce((n, x) => n + brackets.filter((b) => inside(x, b.low, b.high)).length, 0);
	return { lane, count: Math.max(-1, ...lane.values()) + 1, cost: total(order) + passed };
}

/** A whole plan's lanes and cost: crossings in every gap, and two trunks sharing a stretch through a row. */
function lay(ways: readonly Way[], room: number) {
	const gaps = new Map<number, { brackets: Bracket[]; passes: number[] }>();
	const at = (g: number) => gaps.get(g) ?? (gaps.set(g, { brackets: [], passes: [] }), gaps.get(g)!);
	for (const w of ways) {
		for (const b of w.brackets) at(b.gap).brackets.push(b);
		for (const p of w.passes) at(p.gap).passes.push(p.x);
	}
	const lane = new Map<Bracket, number>();
	const lanes = new Map<number, number>();
	let cost = 0;
	for (const [g, { brackets, passes }] of gaps) {
		const laid = laneGap(brackets, passes, room);
		for (const [b, n] of laid.lane) lane.set(b, n);
		lanes.set(g, laid.count);
		cost += laid.cost;
	}
	const rows = new Map<string, string>();
	for (const w of ways)
		for (const t of w.through) {
			const k = `${t.row}:${Math.round(t.x)}`;
			const other = rows.get(k);
			if (other && other !== w.parent) cost += 1;
			rows.set(k, w.parent);
		}
	return { lane, lanes, cost };
}

/**
 * Bands' trunks (see the file's head): each prerequisite's lines as one
 * trunk, given the cards on the grid, the needs drawn, the stretches each
 * row's cards cover and the x of every channel a trunk may run down (each
 * column's centre and the gutters between). `room` keeps brackets that run
 * beside each other a lane apart.
 */
export function routeTrunks(cards: readonly GridCard[], needs: readonly { source: string; target: string }[], spans: RowSpans, channels: readonly number[], room: number): Trunks {
	const card = new Map(cards.map((c) => [c.id, c]));
	const parents = [...new Set(needs.map((n) => n.source))];
	const options = parents.map((p) => waysOf(card.get(p)!, needs.filter((n) => n.source === p).map((n) => card.get(n.target)!), spans, channels));
	let pick = options.map(() => 0);
	const plan = (choice: readonly number[]) => options.map((o, i) => o[choice[i]!]!);
	let best = lay(plan(pick), room);
	const plans = options.reduce((n, o) => n * o.length, 1);
	if (plans <= EXACT_PLANS) {
		for (let k = 1; k < plans; k++) {
			let rest = k;
			const choice = options.map((o) => {
				const c = rest % o.length;
				rest = Math.floor(rest / o.length);
				return c;
			});
			const laid = lay(plan(choice), room);
			if (laid.cost < best.cost) {
				best = laid;
				pick = choice;
			}
		}
	} else {
		for (let improved = true; improved; ) {
			improved = false;
			for (let i = 0; i < options.length; i++)
				for (let c = 0; c < options[i]!.length; c++) {
					if (c === pick[i]) continue;
					const choice = pick.map((v, k) => (k === i ? c : v));
					const laid = lay(plan(choice), room);
					if (laid.cost < best.cost) {
						best = laid;
						pick = choice;
						improved = true;
					}
				}
		}
	}
	const chosen = plan(pick);
	const { lane, lanes, cost } = best;
	return {
		lanes,
		cost,
		lines: (laneY, rowTop, rowBottom) => {
			const out = new Map<string, [number, number][]>();
			for (const w of chosen) {
				const from = card.get(w.parent)!;
				for (const n of needs.filter((n) => n.source === w.parent)) {
					const to = card.get(n.target)!;
					const points: [number, number][] = [[from.x, rowBottom(from.row)]];
					for (const b of w.brackets) {
						if (b.gap >= to.row) break;
						const y = laneY(b.gap, lane.get(b)!);
						points.push([b.up, y], [b.gap + 1 === to.row ? to.x : b.on!, y]);
					}
					points.push([to.x, rowTop(to.row)]);
					out.set(`${n.source}>${n.target}`, corners(points));
				}
			}
			return out;
		},
	};
}

/** A polyline without repeated points or points on a straight run. */
function corners(points: readonly [number, number][]): [number, number][] {
	const kept: [number, number][] = [];
	for (const p of points) {
		const last = kept.at(-1);
		if (last && same(last[0], p[0]) && same(last[1], p[1])) continue;
		const before = kept.at(-2);
		if (last && before && (same(before[0], last[0]) === same(last[0], p[0])) && (same(before[1], last[1]) === same(last[1], p[1]))) kept.pop();
		kept.push(p);
	}
	return kept;
}
