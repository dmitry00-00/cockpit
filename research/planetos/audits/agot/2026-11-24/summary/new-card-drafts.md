# AGOT missing-card drafts (chapters 0–24)

Snapshot checked read-only against Planetos `2026.11.24.37` (837 current refs). Draft set contains **23 person**, **37 place**, and **1 event** payloads/cards.

Every card cites one or more numeric AWOIAF chapter-index URLs and includes CC BY-SA 3.0 attribution. Wording is original and deliberately light: people are recorded as index mentions, place list entries keep scene/reference unresolved, and the event is a plan/proposal only. All entries have `secondary-indexed-partial` status and primary book verification pending. No absolute dates or coordinates are added.

## Included layers

- `person`: 23 missing named-person cards; locators include chapter title, number and AWOIAF URL.
- `place`: 37 new places. `place:eastwatch-by-the-sea` is excluded because its normalized name is already covered by `place:eastwatch`.
- `event`: `event:littlefinger-plan-to-bribe-city-watch`, described as a plan; no payment or outcome is asserted.

## Excluded

- Three dragon candidates and Dancer the horse: excluded because current schema has no `creature` or `animal` kind.
- Eastwatch-by-the-Sea alias: excluded to avoid duplicate of existing `place:eastwatch`.
- Any candidate already covered in live `.37`: excluded. A read-only entity/ref and normalized-name check found no additional person/event duplicates among the selected entries.

## Source and verification

Source basis is AWOIAF numeric chapter indexes only; the novel and chosen edition have not been checked. Place-index entries do not by themselves establish whether a location is a scene or a passing reference. The ch.47 proposal is represented as intention, not an occurrence result.

The JSON contains three homogeneous `cockpit.entity-layer/1` payloads inside a draft-set wrapper. Each entity has chapter locators, source URL, CC BY-SA 3.0 attribution, `secondary-indexed-partial` status and a pending primary-verification note.
