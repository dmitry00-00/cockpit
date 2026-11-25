# ASOS ledger `.40` rebuild method

## Inputs and limits

Read-only rebuild from Planetos `.40` (66 layers, 1,099 refs), the four ASOS range audits, global reconciliation, event normalization crosswalk, ASOS register, and current chapter coverage for ledger-state checks. No project files were edited.

AWOIAF chapter indices/synopses are secondary finding aids. Rows are `secondary-indexed-partial`; primary-edition verification is pending. Chapter 41–60 is selective, not a complete cast denominator. The mention lists in the other ranges are selective as well. Blank fields and gaps do not prove absence. No absolute dates are inferred from chapter order.

## Link rules

Stable source IDs and global reconciliation take precedence over name-only matching. Relations are included only when clear. Every output ref must exist in `.40` and match the expected ledger field kind. Missing refs go to `card-gaps.csv`; unresolved roles, names, aliases, or entity types go to `excluded-ambiguous.csv`.

`entity-ref-crosswalk.csv` records explicit person/place/organization identity and type mappings, including the parent-approved Aemon/Tormund identities, Arryk/Erryk Cargyll identities, Wall/Eyrie/Moon Door place IDs, Night’s Watch organization, and Mole’s Town place. Brown Ben Plumm is explicitly no-card pending primary identity review against `person:ben-plumm`.

`event-crosswalk-dispositions.csv` records source event candidates that map into existing cards. Chapter 64 Battle beneath the Wall is occurred, while Attack on Castle Black is referenced; deaths and repelled assaults collapse into the battle card. Chapter 69 refers to both earlier events and creates no new occurred event. The trial candidate at ch.70 maps to the existing Oberyn event; the separate confession remains a second occurred event. The chapter 77 composite splits into Tywin and Shae death refs. Battle near Yunkai remains one occurred link in chapter 42.

## Validation

The ledger has one row for every chapter number 0–81. All refs resolve to `.40` and have the expected entity kind. No duplicate refs appear in a field. `card-gaps.csv` is deduplicated by canonical candidate/ref, chapter, and field. Residual P0/P1 gap counts are split by kind, source range, and unique candidate ID versus locator row.
