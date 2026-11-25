# M19: generation profile v2 — 2026-11-05

## Change

The settlement draft generator now accepts an optional author description, population, and layout pattern. The generated draft stores those exact inputs plus the resolved pattern as `generationProfile`; the profile is part of deterministic seed material and is validated with the rest of the draft.

- Population selects a declared table-rule band: below 1,000; 1,000–9,999; 10,000 and above. Bands change the generated grid size and the range of building footprints. Empty population keeps the previous default scale.
- Auto pattern recognizes a small vocabulary: `вдоль` / `линейный` selects a three-column linear plan; `компактный` selects a tighter grid. Unsupported description text is retained in the profile and does not silently become generated facts.
- The editor exposes description, population, and an explicit pattern override in a collapsed “Параметры генерации” section. Regeneration replaces the local draft after confirmation when edits exist. It does not write campaign state; the existing explicit proposal is still required to accept a plan.
- Generator version is now `m19-city-v2`. Previously accepted snapshots remain parseable and are not rewritten.

All generated geometry remains `table-rule`; these bands do not claim canonical settlement density or layout. This does not generate actual rivers, walls, or terrain from prose.

## Verification

- `node_modules/.bin/vite-node .m19-check.ts` (temporary file removed): passed 24 profiles across population bands and descriptions; deterministic equality, profile validation, grid scaling, footprint ranges, and pattern inference were checked.
- `npx tsc --noEmit -p tsconfig.app.json`: passed.
- `git diff --check -- ...`: passed for the touched implementation/test files.
- Targeted Vitest invocations remained at `RUN v3.2.7` without test output; they were interrupted. No passing Vitest result is claimed.
- CUA visual/function check on the in-memory M19 QA harness at 1270×718: after restoring the plan styles, the overview map and building panel rendered; entering “поселение вдоль старого тракта” and population 500 then regenerating showed the linear form and changed output to 8 buildings in a 570×750 ft plan. No campaign state was accepted or changed. The profile disclosure was checked expanded and collapsed.

## Still open

M19 remains partial. The full viewport/125% visual matrix is still outstanding; the generation controls received one browser check at 1270×718. The description vocabulary intentionally covers only two layout hints; richer descriptions need additional explicit, reviewable rules. External-door UVTT export/import was separately verified in `M19_EXTERIOR_DOOR_2026-11-05.md`.
