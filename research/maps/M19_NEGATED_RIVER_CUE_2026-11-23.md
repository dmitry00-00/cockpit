# M19 — explicit negation for through-town river cues, 2026-11-23

## Change

`inferSettlementRiverRoute` previously combined an independent river-name match with a positive verb/“through town” match. As a result, “Река не протекает через город” still satisfied the positive cues and generated an interior channel.

The bounded rule now rejects explicit Russian negations of the supported route verbs, including “не протекает / не проходит / не пересекает через…”, and constructions where the route is stated as “не через город”. It also rejects common English forms such as “does not flow through” and “isn't flowing through”. Other prose remains outside the rule and is not semantically interpreted.

This changes only whether an interior river route is generated. A description that mentions a river can still create the existing boundary water feature under the table-rule cues; its exact location remains governed by the existing bounded side rules.

## Verification and remaining work

No tests, typecheck, or browser run were performed for this slice. `git diff --check` is the only check run after the change.

M19 remains open for free-form prose interpretation, walls and terrain, the broader world-to-tactical scale path, the full visual matrix, and MapTool acceptance of the bridge-enabled export. No campaign plan was created or accepted.

## Follow-up, 2026-11-24 — explicit absence of water

`inferSettlementSiteFeature` now skips its bounded river cue when the description explicitly says `не у реки`, `не на реке`, `не рядом с рекой`, or `без реки`; equivalent phrases for “not by/near the river”, “without a river”, and “no river” are handled as well. The same narrow guard covers `без побережья`, `не на побережье`, `не у моря`, and `не на море`, plus bounded English coast forms. A separate positive feature still wins when present (for example, a description may reject a river and explicitly name a coast). This prevents an explicit negative cue from creating the generator’s default 60-foot boundary-water strip. It is not a general natural-language parser; other wording stays unsupported. No tests, typecheck, or browser run were performed.

## Follow-up, 2026-11-24 — Russian “нет X” forms

An additional static review found that `в городе нет реки` and `нет побережья` were not covered: the later positive substring check could still classify the water feature. The bounded denylist now also recognizes `нет реки` / `реки нет` / `нет рек` / `рек нет`, and `нет побережья` / `побережья нет` / `нет моря` / `моря нет`. Other prose remains unsupported; explicit positive cues can still independently classify a different feature. This is still a phrase list, not a general negation parser. Tests, typecheck and browser were not run.
