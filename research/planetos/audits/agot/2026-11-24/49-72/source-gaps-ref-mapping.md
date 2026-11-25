# AGOT 49–72: mapping source gaps to .34 refs

Read-only reconciliation of `source-gaps.csv` against Planetos package `2026.11.24.34`. No project files were changed. Every non-empty `ref` was checked against the package's manifest layers (54 layers; 789 unique stable refs).

- Rows mapped: 38.
- `add`: 29 (25 links to existing cards; 4 new event-card candidates with blank `ref`).
- `relation-correction`: 2 (Mikken, ch.53; Mormont’s raven, ch.60).
- `ambiguous`: 4 (Small Hall, Galbart Glover, silver mare, Meryn Trant).
- `no-card`: 3 (unnamed stableboy, Dancer, High Septon office/title).

## Special mappings

- Chapter 56 “Battle in the hills below the Golden Tooth” → existing `event:jaime-defeats-tully-force-at-golden-tooth`.
- Chapter 56 “Battle under the walls of Riverrun” → existing `event:jaime-defeats-edmures-force-under-riverrun`. Both are `events_referenced_ids`, not events occurring in chapter 56.
- The four other chapter 56 events have no matching stable ref in .34. Their rows are `add` with blank `ref` to distinguish a proposed new card from an excluded no-card item.
- “Yielding of Harrenhal” is kept distinct from existing `event:tywin-leaves-harrenhal`.

All unresolved scene/entity classifications remain secondary-index findings; primary-edition verification is still pending.
