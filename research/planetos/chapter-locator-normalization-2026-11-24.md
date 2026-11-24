# Нормализация локаторов глав первой книги

При расширении chapter ledger обнаружено, что часть человекочитаемых URL вида `A_Game_of_Thrones-Eddard_V` перенаправляется не на главу с таким заголовком: URL для `Eddard V` открывает страницу `Eddard VI`. Страница, на которую ведёт таблица глав AWOIAF, — числовая `A_Game_of_Thrones-Chapter_25`; в ней заголовок `Eddard V`. Аналогичное соответствие проверено на `Chapter_1` (`Bran I`), `Chapter_2` (`Catelyn I`) и `Chapter_72` (`Daenerys X`). Поэтому надежным ключом служит номер главы из таблицы, а не автоматически построенный title slug.

Реестр `agot-chapter-coverage.csv` приведён к каноническим ссылкам AWOIAF: `Prologue` остаётся отдельной страницей, главы 1–72 используют `A_Game_of_Thrones-Chapter_N`. Для карточек, у которых поле `source.url` указывало на ошибочный chapter title alias и subtitle однозначно задавал главу, ссылка также заменена на числовую страницу. Ссылки на страницы персонажей и мест не менялись.

Это исправляет адреса локаторов, но не повышает статус доказательности: главы и карточки остаются вторично индексированными, пока их факты не сверены с выбранным изданием романа. Никаких новых сюжетных утверждений и дат не добавлено.

- [Таблица глав AWOIAF](https://awoiaf.westeros.org/index.php/Chapters_Table_of_contents)
- [Числовая страница Chapter 25 — Eddard V](https://awoiaf.westeros.org/index.php/A_Game_of_Thrones-Chapter_25)
- [Числовая страница Chapter 27 — Eddard VI](https://awoiaf.westeros.org/index.php/A_Game_of_Thrones-Chapter_27)
