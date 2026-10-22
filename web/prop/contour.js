/**
 * CONTOUR walls: walls that follow the overhang's own shape -- under the rim of a
 * shell, along each vane hanging from a ceiling, round a boss, and arcs across the
 * ceiling between them -- the way a hand draws supports, where straight rows cross a
 * curved part at whatever angle its axis gives and leave curved rims bare.
 *
 * The whole part's overhang is rastered in plan (CONTOUR.cell): each cell's lowest
 * overhang surface and its region, and the lowest part surface of any kind. Cells
 * join into LEVELS where neighbours' surfaces stay within CONTOUR.step of each other,
 * so a stepped ceiling is several levels and no wall top jumps a riser.
 *
 *   NARROW levels (no cell farther than CONTOUR.narrow from the level's edge): the
 *   underside of a rib, a vane, a shell's rim. The wall runs down its middle -- the
 *   level's skeleton (Zhang-Suen thinning), traced branch by branch, curving with it.
 *
 *   WIDE levels: the walls run a set distance from the edge, curving with it, as a
 *   slicer's concentric pattern does. First a curve CONTOUR.inset in from every FREE
 *   edge (the ceiling ends in air, or steps up to a higher level), the inset outline,
 *   kept off any HELD edge -- where part goes on down below the ceiling (a wall, a
 *   vane, a lower level), which anchors the ceiling's bridge already. Then BRIDGES:
 *   curves half a span (`pitch`) from whatever holds the ceiling -- a held edge or a
 *   wall kept already -- and a span apart after that: arcs between the spokes, rings
 *   round a boss. Exact Euclidean distance transforms and their iso-curves (marching
 *   squares).
 *
 * Each curve is made printable as separate breakaway pieces: smoothed (the raster's
 * stair-steps), cut where it turns sharper than CONTOUR.corner (a sweep round a sharp
 * corner folds its foot into itself), a closed loop opened, a long one cut every
 * CONTOUR.maxLen, CONTOUR.gap between pieces -- and a station that would stand closer
 * to an earlier line than both their feet and sideClear is dropped, so no two fuse.
 * The families are placed in that order, longest piece first, so a rim's long curve
 * keeps its run and a spoke that meets it stops short. The pieces go through
 * buildProps's per-line pipeline (prop.js), which clears, settles, sweeps and tines
 * them like any track. Not printed yet.
 */
import { PROP } from './config.js';
import { footFor } from './sweep.js';

export const CONTOUR = {
  cell: 0.5,      // mm: the plan raster
  step: 1.0,      // mm: neighbouring cells whose surface differs by more are different levels
  narrow: 3.5,    // mm: a level no wider than twice this (a rib's, a vane's or a rim's
                  // underside) gets one wall down its middle
  inset: 2.25,    // mm: a wide level's first curve off a FREE edge -- the foot (footMin 1.6)
                  // and sideClear (0.35) off whatever stands there, and a hair
  spur: 3.0,      // mm: a skeleton branch shorter than this off a junction is a corner's spur
  smooth: 3,      // smoothing passes over a resampled curve
  corner: 50,     // deg: a curve turning more than this over cornerRun mm is cut there
  cornerRun: 2.0,
  maxLen: 60,     // mm: a curve longer than this is cut into even pieces
  gap: 3.0,       // mm: left between the pieces a curve is cut into
};

// --- the plan raster ------------------------------------------------------------

/** Rasterise triangles (flat [x, y, z] x 3 per face) into the grid, keeping per cell
 *  the lowest z (and `tag(face)` with it when `tags` is given). */
function rasterise(tris, faces, grid, zOut, tags = null, tag = null) {
  const { ox, oy, c, nx, ny } = grid;
  for (const f of faces) {
    const o = f * 9;
    const ax = tris[o], ay = tris[o + 1], az = tris[o + 2];
    const bx = tris[o + 3], by = tris[o + 4], bz = tris[o + 5];
    const cx = tris[o + 6], cy = tris[o + 7], cz = tris[o + 8];
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(det) < 1e-12) continue;
    const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - ox) / c));
    const i1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx, cx) - ox) / c));
    const j0 = Math.max(0, Math.ceil((Math.min(ay, by, cy) - oy) / c));
    const j1 = Math.min(ny - 1, Math.floor((Math.max(ay, by, cy) - oy) / c));
    for (let i = i0; i <= i1; i++) {
      const x = ox + i * c;
      for (let j = j0; j <= j1; j++) {
        const y = oy + j * c;
        const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / det;
        const l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / det;
        const l3 = 1 - l1 - l2;
        if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
        const z = l1 * az + l2 * bz + l3 * cz, k = i * ny + j;
        if (!(z >= zOut[k])) {
          zOut[k] = z;
          if (tags) tags[k] = tag(f);
        }
      }
    }
  }
}

/** Exact squared Euclidean distance transform (Felzenszwalb) of one row/column. */
function edt1(f, n, d, v, z) {
  let k = 0;
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s;
    for (;;) {
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      if (s <= z[k]) { k--; continue; }
      break;
    }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/** Distance in mm from each cell to the nearest `seed` cell (Infinity with none). */
function distanceField(seed, nx, ny, c) {
  const INF = 1e20, g = new Float64Array(nx * ny);
  for (let i = 0; i < g.length; i++) g[i] = seed[i] ? 0 : INF;
  const n = Math.max(nx, ny), f = new Float64Array(n), d = new Float64Array(n);
  const v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < nx; x++) {
    for (let y = 0; y < ny; y++) f[y] = g[x * ny + y];
    edt1(f, ny, d, v, z);
    for (let y = 0; y < ny; y++) g[x * ny + y] = d[y];
  }
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) f[x] = g[x * ny + y];
    edt1(f, nx, d, v, z);
    for (let x = 0; x < nx; x++) g[x * ny + y] = d[x] >= INF / 2 ? Infinity : Math.sqrt(d[x]) * c;
  }
  return g;
}

// --- curves ---------------------------------------------------------------------

/**
 * The level-`L` curves of field `g` over the cells `inside` marks, as polylines of
 * [i, j] grid coordinates, each { pts, closed }. Marching squares: a square with a
 * cell outside is skipped, so no curve leaves its level.
 */
function isoLines(g, inside, nx, ny, L) {
  const idx = (i, j) => i * ny + j;
  // where the field crosses L along a cell edge
  const cross = (i0, j0, i1, j1) => {
    const a = g[idx(i0, j0)], b = g[idx(i1, j1)];
    const t = (L - a) / (b - a);
    return [i0 + (i1 - i0) * t, j0 + (j1 - j0) * t];
  };
  const segs = new Map();      // edge key -> [other key, ...]
  const pt = new Map();        // edge key -> [i, j]
  const link = (ka, pa, kb, pb) => {
    pt.set(ka, pa); pt.set(kb, pb);
    (segs.get(ka) ?? segs.set(ka, []).get(ka)).push(kb);
    (segs.get(kb) ?? segs.set(kb, []).get(kb)).push(ka);
  };
  for (let i = 0; i + 1 < nx; i++) {
    for (let j = 0; j + 1 < ny; j++) {
      if (!inside[idx(i, j)] || !inside[idx(i + 1, j)] || !inside[idx(i, j + 1)] || !inside[idx(i + 1, j + 1)]) continue;
      const v0 = g[idx(i, j)], v1 = g[idx(i + 1, j)], v2 = g[idx(i + 1, j + 1)], v3 = g[idx(i, j + 1)];
      const code = (v0 > L ? 1 : 0) | (v1 > L ? 2 : 0) | (v2 > L ? 4 : 0) | (v3 > L ? 8 : 0);
      if (code === 0 || code === 15) continue;
      // the square's edges, each keyed once: along i from (i, j) is 2 idx(i, j), along j
      // is 2 idx(i, j) + 1 -- bottom (i,j)-(i+1,j), right (i+1,j)-(i+1,j+1), top
      // (i,j+1)-(i+1,j+1), left (i,j)-(i,j+1)
      const E = {
        b: () => [2 * idx(i, j), cross(i, j, i + 1, j)],
        r: () => [2 * idx(i + 1, j) + 1, cross(i + 1, j, i + 1, j + 1)],
        t: () => [2 * idx(i, j + 1), cross(i, j + 1, i + 1, j + 1)],
        l: () => [2 * idx(i, j) + 1, cross(i, j, i, j + 1)],
      };
      const pair = (p, q) => { const [ka, pa] = E[p](), [kb, pb] = E[q](); link(ka, pa, kb, pb); };
      const centre = (v0 + v1 + v2 + v3) / 4 > L;
      switch (code) {
        case 1: case 14: pair('l', 'b'); break;
        case 2: case 13: pair('b', 'r'); break;
        case 3: case 12: pair('l', 'r'); break;
        case 4: case 11: pair('r', 't'); break;
        case 6: case 9: pair('b', 't'); break;
        case 7: case 8: pair('l', 't'); break;
        case 5: if (centre) { pair('l', 't'); pair('b', 'r'); } else { pair('l', 'b'); pair('r', 't'); } break;
        case 10: if (centre) { pair('l', 'b'); pair('r', 't'); } else { pair('l', 't'); pair('b', 'r'); } break;
        default: break;
      }
    }
  }
  // chain: open curves from their ends (one neighbour), then the closed loops left;
  // keys in ascending order, so the result never depends on Map insertion order
  const used = new Set(), out = [];
  const keys = [...segs.keys()].sort((a, b) => a - b);
  const walk = (k0) => {
    const chain = [k0];
    used.add(k0);
    let k = k0;
    for (;;) {
      const next = (segs.get(k) ?? []).find((n) => !used.has(n));
      if (next === undefined) break;
      used.add(next); chain.push(next); k = next;
    }
    return chain;
  };
  for (const k of keys) if (!used.has(k) && segs.get(k).length === 1) out.push({ pts: walk(k).map((c) => pt.get(c)), closed: false });
  for (const k of keys) {
    if (used.has(k)) continue;
    const chain = walk(k);
    out.push({ pts: chain.map((c) => pt.get(c)), closed: chain.length > 2 && segs.get(chain.at(-1)).includes(k) });
  }
  return out;
}

/** Zhang-Suen thinning of the cells `mask` marks, in place: a one-cell-wide skeleton. */
function thin(mask, nx, ny) {
  const at = (i, j) => (i >= 0 && j >= 0 && i < nx && j < ny ? mask[i * ny + j] : 0);
  for (let changed = true; changed;) {
    changed = false;
    for (const pass of [0, 1]) {
      const kill = [];
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < ny; j++) {
          if (!mask[i * ny + j]) continue;
          // neighbours clockwise from north: p2..p9
          const p = [at(i, j + 1), at(i + 1, j + 1), at(i + 1, j), at(i + 1, j - 1),
                     at(i, j - 1), at(i - 1, j - 1), at(i - 1, j), at(i - 1, j + 1)];
          const b = p.reduce((s, v) => s + v, 0);
          if (b < 2 || b > 6) continue;
          let a = 0;
          for (let k = 0; k < 8; k++) if (!p[k] && p[(k + 1) % 8]) a++;
          if (a !== 1) continue;
          if (pass === 0 ? (p[0] && p[2] && p[4]) || (p[2] && p[4] && p[6]) : (p[0] && p[2] && p[6]) || (p[0] && p[4] && p[6])) continue;
          kill.push(i * ny + j);
        }
      }
      for (const k of kill) mask[k] = 0;
      if (kill.length) changed = true;
    }
  }
}

/** A skeleton's branches as polylines of [i, j] cells, junction to junction or end,
 *  { pts, closed }; a branch under `spur` cells ending in air is dropped. */
function branches(mask, nx, ny, spur) {
  const nb = (k) => {
    const i = Math.floor(k / ny), j = k % ny, out = [];
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue;
      const a = i + di, b = j + dj;
      if (a >= 0 && b >= 0 && a < nx && b < ny && mask[a * ny + b]) out.push(a * ny + b);
    }
    return out;
  };
  const cells = [];
  for (let k = 0; k < mask.length; k++) if (mask[k]) cells.push(k);
  const deg = new Map(cells.map((k) => [k, nb(k).length]));
  const node = (k) => deg.get(k) !== 2;
  const seen = new Set(), out = [];
  const edgeKey = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
  const follow = (from, to) => {
    const path = [from, to];
    seen.add(edgeKey(from, to));
    let prev = from, cur = to;
    while (!node(cur)) {
      const next = nb(cur).find((n) => n !== prev && !seen.has(edgeKey(cur, n)));
      if (next === undefined) break;
      seen.add(edgeKey(cur, next));
      path.push(next); prev = cur; cur = next;
      if (cur === path[0]) break;
    }
    return path;
  };
  for (const k of cells) {
    if (!node(k)) continue;
    for (const n of nb(k)) if (!seen.has(edgeKey(k, n))) {
      const path = follow(k, n);
      const end = path.at(-1);
      // a spur: off a junction into air, too short to be a branch of its own
      if (path.length < spur && ((deg.get(k) >= 3 && deg.get(end) <= 1) || (deg.get(k) <= 1 && deg.get(end) >= 3))) continue;
      out.push({ pts: path.map((c) => [Math.floor(c / ny), c % ny]), closed: false });
    }
  }
  // rings: every cell degree 2, no node to start from
  for (const k of cells) {
    if (node(k) || nb(k).every((n) => seen.has(edgeKey(k, n)))) continue;
    const path = follow(k, nb(k)[0]);
    out.push({ pts: path.map((c) => [Math.floor(c / ny), c % ny]), closed: path.at(-1) === k });
  }
  return out;
}

const len2 = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** `pts` resampled every `step` mm of arc (closed: round the loop, last != first). */
function resample(pts, step, closed) {
  const P = closed ? [...pts, pts[0]] : pts;
  let total = 0;
  for (let i = 1; i < P.length; i++) total += len2(P[i - 1], P[i]);
  if (total < step) return closed ? [] : [P[0], P.at(-1)];
  const n = closed ? Math.max(3, Math.round(total / step)) : Math.max(1, Math.round(total / step));
  const ds = total / n, out = [];
  let seg = 1, acc = 0;
  for (let s = 0; s <= (closed ? n - 1 : n); s++) {
    const want = s * ds;
    while (seg < P.length - 1 && acc + len2(P[seg - 1], P[seg]) < want) { acc += len2(P[seg - 1], P[seg]); seg++; }
    const l = len2(P[seg - 1], P[seg]), t = l > 1e-12 ? Math.min(1, (want - acc) / l) : 0;
    out.push([P[seg - 1][0] + (P[seg][0] - P[seg - 1][0]) * t, P[seg - 1][1] + (P[seg][1] - P[seg - 1][1]) * t]);
  }
  return out;
}

/** Laplacian passes (ends held on an open curve). */
function smooth(pts, closed, passes) {
  let p = pts;
  for (let k = 0; k < passes; k++) {
    const q = p.map((v) => [v[0], v[1]]);
    for (let i = 0; i < p.length; i++) {
      if (!closed && (i === 0 || i === p.length - 1)) continue;
      const a = p[(i - 1 + p.length) % p.length], b = p[(i + 1) % p.length];
      q[i] = [(a[0] + 2 * p[i][0] + b[0]) / 4, (a[1] + 2 * p[i][1] + b[1]) / 4];
    }
    p = q;
  }
  return p;
}

/** Turn (deg) at station i over `k` stations either side, or 0 at an open end. */
function turnAt(p, i, closed, k) {
  const n = p.length;
  if (!closed && (i - k < 0 || i + k >= n)) return 0;
  const a = p[(i - k + n) % n], b = p[i], c = p[(i + k) % n];
  const h1 = Math.atan2(b[1] - a[1], b[0] - a[0]), h2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
  return Math.abs(Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1))) * 180 / Math.PI;
}

/**
 * Cut a resampled curve (stations `step` apart) into pieces: at sharp corners, once
 * round a closed loop, and every maxLen, dropping CONTOUR.gap of stations at each cut.
 */
function pieces(p, closed, step) {
  const n = p.length, half = Math.max(1, Math.round(CONTOUR.gap / 2 / step));
  const k = Math.max(1, Math.round(CONTOUR.cornerRun / step));
  const cut = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (turnAt(p, i, closed, k) > CONTOUR.corner) cut[i] = 1;
  // a closed loop with no corner opens at its station farthest along +x (then +y):
  // a point of the geometry, not of the raster's walk order
  if (closed && !cut.some((v) => v)) {
    let best = 0;
    for (let i = 1; i < n; i++) if (p[i][0] > p[best][0] + 1e-9 || (Math.abs(p[i][0] - p[best][0]) <= 1e-9 && p[i][1] > p[best][1])) best = i;
    cut[best] = 1;
  }
  const drop = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!cut[i]) continue;
    for (let d = -half; d <= half; d++) {
      const j = closed ? (i + d + n) % n : i + d;
      if (j >= 0 && j < n) drop[j] = 1;
    }
  }
  const runs = [];
  let cur = [];
  const start = closed ? Math.max(0, drop.indexOf(1)) : -1;
  for (let s = 1; s <= n; s++) {
    const i = closed ? (start + s) % n : s - 1;
    if (drop[i]) { if (cur.length) runs.push(cur); cur = []; } else cur.push(p[i]);
  }
  if (cur.length) runs.push(cur);
  // ...and a long run into even pieces under maxLen
  const out = [];
  for (const r of runs) {
    const m = Math.ceil(((r.length - 1) * step) / CONTOUR.maxLen);
    if (m <= 1) { out.push(r); continue; }
    const per = r.length / m;
    for (let q = 0; q < m; q++) {
      const a = Math.round(q * per) + (q ? half : 0), b = Math.round((q + 1) * per) - (q < m - 1 ? half : 0);
      if (b - a >= 2) out.push(r.slice(a, b));
    }
  }
  return out;
}

// --- the tracks -----------------------------------------------------------------

/**
 * Contour tracks under the whole part. `partTris` is the seated part (flat
 * [x, y, z] x 3 per face), `regions` result.regions, `must(f)` true for a face whose
 * overhang a support must hold (coverage.js MUST), `pitch` the bridges' span (the
 * coverage slider's row pitch). Returns Map(region index -> [line, ...]), each line
 * [x, y, z] stations `step` apart with z the region's surface, at least
 * PROP.minStations long. `dbg`, an object, gets the raster's arrays for a picture.
 */
export function contourTracks(partTris, regions, must, step = PROP.stationStep, pitch = PROP.maxUnsupportedSpan, dbg = null) {
  const c = CONTOUR.cell;
  const red = [], regionOf = new Map();
  regions.forEach((r, ri) => { for (const f of r.faces) if (must(f)) { red.push(f); regionOf.set(f, ri); } });
  const out = new Map();
  if (!red.length) return out;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const f of red) {
    for (let v = 0; v < 3; v++) {
      const x = partTris[f * 9 + v * 3], y = partTris[f * 9 + v * 3 + 1];
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  // two empty cells of margin all round: every level cell has a neighbour to edge on
  const grid = { ox: x0 - 2 * c, oy: y0 - 2 * c, c, nx: Math.ceil((x1 - x0) / c) + 5, ny: Math.ceil((y1 - y0) / c) + 5 };
  const { ox, oy, nx, ny } = grid, N = nx * ny;
  const zRed = new Float64Array(N).fill(Infinity), reg = new Int32Array(N).fill(-1);
  rasterise(partTris, red, grid, zRed, reg, (f) => regionOf.get(f));
  const zLow = new Float64Array(N).fill(Infinity);
  const all = [];
  for (let f = 0; f < partTris.length / 9; f++) all.push(f);
  rasterise(partTris, all, grid, zLow);
  // a red cell: an overhang that is the lowest part surface there (a wall can stand
  // under it); one with part below it is the part-attached path's, left to Auto
  const isRed = new Uint8Array(N);
  for (let k = 0; k < N; k++) if (zRed[k] < Infinity && zRed[k] <= zLow[k] + 1e-6) isRed[k] = 1;

  // levels: red cells joined where neighbours' surfaces stay within `step`
  const level = new Int32Array(N).fill(-1);
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let nLevels = 0;
  for (let k0 = 0; k0 < N; k0++) {
    if (!isRed[k0] || level[k0] >= 0) continue;
    const stack = [k0];
    level[k0] = nLevels;
    while (stack.length) {
      const k = stack.pop(), i = Math.floor(k / ny), j = k % ny;
      for (const [di, dj] of N4) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
        const kk = a * ny + b;
        if (isRed[kk] && level[kk] < 0 && Math.abs(zRed[kk] - zRed[k]) <= CONTOUR.step) { level[kk] = nLevels; stack.push(kk); }
      }
    }
    nLevels++;
  }
  // edges: a level cell beside a cell of another level, or of none, or across a step
  // inside its own level (a vane hung from a spiral ceiling joins it where the spiral
  // comes down to it, and steps up from it everywhere else). HELD where part goes on
  // below this cell's surface there (a wall or vane down from the ceiling, a lower
  // level or step); FREE where nothing is below it (the ceiling ends in air, or steps
  // up). An edge cell's kind is its own: the step a vane sees as free, the ceiling
  // beside it sees as held
  const held = new Uint8Array(N), free = new Uint8Array(N), edge = new Uint8Array(N);
  for (let k = 0; k < N; k++) {
    if (level[k] < 0) continue;
    const i = Math.floor(k / ny), j = k % ny, z = zRed[k];
    for (const [di, dj] of N4) {
      const a = i + di, b = j + dj;
      const kk = a * ny + b, inGrid = a >= 0 && b >= 0 && a < nx && b < ny;
      if (inGrid && level[kk] === level[k] && Math.abs(zRed[kk] - z) <= CONTOUR.step) continue;
      edge[k] = 1;
      if (inGrid && zLow[kk] < z - CONTOUR.step) held[k] = 1; else free[k] = 1;
    }
  }
  const dEdge = distanceField(edge, nx, ny, c);
  // each level's widest point, and its box of cells
  const half = new Float64Array(nLevels);
  const box = Array.from({ length: nLevels }, () => [Infinity, Infinity, -Infinity, -Infinity]);
  for (let k = 0; k < N; k++) {
    const l = level[k];
    if (l < 0) continue;
    if (dEdge[k] > half[l]) half[l] = dEdge[k];
    const i = Math.floor(k / ny), j = k % ny, b = box[l];
    if (i < b[0]) b[0] = i; if (j < b[1]) b[1] = j; if (i > b[2]) b[2] = i; if (j > b[3]) b[3] = j;
  }

  if (dbg) Object.assign(dbg, { grid, level, held, free, half, isRed, zRed, zLow });
  const at = (x, y) => {
    const i = Math.round((x - ox) / c), j = Math.round((y - oy) / c);
    return i >= 0 && j >= 0 && i < nx && j < ny ? i * ny + j : -1;
  };
  // Kept lines' stations in a plan hash, each with its foot + half sideClear: a new
  // station closer than both feet and sideClear to a kept one is dropped
  const taken = new Map(), tKey = (i, j) => i * 100003 + j, T = 8;
  const near = (x, y, r) => {
    const i0 = Math.floor(x / T), j0 = Math.floor(y / T);
    for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) {
      for (const q of taken.get(tKey(i, j)) ?? []) if (Math.hypot(q[0] - x, q[1] - y) < r + q[2]) return true;
    }
    return false;
  };
  const onLine = new Uint8Array(N);   // cells a kept line runs over: seeds for the bridging curves
  const keep = (line) => {
    // by region: the one under the line's middle station
    const mid = line[Math.floor(line.length / 2)], ri = reg[at(mid[0], mid[1])];
    if (ri < 0) return;
    (out.get(ri) ?? out.set(ri, []).get(ri)).push(line);
    for (const p of line) {
      const kk = tKey(Math.floor(p[0] / T), Math.floor(p[1] / T));
      (taken.get(kk) ?? taken.set(kk, []).get(kk)).push([p[0], p[1], footFor(p[2] - PROP.gap) + PROP.sideClear / 2]);
      const k = at(p[0], p[1]);
      if (k >= 0) onLine[k] = 1;
    }
  };
  // a family of curves into lines: pieces (pieces()), the longest first, each cut where
  // it would come at a kept line -- a rim's long curve keeps its run, a spoke meeting
  // it stops short
  const place = (curves) => {
    const runs = [];
    for (const curve of curves) {
      const plan = curve.pts.map(([i, j]) => [ox + i * c, oy + j * c]);
      if (plan.length < 2) continue;
      for (const piece of pieces(smooth(resample(plan, step, curve.closed), curve.closed, CONTOUR.smooth), curve.closed, step)) {
        if (piece.length >= PROP.minStations) runs.push(piece);
      }
    }
    runs.sort((p, q) => q.length - p.length || p[0][0] - q[0][0] || p[0][1] - q[0][1]);
    for (const piece of runs) {
      let line = [];
      const flush = () => { if (line.length >= PROP.minStations) keep(line); line = []; };
      for (const [x, y] of piece) {
        const k = at(x, y);
        const z = k >= 0 && level[k] >= 0 ? zRed[k] : null;
        if (z === null || near(x, y, footFor(z - PROP.gap) + PROP.sideClear / 2)) { flush(); continue; }
        line.push([x, y, z]);
      }
      flush();
    }
  };
  // each wide level's own cells, in a box of its own (a neighbour's edges are not its
  // edges): fn(local grid) per level
  const eachWide = (fn) => {
    for (let l = 0; l < nLevels; l++) {
      if (half[l] <= CONTOUR.narrow) continue;   // all of it narrow: the skeleton has it
      const [bi0, bj0, bi1, bj1] = box[l];
      const i0 = bi0 - 1, j0 = bj0 - 1, mx = bi1 - bi0 + 3, my = bj1 - bj0 + 3;
      const cells = new Int32Array(mx * my).fill(-1), inside = new Uint8Array(mx * my);
      for (let i = 0; i < mx; i++) for (let j = 0; j < my; j++) {
        const gi = i0 + i, gj = j0 + j;
        if (gi < 0 || gj < 0 || gi >= nx || gj >= ny) continue;
        const k = gi * ny + gj;
        if (level[k] !== l) continue;
        cells[i * my + j] = k;
        inside[i * my + j] = 1;
      }
      const seeds = (pick) => {
        const m = new Uint8Array(mx * my);
        for (let q = 0; q < m.length; q++) if (cells[q] >= 0 && pick(cells[q])) m[q] = 1;
        return distanceField(m, mx, my, c);
      };
      const curves = (field, L) => isoLines(field, inside, mx, my, L)
        .map((cv) => ({ pts: cv.pts.map(([i, j]) => [i0 + i, j0 + j]), closed: cv.closed }));
      fn({ inside, mx, my, seeds, curves });
    }
  };

  // 1. NARROW: the skeleton of every level with its edge cells peeled off (so a step
  // inside a level parts its two sides too), kept where the level is narrow there: a
  // vane's middle, a rim's, not a wide ceiling's
  const narrowMask = new Uint8Array(N);
  for (let k = 0; k < N; k++) if (level[k] >= 0 && !edge[k]) narrowMask[k] = 1;
  thin(narrowMask, nx, ny);
  for (let k = 0; k < N; k++) if (narrowMask[k] && dEdge[k] > CONTOUR.narrow) narrowMask[k] = 0;
  place(branches(narrowMask, nx, ny, Math.round(CONTOUR.spur / c)));

  // 2. FREE EDGES: on a wide level, a curve `inset` in from every edge that ends in air
  // (or steps up), running on past a held one wherever it stays heldClear off it -- the
  // inset outline a hand draws, unbroken where a vane meets the rim
  const heldClear = PROP.footMin + PROP.sideClear;
  const freeCurves = [];
  eachWide(({ inside, mx, seeds, curves }) => {
    const dH = seeds((k) => held[k]), dF = seeds((k) => free[k]);
    const f = new Float64Array(dF.length).fill(-1);
    for (let q = 0; q < f.length; q++) if (inside[q]) f[q] = dH[q] >= heldClear ? dF[q] : -1;
    freeCurves.push(...curves(f, CONTOUR.inset));
  });
  place(freeCurves);

  // 3. BRIDGES: half a span from whatever holds the ceiling already -- a held edge, or a
  // line kept above -- then a span apart: arcs between the spokes, rings inside a rim
  const bridgeCurves = [];
  eachWide(({ inside, seeds, curves }) => {
    const d = seeds((k) => held[k] || onLine[k]);
    let dMax = 0;
    for (let q = 0; q < d.length; q++) if (inside[q] && d[q] < Infinity && d[q] > dMax) dMax = d[q];
    for (let L = pitch / 2; L < dMax; L += pitch) bridgeCurves.push(...curves(d, L));
  });
  place(bridgeCurves);
  return out;
}
