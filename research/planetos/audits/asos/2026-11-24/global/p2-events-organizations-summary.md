# ASOS P2 events and organizations — `.41` gap audit

## Scope and source limits

Read-only delta against Planetos `2026.11.24.41` (67 layers; 1,107 refs). This output uses the P2 event/organization rows in `card-gaps-at-2026-11-24-41.csv` and AWOIAF chapter pages as secondary locators. It is not a full denominator for all events or organizations in the book. Primary-edition verification is pending for every draft. Chapter order is not used to infer dates. Russian names are working handoffs only. Prologue and Epilogue use title-based AWOIAF URLs; numbered chapter locators use numeric chapter URLs.

## Counts

- P2 source locators: **81**; unique candidate IDs: **77** (68 event, 9 organization).
- New cards: **30** (24 event, 6 organization).
- The four ranges below are grouped by each candidate’s earliest P2 chapter locator. Every source locator has a separate decision row in the combined JSON.

| Earliest chapter range | P2 locator rows | Unique candidate IDs | Draft cards | Decision rows |
|---|---:|---:|---:|---:|
| 0–20 | 50 | 48 | 16 (13 events / 3 orgs) | 50 |
| 21–40 | 3 | 3 | 2 (0 events / 2 orgs) | 3 |
| 41–60 | 2 | 2 | 0 (0 events / 0 orgs) | 2 |
| 61–81 | 26 | 24 | 12 (11 events / 1 orgs) | 26 |

## Draft cards by earliest chapter range

### 0–20

- `event:chetts-desertion-and-officer-killing-conspiracy` — Chett’s desertion and officer-killing conspiracy (ch. 0; `plan`).
- `event:nights-watch-decision-to-march-against-mances-host` — Night’s Watch decides to march against Mance’s host (ch. 0; `plan`).
- `event:daenerys-decides-to-redirect-the-fleet-toward-slavers-bay` — Daenerys redirects her fleet toward Slaver’s Bay (ch. 8; `decision`).
- `event:three-thousand-of-qohor` — Three Thousand of Qohor (ch. 8; `historical-reference`).
- `event:guncer-sunglasss-sons-are-burned` — Sons of Guncer Sunglass are burned (ch. 10; `reported`).
- `event:sansa-is-invited-to-visit-highgarden-and-marry-willas` — Sansa is invited to visit Highgarden and marry Willas (ch. 6; `proposal`).
- `event:robb-stark-and-jeyne-westerling-marry` — Robb Stark and Jeyne Westerling marry (ch. 14; `reported`).
- `event:storming-of-the-crag` — Storming of the Crag (ch. 14; `reported`).
- `event:attack-on-the-fist-and-nights-watch-retreat` — Attack on the Fist and Night’s Watch retreat (ch. 15; `reference`).
- `event:rickard-karstark-orders-murders-of-willem-lannister-and-tion-frey` — Rickard Karstark orders the murders of Willem Lannister and Tion Frey (ch. 20; `reported`).
- `event:three-horn-blasts-warn-of-others` — Three horn blasts sound at the Fist (ch. 0; `signal`).
- `event:tywin-orders-campaign-against-northern-force-at-duskendale` — Tywin orders a campaign against the northern force at Duskendale (ch. 4; `order`).
- `event:freys-withdraw-from-robbs-host` — Frey men withdraw from Robb’s host (ch. 14; `reported`).
- `organization:salladhor-saans-fleet` — Salladhor Saan’s fleet (ch. 5; `referenced organization`).
- `organization:kingswood-brotherhood` — Kingswood Brotherhood (ch. 11; `historical-reference`).
- `organization:house-karstark` — House Karstark (ch. 20; `reference`).

### 21–40

- `organization:house-of-nakloz` — House of Nakloz (ch. 23; `reference`).
- `organization:house-of-ullhor` — House of Ullhor (ch. 27; `reference`).

### 41–60

- No standalone P2 cards drafted in this range.

### 61–81

- `event:routed-bloody-mummers-at-harrenhal` — Bloody Mummers are reported routed at Harrenhal (ch. 62; `reported`).
- `event:tywin-discusses-marriage-arrangements-for-his-children` — Tywin discusses marriage arrangements for his children (ch. 62; `plan`).
- `event:lysa-learns-sansas-identity` — Lysa learns Sansa’s identity (ch. 68; `reported`).
- `event:daenerys-chooses-to-remain-in-meereen-and-rule` — Daenerys chooses to remain in Meereen and rule (ch. 71; `decision`).
- `event:a-false-arya-is-sent-toward-the-dreadfort` — A false Arya is sent toward the Dreadfort (ch. 72; `reported`).
- `event:stannis-leaves-dragonstone-with-his-fleet` — Stannis leaves Dragonstone with his fleet (ch. 72; `reported`).
- `event:dalla-dies-following-childbirth` — Dalla dies following childbirth (ch. 75; `reported`).
- `event:stannis-offers-to-legitimize-jon-and-settle-free-folk-in-the-gift` — Stannis offers Jon Winterfell and a settlement for the Free Folk (ch. 76; `proposal`).
- `event:stannis-plans-to-garrison-wall-castles-and-mine-dragonglass` — Stannis plans to garrison Wall castles and mine dragonglass (ch. 78; `plan`).
- `event:lysa-reveals-her-role-in-jon-arryns-poisoning-and-the-false-letter` — Lysa reveals her role in Jon Arryn’s poisoning and the false letter (ch. 80; `revealed`).
- `event:catelyn-stark-is-revealed-as-lady-stoneheart` — Catelyn Stark is revealed as Lady Stoneheart (ch. 81; `revealed`).
- `organization:house-baelish` — House Baelish (ch. 68; `reference`).

## Key crosswalks and exclusions

- Ch7 `event:great-ranging` is excluded as a false positive: it refers to Mance’s earlier ranging. Ch15 maps as a reference to existing `event:great-ranging-reaches-fist`.
- The ch18 Fist attack and Night’s Watch retreat remain one new card, separate from the Great Ranging arrival card.
- The ch4 Tywin order for Duskendale is a separate planned operation card; ch19 battle losses add a `reported` locator to existing `event:battle-at-duskendale`.
- Salladhor Saan’s fleet is one organization card with ch5 and ch10 locators. Kingswood Brotherhood is a historical organization; House Karstark is a named noble house.
- Robb/Jeyne marriage and Frey withdrawal are separate reported events. The storming of the Crag is another reported event, not folded into the marriage.
- Gold Cloaks normalize to `organization:kings-landing-city-watch`. Broad temporary Stannis forces and unnamed court judges receive no cards.
- The ch61 Petyr/Joffrey candidate stays ambiguous: the chapter index supports Petyr’s planning around Sansa and wedding entertainment, but does not establish that he arranged Joffrey’s poisoning.
- Sam’s election coalition plans link to the existing Jon Snow election outcome only as precursors, not as the election itself. Stannis’s proposals for Jon/Free Folk are grouped; the Wall garrison and dragonglass plans are a separate single program card.
- Mummer’s Ford chapter 39 is reference-only and maps to existing `event:tywin-ambushes-berics-justice-party`. AWOIAF mention listing alone does not establish a fresh occurrence.

## Range decisions

- **0–20** — {'draft': 16, 'deferred': 19, 'existing': 6, 'merged': 4, 'false-positive-excluded': 1, 'related': 2, 'existing-add-locator': 2}
- **21–40** — {'draft': 2, 'existing-reference': 1}
- **41–60** — {'deferred': 2}
- **61–81** — {'ambiguous': 1, 'draft': 10, 'deferred': 2, 'no-card': 4, 'related-existing': 3, 'existing-alias': 1, 'merged': 5}

The combined JSON records exact gap source URLs, per-locator decision, proposed target refs where a crosswalk is safe, card source metadata, `secondary-indexed-partial`, and `verification.primaryBook=pending`. No package, manifest, or project files were changed.
