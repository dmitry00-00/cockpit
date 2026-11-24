# Q19 — exact choice-count slice and remaining gaps, 24.11.2026

## Exact local source and implementation

The class workbook `Копия файла _Копия Классы.xlsx_.xlsx` contains two option blocks with an explicit one-of statement and enumerated options:

- `Воин!A22` states to choose one fighting style; the options occupy `A23:K23` (11 entries).
- `Паладин!A23` has the same one-of statement; the options occupy `A24:G24` (7 entries).

`ClassGrid` already displayed the source wording and the option lists, but did not expose a normalized count. `ClassOptionBlock.choose` now carries `1` for these exact blocks; the importer assigns it only when the source text contains the exact one-of phrase. The UI shows “При каждом получении: выбрать 1 вариант.” This describes each acquisition and does not choose or record an option. Other blocks receive no count from their list length or from inferred progression.

## Remaining Q19 audit

- The local `Копия расы.xlsx` sheet `Нерасовые черты` has structured prerequisite columns for ability thresholds and spellcasting, plus prose in the source row; it has no dedicated race-prerequisite column. The current `FeatTable` separates the known level, race, and other requirement fields, leaves race as “Не размечена,” and keeps source text visible. No race field can be added from this table without interpreting prose.
- The class workbook stores subclass spell names in Russian. The local SRD spell snapshot contains English IDs/names. The existing exact audit found 413 unlinked subclass spell rows and 117 unlinked race/subrace spell rows; the only further direct relation found previously was the ten-spell Paladin Oath of Devotion list. No source-backed additional mappings were identified in this review.
- Existing UI already presents imported class option blocks, the direct SRD choice lists with explicit `choose`/option arrays, the Metamagic level schedule, Pact Boon options, Inventor starting equipment, and structured feat prerequisites. Do not infer counts for blocks whose source wording does not state them; list length alone is not a choice count.

No other class-option counts or spell links were added. The importer was edited but not run. Tests, typecheck, browser, and importers were not run. `TASKS.md` and `CURRENT_CONTEXT.md` were not edited.
