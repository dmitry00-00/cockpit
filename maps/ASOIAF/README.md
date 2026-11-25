# Карта известного мира ASOIAF

Для отображения карта использует подготовленные WebP-тайлы из `maps/tiles/asoiaf-known-world/`. Тайлы входят в репозиторий, поэтому после клонирования отдельные изображения копировать не нужно: запустите приложение обычным способом, и локальный Vite-сервер отдаст их по адресу `/maps/tiles/asoiaf-known-world/...`.

Исходные растры `map_no_labels.jpg` и `speculative_map.jpg` в репозиторий не входят. Для повторной нарезки тайлов положите `map_no_labels.jpg` по указанному в паспорте карты пути `maps/ASOIAF/map_no_labels.jpg` и выполните:

```sh
python scripts/tile-map.py content/maps/asoiaf-known-world.json
```

Карта и производные тайлы распространяются для некоммерческого использования по CC BY-NC-SA 3.0 Unported. Авторство и сведения об источнике указаны в `content/maps/asoiaf-known-world.json` и `packages/planetos/package.json`.
