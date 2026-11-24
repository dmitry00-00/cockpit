# ASOS 41–60: P1 people card drafts

Package baseline: `2026.11.24.39` (64 layers, 998 entity refs). Output includes 7 unique people and 8 chapter locators.

The candidate list for chapters 41–60 is selective. It is not treated as the book’s full cast denominator. Each included person has a P1 row with an explicit `appearing` relation, a stable `person:` ref confirmed in global reconciliation, and no matching entity in the current package or prior ASOS draft sets. Descriptions only restate that AWOIAF indexes the named person as appearing in the listed chapter. Primary-book verification is pending.

## Included

- `person:mero` — Mero: Daenerys IV (ch. 42); Daenerys V (ch. 57).
- `person:ryman-frey` — Ryman Frey: Catelyn VI (ch. 49).
- `person:edwyn-frey` — Edwyn Frey: Catelyn VI (ch. 49).
- `person:black-walder-frey` — Black Walder Frey: Catelyn VI (ch. 49).
- `person:aegon-jinglebell-frey` — Aegon “Jinglebell” Frey: Catelyn VII (ch. 51).
- `person:smalljon-umber` — Smalljon Umber: Catelyn VII (ch. 51).
- `person:oznak-zo-pahl` — Oznak zo Pahl: Daenerys V (ch. 57).

## Exclusions relevant to duplicate control

- Existing `.39` refs or prior draft refs were skipped, including Styr, Steelshanks Walton, Merrett Frey, Ellaria Sand, Edric Dayne, and Lame Lothar Frey.
- Ghost of High Heart was excluded because global reconciliation flags nonhuman/type-boundary uncertainty.
- Brown Ben Plumm was excluded because a prior draft already has `person:ben-plumm`; the global IDs are not reconciled, so this pass avoids producing a possible duplicate.
- P2 candidates, animal/undead relation labels, aliases, and non-appearance roles were not included.
- Smalljon Umber retains `person:smalljon-umber`; global reconciliation marks him distinct from Greatjon Umber, so the refs must not be merged.

All records are `secondary-indexed-partial`, attributed to AWOIAF under CC BY-SA 3.0, and marked `primaryBook: pending`. No project files were modified.
