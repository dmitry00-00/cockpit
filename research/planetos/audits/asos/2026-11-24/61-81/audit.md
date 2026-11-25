# ASOS 61–81: read-only chapter-index audit

## Scope and source limits

This pass uses the prepared ASOS chapter register and AWOIAF chapter pages as a secondary index. It does not verify the selected novel edition. The package baseline is `.38` per task context; no ASOS coverage ledger is present, so every row is a proposed locator. Entries are `secondary-indexed-partial`, with primary verification pending. No novel text or unsupported absolute dates were copied or added; the project was not modified.

The main denominator is the full `Appearing` cast per chapter page, scene anchors (dream settings separated), priority events, and major groups/institutions. `deferred-mentions.csv` contains a selected continuity subset, not every incidental mention. Houses and taxonomy terms are not exhaustively transcribed. AWOIAF may list animals, aliases, remains, infants, or unnamed roles under characters; these are flagged for identity/type review.

## Register and coverage

Range 61–81 contains 21 locators: numbered chapters 61–80 and Epilogue 81. Chapters 61–80 use numeric `/A_Storm_of_Swords-Chapter_N` URLs; epilogue 81 uses canonical `/A_Storm_of_Swords-Epilogue`. Its register locator remains `chapterNo=81`; there is no `Chapter_81` page. Every CSV row carries its page URL.

- Main CSV: **465** relation rows; kinds `{'person': 259, 'unresolved-type': 27, 'place': 74, 'event': 62, 'organization': 43}`.
- Deferred mentions CSV: **106** selected mention rows.
- Current `.38` display-name matches: `{'present': 219, 'no confident package card match': 219, 'out-of-person-schema': 27}`. Match is conservative; absence of a match is not proof that no alias/card exists.
- Ledger status: no ASOS locator coverage file exists in the checkout, so none of the rows is labeled integrated/covered.

## Key state distinctions

- Ch. 61: Dontos is killed; Sansa’s removal from King’s Landing occurs. Petyr’s prior role in the Joffrey plot is revealed, not newly executed here.
- Ch. 63: Edric’s extraction is an occurred event. Davos challenges Stannis while attempting to redirect his choices; distinguish this from any future response.
- Ch. 64 and 69: military action beneath the Wall is separated from Jon’s later arrest. Chapter 69 also uses the captured Rattleshirt in the accusation.
- Ch. 66–70: Tyrion’s trial and trial-by-combat request precede Oberyn’s death. Do not merge the trial request, combat, death, and verdict into one event.
- Ch. 71: Daenerys’s choice to remain in Meereen and Jorah’s exile are distinct occurred/decision events.
- Ch. 73–79: Stannis defeats Mance’s force, later offers Jon lordship, and the Night’s Watch election concludes with Jon elected in ch.79. Offers/proposals and election are separate states.
- Ch. 80: Lysa’s attempted attack on Sansa and Petyr’s killing of Lysa are separate; the accusation against Marillion is framing, not the actual killer.
- Epilogue 81: Merrett’s hanging and the reveal of Catelyn as Lady Stoneheart are distinct. Lady Stoneheart is an alias/state of Catelyn, not a new person.
- Dream figures and non-person indexed appearances (direwolves, dragons, raven, horse, unnamed infants/roles) are not silently made into person cards.

## Remaining boundary

Before integration, check each stable ref against the live manifest and the chosen primary edition, especially room-level/unnamed locations and AWOIAF labels `Rugen`, `Alayne`, `Lady Stoneheart`, `Lord of Bones`, and the unnamed children/roles. Complete the peripheral mention, House, and full Places/Events denominator in a later pass; this file is not a full-book coverage claim.
