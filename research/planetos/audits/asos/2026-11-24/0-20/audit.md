# ASOS 0–20: read-only chapter-index audit

## Scope and source limits

This pass follows the prepared chapter register and AWOIAF numeric chapter pages. AWOIAF is a secondary index; no selected novel edition was checked. The current Planetos package is `.38` per the parent task context. No ASOS chapter-coverage ledger CSV is present in the checkout, so each row proposes a new ASOS locator rather than claiming an existing ledger link. All entries are `secondary-indexed-partial`; primary verification remains pending. No novel text or unsupported absolute dates were copied or added, and the project was not modified.

The primary CSV is intentionally bounded to the full chapter-level `Appearing` cast, physical scene anchors, separately marked dream places, priority event candidates, and major groups/institutions. The separate `deferred-mentions.csv` preserves the selected high-value mentions from this pass; it is not a complete transcription of every AWOIAF mention. Incidental names, all Houses, taxonomy terms, and other periphery are deferred. AWOIAF page lists may label creatures and role-only figures as characters; these remain marked for type/identity review.

## Register and row counts

Range 0–20 includes Prologue 0 plus chapters 1–20: 21 chapter locators. The register provides canonical title/POV/URL. The prologue uses its canonical `/A_Storm_of_Swords-Prologue` URL; numbered chapters use `/A_Storm_of_Swords-Chapter_N`. Numeric URLs are repeated in every CSV row.

- Main denominator CSV: **355** relation rows; categories `{'person': 201, 'unresolved-type': 17, 'place': 52, 'event': 63, 'organization': 22}`.
- Separate deferred selected-mention list: **118** rows; all marked `mentioned`, with no appearance implication.
- Main-row relations: `{'appearing': 210, 'appearing-in-wolf-dream': 3, 'appearing-unidentified-role': 5, 'appearing; chapter summary includes dream as separate event': 1, 'scene': 47, 'dream-place': 3, 'scene-vessel': 2, 'plan': 13, 'reported signal': 1, 'occurred': 8, 'prior event reported': 1, 'reported': 7, 'historical reference': 4, 'dream': 3, 'referenced': 10, 'proposal': 2, 'recalled': 2, 'decision': 1, 'plan/interrupted': 1, 'recalled past occurrence': 1, 'plan, refused': 1, 'reported past occurrence': 1, 'reported/occurred': 2, 'recounted': 3, 'revealed plan': 1, 'recalled/ongoing flight': 1, 'recounted prior occurrence': 1, 'dream appearance': 1, 'organization present by office': 1, 'mentioned/institution': 1, 'referenced organization': 1, 'appearing/institution': 1, 'appearing/central family': 1, 'appearing broad people; not stable organization': 2, 'referenced organization/army; candidate': 1, 'appearing, named as a group': 1, 'recalled institution': 1, 'historical group': 1, 'appearing group': 3, 'relevant alliance group': 1, 'song/reference': 1, 'appearing species/collective; creature type unresolved': 1, 'appearing institution': 1, 'appearing/relevant political group': 1}`. Repeated chapter-level links are preserved; they are not deduplicated across chapters.
- Current package name-match check: `{'no confident package card match': 187, 'present': 151, 'out-of-person-schema': 17}`. Matching is conservative, based on current entity display names/aliases and does not prove identity. Rows without confident match require manifest/ref audit; do not treat each as a confirmed missing card.
- ASOS ledger: absent; therefore no row is labeled covered. `relation_suggestion` proposes the relevant ASOS locator relation.

## Chapter-level coverage

| chapter_no | title | cast rows | scene/dream place rows |
|---:|---|---:|---:|
| 0 | Prologue | 21 | 2 |
| 1 | Jaime I | 4 | 2 |
| 2 | Catelyn I | 6 | 4 |
| 3 | Arya I | 5 | 2 |
| 4 | Tyrion I | 8 | 4 |
| 5 | Davos I | 1 | 2 |
| 6 | Sansa I | 25 | 2 |
| 7 | Jon I | 14 | 2 |
| 8 | Daenerys I | 10 | 2 |
| 9 | Bran I | 5 | 2 |
| 10 | Davos II | 8 | 3 |
| 11 | Jaime II | 5 | 2 |
| 12 | Tyrion II | 7 | 3 |
| 13 | Arya II | 12 | 3 |
| 14 | Catelyn II | 23 | 3 |
| 15 | Jon II | 19 | 2 |
| 16 | Sansa II | 6 | 1 |
| 17 | Arya III | 8 | 3 |
| 18 | Samwell I | 4 | 1 |
| 19 | Tyrion III | 11 | 2 |
| 20 | Catelyn III | 16 | 5 |

## Important distinctions and unresolved cases

- Chapter 0 separates Chett’s conspiracy and the march decision as plans; the three-horn signal is reported as a warning. The chapter page does not justify marking the planned murder/desertion as completed.
- Chapter 3 and 9 have wolf-dream contexts. Nymeria/Iggo and the Wolfswood dream locator should not be treated as ordinary physical scene presence; the dream place is separate in the CSV.
- Chapter 8 lists three dragons as appearing; chapter 18 lists an Other; direwolves and Mormont’s raven are also indexed. They are marked `unresolved-type`, not silently added as people.
- Chapter 11 and 13 list “Boy” and “Husband”, and chapter 16 lists an “Old seamstress”. These are role labels without stable identity; do not create individual cards without primary-source confirmation.
- Chapter 10’s Davos intent to kill Melisandre is interrupted by his arrest. Chapters 6/16 and 19 contain proposals or future plans, not completed marriages/escapes.
- Chapter 14 reports Robb and Jeyne’s already completed marriage; chapter 19 repeats the report. Use one event identity with both locators if supported by the live package.
- Chapter 20 Rickard Karstark’s execution is in-scene; the murders of Willem Lannister and Tion Frey are prior events recounted in the synopsis.
- Some interior-place labels (for example, “Small Council chamber” or room-level sublocations) are candidate scene anchors inferred from the synopsis; confirm their naming/granularity against the chosen edition.

## Follow-up boundary

Next pass should cover the full mention list, House/group denominator, and all page-listed place/event links; then reconcile IDs/aliases against the live manifest and check the primary edition. This pass is suitable for adding ASOS locator proposals for the cast and scene anchors, but it is not a claim of complete book coverage.
