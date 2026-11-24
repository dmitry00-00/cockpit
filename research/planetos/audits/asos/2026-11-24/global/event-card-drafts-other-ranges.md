# ASOS event-card drafts: ranges 0–20, 41–60, 61–81

## Scope and source limits

Сопоставлены `global-reconciliation.csv`, локальные аудиты трёх диапазонов и Planetos `.38` в checkout `/Users/dmitrij/.codex/worktrees/d10-downtime-integration/cockpit`. AWOIAF — вторичный chapter index по CC BY-SA 3.0; он помогает с локаторами и краткими синопсисами, но не заменяет сверку романа. Для всех карточек указано `secondary-indexed-partial`, а `verification.primaryBook=pending`. Точная абсолютная дата не выводится из порядка глав. Текст романа не копировался. Проект не изменялся.

Сверены и исключены уже имеющиеся карточки `.38` и все 13 черновых ID диапазона 21–40. Планы, сообщения, незавершённые действия и ретроспективные сведения имеют отдельное значение `locators[].relation`; их нельзя выдавать за свершившийся факт.

## Итог

- Входной фильтр global reconciliation: **65** отсутствующих P0/P1 event refs из заданных диапазонов.
- Черновых карточек: **60**; приоритеты {'P1': 59, 'P0': 1}; распределение по диапазонам {'61-81': 36, '0-20': 8, '41-60': 16}.
- Исключено как уже покрытое/дублирующее: **5**; нормализовано из составных candidate refs: **2**.
- Уникальных output refs: **60**; конфликтов с `.38`: 0; конфликтов с 21–40 drafts: 0; неразрешённых ссылок: 0.
- Связи locator: `{'occurred-per-synopsis': 42, 'occurred-revelation': 2, 'plan-or-intelligence': 1, 'reported-message': 5, 'occurred-as-recounted': 1, 'occurred-decision-pending': 1, 'occurred-revelation-and-decision': 1, 'occurred-attempt': 2, 'occurred-and-framed': 1, 'occurred-retrospective-justice': 1, 'planned-only': 1, 'occurred-in-progress': 1, 'occurred-and-mission-assigned': 1}`.

## Черновые карточки

- `event:arya-and-sandor-fight-polliver-tickler-and-the-squire-at-the-crossroads-inn` — Arya and Sandor fight Polliver, Tickler, and the squire at the crossroads inn — P1; Arya XIII (глава 74), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_74).
- `event:arya-kills-polliver-tickler-and-the-squire` — Arya kills Polliver, Tickler, and the squire — P1; Arya XIII (глава 74), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_74).
- `event:arya-leaves-sandor-and-secures-passage-toward-braavos` — Arya leaves Sandor and secures passage toward Braavos — P1; Arya XIII (глава 74), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_74).
- `event:aryas-party-is-captured-by-the-brotherhood-without-banners` — Arya’s party is captured by the Brotherhood without Banners — P1; Arya II (глава 13), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_13).
- `event:barristan-reveals-himself-to-daenerys` — Barristan reveals his identity — P1; Daenerys V (глава 57), `occurred-revelation`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_57).
- `event:barristan-selmy-swears-himself-to-daenerys` — Barristan Selmy swears himself to Daenerys — P1; Daenerys VI (глава 71), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_71).
- `event:bran-group-crosses-black-gate` — Bran’s group passes through the Black Gate — P1; Bran IV (глава 56), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_56).
- `event:brienne-is-arrested` — Brienne is arrested — P1; Jaime VII (глава 62), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_62).
- `event:brown-ben-reveals-meereen-sewer-route` — Brown Ben reveals a sewer route into Meereen — P1; Daenerys V (глава 57), `plan-or-intelligence`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_57).
- `event:report-of-balon-death-and-euron-return` — Captain reports Balon’s death and Euron’s return — P1; Catelyn V (глава 45), `reported-message`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_45).
- `event:daenerys-exiles-jorah-mormont` — Daenerys exiles Jorah Mormont — P1; Daenerys VI (глава 71), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_71).
- `event:dalla-gives-birth-during-the-attack` — Dalla gives birth during the attack — P1; Jon X (глава 73), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_73).
- `event:davos-and-loyal-men-remove-edric-storm-from-dragonstone` — Davos and loyal men remove Edric Storm from Dragonstone — P1; Davos VI (глава 63), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_63).
- `event:davos-confronts-stannis-over-edric-and-melisandres-prophecy` — Davos confronts Stannis over Edric and Melisandre’s prophecy — P1; Davos VI (глава 63), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_63).
- `event:davos-is-taken-into-custody` — Davos is taken into custody — P1; Davos II (глава 10), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_10).
- `event:davos-reads-aemons-warning-letter` — Davos reads Aemon’s letter about the Fist and the Wall — P1; Davos V (глава 54), `reported-message`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_54).
- `event:davos-survives-the-battle-of-the-blackwater-and-is-rescued` — Davos survives the Battle of the Blackwater and is rescued — P1; Davos I (глава 5), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_5).
- `event:dontos-hollard-is-killed-and-his-skiff-burned` — Dontos Hollard is killed and his skiff burned — P1; Sansa V (глава 61), `occurred-as-recounted`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_61).
- `event:jaime-frees-tyrion-from-the-black-cells` — Jaime frees Tyrion from the black cells — P1; Tyrion XI (глава 77), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_77).
- `event:jaime-returns-to-kings-landing` — Jaime returns to King’s Landing — P1; Jaime VII (глава 62), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_62).
- `event:jaime-tests-and-instructs-the-kingsguard-under-his-command` — Jaime tests and instructs the Kingsguard under his command — P1; Jaime VIII (глава 67), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_67).
- `event:janos-slynt-and-alliser-thorne-arrest-jon` — Janos Slynt and Alliser Thorne arrest Jon — P1; Jon IX (глава 69), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_69).
- `event:jarman-reports-mances-host-to-castle-black` — Jarman Buckwell reports Mance’s host at the Wall — P1; Jon VI (глава 48), `reported-message`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_48).
- `event:jon-asks-for-time-and-does-not-accept-the-offer` — Jon asks for time and does not accept the offer — P1; Jon XI (глава 76), `occurred-decision-pending`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_76).
- `event:jon-escapes-thenns-at-queenscrown` — Jon escapes the raiding party at Queenscrown — P1; Jon V (глава 41), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_41).
- `event:jon-snow-is-elected-the-998th-lord-commander-of-the-nights-watch` — Jon Snow is elected the 998th Lord Commander of the Night’s Watch — P1; Jon XII (глава 79), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_79).
- `event:jorah-spying-exposed-and-dismissed` — Jorah’s spying is exposed; Daenerys dismisses him — P1; Daenerys V (глава 57), `occurred-revelation-and-decision`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_57).
- `event:lysa-attempts-to-kill-sansa-at-the-moon-door` — Lysa attempts to kill Sansa at the Moon Door — P1; Sansa VII (глава 80), `occurred-attempt`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_80).
- `event:mance-rayder-is-captured-and-harma-dogshead-is-killed` — Mance Rayder is captured and Harma Dogshead is killed — P1; Jon X (глава 73), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_73).
- `event:marillion-attempts-to-assault-sansa-and-is-stopped` — Marillion attempts to assault Sansa and is stopped — P1; Sansa VI (глава 68), `occurred-attempt`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_68).
- `event:mero-attacks-daenerys-and-is-killed` — Mero attacks Daenerys and is killed by Barristan — P1; Daenerys V (глава 57), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_57).
- `event:merrett-frey-is-hanged-by-the-brotherhood-without-banners` — Merrett Frey is hanged by the Brotherhood without Banners — P1; Epilogue (глава 81), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Epilogue).
- `event:oberyn-agrees-to-champion-tyrion` — Oberyn agrees to champion Tyrion — P1; Tyrion IX (глава 66), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_66).
- `event:olenna-and-margaery-probe-sansa-about-joffrey` — Olenna and Margaery probe Sansa about Joffrey — P1; Sansa I (глава 6), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_6).
- `event:belwas-kills-oznak-zo-pahl` — Oznak zo Pahl is killed in single combat — P1; Daenerys V (глава 57), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_57).
- `event:petyr-baelish-and-lysa-arryn-marry-at-his-tower` — Petyr Baelish and Lysa Arryn marry at his tower — P1; Sansa VI (глава 68), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_68).
- `event:petyr-baelish-kills-lysa-arryn-and-blames-marillion` — Petyr Baelish kills Lysa Arryn and blames Marillion — P1; Sansa VII (глава 80), `occurred-and-framed`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_80).
- `event:rattleshirt-is-presented-as-evidence-against-jon` — Rattleshirt is presented as evidence against Jon — P1; Jon IX (глава 69), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_69).
- `event:red-wedding-responsibility-is-judged-by-the-brotherhood` — Red Wedding responsibility is judged by the Brotherhood — P1; Epilogue (глава 81), `occurred-retrospective-justice`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Epilogue).
- `event:river-galley-intercepts-the-skiff-and-is-sunk` — River galley intercepts the skiff and is sunk — P1; Jaime I (глава 1), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_1).
- `event:robb-executes-rickard-karstark` — Robb executes Rickard Karstark — P1; Catelyn III (глава 20), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_20).
- `event:robb-plans-to-name-jon-heir` — Robb plans to legitimize Jon and name him heir — P1; Catelyn V (глава 45), `planned-only`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_45).
- `event:roose-reports-theon-held-by-ramsay` — Roose reports Ramsay holds Theon — P1; Catelyn VI (глава 49), `reported-message`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_49).
- `event:sam-kills-an-other-with-dragonglass` — Sam kills an Other with dragonglass — P1; Samwell I (глава 18), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_18).
- `event:sandor-and-arya-take-work-in-a-foothills-village` — Sandor and Arya take work in a foothills village — P1; Arya XII (глава 65), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_65).
- `event:sansa-is-taken-from-kings-landing-by-petyr-baelish` — Sansa is taken from King’s Landing by Petyr Baelish — P1; Sansa V (глава 61), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_61).
- `event:small-paul-is-killed-by-an-other` — Small Paul is killed by an Other — P1; Samwell I (глава 18), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_18).
- `event:stanniss-forces-attack-and-defeat-mances-host` — Stannis’s forces attack and defeat Mance’s host — P1; Jon X (глава 73), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_73).
- `event:tyrion-demands-trial-by-combat` — Tyrion demands trial by combat in King’s Landing — P1; Tyrion IX (глава 66), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_66).
- `event:tyrion-is-taken-to-the-black-cells-after-the-verdict` — Tyrion is taken to the black cells after the verdict — P1; Tyrion X (глава 70), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_70).
- `event:tyrion-kills-shae-in-the-red-keep` — Tyrion kills Shae in the Red Keep — P1; Tyrion XI (глава 77), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_77).
- `event:tywin-receives-coded-report-of-robb-death` — Tywin’s court receives coded news of Robb’s death — P1; Tyrion VI (глава 53), `reported-message`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_53).
- `event:varys-helps-tyrion-escape-by-ship` — Varys helps Tyrion escape by ship — P1; Tyrion XI (глава 77), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_77).
- `event:wights-attack-sam-and-gilly-at-whitetree` — Wights attack Sam and Gilly at Whitetree — P1; Samwell III (глава 46), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_46).
- `event:attack-on-castle-black` — Wildlings attack Castle Black — P0; Jon VII (глава 55), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_55).
- `event:ygritte-dies-at-castle-black` — Ygritte dies during the attack — P1; Jon VII (глава 55), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_55).
- `event:davos-begins-to-read-the-nights-watch-letter-to-stannis` — Davos begins reading the Night’s Watch letter to Stannis — P1; Davos VI (глава 63), `occurred-in-progress`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_63).
- `event:jaime-gives-brienne-the-valyrian-sword-later-named-oathkeeper-and-asks-her-to-find-the-stark-girls` — Jaime gives Brienne a Valyrian sword and asks her to find the Stark girls — P1; Jaime IX (глава 72), `occurred-and-mission-assigned`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_72).
- `event:tyrions-trial-begins-and-testimony-is-presented` — Tyrion’s trial begins and testimony is presented — P1; Tyrion IX (глава 66), `occurred-per-synopsis`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_66).
- `event:gregor-clegane-confesses-to-elias-martells-death` — Gregor Clegane confesses to Elia Martell’s death — P1; Tyrion X (глава 70), `occurred-revelation`; [AWOIAF](https://awoiaf.westeros.org/index.php/A_Storm_of_Swords-Chapter_70).

## Исключения и нормализации

- `event:attack-on-castle-black-and-battle-beneath-the-wall` — Глава 69 возвращается к событиям у Стены; перекрывается с уже имеющимися attack-on-castle-black (гл.55) и battle-beneath-the-wall (гл.64), поэтому отдельный card создаст дубль.
- `event:battle-beneath-the-wall-attack-on-castle-black` — Событие уже покрывает event:battle-beneath-the-wall в пакете .38; locator ch64 совпадает.
- `event:donal-noye-and-mag-mar-tun-doh-weg-die-in-the-gate-tunnel` — Гибель Донала Ноя и Мага уже указана в существующей карточке event:battle-beneath-the-wall как последствие боя.
- `event:nights-watch-repels-the-free-folk-assault` — Тот же бой, что существующая event:battle-beneath-the-wall (chapter 64); не создавать второй ref.
- `event:trial-by-combat-between-oberyn-martell-and-gregor-clegane` — Испытание уже непосредственно покрыто существующей event:oberyn-dies-in-trial-by-combat из той же главы; отдельная запись продублировала бы одно состязание.

Нормализованные составные кандидаты:
- `event:oberyn-dies-and-gregor-admits-responsibility-for-elias-death` → `event:gregor-clegane-confesses-to-elias-martells-death`: existing card covers Oberyn death; output card isolates the additional confession/revelation only.
- `event:tyrion-kills-shae-and-tywin-lannister` → `event:tyrion-kills-shae-in-the-red-keep`: source candidate combines multiple beats; package already covers the other beat.

Связанный существующий кандидат (не включён в счётчик отсутствующих карт):
- `event:battle-for-yunkai` → `event:battle-near-yunkai`: ch.42 Daenerys IV; The source audit identifies a P0 battle candidate, but the package already has an event card for the Battle near Yunkai. Crosswalk the chapter-42 event locator rather than creating a duplicate card.

## Проверки

Каждая карточка имеет `kind=event`, стабильный English `ref`, короткое оригинальное описание на русском, `source` с AWOIAF numeric chapter URL и CC BY-SA 3.0, один locator `{book,chapterNo,chapterTitle,relation,url}`, `verification.primaryBook=pending`; ссылки ведут на refs из `.38`. Для главы 81 использована каноническая страница Epilogue при `chapterNo=81`.

### Неопределённости для первичной сверки

- Проверить все эпизоды, формулировки сообщений и русские имена по выбранному изданию романа; вторичный индекс не подтверждает полноту и точность деталей.
- Ch. 45/48/49/53/54: сведения о Бейлоне, Эуроне, Мансе, Теоне, Роббе и событиях у Стены остаются сообщением/письмом, а не независимо проверенным фактом.
- Ch. 45: замысел Робба относительно Джона не является завершённым назначением наследника.
- Ch. 57: путь Бена Пламма через канализацию — оперативное предложение; карточка не утверждает, что оно уже исполнено.
- Ch. 55 атака на Чёрный замок отделена от ch.64 боя под Стеной; chapter 69 recap не создаёт третьего события.
- Ch. 64 гибель Донала Ноя и Мага уже присутствует как последствие в `event:battle-beneath-the-wall`.
- Ch. 70 смерть Оберина уже покрыта `.38`; новая нормализованная запись изолирует только признание Григора о гибели Элии. Сверить точный контекст признания.
- Ch. 77 смерть Тайвина уже покрыта `.38`; нормализованная новая карточка описывает только гибель Шаи.
- Ch. 74 схватка в трактире и её смертельный исход сохранены двумя последовательными карточками; проверить, что пользователю нужны отдельные тактический эпизод и его исход.
- Ch. 42 битва за Юнкай: локальный аудит предлагает P0-кандидат, но `.38` уже содержит `event:battle-near-yunkai`. Нужна проверка locator ch.42, не новая карточка.
- Повторное требование Тириона о суде поединком в ch.66 — отдельная сцена в Королевской Гавани; существующий `.38` `event:tyrion-requests-trial-by-combat` относится к AGOT, Tyrion V, Орлиному гнезду, поэтому он не считается покрытием этого кандидата.
