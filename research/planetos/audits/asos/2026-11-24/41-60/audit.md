# A Storm of Swords, chapters 41–60: candidate audit

**Checkout:** `/Users/dmitrij/.codex/worktrees/d10-downtime-integration/cockpit`

**Snapshot compared:** Planetos `2026.11.24.38`, 60 layers / 898 cards (437 people, 197 places, 35 organizations, 229 events). Read-only; project unchanged.

**Register:** `research/planetos/asos-chapter-register-2026-11-24.csv`; the requested interval contains 20 numbered chapters.

**Source limit:** AWOIAF numeric chapter pages are community-maintained secondary indexes. They support chapter locators, indexed participants/places and summarized beats, but do not establish a complete appearance denominator or replace the novel. Primary-edition and Russian-translation verification is pending. No absolute dates are inferred from chapter order.

## Summary

- `112` selected chapter-context rows (not unique entities): event 25, organization 6, person 42, place 39.
- `59` rows marked missing across `56` unique proposed refs; status counts: `context-only` 2, `covered` 46, `covered-locator-review` 1, `covered-name-variant` 1, `covered-underlying-event` 1, `excluded-noncanonical` 1, `missing` 59, `partial-other-recipient` 1.
- First-pass, key-utility candidates only. Repeated POVs and routine names are omitted unless they clarify coverage; this is not a full denominator or completeness percentage.

## High-value missing candidates

**Places:** Queenscrown, High Heart, Oldstones, Hag’s Mire, Lord Harroway’s Town, Nightfort, Black Gate; lower-priority Flea Bottom and the separately modeled Goodbrook village need review.

**People:** Coldhands, Ghost of High Heart, Edric Dayne, Styr, Small Paul, Steelshanks Walton; Frey figures Ryman, Edwyn, Black Walder, Lothar, Jinglebell and Merrett; lower-priority Donnel Haigh, Sedgekins, Raymund Frey, Ellaria Sand and Tallad; Meereen figures Oznak zo Pahl, Brown Ben Plumm and Mero.

**Groups:** Stormcrows, Second Sons, Unsullied, Brotherhood without Banners, Brave Companions/Bloody Mummers and Thenns have no organization cards in this snapshot.

## State and locator distinctions

- Chapter 42’s Yunkai battle has occurred by the time its outcome is reported. Existing `event:battle-near-yunkai` points to chapter 57, whose indexed scene is Meereen; review the current event locator against chapter 42.
- Chapter 45’s heir decision and dispatch order are plans/orders; Balon’s death and Euron’s return arrive as reports.
- Chapter 48’s Mance report and Grenn’s claim that Bran/Rickon died are reports; the latter is doubted. Existing false-report card records another recipient.
- Chapter 49’s account of Ramsay and Theon is reported speech. Red Wedding itself occurs in chapter 51 and is already covered; chapter 52 is its continuation.
- Chapter 54 repeats news of the Red Wedding and relays a letter about the Fist/Wall; these are report contexts. Chapter 55’s Castle Black attack is distinct from the later chapter-64 `battle-beneath-the-wall`.
- Chapter 57 has distinct Meereen incidents and intelligence but does not show the city captured. Chapter 58’s marriage idea is a plan. Chapter 60 Joffrey’s death is covered. Chapter 43 visions and chapter 44 fever dream are dream contexts, not historical events.

## Primary-source checks still needed

Verify participant appearance vs mention (especially Chett), exact scene locations at Whitetree and the Goodbrook ruins, Frey identities/aliases, Jarman/Jarmen spelling, chapter-42 vs chapter-57 Yunkai battle locator, and every report/plan/dream distinction against the selected novel edition and Russian translation before integration.

`candidate-reconciliation.csv` lists each selected candidate context with chapter title, numeric URL, relation/state, package ref or proposed ref, priority and an original short note.
