# ASOS P2 events and organizations — first batch, chapters 0–20

## Source limits

Read-only delta against Planetos `2026.11.24.41`. AWOIAF chapter indexes and synopses are secondary; primary-edition verification remains pending. They may omit context or flatten reported, planned, and remembered events. Prologue is an AWOIAF title page rather than a numbered URL. No dates are inferred from chapter order. Russian labels are working handoffs only.

## Counts

- P2 locator rows: **50**; unique IDs: **48** (45 event, 3 organization).
- Drafts: **16** (13 events, 3 organizations).
- Candidate decisions are now one per gap locator row, so repeated chapter locators remain visible.

## Draft cards by earliest chapter range

### 0–20

- `event:chetts-desertion-and-officer-killing-conspiracy` — Chett’s desertion and officer-killing conspiracy (ch. 0, Prologue; `plan`).
- `event:nights-watch-decision-to-march-against-mances-host` — Night’s Watch decides to march against Mance’s host (ch. 0, Prologue; `plan`).
- `event:daenerys-decides-to-redirect-the-fleet-toward-slavers-bay` — Daenerys redirects her fleet toward Slaver’s Bay (ch. 8, Daenerys I; `decision`).
- `event:three-thousand-of-qohor` — Three Thousand of Qohor (ch. 8, Daenerys I; `historical-reference`).
- `event:guncer-sunglasss-sons-are-burned` — Sons of Guncer Sunglass are burned (ch. 10, Davos II; `reported`).
- `event:sansa-is-invited-to-visit-highgarden-and-marry-willas` — Sansa is invited to visit Highgarden and marry Willas (ch. 6, Sansa I; `proposal`).
- `event:robb-stark-and-jeyne-westerling-marry` — Robb Stark and Jeyne Westerling marry (ch. 14, Catelyn II; `reported`).
- `event:storming-of-the-crag` — Storming of the Crag (ch. 14, Catelyn II; `reported`).
- `event:attack-on-the-fist-and-nights-watch-retreat` — Attack on the Fist and Night’s Watch retreat (ch. 15, Jon II; `reference`).
- `event:rickard-karstark-orders-murders-of-willem-lannister-and-tion-frey` — Rickard Karstark orders the murders of Willem Lannister and Tion Frey (ch. 20, Catelyn III; `reported`).
- `event:three-horn-blasts-warn-of-others` — Three horn blasts sound at the Fist (ch. 0, Prologue; `signal`).
- `event:tywin-orders-campaign-against-northern-force-at-duskendale` — Tywin orders a campaign against the northern force at Duskendale (ch. 4, Tyrion I; `order`).
- `event:freys-withdraw-from-robbs-host` — Frey men withdraw from Robb’s host (ch. 14, Catelyn II; `reported`).
- `organization:salladhor-saans-fleet` — Salladhor Saan’s fleet (ch. 5, Davos I; `referenced organization`).
- `organization:kingswood-brotherhood` — Kingswood Brotherhood (ch. 11, Jaime II; `historical-reference`).
- `organization:house-karstark` — House Karstark (ch. 20, Catelyn III; `reference`).

## Decisions and crosswalks

- `organization:salladhor-saans-fleet` has separate ch5 and ch10 decision rows; one organization card covers both.
- `event:great-ranging` ch7 is excluded as a false positive: it refers to Mance’s earlier ranging. Ch15 maps as a reference to existing `event:great-ranging-reaches-fist`.
- Three horn blasts are retained as a signal card, but its association with the Others is explicitly not asserted from the synopsis alone.
- Tywin’s Duskendale order is its own plan/order card. Candidate ch19 losses add a `reported` locator to existing `event:battle-at-duskendale`.
- Frey withdrawal is a separate reported military consequence of Robb/Jeyne’s marriage, not folded into the marriage card.
- The Crag injury composite is normalized to the Crag operation. The Fist candidates are normalized into one attack/retreat card. Mummer’s Ford maps to existing `event:tywin-ambushes-berics-justice-party`.
- Blackwater, Renly’s death, Jaime/Aerys, Robert’s feast, and the Dontos escape plan map to existing `.41` cards. Some historical or minor plans remain deferred; see the JSON for every per-locator decision.

## Later earliest-chapter ranges

- 21–40: 3 P2 locators / 3 IDs.
- 41–60: 2 P2 locators / 2 IDs.
- 61–81: 26 P2 locators / 24 IDs.



Existing-reference locator suggestions are recorded in `existingLocatorSuggestions`; no package file was edited.
