# ASOS 0–20: provisional person-card draft set

## Scope and source limits

Drafts derive only from the AWOIAF chapter appearance/selected-mention locators already audited for chapters 0–20. AWOIAF is a secondary index; the selected primary edition is not checked. Every draft is `provisional` / `secondary-indexed-partial`, attributed to AWOIAF under CC BY-SA 3.0, and uses original short Russian summaries without novel text. Descriptions are deliberately sparse where the index only supplies an appearance label. No date, biography, or role was inferred beyond the chapter-page synopsis. Project files were not edited.

## Reconciliation

- Initial no-exact-match cast refs: **72**.
- New provisional cards in JSON: **62**.
- Existing-card locators to preserve: Brienne → `person:brienne-of-tarth` (ch.1 appearing, ch.13 mentioned); Tormund → `person:tormund-giantsbane` (ch.7 and ch.15 appearing); Arryk → `person:arryk-cargyll` and Erryk → `person:erryk-cargyll` (ch.6 appearing).
- Existing-card candidates requiring global alias reconciliation: Jon Umber (ch.14) may refer to `person:greatjon-umber`; Smalljon (ch.14) may refer to `person:jon-umber-son-of-jon`. Keep both as alias review until global resolver checks identity.
- Excluded office: High Septon (ch.19) is an unnamed office-holder, not a named person record.
- Alias review, no duplicate draft: Lord of Bones (ch.7, ch.15) is indexed as an alias/title associated with `person:rattleshirt`; identity boundary remains primary-verification pending.
- Ambiguous identity: `Ryk` (ch.7) and `Longspear Ryk` (ch.15) remain separate alias-review candidates, with their own source URLs. Do not create either card or merge them before primary verification.
- Canonical display/ref adjustments: AWOIAF `Donnel Hill` → candidate `Sweet Donnel Hill` / `person:donnel-hill`; AWOIAF `Lark` → `Lark the Sisterman` / `person:lark`. These are naming normalizations from the chapter synopsis, not primary-edition checks.

## Identity edge cases

- `Brown Bernarr` appears in the Prologue cast list; a later chapter index uses `Black Bernarr` as a mention. The draft keeps only the appearing locator and flags identity as unresolved; no second card is created.
- `Ryk` (ch.7) and `Longspear Ryk` (ch.15) are not drafted or merged; both remain independent alias-review rows pending primary verification.
- Sansa/Alayne and Catelyn/Lady Stoneheart are already represented by existing person cards; they are not new drafts.

## JSON contents

The entity-layer/1 payload contains 62 unique person refs. Each record includes the chapter-specific source URL(s), book/chapter locators, CC-BY-SA 3.0 attribution, source status, primary-check status, and a short original description. The JSON uses the package locator shape (`locators` with `book`, `chapterNo`, `chapterTitle`, `relation`, and `url`); each entity also carries `status: secondary-indexed-partial` and `verification.primaryBook: pending`.
