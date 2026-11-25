# ACOK 46–69 — triage unmatched candidate refs

## Scope and limits

Проверены все `unmatchedCandidateRefs` в `ledger-proposals.json` против зарегистрированных entity layers Planetos `.31` и страниц числового chapter index AWOIAF. Страница главы — вторичный индекс и редакционный synopsis; он полезен для разделения appearing/mentioned/dream/scene, но не заменяет сверку с выбранным изданием романа. Даты не выводились. Все карточки в additions имеют статус `secondary-indexed-partial`, attribution CC-BY-SA 3.0 и numeric locators. Русские передачи имён рабочие.

## Resolutions against .31

- **Vyman:** `person:maester-vyman` — неверный ref-кандидат. В .31 уже есть `person:vyman` / Vyman. Ch55 отмечает появление Maester Vyman; добавить локатор к существующей карточке, новую не создавать. [Catelyn VII, ch55](https://awoiaf.westeros.org/index.php/A_Clash_of_Kings-Chapter_55)
- **City Watch:** ref `organization:city-watch-of-kings-landing` неверный; в .31 уже есть `organization:kings-landing-city-watch`. Переиспользовать его для ch49/59.
- **Reek:** ch50 и ch56 обозначают человека под именем Reek; ch66 AWOIAF говорит, что он раскрывается как Ramsay Snow, а `person:ramsay-snow` уже существует в .31. Не создавать отдельную карточку Reek и не переписывать ранние appearance как будто имя раскрыто в той сцене: сохранить display alias, а `aliasOf`/identity link оставить **unresolved pending primary-text check**. [Theon IV, ch50](https://awoiaf.westeros.org/index.php/A_Clash_of_Kings-Chapter_50), [Theon V, ch56](https://awoiaf.westeros.org/index.php/A_Clash_of_Kings-Chapter_56), [Theon VI, ch66](https://awoiaf.westeros.org/index.php/A_Clash_of_Kings-Chapter_66)
- **Lord of Bones / Rattleshirt:** Chapter 68’s secondary character list calls the appearing figure “Lord of Bones”; prior delta candidate `person:rattleshirt` is not itself in `.31`, but connecting these labels is an identity/alias inference. Keep that relation **unresolved** until primary verification; do not add a duplicate character or silently convert the chapter locator. [Jon VIII, ch68](https://awoiaf.westeros.org/index.php/A_Clash_of_Kings-Chapter_68)
- **Orell:** ch51's character list includes Orell, but ch53 describes a skinchanger’s eagle in the scene and ch68 lists Orell only as mentioned. Treat ch51 as possible indirect skinchanger/animal appearance, not an unambiguous physical appearance of Orell; no new card.
- **High Septon:** AWOIAF lists this title as appearing in ch49; this is an office-holder label without a named identity in the candidate. Do not create a new person record from the office title. Ch60 only mentions the office-holder.
- **Aegon Targaryen:** in the relevant ch48 row this is a dream/vision or recalled identity, not a physical appearance in Daenerys’s scene. Do not count it as appearing. Verify which Aegon before assigning any alias.

## Shortlist — 15 entity additions

These are named, useful appearances absent from `.31`; they are split by kind in the additions JSON files. P1 reflects campaign relevance; P2 reflects a useful recurring/family NPC or recognizable scene actor. This is a shortlist, not a claim that all low-level cast members need cards.

### People

| Candidate ref | Priority | Evidence in range | GM use |
|---|---:|---|---|
| `person:vargo-hoat` | P1 | Appears ch47; mentioned ch64 | Mercenary commander involved in Harrenhal’s power shift; recurring antagonist. |
| `person:qyburn` | P1 | Appears ch64 | Roose’s adviser in the chapter; later a distinctive political and medical operator. |
| `person:jacelyn-bywater` | P1 | Appears ch49 | City Watch commander tied to Tyrion’s defense of King’s Landing. |
| `person:wex-pyke` | P2 | Appears ch50, ch56, ch66 | Recurrent witness and messenger within Theon’s Winterfell arc. |
| `person:hot-pie` | P2 | Appears ch47, ch64 | Companion of Arya and Gendry who remains relevant in travel/scenes. |
| `person:biter` | P2 | Appears ch47; mentioned ch64 | Distinctive released prisoner and later recurring threat; low scene count in this range. |
| `person:rorge` | P2 | Appears ch47; mentioned ch64 | Companion to Biter among the freed captives; recurring threat. |
| `person:osfryd-kettleblack` | P2 | Appears ch54, ch57, ch60 | Repeated court/guard NPC who reports battle conditions and carries out orders. |
| `person:osney-kettleblack` | P2 | Appears ch54, ch60 | Repeated court/guard NPC who delivers battle reports. |
| `person:osmund-kettleblack` | P2 | Appears ch49, ch57; mentioned ch54 | Kingsguard member; the earlier ledger missed both ch49 and ch57 appearance candidates. |
| `person:allard-seaworth` | P2 | Appears ch58 | Davos’s son in the fleet scene; adds family stakes to the battle. |
| `person:dale-seaworth` | P2 | Appears ch58 | Davos’s son and crew member. |
| `person:matthos-seaworth` | P2 | Appears ch58 | Davos’s son and close shipboard companion. |

### Organization

- `organization:house-bolton` — **P1**, referenced across ch47, ch64, ch66; House Bolton is a missing faction-level card, not just a character alias. Link Roose and the Harrenhal/Winterfell conflict.

### Event

- `event:arya-escapes-harrenhal` — **P1**, occurs ch64: Arya, Gendry, and Hot Pie leave the castle. It is distinct from Arya/Jaqen’s earlier prisoner liberation in ch47 and has immediate play value as a stealth/escape sequence.

## Other real appearances not selected for new cards

- **Black Lorren:** genuine appearances ch46 and ch66, with an intervening mention ch50; a viable P2 Theon companion, but excluded from the 15-item cap. If the Ironborn sub-roster matters, add him next.
- **Aenys Frey, Kyra, Cley Cerwyn:** genuine one-chapter appearances in this range, but their immediate utility/recurrence is lower than the shortlist.
- **Ebben and Stonesnake:** repeatedly appear around the Skirling Pass (ch51/53/68), but serve mainly as members of Qhorin’s patrol. The person cards may be deferred unless the Northern expedition roster needs individual tracking.
- **Rivermaster’s? Maester Vyman** is not a missing entity: see corrected existing ref above.

## Mention / dream / alias / role / location triage

- **Mention-only, so not appearance cards based on this range:** Imry Florent, Salladhor Saan, Bael the Bard, Garlan Tyrell; likewise Aenys Frey etc. only where that chapter lists them in `Mentioned` rather than `Appearing`.
- **Collective/group candidates:** `organization:wildlings` is too broad and not a stable organization for one card; `organization:royal-fleet` denotes a fleet in a scene, not a persistent faction. `organization:thirteen-of-qarth` is not confirmed as an appearing entity here; the page uses other Qartheen group labels. Defer all three.
- **Physical scene places vs dream places:** Winterfell Great Hall / Godswood, Red Keep godswood, Riverrun dungeon, Blackwater Rush, Qarth port and Harrenhal godswood are scene locators/subplaces, not people/orgs/events; use existing parent place refs or add a proper place layer in a separate decision. The House with the Red Door and Tyrion’s Sunset Sea cottage are dream/vision settings; never imply they are physical locations visited in these scenes.
- **Plans/contingencies, not completed events:** Theon’s search for Bran/Rickon (ch50), the Sansa–Dontos escape plan (ch52/65), Theon’s order sending Reek to find men (ch56), Cersei’s siege/capture fears (ch60), and the ship/dragon negotiations in Qarth (ch63). These may be tracked as plans, offers or scene facts, but should not be imported as occurred events. The actual arrival of Illyrio’s envoys and delivery of his proposal in ch63 is a scene beat; a standalone event card is optional and would overlap the existing Daenerys ch63 encounter/assassination card.

## Ledger defects exposed by this triage

1. Ch49 AWOIAF lists **Osmund Kettleblack** as appearing; the previous ledger row omitted him.
2. Ch57 lists **Osfryd Kettleblack** and **Osmund Kettleblack** as appearing; the previous ledger row omitted both.
3. Ch60 lists **Osfryd** and **Osney Kettleblack** as appearing; the previous row omitted both.
4. Ch54 row already has Osfryd and Osney appearances; add their ch57/ch60 locators for Osfryd and ch60 for Osney.
5. Ch64’s Arya escape sequence is an occurred event, not merely a referenced event. The existing `event:arya-escapes-harrenhal` is included as a delta candidate in the additions JSON.
6. Replace the false-unmatched Vyman and City Watch refs with exact existing `.31` refs. Keep Reek/Ramsay and Lord of Bones/Rattleshirt identity links unresolved until primary text review.

## Additions files

- `ledger-proposals-corrected.json` — отдельная исправленная копия 24 ledger rows; добавляет пропущенные появления Kettleblack, исправляет точные refs Vyman/City Watch, меняет ch64 escape на occurred event и явно сохраняет alias ambiguity Reek / Lord of Bones. Исходный `ledger-proposals.json` не менялся.
- `unmatched-people-additions.json` — 13 people.
- `unmatched-organizations-additions.json` — 1 organization.
- `unmatched-events-additions.json` — 1 event.

Every proposed record cites its exact numeric AWOIAF chapter page, `bookId=acok`, `chapterNo`, CC-BY-SA-3.0, and pending primary-edition verification. No project files were edited.


## Follow-up integration `.33`

Проверены и интегрированы 14 полезных карточек/сущностей по открытым кандидатам: 8 персонажей (Kyra, Black Lorren, Ebben, Stonesnake, Bael the Bard как герой легенды, Imry Florent как упомянутый командир, Aenys Frey, Garlan Tyrell), место Blackwater Rush и 5 записей событий/планов. Добавлены поиск Брана и Рикона, план побега Сансы и Донтоса, поручение Теона Рику искать защитников, распоряжения Серсеи во время битвы и встреча посланников Иллирио с Дейенерис. Планы и условные угрозы помечены как планы, а не исполненные исходы.

Сильное предположение прежнего кандидата `event:illyrio-offers-ships-to-daenerys` заменено более узким `event:illyrio-envoys-meet-daenerys`: глава подтверждает посланников, их прибытие и слова о намерениях Иллирио, но отдельное обещание отдать Дейенерис флот мы не утверждаем. Blackwater Rush добавлен как отдельное место сцены без координат. На момент выпуска `.33` 21 контекст имел итоговую классификацию; девять оставались открытыми. Их дальнейший исход описан в разделе `.34` ниже. См. `acok-candidate-triage-2026-11-24.csv` и обновлённый ACOK chapter ledger. Все новые записи остаются `secondary-indexed-partial`; выбранное издание не проверялось.


## Follow-up integration `.34`

Орелл добавлен отдельной карточкой как упомянутый в Jon VIII; прежняя запись об его появлении в Jon VI остаётся с оговоркой: указатель связывает имя с орлом, но присутствие самого человека в сцене не подтверждено первичным текстом. Остальные кандидаты получили явную редакторскую disposition. Реестр переименован в `acok-candidate-triage-2026-11-24.csv`: теперь все 30 контекстов имеют решение, включая 8 сознательных исключений/отложенных записей. Это закрывает triage-список, но не denominator всех ACOK глав и не полную проверку издания.
