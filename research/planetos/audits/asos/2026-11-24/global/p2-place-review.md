# ASOS P2 place gaps — `.41` review

## Result

The `.41` card-gap CSV contains **one** P2 place candidate: `place:flea-bottom`. It is absent from current `.41` place layers and does not appear in the previous P1 triage. Propose **one short draft card**.

| Ref | Decision | Locator relation | Reason |
|---|---|---|---|
| `place:flea-bottom` | Add P2 place card | `places_referenced_ids` / `reference`, Tyrion VI (Chapter 53) | Durable named urban district of King’s Landing; the chapter references a brawl there, but its main scene is in King’s Landing, so do not mark Flea Bottom as the scene setting. |

[AWOIAF numeric chapter locator](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_53) · [AWOIAF place entry](https://awoiaf.westeros.org/index.php/Flea_Bottom)

## Draft and validation

The JSON payload includes an `entity-layer/1` place card linked to the existing `place:kings-landing`. It is marked `secondary-indexed-partial`, CC-BY-SA 3.0 attributed, and `verification.primaryBook: pending`. The chapter ledger field is `places_referenced_ids` and the card locator relation is `reference`, not `scene`; no coordinates or dates were added. The link is a standard cross-reference to King’s Landing, not a separate parent field.

Checked against current `.41` content refs and `/private/tmp/planetos-asos-places-p1-remain-2026-11-24/remaining-p1-place-triage.json`: the ref is missing from `.41`, the parent link resolves, and there is no P1-triage overlap.

## Source limits

The chapter index locates the relevant incident in Flea Bottom; the place entry supports its status as a named district within King’s Landing. This is secondary indexing only; verify the chapter locator and Russian display name against the selected novel edition before integration.
