/**
 * ANTI-WARP EARS on Auto's walls (prop/ears.js), for a filament that shrinks: the
 * profile's EARS.r (ABS 5 mm) puts a one-layer disc at each end of every wall that
 * stands on the plate there, where a shrinking strip starts to peel.
 *
 * Runs LAST, after the tall-wall ribs, so every support is on the plate: each ear is
 * kept sideClear off the part and off every other support (its own wall aside) and
 * shrinks to half its radius when blocked, so no ear fuses two pieces. Ears join
 * their wall's triangle ranges, so removing a wall removes its ears. Draw ears its
 * own walls on the page (draw.js `ears`).
 */
import { EARS, earWall, PROP } from '../prop.js';
import { seatedPartTris } from './seating.js';
import { floorAt, planGrid } from './tall.js';

/**
 * Add the ears to `built` (buildFins' result, seated frame, bed at z 0) in place:
 * triangles appended, each eared fin's triRanges grown, `built.ears` the count (unset
 * with ears off).
 * `layerH`: the ear's height (the Layer height field).
 */
export function earWalls(topo, result, rot, built, layerH = PROP.tineH) {
  if (!(EARS.r > 0)) return built;   // off (every filament but ABS): the build is untouched
  built.ears = 0;
  const fins = built.fins ?? [];
  const walls = fins.filter((f) => f.kind === 'prop' && Array.isArray(f.line) && f.line.length >= 2);
  if (!walls.length) return built;
  const tris = seatedPartTris(topo, rot, result.offset);
  // Only what an ear could meet goes in: what stands on the plate
  const zTop = Math.max(0.05, layerH) + PROP.sideClear;
  const low = (p, q, r) => Math.min(p[2], q[2], r[2]) <= zTop;
  const grid = planGrid();
  fins.forEach((f, k) => { for (const [a, b] of f.triRanges ?? []) grid.add(built.triangles.slice(a, b), k, low); });
  if (built.padTriangles?.length) grid.add(built.padTriangles, null, low);
  const triangles = [...built.triangles];
  for (const f of walls) {
    const k = fins.indexOf(f);
    const out = [];
    const n = earWall(f.line, (i) => floorAt(tris, f.line[i], 0), tris, 0, out, (t) => {
      if (grid.hits(t, k)) return false;
      grid.add(t, k);              // the next wall's ears keep clear of these
      return true;
    }, layerH);
    if (!n) continue;
    const at = triangles.length;
    for (const v of out) triangles.push(v);
    f.triRanges = [...(f.triRanges ?? []), [at, triangles.length]];
    f.ears = n;
    built.ears += n;
  }
  built.triangles = triangles;
  return built;
}
