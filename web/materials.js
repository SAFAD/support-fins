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
//              ribScale: 22 mm at 2 lines). PETG and ABS are within 2x of PLA, inside the
//              10 cm rule's own uncertainty, so they keep 1. (TPU at 4 lines is stiff to
//              43 mm, but on low walls it only doubled the plastic and fitted fewer: the
//              6R0 housing on its ribs, every wall under 13 mm, held less at 4 than at 2.)
//   ears       ABS and ASA shrink ~0.5-0.8% as they cool, two to three times PLA's, and
//              a long thin wall foot peels from its ends: a one-layer disc of this
//              radius at each end of a wall on the plate (prop/ears.js), a slicer's
//              "mouse ears". 0 = none.
//   padMargin  how far the bed pad spreads past the contact (FIN.padMargin, 4): ABS's
//              8 is the brim a warping part needs, the margin the pad first had.
//   span       mm the part bridges between two walls (PROP.maxUnsupportedSpan, 12 on
//              PLA's slenderness coupon): every row pitch, downhill walls' spacing and
//              Full coverage's reach follow it. ABS is printed with little part cooling
//              (fans warp and split it) and TPU is soft and slow to set, so both sag
//              over a span PLA holds: 9 and 8 mm, until the coupon prints in them.
export const MATERIAL = Object.freeze({
  pla:  Object.freeze({ padH: 0.5, padGrab:  0.05, propGap: 0.2,  density: 1.24 }),
  petg: Object.freeze({ padH: 0.3, padGrab: -0.10, propGap: 0.3,  density: 1.27 }),
  abs:  Object.freeze({ padH: 0.5, padGrab:  0.05, propGap: 0.2,  density: 1.05, ears: 5, padMargin: 8, span: 9 }),
  tpu:  Object.freeze({ padH: 0.3, padGrab: -0.10, propGap: 0.3,  density: 1.21, stiffness: 0.01, span: 8 }),
});
