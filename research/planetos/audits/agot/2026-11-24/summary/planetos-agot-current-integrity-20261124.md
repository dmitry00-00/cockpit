# AGOT chapter ledger integrity (.38)

Read-only audit of the specified checkout and current package/ledger.

- Checkout: `/Users/dmitrij/.codex/worktrees/d10-downtime-integration/cockpit`
- Package: `2026.11.24.38`; 60 manifest layers; 898 unique stable refs. Cards by kind: person 437, place 197, organization 35, event 229.
- Ledger: `/Users/dmitrij/.codex/worktrees/d10-downtime-integration/cockpit/research/planetos/agot-chapter-coverage.csv`; 73 rows for chapters 0–72; 73 unique chapter keys.
- Relation memberships: **2593**. Unique refs in the ledger: **621** (person 342, place 109, organization 23, event 147).
- Broken refs: **0 occurrences across 0 IDs**; wrong-kind links: 0.

## Link counts

| Relation field | Memberships | Unique refs |
|---|---:|---:|
| `people_appearing_ids` | 909 | 255 |
| `people_in_dream_ids` | 30 | 28 |
| `people_mentioned_ids` | 903 | 196 |
| `scene_place_ids` | 191 | 87 |
| `places_in_dream_ids` | 9 | 8 |
| `places_referenced_ids` | 125 | 41 |
| `organization_ids` | 217 | 23 |
| `events_occurred_ids` | 116 | 115 |
| `events_referenced_ids` | 93 | 55 |

| Entity type | Memberships | Unique refs |
|---|---:|---:|
| person | 1842 | 342 |
| place | 325 | 109 |
| organization | 217 | 23 |
| event | 209 | 147 |

## Duplicate checks

- Duplicate CSV header names: 0.
- Duplicate chapter rows: 0.
- Repeated refs within a single chapter/role field: 0.
- Duplicate stable ref definitions across package layers: 0.
- Same ref appears in multiple role fields in one chapter: 11 overlaps; dream/physical overlap may be intentional. Arya Stark in both appearing and mentioned in chapter 30 is the clearest role conflict to review.

- Ch.17 `person:robb-stark` (person): `people_appearing_ids`, `people_in_dream_ids`.
- Ch.17 `place:winterfell` (place): `scene_place_ids`, `places_in_dream_ids`.
- Ch.30 `person:arya-stark` (person): `people_appearing_ids`, `people_mentioned_ids`.
- Ch.66 `person:eddard-stark` (person): `people_in_dream_ids`, `people_mentioned_ids`.
- Ch.66 `place:crypts-of-winterfell` (place): `scene_place_ids`, `places_in_dream_ids`.
- Ch.67 `person:ilyn-payne` (person): `people_appearing_ids`, `people_in_dream_ids`.
- Ch.67 `person:eddard-stark` (person): `people_appearing_ids`, `people_in_dream_ids`.
- Ch.68 `person:drogo` (person): `people_appearing_ids`, `people_in_dream_ids`.
- Ch.68 `person:jorah-mormont` (person): `people_appearing_ids`, `people_in_dream_ids`.
- Ch.68 `person:rhaego` (person): `people_in_dream_ids`, `people_mentioned_ids`.
- Ch.68 `place:dothraki-sea` (place): `scene_place_ids`, `places_in_dream_ids`.

## Gap report versus current ledger

`chapter-index-gaps.csv` has 41 group rows: 25 person groups / 175 candidates, and 16 place groups / 109 candidates. Person mapping is labelled `.34`, place mapping `.37`; both were checked against `.38`.

### People

The person mapping lists 127 add, 12 ambiguous, and 36 no-card rows. Current ledger has 126 adds in the expected field; Mikken ch.8 is still in `people_mentioned_ids` rather than `people_appearing_ids`.
Of 36 no-card rows, 27 now have exact-name `.38` refs and are already linked in the expected role; those no-card decisions are stale. Nine remain unlinked/unresolved, including unnamed roles, animal/identity distinctions, and historical Aemon Targaryen (distinct from Maester Aemon). Nine ambiguous animal refs are already listed in mentioned fields; the two Drogo-stallion locators and false-positive Nymeria ch.1 remain unresolved.

### Places

The `.37` place mapping has 109 rows (17 add, 45 ambiguous, 47 no-card). All 17 add refs are in the expected ledger field; Moat Cailin ch.20 is an additional ambiguous ref already in `places_referenced_ids`.
In `.38`, the 47 candidates previously marked no-card now have exact stable refs (37 distinct refs), but none is linked in its chapter. These decisions are stale relative to the package; their scene/reference roles still need review. Another 44 stable-ref candidates remain ambiguous and unlinked. Across the 109 place candidates, 18 already have a target link in the ledger.

**The 16 place-link changes are present in their expected fields:** ch.2 Eyrie; ch.3 Braavos; ch.3 Westeros; ch.4 Eyrie; ch.8 King’s Landing; ch.8 Wall; ch.9 Wall; ch.11 Vaes Dothrak; ch.12 King’s Landing; ch.12 Trident; ch.13 King’s Landing; ch.13 Wall; ch.13 Wolfswood; ch.18 Eel Alley; ch.19 Storm’s End; ch.20 Dragonstone. A separate mapping row for Wall in ch.1 is also present; Moat Cailin in ch.20 is present despite its ambiguous status.
The gap report should be refreshed against `.38`; primary-edition verification remains pending.
