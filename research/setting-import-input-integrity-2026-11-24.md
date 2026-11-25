# IS2 — целостность внешних входов runner, 24.11.2026

## Изменение

`setting-import-run.mjs` после существующей проверки пути и `realpath` рассматривает каждый переданный `external-input` как read-only источник. Перед подготовкой результата runner снимает его SHA-256 потоковым чтением. Перед и после каждого этапа сравниваются лёгкие метаданные с базовым снимком: canonical path, тип/режим, размер, device/inode, число ссылок, время изменения и время смены inode. После конвейера runner повторно потоково хэширует входы даже при ошибке этапа; несовпадающий digest завершает запуск ошибкой, сохраняя сообщение первоначальной ошибки.

Обычные файловые снимки `outputRoot`, `scratchRoot` и read-only проектных слоёв также считают SHA-256 потоково, поэтому файл не загружается целиком в память ради проверки.

## Стоимость и гарантия

- Для каждого переданного внешнего файла читается весь размер дважды за запуск: один проход перед конвейером и один в его завершающем пути, также после отказа этапа.
- Внутри этапов большой файл не перечитывается: `lstat`/`realpath`/`stat` позволяют связать обычную замену, переименование или изменение метаданных с конкретным этапом.
- Итоговый digest обнаруживает изменение, оставшееся в файле в конце. Метаданные раньше сообщают об обычном изменении между этапами. Runner не блокирует запись и не является системной песочницей: transient write-and-restore, которое восстановило исходные байты и все наблюдаемые метаданные до следующей проверки, теоретически не выявляется.
- Политика расположения сохраняется: обязательный wiki `dump` по-прежнему обязан быть зарегистрированным внешним входом с `outsideRepository: true`; optional GIS-пакет проверяется на целостность, если передан, но политика допуска его расположения остаётся профилю.

Реальный runner, планировщик, импортёры, тесты и typecheck не запускались. Эта проверка не подтверждает доступность входов, успешную сборку FR или импорт в приложение.


## Follow-up: pinning the file descriptor

An independent review found a narrow TOCTOU window between path validation and `createReadStream(path)`. Hashing now opens the external file once and reads from that pinned descriptor; descriptor metadata (device/inode, mode, size and timestamps) is compared with the start snapshot before and after the read. `O_NOFOLLOW` is used where the platform exposes it. This prevents an ordinary path replacement between validation and open from silently changing which file the hash covers. It does not lock out concurrent writers or eliminate transient write-and-restore cases described above. The runner was not executed.


## Follow-up: pinning the file descriptor

An independent review found a narrow TOCTOU window between path validation and `createReadStream(path)`. Hashing now opens the external file once and reads from that pinned descriptor; descriptor metadata (device/inode, mode, size and timestamps) is compared with the start snapshot before and after the read. `O_NOFOLLOW` is used where the platform exposes it. This prevents an ordinary path replacement between validation and open from silently changing which file the hash covers. It does not lock out concurrent writers or eliminate transient write-and-restore cases described above. The runner was not executed.
