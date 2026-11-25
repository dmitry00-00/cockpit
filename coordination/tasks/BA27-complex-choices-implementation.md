# БА27 — реализация source-aware выборов в повышении

Дата: 2026-11-03

## База и результат

- Task branch: `codex/ba27`
- Baseline commit: `a7386b87c60f0f59ecffae14ac315466f4f3cc64`
- Feature result commit: `fd7884757bdc4697db0ceeeb7f92f1fa78eb5799` (содержит реализацию и первичную версию этого handoff).
- Изменения ограничены текущим заданием; общий backlog не помечался завершённым.

## Что сделано

- Д8 получает текущие SRD choice requirements из `classChoicesOf`, сравнивает накопительное количество на предыдущем и новом уровне и показывает только новые picks.
- Выбор доступен только из вариантов с `source: 'srd'`; ранее выбранные варианты исключаются, недоступный source или лишний/дублирующий ID отклоняется. Требования без пригодной схемы остаются видимой причиной, подтверждение такого placeholder блокируется.
- Форма обновляет доступные варианты при смене нового подкласса; preview, применение и локальный план используют одну и ту же функцию плана. Предпросмотр не диспатчит событие.
- Выборы записываются в `CharacterSheet.choices` с `at`, `source` и `{ id: 'dnd5e', version: 'SRD 5.1', layer: 'srd' }`. Старые листы без этих optional полей сохраняются совместимыми. `CHARACTER_LEVELED` уже хранит snapshot листа, поэтому replay/undo включает provenance автоматически.
- Expertise обновляет `sheet.expertise` и пересчёт пассивной внимательности. Имеющийся расчёт атак по fighting style продолжает использовать сохранённый выбор; preview отдельно предупреждает, когда выбранный стиль не имеет реализованного эффекта. Metamagia, избранный враг, местность и предок дракона сохраняются как выборы источника, но их эффекты не симулируются.
- Дальние планы передают эти picks через `LevelUpChoice`; шаг с неподдержанным эффектом остаётся кандидатом и не попадает в полный итог.

## Изменённые файлы

- `src/campaign/levelUp.ts`, `levelUpPreview.ts`: правила предложений, source фильтрация, валидация, применение и предупреждения.
- `src/campaign/derive.ts`, `src/engine/state.ts`: optional provenance у выбранных значений листа; legacy форма остаётся допустимой.
- `src/components/LevelUpForm.tsx`, `src/components/LevelPlan.tsx`, `src/pages/DeskPage.tsx`: поля выбора, динамика подкласса, одинаковые план/preview/apply props.
- `src/campaign/levelUp.test.ts`, `levelUpPreview.test.ts`, `levelPlan.test.ts`, `build.test.ts`, `src/components/LevelUpForm.test.tsx`: проверки новой логики и совместимости.
- Этот handoff.

## Проверки

- `npx vitest run src/campaign/levelUp.test.ts src/campaign/levelUpPreview.test.ts src/campaign/levelPlan.test.ts src/campaign/derive.test.ts src/campaign/build.test.ts src/components/LevelUpForm.test.tsx src/pages/editor/CharacterEditor.test.tsx src/pages/desk/path.test.tsx src/campaign/progression.test.ts src/pages/DeskPage.test.tsx --maxWorkers=2` — 10 файлов, 125 тестов прошли.
- После последней правки динамического плана формы повторно: level-up, level-plan, LevelUpForm и desk path — 5 файлов, 27 тестов прошли.
- `npx tsc --noEmit -p tsconfig.app.json` — прошёл. В переданном snapshot исключён `design/masks/toril.json`, который импортирует `src/map/planet.ts`; для проверки был временно создан symlink к исходнику из root checkout, затем удалён. Root checkout не менялся. Без этого внешнего файла текущий snapshot не разрешает import, поэтому standalone повторный typecheck здесь заблокирован недостающим baseline asset.
- `git diff --check` — прошёл.
- Браузер не запускался: визуальную приёмку оставляет себе Codex по координации.

## Ограничения и остаток БА27

- Это source-aware путь для известных схем `build.classChoicesOf`, а не generic executor всех `ClassOptionBlock` из импорта. Импортные блоки не содержат надёжных `levels/count` и не могут безопасно дать их автоматически.
- В повышении поддержаны источники/числа для SRD: fighting styles, ranger favored enemy/terrain, sorcerer metamagic, rogue/bard Expertise и draconic ancestry. Бонусы реально пересчитываются только там, где движок уже умеет это делать: Expertise и существующий Archery bonus атаки. Для остальных выбор записывается, предупреждается, а дальний точный расчёт останавливается.
- Неподдержанные imported subclass choices и feature placeholders без явной SRD схемы не конвертируются в автоматически полученные picks. Такие placeholders блокируют событие с ясной причиной; review-only текстовые особенности остаются предупреждениями.
- Существующие choices, созданные до provenance, читаются без источника/уровня и не мигрируются догадками.
- Не реализованы общие механические адаптеры для книги, A5E, rune/ maneuver/invocation/infusion схем и произвольных subclass option blocks. Для них нужен достоверный контракт на количество/уровень и версия правила, после чего можно добавлять адаптеры по одному.
