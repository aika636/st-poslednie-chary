// Чистые части слоя SillyTavern: чтение метаданных без записи, сборка view для панели,
// тексты для промпта по типу генерации, настройки, шаблоны и свои заклинания.
// Без DOM и без SillyTavern: всё нужное приходит параметрами.
import { normalizeMeta, computeChat, factRows, collectEvents, staleNoteIds, MODES } from './core/chat-journal.mjs?v=0.1.28';
import { statusBlock, turnFact, notesOfRows, fracturesOfRows } from './core/prompt.mjs?v=0.1.28';
import { createProfile } from './core/state.mjs?v=0.1.28';
import { customSpell, customId, validateSpell, cleanSearchWords } from './core/catalog.mjs?v=0.1.28';
import SPELLS from './core/data/spells.mjs?v=0.1.28';
import FRACTURES from './core/data/fractures.mjs?v=0.1.28';
import TAGS from './core/data/tags.mjs?v=0.1.28';
import DIRECTIONS from './core/data/directions.mjs?v=0.1.28';
import SOURCES from './core/data/sources.mjs?v=0.1.28';

export const DEPTH_MIN = 0;
export const DEPTH_MAX = 10;
export const THEMES = ['amethyst', 'tavern'];
export const ITEMS = ['tome', 'phone'];
export const SKINS = { tome: ['amethyst', 'tavern', 'dark', 'forest', 'temple'], phone: ['city', 'cyber', 'space'] };
export const DEFAULT_SETTINGS = Object.freeze({ enabled: true, depth: 1, templates: [], theme: 'amethyst', item: 'tome', skin: 'amethyst', desire: false, free: false, customSpells: [], customDeleted: [], searchWords: {} });

// Школа, выключенная по умолчанию: её чары и вкладка видны только при включённой настройке.
export const OPTIONAL_SCHOOL = 'desire';
// Тег, доступный только вместе с этой школой.
export const OPTIONAL_TAG = 'навязанное_влечение';

// Генерации, которым факт хода не нужен.
const NO_FACT_TYPES = new Set(['quiet', 'impersonate']);

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isText = (v) => typeof v === 'string' && v.trim() !== '';

// prompt.mjs ищет обет по id тега: словарь из списка.
export const TAGS_BY_ID = Object.freeze(Object.fromEntries(TAGS.map((t) => [t.id, t])));
export const PROMPT_OPTIONS = Object.freeze({ sources: SOURCES, tags: TAGS_BY_ID });

// Чтение метаданных чата без побочных эффектов: нормализуется копия, исходный объект
// не меняется и в chatMetadata ничего не появляется. exists — ключ уже лежит в чате.
export function readMeta(raw) {
  // Пустая заготовка прошлой версии (без профиля, журнала и очереди) — как будто данных нет:
  // терять нечего, а профиль в таком чате создать можно.
  if (isEmptyLegacy(raw)) return { ...normalizeMeta(undefined), exists: false };
  const exists = raw !== undefined && raw !== null;
  let copy;
  try {
    copy = exists ? structuredClone(raw) : raw;
  } catch {
    return { meta: raw, unsupported: true, exists };
  }
  const { meta, unsupported } = normalizeMeta(copy);
  return { meta, unsupported, exists };
}

const emptyList = (v) => v === undefined || (Array.isArray(v) && v.length === 0);

export function isEmptyLegacy(raw) {
  return isObject(raw) && raw.schemaVersion === undefined && (raw.snapshot === null || raw.snapshot === undefined)
    && emptyList(raw.journal) && emptyList(raw.pending);
}

// Предупреждать ли о незнакомых метаданных: только если в них есть что терять
// (пустые заготовки старых версий не стоят тоста в каждом чате).
export function worthWarning(raw) {
  return isObject(raw) && raw.snapshot !== null && raw.snapshot !== undefined;
}

export const hasProfile = (meta) => isObject(meta?.snapshot);

// Есть ли в чате события или очередь: тогда профиль уже не пересоздаётся.
export function hasHistory(chat, meta) {
  return collectEvents(chat).length > 0 || (Array.isArray(meta?.pending) && meta.pending.length > 0);
}

// Смена режима «сюжет»/«кубик», пока в очереди есть касты, запрещена: каст «кубика» несёт
// только сложность, каст «сюжета» — только исход, и в другом режиме он не зафиксируется.
export const MODE_LOCK_REASON = 'Сначала отправьте или отмените касты в очереди';
export function canSwitchMode(meta) {
  const pending = Array.isArray(meta?.pending) ? meta.pending : [];
  return pending.some((cmd) => cmd?.kind === 'cast')
    ? { ok: false, reason: MODE_LOCK_REASON }
    : { ok: true, reason: '' };
}

// Поле прошлой версии, которое больше не используется: у старых карточек его просто отбрасываем.
const withoutLegacy = (card) => {
  if (!isObject(card) || !('circle' in card)) return card;
  const { circle, ...rest } = card;
  return rest;
};

// Годные карточки из списка (данные могли быть испорчены руками); повтор id — первая побеждает.
function validCards(raw) {
  const seen = new Set();
  return (Array.isArray(raw) ? raw : []).map(withoutLegacy).filter((card) => {
    if (validateSpell(card).length || seen.has(card.id)) return false;
    seen.add(card.id);
    return true;
  });
}

const textIds = (raw) => [...new Set((Array.isArray(raw) ? raw : []).filter(isText))];

// Свои заклинания: общие из настроек, затем (для старых чатов) такие же из метаданных чата,
// которых нет среди общих и которые не удалены. Общие по id главнее.
export function customSpellsOf(meta, settings = null) {
  const own = validCards(meta?.customSpells);
  if (!settings) return own;
  const shared = validCards(settings.customSpells);
  const skip = new Set([...shared.map((s) => s.id), ...textIds(settings.customDeleted)]);
  return [...shared, ...own.filter((s) => !skip.has(s.id))];
}

export function allSpells(meta, builtin = SPELLS, { desire = false, settings = null } = {}) {
  const custom = customSpellsOf(meta, settings);
  const ids = new Set(custom.map((s) => s.id));
  return [...builtin.filter((s) => !ids.has(s.id) && (desire || s.direction !== OPTIONAL_SCHOOL)), ...custom];
}

// Своё заклинание из старых метаданных чата — в общие настройки. Возвращает patch для настроек или null;
// метаданные не меняются.
export function migrateCustom(settings, meta) {
  const s = normalizeSettings(settings);
  const have = new Set(s.customSpells.map((c) => c.id));
  const gone = new Set(s.customDeleted);
  const add = validCards(meta?.customSpells).filter((c) => !have.has(c.id) && !gone.has(c.id) && !SPELLS.some((b) => b.id === c.id));
  return add.length ? { customSpells: [...s.customSpells, ...add] } : null;
}

// Сохранение своего заклинания в общие настройки: без editId — новое (id по названию, занятый получает
// суффикс), с editId — правка, id не меняется. Возвращает { ok, errors, card, patch }.
export function saveCustomSpell(settings, meta, input, { editId = null } = {}) {
  const fail = (msg) => ({ ok: false, errors: [msg], card: null, patch: null });
  const s = normalizeSettings(settings);
  const shared = s.customSpells;
  const known = customSpellsOf(meta, s);
  const base = editId === null ? null : SPELLS.find((c) => c.id === editId) ?? null;
  if (editId !== null && !base && !known.some((c) => c.id === editId)) return fail('такого заклинания уже нет');
  if (!s.desire && (input?.direction === OPTIONAL_SCHOOL || (input?.tags ?? []).includes(OPTIONAL_TAG))) {
    return fail('школа «Чары влечения» выключена в настройках');
  }
  const taken = [...SPELLS.map((c) => c.id), ...known.map((c) => c.id), ...s.customDeleted];
  let card;
  try {
    card = customSpell({ ...input, id: editId ?? customId(input?.name ?? '', taken) });
    if (base) {
      card = { ...base, ...card };
      const errors = validateSpell(card);
      if (errors.length) throw new Error(`заклинание «${card.name}»: ${errors.join('; ')}`);
    }
  } catch (err) {
    return fail(String(err?.message ?? err));
  }
  const customSpells = editId !== null && shared.some((c) => c.id === editId)
    ? shared.map((c) => (c.id === editId ? card : c))
    : [...shared, card];
  return { ok: true, errors: [], card, patch: { customSpells } };
}

// Правка встроенной чары хранится перекрытием с тем же id; возврат убирает его (в удалённые не пишется).
export function resetSpell(settings, id) {
  const s = normalizeSettings(settings);
  if (!isText(id) || String(id).startsWith('custom:') || !SPELLS.some((c) => c.id === id)) return null;
  return { customSpells: s.customSpells.filter((c) => c.id !== id) };
}

// Удаление: из общих настроек, id запоминается, чтобы перенос из метаданных его не вернул.
export function deleteCustomSpell(settings, id) {
  const s = normalizeSettings(settings);
  if (!isText(id) || !String(id).startsWith('custom:')) return null;
  return { customSpells: s.customSpells.filter((c) => c.id !== id), customDeleted: [...new Set([...s.customDeleted, id])] };
}

// Свои слова поиска: { id: [слова] }, пустые ключи отброшены.
function cleanSearchMap(raw) {
  const out = {};
  if (isObject(raw)) for (const [id, w] of Object.entries(raw)) { const c = cleanSearchWords(w); if (c.length && isText(id)) out[id] = c; }
  return out;
}

// Свои слова одной чары в общие настройки: пустой ввод удаляет ключ. Возвращает patch для настроек.
export function setSearchWords(settings, id, input) {
  const all = { ...normalizeSettings(settings).searchWords };
  const words = cleanSearchWords(input);
  if (words.length) all[id] = words; else delete all[id];
  return { searchWords: all };
}

export function normalizeSettings(raw) {
  const s = isObject(raw) ? raw : {};
  const item = ITEMS.includes(s.item) ? s.item : DEFAULT_SETTINGS.item;
  const skins = SKINS[item];
  const skin = skins.includes(s.skin) ? s.skin : skins.includes(s.theme) ? s.theme : (skins[0] ?? '');
  return {
    ...s,
    enabled: typeof s.enabled === 'boolean' ? s.enabled : DEFAULT_SETTINGS.enabled,
    depth: clampDepth(s.depth ?? DEFAULT_SETTINGS.depth),
    templates: Array.isArray(s.templates) ? s.templates.filter((t) => isObject(t) && isText(t.name)) : [],
    theme: THEMES.includes(s.theme) ? s.theme : DEFAULT_SETTINGS.theme,
    item,
    skin,
    desire: s.desire === true,
    free: s.free === true,
    customSpells: validCards(s.customSpells),
    customDeleted: textIds(s.customDeleted),
    searchWords: cleanSearchMap(s.searchWords),
  };
}

export function clampDepth(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.depth;
  return Math.min(DEPTH_MAX, Math.max(DEPTH_MIN, n));
}

// Шаблон профиля по имени: новый добавляется, с тем же именем — заменяется.
export function upsertTemplate(templates, input) {
  let profile;
  try {
    profile = createProfile(input);
  } catch (err) {
    return { ok: false, errors: [String(err?.message ?? err)], templates };
  }
  if (!profile.name) return { ok: false, errors: ['у шаблона нет имени'], templates };
  const rest = (templates ?? []).filter((t) => t?.name !== profile.name);
  return { ok: true, errors: [], templates: [...rest, profile] };
}

export function removeTemplate(templates, name) {
  return (templates ?? []).filter((t) => t?.name !== name);
}

// Тексты для промпта: блок состояния и факт хода под тип генерации.
// Выключено, профиля нет или схема незнакомая — оба пустые.
export function promptTexts({ chat, meta, unsupported, enabled, type = 'normal', options = PROMPT_OPTIONS }) {
  const empty = { status: '', fact: '' };
  if (!enabled || unsupported || !hasProfile(meta)) return empty;
  const view = computeChat(chat ?? [], meta);
  if (!view) return empty;
  const rows = NO_FACT_TYPES.has(type) ? [] : factRows(chat ?? [], meta, type);
  const fact = turnFact(rows, options);
  // Сказанное в факте хода не повторяется в «недавних последствиях» блока состояния,
  // а устаревшие заметки об окончании чар туда больше не попадают.
  const skipNotes = [...(fact ? notesOfRows(rows) : []), ...staleNoteIds(chat ?? [], view.rows)];
  const status = statusBlock(view.state, { ...options, skipNotes, skipFractures: fact ? fracturesOfRows(rows) : [], brief: !fact });
  return { status: status ?? '', fact: fact ?? '' };
}

// Данные каталога для панели.
export function viewData(meta, settings = {}) {
  const desire = settings?.desire === true;
  const directions = desire ? DIRECTIONS : DIRECTIONS.filter((d) => d.id !== OPTIONAL_SCHOOL);
  return { spells: allSpells(meta, SPELLS, { desire, settings }), edited: customSpellsOf(meta, settings).filter((c) => SPELLS.some((b) => b.id === c.id)).map((c) => c.id), fractures: FRACTURES, tags: TAGS, directions, allDirections: DIRECTIONS, sources: SOURCES };
}

// View для панели (форма — в договоре ui-contract).
// Последнее мгновенное действие для кнопки отмены: событие и состояние до него.
function instantOf(rows, id) {
  const row = id ? rows.find((r) => r.event?.id === id && r.ok === true) : null;
  return row ? { id, kind: row.event.kind, payload: row.event.payload ?? {}, before: row.before } : null;
}

export function buildView({ chatOpen, chatId = null, chat, meta, unsupported, settings, instantId = null }) {
  const s = normalizeSettings(settings);
  const base = {
    chatOpen: Boolean(chatOpen),
    chatId: chatOpen ? (chatId ?? null) : null,
    unsupported: Boolean(unsupported),
    hasProfile: false,
    mode: 'story',
    snapshot: null,
    state: null,
    forecast: null,
    giftBase: {},
    pending: [],
    pendingRows: [],
    instant: null,
    rows: [],
    conflicts: [],
    data: viewData(unsupported ? null : meta, s),
    templates: s.templates,
    settings: { enabled: s.enabled, depth: s.depth, theme: s.theme, item: s.item, skin: s.skin, desire: s.desire, free: s.free, searchWords: s.searchWords },
  };
  if (!chatOpen || !isObject(meta)) return base;
  base.hasProfile = hasProfile(meta);
  if (unsupported) return base;
  base.mode = MODES.includes(meta.mode) ? meta.mode : 'story';
  base.snapshot = meta.snapshot ?? null;
  base.pending = Array.isArray(meta.pending) ? meta.pending : [];
  const computed = computeChat(chat ?? [], meta);
  if (!computed) return base;
  // Состояние без одного каста очереди: по нему считается доступность дара при замене этого каста.
  const giftBase = {};
  for (const c of base.pending) {
    if (c?.kind !== 'cast') continue;
    const f = computeChat(chat ?? [], { ...meta, pending: base.pending.filter((x) => x !== c) })?.pendingPreview.state;
    if (f) giftBase[c.id] = { giftUsed: f.giftUsed, lastPaid: f.lastPaid ?? null };
  }
  return {
    ...base,
    giftBase,
    state: computed.state,
    forecast: computed.pendingPreview.state,
    pendingRows: computed.pendingPreview.rows,
    rows: computed.rows,
    conflicts: computed.conflicts,
    instant: instantOf(computed.rows, instantId),
  };
}

// Смещение тома от места по умолчанию, зажатое так, чтобы минимум `keep` px обложки оставались на экране.
// rect — рамка обложки без смещения; minTop — верхняя граница, выше которой обложка не поднимается.
export function clampOffset(off, rect, vw, vh, keep = 120, minTop = 0) {
  const num = (v) => (Number.isFinite(v) ? v : 0);
  const k = Math.min(keep, rect.width, rect.height);
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  const x = clamp(num(off?.x), k - rect.left - rect.width, vw - k - rect.left);
  const y = clamp(num(off?.y), minTop - rect.top, vh - k - rect.top);
  return { x: Math.round(x), y: Math.round(y) };
}
