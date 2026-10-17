/**
 * EARS -- one-layer discs at the ends of a wall on the plate, for a filament that
 * shrinks as it cools (materials.js `ears`: ABS and ASA).
 *
 * ABS shrinks ~0.7-0.8% and ASA ~0.5% between the nozzle and the room, two to three
 * times PLA. A wall is a long thin strip on the plate, and a strip that shrinks
 * pulls its ends inward and up: the peel starts at an end and runs along the foot
 * until the wall leans off the overhang it was holding. The foot (PROP.footMin..
 * footMax either side) can't get much wider -- a row's feet would fuse -- but its
 * ENDS can, which is a slicer's "mouse ears": a disc on the first layer where a
 * strip would start to lift. One layer, like the Light pad, because only the first
 * layer grips the plate; more would only weld harder to the wall above it.
 *
 * An ear is centred on the wall's end station, so it reaches EARS.r past the end
 * and either side. It is built only where the end stands on the plate, only where
 * the part stays clear of it (sideClear beside it, the support gap over it), and
 * only if `clear(tris)` (the caller's check against supports already built) passes;
 * a blocked ear retries at half the radius, then is dropped. Not printed yet.
 */
import { boxExtrude } from '../solids.js';
import { PROP } from './config.js';
import { surfaceZsAt } from './surface.js';

export const EARS = {
  r: 0,           // mm: the ear's radius; 0 = no ears. The filament profile sets it (ABS 5).
  rMin: 2.5,      // mm: a blocked ear retries at half its radius down to this, then is dropped
  segs: 24,       // sides of the disc
  onPlate: 0.5,   // mm: an end whose floor is this close to the bed stands on the plate (BRACE.onPlate)
  step: 0.25,     // mm: part clearance sampled this finely under an ear
};

/** Does part surface come within sideClear of the disc (cx, cy, r), or within the
 *  support gap over its top `zTop`? */
function earHitsPart(tris, cx, cy, r, zBed, zTop) {
  const R = r + PROP.sideClear, n = Math.ceil(2 * R / EARS.step);
  const over = zTop + Math.max(PROP.gap, PROP.sideClear);
  for (let i = 0; i <= n; i++) {
    const x = cx - R + 2 * R * i / n;
    for (let k = 0; k <= n; k++) {
      const y = cy - R + 2 * R * k / n;
      if ((x - cx) ** 2 + (y - cy) ** 2 > R * R) continue;
      for (const z of surfaceZsAt(tris, x, y)) if (z >= zBed - 0.01 && z <= over) return true;
    }
  }
  return false;
}

/** One ear: a closed, outward-wound disc of radius r on the plate, `h` tall. */
function disc(cx, cy, r, zBed, h) {
  const poly = [];
  for (let s = 0; s < EARS.segs; s++) {
    const a = (2 * Math.PI * s) / EARS.segs;
    poly.push([r * Math.cos(a), r * Math.sin(a)]);   // counter-clockwise: outward faces
  }
  const out = [];
  boxExtrude(poly, zBed, zBed + h, (a, b, c) => [cx + a, cy + b, c], out);
  return out;
}

/**
 * Ears for the wall whose contact line is `top` (stations [x, y, z]) and whose bottom
 * at station i is `floorZ(i)`: one at each end that stands on the plate. Appends the
 * discs' triangles to `out` and returns how many were built (0 with EARS.r 0).
 * `h`: the ear's height, one layer (the Layer height field).
 */
export function earWall(top, floorZ, tris, zBed, out, clear = () => true, h = PROP.tineH) {
  const n = top.length;
  if (!(EARS.r > 0) || n < 2) return 0;
  const lift = Math.max(0.05, h);
  let built = 0;
  for (const i of [0, n - 1]) {
    if (floorZ(i) > zBed + EARS.onPlate) continue;
    const [cx, cy] = top[i];
    for (let r = EARS.r; r >= EARS.rMin - 1e-9; r /= 2) {
      if (earHitsPart(tris, cx, cy, r, zBed, zBed + lift)) continue;
      const d = disc(cx, cy, r, zBed, lift);
      if (clear(d)) { out.push(...d); built++; break; }
    }
  }
  return built;
}
