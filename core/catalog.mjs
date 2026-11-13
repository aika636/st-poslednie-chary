// Каталог: проверка карточек заклинаний и надломов, поиск, копия карточки для каста,
// минимальная форма своего заклинания.
import { RESISTANCES, DURATIONS, SOURCES, rollsAgainst } from './rules.mjs?v=0.1.1';
import { EFFECT_END_REASONS } from './journal.mjs?v=0.1.1';
import DIRECTIONS from './data/directions.mjs?v=0.1.1';
import TAGS from './data/tags.mjs?v=0.1.1';

export const LABELS = ['бой', 'быт', 'социалка'];
export const PLACEHOLDERS = ['цель', 'замысел'];
export const DIRECTION_IDS = DIRECTIONS.map((d) => d.id);

const SPELL_FIELDS = new Set(['id', 'name', 'direction', 'cost', 'labels', 'tags', 'resist', 'duration',
  'target', 'visibility', 'limit', 'texts']);
const TEXT_FIELDS = new Set(['success', 'failure', 'memory', 'complication', 'end']);
const FRACTURE_FIELDS = new Set(['id', 'source', 'name', 'text', 'heal', 'accept', 'acceptTags']);
const SEVERITIES = ['1', '2', '3'];

const isText = (v) => typeof v === 'string' && v.trim() !== '';
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Подстановки в фигурных скобках, кроме разрешённых.
function badPlaceholders(text) {
  const found = [...text.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]);
  return found.filter((name) => !PLACEHOLDERS.includes(name));
}

function checkText(errors, where, value) {
  if (!isText(value)) {
    errors.push(`${where}: нужен непустой текст`);
    return;
  }
  for (const name of badPlaceholders(value)) errors.push(`${where}: неизвестная подстановка {${name}}`);
}

function checkList(errors, where, value, allowed) {
  if (!Array.isArray(value)) {
    errors.push(`${where}: нужен список`);
    return;
  }
  for (const item of value) if (!allowed.includes(item)) errors.push(`${where}: неизвестное значение «${item}»`);
  if (new Set(value).size !== value.length) errors.push(`${where}: повторяющиеся значения`);
}

// Проверка одной карточки заклинания. Возвращает список ошибок; пустой — карточка годится.
export function validateSpell(card, { tags = TAGS } = {}) {
  const errors = [];
  if (!isPlainObject(card)) return ['карточка заклинания должна быть объектом'];
  const tagIds = tags.map((t) => t.id);

  for (const key of Object.keys(card)) if (!SPELL_FIELDS.has(key)) errors.push(`лишнее поле «${key}»`);
  if (!isText(card.id)) errors.push('id: нужен непустой текст');
  if (!isText(card.name)) errors.push('name: нужно название');
  if (!DIRECTION_IDS.includes(card.direction)) errors.push(`direction: неизвестное направление «${card.direction}»`);
  if (!Number.isInteger(card.cost) || card.cost < 0) errors.push('cost: цена должна быть целым числом не меньше нуля');
  checkList(errors, 'labels', card.labels, LABELS);
  checkList(errors, 'tags', card.tags, tagIds);
  if (!RESISTANCES.includes(card.resist)) errors.push(`resist: неизвестное сопротивление «${card.resist}»`);
  if (!DURATIONS.includes(card.duration)) errors.push(`duration: неизвестная длительность «${card.duration}»`);
  for (const key of ['target', 'visibility', 'limit']) checkText(errors, key, card[key]);

  const texts = card.texts;
  if (!isPlainObject(texts)) {
    errors.push('texts: нужен объект с текстами для модели');
    return errors;
  }
  for (const key of Object.keys(texts)) if (!TEXT_FIELDS.has(key)) errors.push(`texts: лишнее поле «${key}»`);
  for (const key of ['success', 'failure', 'memory']) checkText(errors, `texts.${key}`, texts[key]);

  // Осложнение ровно на пороге бывает только у карточек с броском.
  if (rollsAgainst(card)) checkText(errors, 'texts.complication', texts.complication);
  else if (texts.complication !== undefined) errors.push('texts.complication: осложнение бывает только у карточек с порогом (soft, hard)');

  if (texts.end !== undefined) {
    if (!isPlainObject(texts.end)) errors.push('texts.end: нужен объект «причина → заметка»');
    else {
      for (const [reason, note] of Object.entries(texts.end)) {
        if (!EFFECT_END_REASONS.includes(reason)) errors.push(`texts.end: неизвестная причина окончания «${reason}»`);
        else checkText(errors, `texts.end.${reason}`, note);
      }
    }
  }
  return errors;
}

// Проверка одного надлома.
export function validateFracture(f, { tags = TAGS } = {}) {
  const errors = [];
  if (!isPlainObject(f)) return ['надлом должен быть объектом'];
  for (const key of Object.keys(f)) if (!FRACTURE_FIELDS.has(key)) errors.push(`лишнее поле «${key}»`);
  if (!isText(f.id)) errors.push('id: нужен непустой текст');
  if (!SOURCES.includes(f.source)) errors.push(`source: неизвестный источник «${f.source}»`);
  if (!isText(f.name)) errors.push('name: нужно название');
  if (!isText(f.text)) errors.push('text: нужно описание проявления');
  if (!isPlainObject(f.heal)) errors.push('heal: нужны условия снятия для тяжести 1, 2 и 3');
  else {
    for (const s of SEVERITIES) if (!isText(f.heal[s])) errors.push(`heal.${s}: нужно условие снятия`);
    for (const key of Object.keys(f.heal)) if (!SEVERITIES.includes(key)) errors.push(`heal: лишняя тяжесть «${key}»`);
  }
  if (!isText(f.accept)) errors.push('accept: нужно постоянное свойство для принятия');
  if (f.acceptTags !== undefined) checkList(errors, 'acceptTags', f.acceptTags, tags.map((t) => t.id));
  return errors;
}

function validateTag(t) {
  if (!isPlainObject(t)) return ['тег должен быть объектом'];
  return ['id', 'label', 'when', 'vow'].filter((key) => !isText(t[key])).map((key) => `${key}: нужен непустой текст`);
}

function duplicates(items) {
  const seen = new Set();
  const out = new Set();
  for (const item of items) {
    if (!isPlainObject(item)) continue;
    if (seen.has(item.id)) out.add(item.id);
    seen.add(item.id);
  }
  return [...out];
}

const label = (item, i) => (isPlainObject(item) && isText(item.id) ? item.id : `№${i + 1}`);

// Общая проверка каталога: каждая запись и уникальность id.
export function validateCatalog({ spells = [], fractures = [], tags = TAGS } = {}) {
  const errors = [];
  tags.forEach((t, i) => validateTag(t).forEach((e) => errors.push(`Тег ${label(t, i)}: ${e}`)));
  spells.forEach((s, i) => validateSpell(s, { tags }).forEach((e) => errors.push(`Заклинание ${label(s, i)}: ${e}`)));
  fractures.forEach((f, i) => validateFracture(f, { tags }).forEach((e) => errors.push(`Надлом ${label(f, i)}: ${e}`)));
  for (const id of duplicates(tags)) errors.push(`Тег ${id}: id повторяется`);
  for (const id of duplicates(spells)) errors.push(`Заклинание ${id}: id повторяется`);
  for (const id of duplicates(fractures)) errors.push(`Надлом ${id}: id повторяется`);
  return errors;
}

const FRACTURE_PREFIX = { knowledge: 'KN', blood: 'KR', faith: 'VR', pact: 'DG', nature: 'PR' };

// Тексты встроенной карточки, которые уходят модели.
function modelTexts(card) {
  const t = card.texts ?? {};
  return [t.success, t.failure, t.memory, t.complication, ...Object.values(t.end ?? {})].filter((x) => typeof x === 'string');
}

// Дополнительные требования к встроенному набору. Своё заклинание их не проходит и не должно.
export function validateBuiltin({ spells = [], fractures = [] } = {}) {
  const errors = [];
  if (!spells.length) errors.push('встроенный каталог заклинаний пуст');
  for (const d of DIRECTION_IDS) {
    const n = spells.filter((s) => s.direction === d).length;
    if (!n) errors.push(`направление ${d}: нет заклинаний`);
  }
  for (const s of spells) {
    if (!/^M\d{2,}$/.test(s.id)) errors.push(`Заклинание ${s.id}: id встроенной карточки — M и не менее двух цифр`);
    if (!Number.isInteger(s.cost) || s.cost < 0 || s.cost > 3) errors.push(`Заклинание ${s.id}: цена встроенных чар должна быть от 0 до 3`);
    if (modelTexts(s).some((t) => /\d/.test(t))) errors.push(`Заклинание ${s.id}: в текстах для модели не должно быть чисел`);
  }

  if (fractures.length !== 20) errors.push(`встроенных надломов ${fractures.length}, нужно 20`);
  for (const source of SOURCES) {
    const n = fractures.filter((f) => f.source === source).length;
    if (n !== 4) errors.push(`надломов источника ${source}: ${n}, нужно 4`);
  }
  for (const f of fractures) {
    const prefix = FRACTURE_PREFIX[f.source];
    if (prefix && !new RegExp(`^${prefix}-0[1-4]$`).test(f.id)) errors.push(`Надлом ${f.id}: id должен быть вида ${prefix}-01…${prefix}-04`);
  }
  return errors;
}

// Для поиска: без регистра, ё = е.
const fold = (s) => String(s ?? '').toLowerCase().replace(/ё/g, 'е').trim();

export function createCatalog(spells = []) {
  const byId = new Map(spells.map((s) => [s.id, s]));
  return {
    get: (id) => byId.get(id) ?? null,
    list: () => [...spells],
    search(query) {
      const q = fold(query);
      if (!q) return [...spells];
      return spells.filter((s) => fold(s.name).includes(q));
    },
  };
}

// Копия карточки для события каста: журнал хранит её и не зависит от последующих правок каталога.
export const castCard = (card) => structuredClone(card);

const slug = (name) => fold(name).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');

// Своё заклинание из минимальной формы. Недостающее заполняется нейтральными значениями;
// при ошибке в данных бросает исключение со списком проблем.
export function customSpell({
  name, cost = 1, resist = 'none', duration = 'instant', target, limit, success, failure,
  direction = 'matter', labels = [], tags = [], visibility, memory, complication,
} = {}) {
  if (!isText(name)) throw new Error('у своего заклинания нет названия');
  const id = `custom:${slug(name)}`;
  const texts = {
    success: isText(success) ? success.trim() : 'Чудо удалось: {замысел}.',
    failure: isText(failure) ? failure.trim() : 'Чудо не удалось: задуманный эффект не наступил.',
    memory: isText(memory) ? memory.trim() : 'Свидетели помнят то, что заметили; память магией не меняется.',
  };
  if (rollsAgainst({ resist })) {
    texts.complication = isText(complication)
      ? complication.trim()
      : 'Чудо удалось, но с малым неудобством: заминка, шум или привлечённый взгляд.';
  }
  const card = {
    id,
    name: name.trim(),
    direction,
    cost,
    labels: [...labels],
    tags: [...tags],
    resist,
    duration,
    target: isText(target) ? target.trim() : 'По замыслу игрока',
    visibility: isText(visibility) ? visibility.trim() : 'Проявление каста — по источнику',
    limit: isText(limit) ? limit.trim() : 'Одно действие в пределах замысла, без скрытых преимуществ',
    texts,
  };
  const errors = validateSpell(card);
  if (errors.length) throw new Error(`своё заклинание «${card.name}»: ${errors.join('; ')}`);
  return card;
}
