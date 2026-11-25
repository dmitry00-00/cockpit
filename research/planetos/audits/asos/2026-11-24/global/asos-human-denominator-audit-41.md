# ASOS `.41` human-appearance denominator audit

## Exact result

The global reconciliation contains **328 unique strict human-appearance refs** (`kind=person`, `human_denominator_included=yes`). Comparing against live `.41` person-card refs and applying accepted crosswalks yields **324 canonicalized identities**: **232 matched**, **89 true missing cards**, and **3 unresolved alias/type candidates**.

| Measure | Count |
|---|---:|
| Strict global refs | 328 |
| Direct live package ref matches | 231 |
| Accepted human crosswalk source IDs | 5 |
| Canonicalized unique identity candidates | 324 |
| Matched canonical identities | 232 |
| True missing cards | 89 |
| Unresolved alias/type candidates | 3 |

Four crosswalk aliases (`Arryk`, `Erryk`, `Tormund`, and the parent-confirmed `Jon Umber`) map to canonical refs already present as candidates, so they collapse into existing identity groups. `Aemon Targaryen` maps to the live `person:maester-aemon` card and adds one matched identity. Thus 328 source refs normalize to 324 identities. Of the 97 refs lacking exact cards, the five accepted mappings resolve the alias refs; four collapse with already-counted identities, leaving 92 unmatched identities.

All three P0 and all 86 P1 strict source refs resolve to live person cards by exact ref or accepted crosswalk. Remaining unmatched candidates are P2 or priority-not-specified.

## Accepted human crosswalks

| Source ref | Canonical `.41` ref | Decision | Locator chapters |
|---|---|---|---|
| `person:arryk` | `person:arryk-cargyll` | alias-normalization | Sansa I (ch. 6) |
| `person:erryk` | `person:erryk-cargyll` | alias-normalization | Sansa I (ch. 6) |
| `person:aemon-targaryen` | `person:maester-aemon` | identity-normalization | Jon VIII (ch. 64); Jon IX (ch. 69); Samwell IV (ch. 75); Samwell V (ch. 78); Jon XII (ch. 79) |
| `person:tormund` | `person:tormund-giantsbane` | identity-normalization | Jon I (ch. 7); Jon II (ch. 15); Jon X (ch. 73) |
| `person:jon-umber` | `person:greatjon-umber` | parent-confirmed-identity-normalization (parent-confirmed) | Catelyn II (ch. 14); Catelyn IV (ch. 35) |

Arryk and Erryk remain separate people; their crosswalks do not merge the twins. The Greatjon crosswalk resolves `person:jon-umber` to the existing `person:greatjon-umber` identity in Catelyn II and Catelyn IV. All crosswalk targets are present in `.41`.

## Unresolved alias/type cases (3)

| Ref | Name | Priority | Appearance locator(s) | Why not counted as a true missing card |
|---|---|---:|---|---|
| `person:ryk` | Ryk | not-specified | Jon I (ch. 7) | Earlier parent instruction: Ryk and Longspear Ryk remain separate unresolved IDs; no merge until primary-text review. |
| `person:longspear-ryk` | Longspear Ryk | not-specified | Jon II (ch. 15) | Earlier parent instruction: Ryk and Longspear Ryk remain separate unresolved IDs; no merge until primary-text review. |
| `person:high-septon` | High Septon | not-specified | Tyrion III (ch. 19) | The chapter index lists the office-holder as appearing, but it provides only the office title, not a stable named individual; prior card-draft direction was to exclude unnamed office-holders. |

The AWOIAF Daenerys III Character List separately lists Grazdan (fat one), Grazdan (spiked beard), Grazdan (tall one), and Grazdan mo Ullhor as appearing; the Grazdan mo Ullhor profile describes him as one of four named Grazdans. The three descriptor refs have therefore moved into true missing, each separate from mo Ullhor, while primary novel verification remains pending. Keep `Ryk` and `Longspear Ryk` separate per the earlier instruction; no accepted crosswalk exists for them. High Septon is listed as appearing by AWOIAF, but the candidate names only an office-holder, not a stable named person; prior direction excludes it from person-card creation.

## True missing cards (89)

| Ref | Name | Priority | Appearance chapter(s) |
|---|---|---:|---|
| `person:shagwell` | Shagwell | P2 | Jaime III (ch. 21); Jaime IV (ch. 31) |
| `person:timeon` | Timeon | P2 | Jaime III (ch. 21); Jaime IV (ch. 31) |
| `person:urswyck` | Urswyck | P2 | Jaime III (ch. 21); Jaime IV (ch. 31) |
| `person:zollo` | Zollo | P2 | Jaime III (ch. 21); Jaime IV (ch. 31) |
| `person:roone` | Roone | P2 | Arya IV (ch. 22) |
| `person:grazdan-mo-ullhor` | Grazdan mo Ullhor | P2 | Daenerys III (ch. 27) — separately listed among four Grazdan identities; primary verification pending. |
| `person:grazdan-fat-one` | Grazdan (fat one) | P2 | Daenerys III (ch. 27) — separately listed; primary verification pending. |
| `person:grazdan-spiked-beard` | Grazdan (spiked beard) | P2 | Daenerys III (ch. 27) — separately listed; primary verification pending. |
| `person:grazdan-tall-one` | Grazdan (tall one) | P2 | Daenerys III (ch. 27) — separately listed; primary verification pending. |
| `person:alyn-ambrose` | Alyn Ambrose | P2 | Sansa III (ch. 28) |
| `person:ermesande-hayford` | Ermesande Hayford | P2 | Sansa III (ch. 28) |
| `person:orton-merryweather` | Orton Merryweather | P2 | Sansa III (ch. 28) |
| `person:philip-foote` | Philip Foote | P2 | Sansa III (ch. 28); Tyrion V (ch. 38); Tyrion IX (ch. 66) |
| `person:bella` | Bella | P2 | Arya V (ch. 29) |
| `person:cass` | Cass | P2 | Arya V (ch. 29) |
| `person:helly` | Helly | P2 | Arya V (ch. 29) |
| `person:jyzene` | Jyzene | P2 | Arya V (ch. 29) |
| `person:lanna` | Lanna | P2 | Arya V (ch. 29) |
| `person:tansy` | Tansy | P2 | Arya V (ch. 29) |
| `person:errok` | Errok | P2 | Jon IV (ch. 30) |
| `person:amabel` | Amabel | P2 | Jaime IV (ch. 31) |
| `person:alan-of-rosby` | Alan of Rosby | P2 | Samwell II (ch. 33) |
| `person:bannen` | Bannen | P2 | Samwell II (ch. 33) |
| `person:byam-flint` | Byam Flint | P2 | Samwell II (ch. 33) |
| `person:ferny` | Ferny | P2 | Samwell II (ch. 33) |
| `person:fornio` | Fornio | P2 | Samwell II (ch. 33) |
| `person:garth-of-greenaway` | Garth of Greenaway | P2 | Samwell II (ch. 33) |
| `person:garth-of-oldtown` | Garth of Oldtown | P2 | Samwell II (ch. 33) |
| `person:orphan-oss` | Orphan Oss | P2 | Samwell II (ch. 33) |
| `person:rolley-of-sisterton` | Rolley of Sisterton | P2 | Samwell II (ch. 33) |
| `person:ronnel-harclay` | Ronnel Harclay | P2 | Samwell II (ch. 33) |
| `person:tim-stone` | Tim Stone | P2 | Samwell II (ch. 33) |
| `person:ulmer-of-the-kingswood` | Ulmer of the Kingswood | P2 | Samwell II (ch. 33); Jon XII (ch. 79) |
| `person:dennet` | Dennet | P2 | Arya VI (ch. 34) |
| `person:kyle` | Kyle | P2 | Arya VI (ch. 34); Arya VII (ch. 39) |
| `person:melly` | Melly | P2 | Arya VI (ch. 34) |
| `person:elmar-frey` | Elmar Frey | P2 | Jaime V (ch. 37) |
| `person:arron-qorgyle` | Arron Qorgyle | P2 | Tyrion V (ch. 38); Tyrion X (ch. 70) |
| `person:deziel-dalt` | Deziel Dalt | P2 | Tyrion V (ch. 38) |
| `person:dickon-manwoody` | Dickon Manwoody | P2 | Tyrion V (ch. 38) |
| `person:harmen-uller` | Harmen Uller | P2 | Tyrion V (ch. 38) |
| `person:jynessa-blackmont` | Jynessa Blackmont | P2 | Tyrion V (ch. 38) |
| `person:larra-blackmont` | Larra Blackmont | P2 | Tyrion V (ch. 38) |
| `person:merlon-crakehall` | Merlon Crakehall | P2 | Tyrion V (ch. 38) |
| `person:mors-manwoody` | Mors Manwoody | P2 | Tyrion V (ch. 38) |
| `person:myles-manwoody` | Myles Manwoody | P2 | Tyrion V (ch. 38) |
| `person:myria-jordayne` | Myria Jordayne | P2 | Tyrion V (ch. 38) |
| `person:perros-blackmont` | Perros Blackmont | P2 | Tyrion V (ch. 38) |
| `person:ryon-allyrion` | Ryon Allyrion | P2 | Tyrion V (ch. 38) |
| `person:tremond-gargalen` | Tremond Gargalen | P2 | Tyrion V (ch. 38) |
| `person:ulwyck-uller` | Ulwyck Uller | P2 | Tyrion V (ch. 38) |
| `person:beardless-dick` | Beardless Dick | P2 | Arya VII (ch. 39) |
| `person:merrit-o-moontown` | Merrit o' Moontown | P2 | Arya VII (ch. 39) |
| `person:mudge` | Mudge | P2 | Arya VII (ch. 39) |
| `person:notch` | Notch | P2 | Arya VII (ch. 39); Epilogue (ch. 81) |
| `person:utt` | Utt | P2 | Arya VII (ch. 39) |
| `person:watty-the-miller` | Watty the Miller | P2 | Arya VII (ch. 39) |
| `person:gerald-gower` | Gerald Gower | not-specified | Davos VI (ch. 63) |
| `person:lewys-the-fishwife` | Lewys the Fishwife | not-specified | Davos VI (ch. 63) |
| `person:omer-blackberry` | Omer Blackberry | not-specified | Davos VI (ch. 63) |
| `person:triston-of-tally-hill` | Triston of Tally Hill | not-specified | Davos VI (ch. 63) |
| `person:arron` | Arron | not-specified | Jon VIII (ch. 64) |
| `person:emrick` | Emrick | not-specified | Jon VIII (ch. 64) |
| `person:jack-bulwer` | Jack Bulwer | not-specified | Jon VIII (ch. 64) |
| `person:red-alyn-of-the-rosewood` | Red Alyn of the Rosewood | not-specified | Jon VIII (ch. 64) |
| `person:spotted-pate-of-maidenpool` | Spotted Pate of Maidenpool | not-specified | Jon VIII (ch. 64) |
| `person:zei` | Zei | not-specified | Jon VIII (ch. 64) |
| `person:ardrian-celtigar` | Ardrian Celtigar | not-specified | Tyrion IX (ch. 66) |
| `person:galyeon-of-cuy` | Galyeon of Cuy | not-specified | Tyrion IX (ch. 66) |
| `person:josmyn-peckledon` | Josmyn Peckledon | not-specified | Tyrion IX (ch. 66) |
| `person:jothos-slynt` | Jothos Slynt | not-specified | Tyrion IX (ch. 66) |
| `person:bryen` | Bryen | not-specified | Sansa VI (ch. 68) |
| `person:grisel` | Grisel | not-specified | Sansa VI (ch. 68) |
| `person:kella` | Kella | not-specified | Sansa VI (ch. 68) |
| `person:umfred` | Umfred | not-specified | Sansa VI (ch. 68) |
| `person:glendon-hewett` | Glendon Hewett | not-specified | Jon IX (ch. 69) |
| `person:tim-tangletongue` | Tim Tangletongue | not-specified | Jon IX (ch. 69) |
| `person:wynton-stout` | Wynton Stout | not-specified | Jon IX (ch. 69) |
| `person:ghael` | Ghael | not-specified | Daenerys VI (ch. 71) |
| `person:arrowhead` | Arrowhead | not-specified | Jon X (ch. 73) |
| `person:harma` | Harma | not-specified | Jon X (ch. 73) |
| `person:quenn` | Quenn | not-specified | Jon X (ch. 73) |
| `person:torwynd` | Torwynd | not-specified | Jon X (ch. 73) |
| `person:polliver` | Polliver | not-specified | Arya XIII (ch. 74) |
| `person:ternesio-terys` | Ternesio Terys | not-specified | Arya XIII (ch. 74) |
| `person:lester` | Lester | not-specified | Tyrion XI (ch. 77) |
| `person:lum` | Lum | not-specified | Tyrion XI (ch. 77) |
| `person:emmett` | Emmett | not-specified | Jon XII (ch. 79) |
| `person:petyr-frey` | Petyr Frey | not-specified | Epilogue (ch. 81) |

The detailed JSON includes all matched identity refs, exact missing source IDs with chapter URLs, and the accepted crosswalk decisions. The Grazdan distinction follows the AWOIAF [Daenerys III chapter index](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_27) and [Grazdan mo Ullhor profile](https://awoiaf.westeros.org/index.php/Grazdan_mo_Ullhor); no primary-book verification has been performed.

## Matched refs that still need role/identity care

- `person:quaithe` — Card exists; AWOIAF/ledger context mixes appearing and dream-related interpretation. Preserve the existing card, but keep locator role for primary review.
- `person:rattleshirt` — Card exists; prior instruction keeps the Lord of Bones/Rattleshirt identity boundary under review and forbids a new duplicate/merge before primary review.
- `person:greatjon-umber` — Card exists; distinct from Smalljon Umber. Keep both refs separate.
- `person:smalljon-umber` — Card exists; distinct from Greatjon Umber. Keep both refs separate.

Crosswalk rows outside the strict human denominator include type corrections for Night’s Watch → organization and Mole’s Town → place, plus the unresolved Brown Ben Plumm alias-review. They are not counted as human appearance candidates.

## Method and limitations

The denominator is the 328 unique global IDs selected by the strict human-appearance flag. Live refs were read from all `.41` Planetos content layers, not inferred from card names. The `.40` crosswalk was applied only for accepted person alias/identity mappings whose target card exists in `.41`; the parent-confirmed Jon Umber mapping was also applied. Type-correction and alias-review-without-target rows were not treated as accepted human matches. `package_refs` was checked against the live inventory and did not create additional non-exact person matches.

This is a ref-completeness audit, not a primary-text verification that each indexed appearance is accurate. The source-status and unresolved notes in JSON preserve that distinction. No project files were modified.
