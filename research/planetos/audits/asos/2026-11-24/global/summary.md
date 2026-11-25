# ASOS global candidate reconciliation

Package baseline: Planetos 2026.11.24.38, 60 layers / 898 refs (437 people, 197 places, 35 organizations, 229 events).
Read-only reconciliation of the four AWOIAF range outputs against the live .38 manifest.

## Scope and source limits

- AWOIAF chapter pages are secondary indexes; primary-edition verification remains pending.
- No ASOS chapter ledger is present in the checkout. A card match in .38 does not mean a chapter locator has been integrated.
- Ranges 0–20 and 61–81 provide full chapter-level Appearing lists plus selected scene/event/context candidates. Range 21–40 provides full Appearing lists, header scene places and selected priority events. Range 41–60 is a selected context pass, not a full cast denominator.
- Selected continuity mentions stay in their own column and are never counted as full appearance candidates. The 41–60 selected context rows are also not a complete cast denominator.
- Animals, unresolved types, unnamed/role-only entries and dream-only figures are excluded from the strict human denominator; they remain visible with an exclusion reason.
- No completeness percentages or chapter-order-derived dates are provided.

## Source row counts

- 0–20: 355 full-roster/context rows; 118 selected-mention rows.
- 21–40: 330 rows from the full appearance/scene/event candidate audit.
- 41–60: 112 selected-context rows, not a full roster.
- 61–81: 465 full-roster/context rows; 106 selected-mention rows.
- Global inventory: 772 unique canonical candidates after supported package-ref and alias reconciliation.

## Distinct candidate counts by kind

- event: 162
- organization: 39
- person: 429
- place: 114
- unresolved-type: 28

Package card status:

- ambiguous-or-alias-review: 2
- no-matching-card-in-.38: 490
- present-in-.38: 252
- unresolved-type; not a card addition: 28

Source/carry-forward priority:

- P0: 12
- P1: 292
- P2: 280
- not-specified: 188

Strict human denominator: 328 unique candidates have at least one clear, full-roster, non-dream human appearance locator. This denominator excludes selected mentions and 41–60-only context.
Excluded human-like index entries include 8 animal/nonhuman inventory rows and 7 unnamed/role-only or identity-ambiguous rows.

## Normalized ledger-field proposals

- events_occurred_ids: 72 unique candidates with at least one clear source relation.
- events_referenced_ids: 86 unique candidates with at least one clear source relation.
- organization_ids: 18 unique candidates with at least one clear source relation.
- people_appearing_ids: 347 unique candidates with at least one clear source relation.
- people_in_dream_ids: 1 unique candidates with at least one clear source relation.
- people_mentioned_ids: 143 unique candidates with at least one clear source relation.
- places_in_dream_ids: 2 unique candidates with at least one clear source relation.
- places_referenced_ids: 1 unique candidates with at least one clear source relation.
- scene_place_ids: 95 unique candidates with at least one clear source relation.

ledger_field is only a proposed field mapping, not an integration status. 75 inventory rows carry two ledger fields because the same entity has clear relations of different roles across locators: 74 people are both appearing and mentioned, and one event (Red Wedding) is both occurred and referenced. Role-level uncertainty remains in ledger_field_uncertainty and is not itself mapped. 82 rows have no field where type, identity, or relation is unresolved or not represented clearly. Clear mappings: person appearing → people_appearing_ids; selected person mention → people_mentioned_ids; explicit dream appearance → people_in_dream_ids; place scene/dream/reference → scene_place_ids / places_in_dream_ids / places_referenced_ids; specific group → organization_ids; occurred vs reported/planned/referenced event → events_occurred_ids / events_referenced_ids. An ambiguous source relation receives no field for that relation. If the same entity has a separate clear locator, its aggregate row can still list that clear field; unresolved-type candidates always have no field. The row-level reason/status remains separate.

## Alias and identity review

- Canonicalized supported aliases: Brienne Tarth → Brienne of Tarth; Arstan Whitebeard/Arstan → Barristan Selmy; short Arryk/Erryk labels → Cargyll refs; the Hound → Sandor Clegane; the Goat → Vargo Hoat; Grigg → Grigg the Goat; Jarman → package Jarmen Buckwell (spelling variant, verify); Lord of Bones → existing Rattleshirt (alias, verify); Lady Stoneheart → Catelyn Stark; Alayne Stone → Sansa Stark.
- Kept distinct or explicitly pending: Ghost (direwolf) vs Ghost of High Heart; the Liddle vs Torren Liddle; Brave Companions vs Bloody Mummers; Grazdan descriptor labels vs Grazdan mo Ullhor.
- Alias/identity decisions are represented in alias_collision_group and identity_review_status. Uncertain identities were not merged to manufacture a stable ref. Smalljon and Greatjon Umber remain distinct; Lord of Bones is reconciled to existing package ref person:rattleshirt, with primary verification pending; AWOIAF Jarman Buckwell is mapped to package ref person:jarmen-buckwell, spelling check pending.

## Missing cards, priorities, verification

- 490 unique candidates have no matching .38 card. Another 28 unresolved-type rows are retained for audit and excluded from card additions. Zero asserted package refs were broken against the .38 manifest.
- Candidates flagged for identity/alias review: 89.
- Candidate IDs remain proposals; a no-match is not proof that a card is required. Verify all source rows against the selected book edition before adding locators/cards.
- Priorities are carried from range passes when available; otherwise the CSV indicates not-specified or a conservative P1/P2 cue. P0 is retained only where a source range explicitly provided it.

## Integration delta to Planetos `.39`

The first ASOS content batch added 100 unique refs from the reviewed drafts: 74 people (seven identities shared across 0–20 and 61–81 were merged into one card with multiple locators), 7 places, 6 organizations and 13 events. All 100 new refs match a `global_id` in this reconciliation CSV. Against the original 772-candidate inventory, 352 refs now have package cards, 390 remain unmatched candidates, 28 remain unresolved-type, and 2 remain in alias-review status. These counts describe card matching only; they are not chapter-link coverage. The batch includes opening-cast cards, not every P2 name or peripheral mention.

## Current integration status: Planetos `.41`

The historical `.38` candidate matching above is not the current package count. `.40` raised the package to 1,099 cards and rebuilt all 82 ASOS chapter rows to 1,077 clear links across 448 unique refs. The `.40` snapshot and its crosswalk, exclusions, and 263-row gap list are retained under `global/*-at-2026-11-24-40.*`.

`.41` adds eight person cards from the reviewed remaining P0/P1 draft: Coldhands plus seven P1 records. Eighteen clear appearance/mention relations were added to the ledger, which now contains 1,095 links across 455 unique refs; its current gap list contains 219 active candidate–chapter–field rows after the place triage dispositioned 26 relations across 25 candidate IDs. Ghost of High Heart is kept separate from the direwolf Ghost, but its chapter relations remain outside the ledger pending resolution of a secondary-source type conflict. Brown Ben Plumm remains an alias-review/no-card candidate against `person:ben-plumm`. The separate second-pass audit reviewed 35 remaining P1 place candidates and justified no new standalone place card; the dispositions are in `remaining-p1-place-triage.md`.

The 146 `.40` ambiguous/excluded source rows remain preserved separately and are not silently mapped. All counts describe secondary-index structure only, not completeness or primary-text verification. See [`ledger summary .40`](ledger-summary-at-2026-11-24-40.md), [`ledger summary .41`](ledger-summary-at-2026-11-24-41.md), [`ledger method .40`](ledger-integration-method-40.md), [`ledger .41`](asos-chapter-ledger-at-2026-11-24-41.csv), [`gap inventory .41`](card-gaps-at-2026-11-24-41.csv), [`excluded rows .40`](excluded-ambiguous-at-2026-11-24-40.csv), [`person drafts`](person-card-drafts-remaining-p1.md), and [`place triage`](remaining-p1-place-triage.md).

## Artifacts

- global-reconciliation.csv: one row per global candidate with normalized kind/ID, card status, all locators, separate mention/dream fields, strict human-denominator flag, priority, alias review, and proposed ledger_field.
- The original reconciliation CSV is the `.38` baseline proposal set; current ledger integration is tracked by the dated `.40` and `.41` artifacts above.
- This summary retains its historical baseline and records subsequent package/ledger integrations separately so candidate counts are not confused with chapter-link coverage.
