// CONTOUR MODE (web/prop/contour.js, docs/FIN-SPEC.md "Contour mode"): walls that follow
// the overhang's shape. Pinned on a mushroom -- a round cap on a square post: the cap's
// rim gets an inset ring of curved walls; the build is closed and outward, its contour
// walls bend with the rim and never stand close enough to another to fuse; and a part
// whose overhang has no curve still gets walls.
import { analyze, assert, buildTopology, fins, isClosed, isOriented, prop } from './_util.js';
import { seatedPartTris } from '../web/fins/seating.js';
const { CONTOUR, PROP, contourTracks, footFor } = prop;

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
function box(x0, x1, y0, y1, z0, z1, out) {
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  for (const [a, b, c] of [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]]) out.push(...v[a], ...v[b], ...v[c]);
}
/** A closed `n`-gon prism round (cx, cy), radius r, z0..z1. */
function disc(cx, cy, r, z0, z1, n, out) {
  const p = (k, z) => [cx + r * Math.cos((2 * Math.PI * k) / n), cy + r * Math.sin((2 * Math.PI * k) / n), z];
  for (let k = 0; k < n; k++) {
    const a0 = p(k, z0), a1 = p(k + 1, z0), b0 = p(k, z1), b1 = p(k + 1, z1);
    out.push(cx, cy, z0, ...a1, ...a0);    // bottom, facing down
    out.push(cx, cy, z1, ...b0, ...b1);    // top
    out.push(...a0, ...a1, ...b1, ...a0, ...b1, ...b0);
  }
}
const topoOf = (t) => {
  const pos = new Float32Array(t);
  return buildTopology({ getAttribute: (k) => (k === 'position' ? { array: pos } : null) });
};
/** A cap of radius R, its underside `h` up, on a 10 mm square post. */
function mushroom(R = 25, h = 20) {
  const t = [];
  box(-5, 5, -5, 5, 0, h + 1, t);
  disc(0, 0, R, h, h + 2, 96, t);
  const topo = topoOf(t);
  return { topo, res: analyze(topo, 45, IDENTITY) };
}
const build = (s, mode) => fins.buildFins(s.topo, s.res, IDENTITY,
  { mode, bedPad: true, tines: true, layerHeight: 0.2 });
/** The angle a plan polyline sweeps round the origin, degrees. */
function sweptAngle(line) {
  let a = 0;
  for (let k = 1; k < line.length; k++) {
    let d = Math.atan2(line[k][1], line[k][0]) - Math.atan2(line[k - 1][1], line[k - 1][0]);
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    a += d;
  }
  return Math.abs((a * 180) / Math.PI);
}

Deno.test('contour: a round cap gets an inset ring round its rim, in pieces', () => {
  const R = 25, s = mushroom(R);
  const tracks = contourTracks(seatedPartTris(s.topo, IDENTITY, s.res.offset), s.res.regions, () => true);
  const lines = [...tracks.values()].flat();
  assert(lines.length > 0, 'no contour tracks');
  // the polygon's apothem is a hair under R; the ring sits CONTOUR.inset inside it
  const ringR = R * Math.cos(Math.PI / 96) - CONTOUR.inset;
  const ring = lines.filter((l) => l.every((p) => Math.abs(Math.hypot(p[0], p[1]) - ringR) < 0.6));
  assert(ring.length >= 2, `${ring.length} ring pieces`);
  const swept = ring.reduce((a, l) => a + sweptAngle(l), 0);
  assert(swept > 270, `the ring covers ${swept.toFixed(0)} deg of the rim`);
  for (const l of ring) {
    let len = 0;
    for (let k = 1; k < l.length; k++) len += Math.hypot(l[k][0] - l[k - 1][0], l[k][1] - l[k - 1][1]);
    assert(len <= CONTOUR.maxLen + PROP.stationStep, `a ring piece ${len.toFixed(1)} mm long`);
  }
  // every station on the cap's underside, the region's surface
  for (const l of lines) for (const p of l) assert(Math.abs(p[2] - 20) < 1e-6, `a station at z ${p[2]}`);
});

Deno.test('contour: the build is closed and outward, its walls bend with the rim and never fuse', () => {
  const s = mushroom();
  const b = build(s, 'contour');
  assert(isClosed(b.triangles), 'contour build not closed');
  assert(isOriented(b.triangles), 'contour build not outward');
  const walls = b.props.filter((q) => q.contour);
  assert(walls.length >= 3, `${walls.length} contour walls`);
  assert(walls.some((q) => sweptAngle(q.line) > 60), 'no contour wall follows the rim round');
  const gap = PROP.sideClear - 0.05;
  for (let a = 0; a < walls.length; a++) for (let c = a + 1; c < walls.length; c++) {
    for (const p of walls[a].line) for (const q of walls[c].line) {
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      assert(d >= footFor(p[2]) + footFor(q[2]) + gap, `walls ${a} and ${c} ${d.toFixed(2)} mm apart`);
    }
  }
});

Deno.test('contour: a square shelf, no curve anywhere, still gets walls', () => {
  const t = [];
  box(0, 10, 0, 20, 0, 32, t);
  box(10, 70, 0, 20, 30, 32, t);
  const topo = topoOf(t);
  const s = { topo, res: analyze(topo, 45, IDENTITY) };
  const b = build(s, 'contour');
  assert(b.props.length > 0, 'no walls');
  assert(isClosed(b.triangles) && isOriented(b.triangles), 'shelf build not closed and outward');
});
