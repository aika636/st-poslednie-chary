# Каталог заклинаний и надломов

`core/data/`: `spells.mjs` (86 карточек), `short.mjs` (короткая строка эффекта по id),
`directions.mjs` (шесть школ: matter, body, mind, images, bonds, bounds), `sources.mjs` (пять
источников), `fractures.mjs` (20 надломов), `tags.mjs` (9 тегов-обетов), `spell-replacements.mjs`
(переименования и слияния: старые id в избранном приводятся к новым).

## Карточка заклинания
`id`, `name`, `direction`, `cost`, `labels` (бой/быт/социалка), `tags`, `resist`
(`none|consent|soft|hard`), `duration` (`instant|scene|sustained|bond`), `target`, `visibility`,
`limit`, `texts`: `success`, `failure`, `memory`, `complication`, `end` (по причинам:
done/broke/escaped/consent/scene/removed). В текстах допустимы подстановки `{цель}` и `{замысел}`;
пустые сокращаются автоматически.

## Правила для текстов
Тексты исходов уходят модели: проза без чисел и механики; провал прямо говорит, что эффекта нет;
условия вроде «пока не проснётся» — события истории, их закрывает игрок кнопкой.
Тексты карточек пишутся по-русски; служебные метки вокруг них («Visibility:», «Memory:», «Spell limit:») добавляет код по-английски.
Id заклинания не переиспользовать: старые события в чатах ссылаются на копию карточки, но
избранное — на id.

## Надлом
`id`, `source`, `name`, `text`, `heal` (условие снятия по тяжести 1–3), `accept` (постоянное
свойство при принятии на тяжести 3). Ни один симптом не определяет решений персоны.

## Проверка и экспорт
`validateCatalog` / `validateBuiltin` в `core/catalog.mjs`.
