// FILAMENT PROFILES (web/materials.js, docs/FIN-SPEC.md "Filament profiles"): TPU and ABS
// fail in ways a clearance can't fix, so their profiles change the geometry. Pinned:
// PLA and PETG build exactly as with no filament at all; TPU's walls are ribbed from
// cbrt(stiffness) x the wall's thickness of BRACE.tallH up; ABS's plate walls get
// one-layer ears at their ends that never touch the part or another support, a wider
// pad, and drawn walls get them too; and a filament never leaks into the next build.
import { assert, analyze, bbox, buildTopology, fins, isClosed, isOriented, prop } from './_util.js';
const { BRACE, EARS, PROP, ribScale, tallH } = prop;
const { MATERIAL } = await import('../web/materials.js');
const { applyWallLines } = await import('../web/nozzle.js');
const { drawnWall } = await import('../web/draw.js');

function box(x0, x1, y0, y1, z0, z1, out) {
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  for (const [a, b, c] of [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]]) out.push(...v[a], ...v[b], ...v[c]);
}
/** A post with a 60 x 20 mm shelf out from its top, the shelf's underside `h` up. */
function shelf(h) {
  const t = [];
  box(0, 10, 0, 20, 0, h + 2, t); box(10, 70, 0, 20, h, h + 2, t);
  const pos = new Float32Array(t);
  const topo = buildTopology({ getAttribute: (k) => (k === 'position' ? { array: pos } : null) });
  const rot = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  return { topo, rot, res: analyze(topo, 45, rot), t };
}
const LAYER = 0.2;
/** The site's Auto build in `material` (its gap and pad numbers too, as the page sends them). */
function build(s, material, o = {}) {
  const m = MATERIAL[material];
  const tunables = material === undefined ? undefined
    : { padH: m.padH, padGrab: m.padGrab, propGap: m.propGap, material };
  return fins.buildFins(s.topo, s.res, s.rot,
    { mode: 'auto', bedPad: true, tines: true, layerHeight: LAYER, ...o, tunables: { ...tunables, ...o.tunables } });
}
const same = (a, b) => a.length === b.length && a.every((v, i) => v[0] === b[i][0] && v[1] === b[i][1] && v[2] === b[i][2]);
/** Put the engine back on PLA's numbers whatever a test did. */
function plain() {
  const m = MATERIAL.pla;
  fins.applyTunables({ padH: m.padH, padGrab: m.padGrab, propGap: m.propGap, material: 'pla', wallLines: 2 });
}

Deno.test('filament: PLA and PETG build exactly as with no filament', () => {
  try {
    for (const h of [30, 110]) {
      const s = shelf(h);
      plain();
      const none = build(s, undefined);
      const pla = build(s, 'pla');
      assert(same(none.triangles, pla.triangles), `PLA moved a triangle (shelf ${h})`);
      assert(same(none.padTriangles, pla.padTriangles), `PLA moved the pad (shelf ${h})`);
      assert(pla.ears === undefined, 'PLA has no ears pass');
      plain();
      const petgGap = build(s, undefined, { tunables: { padH: 0.3, padGrab: -0.1, propGap: 0.3 } });
      const petg = build(s, 'petg');
      assert(same(petgGap.triangles, petg.triangles), `PETG is more than its gap and pad (shelf ${h})`);
    }
  } finally { plain(); }
});

Deno.test('filament: TPU ribs its walls from cbrt(stiffness) x the wall thickness of tallH up', () => {
  try {
    plain();
    assert(ribScale() === 1, 'PLA ribs at tallH');
    applyWallLines(8);
    assert(ribScale() === 1, 'a thicker PLA wall keeps the printed rule');
    fins.applyTunables({ material: 'tpu', wallLines: 2 });
    const k = Math.cbrt(MATERIAL.tpu.stiffness);
    assert(Math.abs(tallH() - BRACE.tallH * k) < 1e-9, `TPU at 2 lines: ${tallH()}`);
    assert(tallH() > 20 && tallH() < 23, `TPU's 2-line walls rib from ~22 mm: ${tallH()}`);
    applyWallLines(4);
    assert(Math.abs(tallH() - 2 * BRACE.tallH * k) < 1e-9, `TPU at 4 lines: ${tallH()}`);

    // a 30 mm wall: ribbed in TPU at two lines, never in PLA, nor in TPU at four
    const s = shelf(30);
    plain();
    const pla = build(s, 'pla');
    assert(pla.tallRibs === 0, `PLA: no ribs on 30 mm walls (${pla.tallRibs})`);
    const tpu2 = build(s, 'tpu');
    assert(tpu2.tallRibs >= 2, `TPU, 2 lines: ribs on 30 mm walls (${tpu2.tallRibs})`);
    const ribbed = tpu2.fins.filter((f) => f.ribs);
    assert(ribbed.length && ribbed.every((f) => f.height > tallH()), 'only walls over the TPU threshold');
    for (const f of ribbed) {
      const r = bbox(tpu2.triangles.slice(...f.triRanges.at(-1)));
      assert(Math.abs(r.lo[2]) < 1e-6, 'a rib stands on the plate');
      assert(r.hi[2] < f.height - PROP.tipH - 0.9, 'a rib stops under the tip taper: the contact is untouched');
    }
    // everything before the ribs is PLA's build at TPU's gap
    plain();
    const gapOnly = build(s, undefined, { tunables: { padH: 0.3, padGrab: -0.1, propGap: 0.3 } });
    assert(same(gapOnly.triangles, tpu2.triangles.slice(0, gapOnly.triangles.length)), 'TPU moved more than it added');
    const tpu4 = build(s, 'tpu', { tunables: { wallLines: 4 } });
    assert(tpu4.tallRibs === 0, `TPU, 4 lines: a 30 mm wall is stiff enough (${tpu4.tallRibs})`);
    plain();
    const tall4 = build(shelf(60), 'tpu', { tunables: { wallLines: 4 } });
    assert(tall4.tallRibs >= 2, `TPU, 4 lines: ribs on 60 mm walls (${tall4.tallRibs})`);
  } finally { plain(); }
});

Deno.test('filament: ABS ears are one-layer closed discs at plate wall ends, clear of the part and every other support', () => {
  try {
    plain();
    const s = shelf(30);
    const pla = build(s, 'pla');
    const abs = build(s, 'abs');
    assert(abs.ears >= 2, `ears on the plate walls: ${abs.ears}`);
    // the walls themselves are PLA's
    assert(same(pla.triangles, abs.triangles.slice(0, pla.triangles.length)), 'ABS moved a wall');
    const eared = abs.fins.filter((f) => f.ears);
    assert(eared.reduce((a, f) => a + f.ears, 0) === abs.ears, 'every ear belongs to its wall');
    const sc = PROP.sideClear;
    for (const f of eared) {
      const ears = abs.triangles.slice(...f.triRanges.at(-1));
      assert(isClosed(ears) && isOriented(ears), 'an ear is a closed, outward-wound solid');
      const r = bbox(ears);
      assert(Math.abs(r.lo[2]) < 1e-9 && Math.abs(r.hi[2] - LAYER) < 1e-9, `an ear is one layer on the plate: ${r.lo[2]}..${r.hi[2]}`);
      const w = r.hi[0] - r.lo[0];
      assert(w <= 2 * EARS.r + 1e-6 && w >= 2 * EARS.rMin - 1e-6, `an ear's radius: ${w / 2}`);
      // the post stands on the plate at x 0..10, y 0..20: no ear comes within sideClear
      for (const v of ears) {
        const dx = Math.max(0 - v[0], v[0] - 10, 0), dy = Math.max(0 - v[1], v[1] - 20, 0);
        assert(Math.hypot(dx, dy) >= sc - 1e-6, `an ear runs into the part at ${v.map((c) => c.toFixed(2))}`);
      }
      // ...nor into any other support's footprint on the plate
      for (const g of abs.fins) {
        if (g === f) continue;
        for (const [a, b] of g.triRanges) {
          const low = abs.triangles.slice(a, b).filter((v) => v[2] <= LAYER + 1e-6);
          if (!low.length) continue;
          const o = bbox(low);
          const apart = r.hi[0] + sc <= o.lo[0] || o.hi[0] + sc <= r.lo[0] || r.hi[1] + sc <= o.lo[1] || o.hi[1] + sc <= r.lo[1];
          assert(apart, 'an ear meets another support');
        }
      }
      // ...nor the pad
      if (abs.padTriangles.length) {
        const o = bbox(abs.padTriangles);
        assert(r.hi[0] + sc <= o.lo[0] || o.hi[0] + sc <= r.lo[0] || r.hi[1] + sc <= o.lo[1] || o.hi[1] + sc <= r.lo[1], 'an ear meets the pad');
      }
    }
    // the pad spreads to ABS's margin (the shelf part stands on its post: a 200 mm2 foot, no pad)
    assert(fins.FIN.padMargin === MATERIAL.abs.padMargin, `ABS's pad spread: ${fins.FIN.padMargin}`);
  } finally { plain(); }
  assert(fins.FIN.padMargin === 4 && EARS.r === 0 && BRACE.stiffness === 1, 'PLA restores the pad spread, the ears and the ribs');
});

Deno.test('filament: a filament never leaks into the next build', () => {
  try {
    plain();
    const s = shelf(30);
    const before = build(s, 'pla');
    build(s, 'tpu');
    build(s, 'abs');
    const after = build(s, 'pla');
    assert(same(before.triangles, after.triangles) && same(before.padTriangles, after.padTriangles),
      'PLA after TPU and ABS is not PLA');
    // an unknown filament leaves the geometry alone, as junk tunables do
    fins.applyTunables({ material: 'tpu' });
    for (const junk of ['nylon', 'toString', '', null, 3]) fins.applyTunables({ material: junk });
    assert(BRACE.stiffness === MATERIAL.tpu.stiffness, 'junk changed the filament');
  } finally { plain(); }
});

Deno.test('filament: a drawn wall gets ABS ears at its plate ends, and none in PLA', () => {
  try {
    const s = shelf(30);
    const off = s.res.offset;
    const part = Float64Array.from(s.t.map((v, i) => v + [off.x, off.y, off.z][i % 3]));
    const at = (x, y) => [x + off.x, y + off.y, 30 + off.z];
    plain();
    const pla = drawnWall(at(20, 10), at(60, 10), part, 0, { layerHeight: LAYER });
    assert(pla.ok && pla.ears === undefined, 'PLA: no ears');
    fins.applyTunables({ material: 'abs' });
    const abs = drawnWall(at(20, 10), at(60, 10), part, 0, { layerHeight: LAYER });
    assert(abs.ok && abs.ears === 2, `ABS: an ear at each end (${abs.ears})`);
    assert(same(pla.tris, abs.tris.slice(0, pla.tris.length)), 'the wall itself is unchanged');
    const ears = abs.tris.slice(pla.tris.length);
    assert(isClosed(ears) && isOriented(ears), 'the ears are closed, outward-wound solids');
    // a line drawn right beside the post: that end's ear shrinks or goes, never into the part
    const near = drawnWall(at(12, 10), at(60, 10), part, 0, { layerHeight: LAYER });
    assert(near.ok, 'the wall beside the post builds');
    for (const v of near.tris) {
      if (v[2] <= LAYER + 1e-9) assert(v[0] - (off.x + 10) >= PROP.sideClear - 1e-6, 'an ear runs into the post');
    }
  } finally { plain(); }
});
