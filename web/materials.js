// Material profiles: the clearances each filament needs, one table for the website
// (ui/settings.js) and the plugins' engine entry (plugins/shared/engine/fins_entry.js),
// so a plugin's PETG prints the site's PETG numbers.
//
// PETG welds to a support far harder than the PLA every bite
// number here was tuned on, so PETG needs more clearance in both places at
// once: the plain breakaway prop's clearance (PROP.gap), and the bed pad -- thinner (FIN.padH) with a gap
// instead of a tack (PAD.grab < 0). PLA is exactly today's numbers, so switching
// to PLA (or never touching this) leaves existing prints unchanged. density is g/cm^3
// for the grams receipt.
//
// Two filaments fail in ways no clearance fixes, so their profiles also change the
// geometry (docs/FIN-SPEC.md "Filament profiles"; not printed yet):
//   stiffness  Young's modulus against PLA's. TPU 95A datasheets give 9-67 MPa, PLA
//              2.2-3.3 GPa: a TPU wall bends ~100x as far as the same PLA wall, so its
//              ribs start where a PLA wall bending as far would get them (prop/brace.js
//              ribScale). PETG and ABS are within 2x of PLA, inside the 10 cm rule's own
//              uncertainty, so they keep 1.
//   wallLines  the Wall lines the site sets when the filament is picked (never lowers
//              it): TPU's 4 lines are 8x as stiff across the wall as 2.
//   ears       ABS and ASA shrink ~0.5-0.8% as they cool, two to three times PLA's, and
//              a long thin wall foot peels from its ends: a one-layer disc of this
//              radius at each end of a wall on the plate (prop/ears.js), a slicer's
//              "mouse ears". 0 = none.
//   padMargin  how far the bed pad spreads past the contact (FIN.padMargin, 4): ABS's
//              8 is the brim a warping part needs, the margin the pad first had.
export const MATERIAL = Object.freeze({
  pla:  Object.freeze({ padH: 0.5, padGrab:  0.05, propGap: 0.2,  density: 1.24 }),
  petg: Object.freeze({ padH: 0.3, padGrab: -0.10, propGap: 0.3,  density: 1.27 }),
  abs:  Object.freeze({ padH: 0.5, padGrab:  0.05, propGap: 0.2,  density: 1.05, ears: 5, padMargin: 8 }),
  tpu:  Object.freeze({ padH: 0.3, padGrab: -0.10, propGap: 0.3,  density: 1.21, stiffness: 0.01, wallLines: 4 }),
});
