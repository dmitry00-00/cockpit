# ASOS ledger `.40` rebuild summary

- Baseline: Planetos `2026.11.24.40`; 66 layers; 1099 refs (people 527, places 229, organizations 41, events 302).
- Ledger: 82 rows, chapters 0–81 exactly once; 1077 links by field: people_appearing_ids=625, people_mentioned_ids=183, scene_place_ids=137, organization_ids=31, events_occurred_ids=68, events_referenced_ids=25, people_in_dream_ids=1, places_in_dream_ids=3, places_referenced_ids=4.
- Clear missing-card gaps: 263 unique rows after `.40` ref reconciliation and alias/type crosswalks.
- Excluded/ambiguous source rows: 146; includes Brown Ben Plumm alias-review/no-card. Details in `excluded-ambiguous.csv`.
- Range 41–60 remains selective; the ledger does not claim a complete cast denominator.
- Event mapping: ch.42 has the sole `event:battle-near-yunkai` link. Ch.64 uses Battle beneath the Wall as occurred and Attack on Castle Black as referenced. Ch.69 references both prior event refs; it does not create a third event. Ch.70 links the existing Oberyn trial/death plus Gregor’s confession; ch.77 links the existing Tywin death plus Shae’s death.
- Person/type mapping: Aemon locators ch.64/69/75/78/79 → `person:maester-aemon`; Tormund ch.7/15/73 → `person:tormund-giantsbane`; Arryk/Erryk ch.6 → their distinct Cargyll refs. Night’s Watch is `organization:nights-watch`; Mole’s Town is `place:moles-town`. Wall/Eyrie/Moon Door map to current canonical place refs. Brown Ben remains alias-review/no-card.
- QA: all refs resolve in `.40` and match field kind; no within-field duplicates; no dates inferred from chapter order.

## Residual P0/P1 card gaps

Unique candidate IDs are counted once per source range; locator rows are shown separately. The 41–60 rows remain selective.

| Kind | Priority | Range | Unique candidate IDs | Candidate locator rows |
|---|---|---:|---:|---:|
| person | P0 | 41-60 | 1 | 2 |
| person | P1 | 21-40 | 1 | 2 |
| person | P1 | 61-81 | 5 | 14 |
| place | P1 | 0-20 | 9 | 10 |
| place | P1 | 21-40 | 3 | 3 |
| place | P1 | 61-81 | 13 | 13 |

## Alias/type crosswalk decisions

| Source candidate | Chapters | Decision |
|---|---:|---|
| `person:arryk` | 6 | Map to `person:arryk-cargyll`; retain distinct from Erryk. |
| `person:erryk` | 6 | Map to `person:erryk-cargyll`; retain distinct from Arryk. |
| `person:aemon-targaryen` | 64, 69, 75, 78, 79 | Map to existing `person:maester-aemon`. |
| `person:tormund` | 7, 15, 73 | Map to existing `person:tormund-giantsbane`. |
| `place:wall` | 64, 69 | Map to existing `place:the-wall`. |
| `place:eyrie` | 80 | Map to existing `place:the-eyrie`. |
| `place:moon-door` | 80 | Map to existing `place:moon-door-of-the-eyrie`. |
| `person:nights-watch` | 63 | Correct entity kind to organization; map to `organization:nights-watch`. |
| `person:moles-town` | 64 | Correct entity kind to place; map to `place:moles-town` as referenced. |
| `person:brown-ben-plumm` | 57 | Alias review/no-card against existing `person:ben-plumm`; no ledger link pending primary identity check. |

See `residual-priority-gaps.csv` for machine-readable counts and `entity-ref-crosswalk.csv` for row-level locator evidence and reasons.
