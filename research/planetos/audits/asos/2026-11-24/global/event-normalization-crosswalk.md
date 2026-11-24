# ASOS event source-candidate normalization crosswalk

## Scope

This is a **source-candidate normalization** for two composite P1 event candidates and the related Battle near Yunkai candidate. It is not a denominator recalculation. No new cast/event denominator, completeness estimate, or package edit is produced. Candidate names and proposed output refs are reconciled against the existing range draft, global reconciliation, current package `.39`, and chapter ledger.

Baseline read: Planetos **2026.11.24.39**, 64 layers, 998 entity refs. The existing ASOS chapter ledger currently has 82 rows. AWOIAF numeric chapter pages are secondary indexes/synopses; primary-edition verification remains pending.

## Mapping

| Source candidate | Existing `.39` component | New delta / locator | Proposed ledger field | Current ledger state |
|---|---|---|---|---|
| `event:oberyn-dies-and-gregor-admits-responsibility-for-elias-death` — “Oberyn dies and Gregor admits responsibility for Elia’s death” (P1) | `event:oberyn-dies-in-trial-by-combat` covers Oberyn’s death; existing card locator is ch.70 Tyrion X. | Draft-only `event:gregor-clegane-confesses-to-elias-martells-death`, ch.70 Tyrion X, relation `occurred-revelation`; isolate the confession/admission. | `events_occurred_ids` for each distinct event action. | Chapter 70 currently has neither ref linked. |
| `event:tyrion-kills-shae-and-tywin-lannister` — “Tyrion kills Shae and Tywin Lannister” (P1) | `event:tywin-lannister-killed-by-tyrion` exists in `.39`, ch.77 Tyrion XI. | Draft-only `event:tyrion-kills-shae-in-the-red-keep`, ch.77 Tyrion XI, relation `occurred-per-synopsis`; isolate Shae’s death. | `events_occurred_ids` for each distinct event. | Chapter 77 currently has neither ref linked. |
| Global candidate `event:battle-near-yunkai`, canonical name “Battle near Yunkai”, source variant/local candidate `event:battle-for-yunkai` / “Battle for Yunkai” (P0) | The same event is already covered by `.39` ref `event:battle-near-yunkai`; its current card source locator is ch.57 Daenerys V. | Reconcile the existing card locator to ch.42 Daenerys IV (`occurred; outcome reported`). No new event card or ledger membership. | `events_occurred_ids`. | Chapter 42 already contains `event:battle-near-yunkai`; do not duplicate the ledger link. |

The CSV provides one row per canonical output ref and records the source candidate, package state, locator, proposed field, and action separately.

## Locator caution: Battle near Yunkai

The local audit and global reconciliation both flag the ch.42 locator. The numeric AWOIAF page for [Daenerys IV, ch.42](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_42) places the chapter at Yunkai and its synopsis describes the night attack and the reported victory. By contrast, [Daenerys V, ch.57](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_57) is set at Meereen and summarizes events around that city, including the Siege of Meereen. The `.39` Battle near Yunkai card currently cites ch.57, while the ch.42 ledger row already links `event:battle-near-yunkai`. The crosswalk therefore flags the card locator for correction/review and preserves the existing ledger membership. Verify the event identity and final locator against the chosen novel edition before treating this as definitive.

For the two composite candidates, [Tyrion X, ch.70](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_70) lists both the trial combat outcome and Gregor’s admission in the same scene; the existing `.39` card covers Oberyn’s death, so the new draft isolates the admission. [Tyrion XI, ch.77](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_77) describes both Shae’s and Tywin’s deaths; the existing `.39` card covers Tywin, so the new draft isolates Shae. The ledger links for chapters 70 and 77 are currently blank in the event fields.

## Limits

The separation reflects source-candidate normalization, not a claim that the source index is complete or that its synopsis replaces the primary text. All event links remain provisional; event dates are not inferred from chapter order. No project files were changed.
