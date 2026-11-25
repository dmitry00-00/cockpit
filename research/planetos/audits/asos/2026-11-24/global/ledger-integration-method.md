# ASOS chapter ledger draft

## Scope and method

- Package baseline: **2026.11.24.39**, **64 layers**, **998 resolvable entity refs**, read from the project package manifest and its declared layers. The resulting ledger is now integrated at `research/planetos/asos-chapter-coverage.csv`; this note records the preparation method, not a read-only state of the checkout.
- Chapter register: `research/planetos/asos-chapter-register-2026-11-24.csv`, exactly 82 rows for chapter numbers 0–81 (Prologue, chapters 1–80, Epilogue); each appears exactly once in the ledger draft.
- Candidate inputs: all four ASOS range audits and `global-reconciliation.csv` archived under `research/planetos/audits/asos/2026-11-24/`.
- AWOIAF chapter pages are secondary finding aids. Rows are marked `secondary-indexed-partial`; primary-edition verification is pending. No novel text is reproduced.
- Added links require a clear relation and a ref resolvable in current .39. `card-gaps.csv` lists clear candidate relations whose canonical card is absent in .39. Ambiguous candidate mappings and uncertain roles are excluded to `excluded-ambiguous.csv`, with source row and reason.
- Candidate coverage is intentionally partial, not a complete denominator: the 41–60 pass is selective, mention lists are curated, and source audits omit some aliases, animals, unnamed roles, and uncertain collective types. Do not interpret blank cells or the gap list as proof of absence.
- People appearing, people in dreams, mentions, scene places, dream places, place references, organizations, occurred events, and referenced events are kept in separate fields. Events are marked occurred only when the indexed relation explicitly begins with occurrence; reports, plans, history, and recollection are referenced. Dream/prophecy events are excluded because the schema has no event-dream field.

## Totals

- Ledger rows: **82**, chapter numbers 0–81 exactly once.
- Ledger links: **928**; by field: people_appearing_ids=591, people_in_dream_ids=1, people_mentioned_ids=180, scene_place_ids=105, places_in_dream_ids=3, places_referenced_ids=6, organization_ids=15, events_occurred_ids=12, events_referenced_ids=15.
- Clear missing-card gaps: **398** unique `(global_id, chapter, field)` rows.
- Excluded/ambiguous source rows: **160**.
- QA: every ledger ref resolves in .39; no duplicates occur inside a field.

## Limits

The secondary index does not establish primary-text facts, exact scene boundaries beyond its classification, chronology dates, or exhaustive mention coverage. Review links against the chosen edition before treating them as definitive. The accompanying card-gap and excluded-candidate CSVs describe the `.39` integration baseline; regenerate them after new cards or ledger links are added.
