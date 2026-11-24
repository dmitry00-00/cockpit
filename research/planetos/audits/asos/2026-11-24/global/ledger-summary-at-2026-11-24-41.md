# ASOS ledger `.41` summary

## Result

- Planetos package: `2026.11.24.41`; 67 layers; 1,107 unique entity refs (535 people, 229 places, 41 organizations, 302 events).
- Chapter ledger: 82 rows for chapter 0–81; 1,095 links; 455 unique refs.
- Link fields: `people_appearing_ids` 642; `people_mentioned_ids` 184; `scene_place_ids` 137; `organization_ids` 31; `events_occurred_ids` 68; `events_referenced_ids` 25; `places_referenced_ids` 4; `places_in_dream_ids` 3; `people_in_dream_ids` 1.
- Delta from `.40`: 18 person links were added — 17 appearances and one mention — for Coldhands, Grigg the Goat, Hareth, Kegs, Mully, Owen the Oaf, and Spare Boot. The eight new P0/P1 cards also include Ghost of High Heart; its two appearance locators remain out of the ledger because the secondary sources conflict about entity type.
- Active gap inventory: 219 candidate–chapter–field rows. The `.40` baseline had 263; 18 person relations are now linked and 26 P1 place relations across 25 candidate IDs have been dispositioned as aliases, generic/interior/temporary sites, or unresolved sublocations. They are removed from the standalone-card queue, not silently asserted as absent from the story.
- The active gap file now contains no P0/P1 rows: 165 P2 relations and 54 selected mention relations with no source priority remain. Those mentions are not a card quota; review them for GM value and identity first.
- The 146 `.40` ambiguous/excluded source rows remain separately archived. Brown Ben Plumm remains alias-review/no-card against `person:ben-plumm`.

## Structural review

`node scripts/check-packages.mjs` passed: 7 manifests; 156 `content/` files, each assigned to exactly one layer. A read-only data audit found 1,107 unique package refs; all 82 chapter numbers are unique; all 1,095 ledger links resolve to the expected kind; no field contains duplicate refs.

This remains a secondary-indexed partial ledger. The chapter 41–60 audit is selective; primary-edition verification, final Russian names, chapter-frontier/player projection, event-to-timeline integration, and table acceptance remain open.

## Source artifacts

- Current ledger: `asos-chapter-ledger-at-2026-11-24-41.csv`
- Current active gaps: `card-gaps-at-2026-11-24-41.csv`
- `.40` structural baseline: `ledger-summary-at-2026-11-24-40.md`
- `.40` excluded/ambiguous rows: `excluded-ambiguous-at-2026-11-24-40.csv`
- P1 place decisions: `remaining-p1-place-triage.md` and `.json`
- Person draft/review notes: `person-card-drafts-remaining-p1.md`
