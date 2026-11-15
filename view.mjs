// Чистые части слоя SillyTavern: чтение метаданных без записи, сборка view для панели,
// тексты для промпта по типу генерации, настройки, шаблоны и свои заклинания.
// Без DOM и без SillyTavern: всё нужное приходит параметрами.
import { normalizeMeta, computeChat, factRows, collectEvents, staleNoteIds, MODES } from './core/chat-journal.mjs?v=0.1.6';
import { statusBlock, turnFact, notesOfRows, fracturesOfRows } from './core/prompt.mjs?v=0.1.6';
import { createProfile } from './core/state.mjs?v=0.1.6';
import { customSpell, validateSpell } from './core/catalog.mjs?v=0.1.6';
import SPELLS from './core/data/spells.mjs?v=0.1.6';
import FRACTURES from './core/data/fractures.mjs?v=0.1.6';
import TAGS from './core/data/tags.mjs?v=0.1.6';
import DIRECTIONS from './core/data/directions.mjs?v=0.1.6';
import SOURCES from './core/data/sources.mjs?v=0.1.6';

export const DEPTH_MIN = 0;
export const DEPTH_MAX = 10;
export const THEMES = ['amethyst', 'tavern'];
export const DEFAULT_SETTINGS = Object.freeze({ enabled: true, depth: 1, templates: [], theme: 'amethyst', desire: false });

// Школа, выключенная по умолчанию: её чары и вкладка видны только при включённой настройке.
export const OPTIONAL_SCHOOL = 'desire';

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

// Свои заклинания из метаданных: только годные карточки (данные могли быть испорчены руками).
export function customSpellsOf(meta) {
  const list = Array.isArray(meta?.customSpells) ? meta.customSpells : [];
  return list.map(withoutLegacy).filter((card) => validateSpell(card).length === 0);
}

export function allSpells(meta, builtin = SPELLS, { desire = false } = {}) {
  const custom = customSpellsOf(meta);
  const ids = new Set(custom.map((s) => s.id));
  return [...builtin.filter((s) => !ids.has(s.id) && (desire || s.direction !== OPTIONAL_SCHOOL)), ...custom];
}

// Своё заклинание в метаданные (мутирует meta): с тем же id — заменяется.
export function addCustomSpell(meta, input) {
  let card;
  try {
    card = customSpell(input);
  } catch (err) {
    return { ok: false, errors: [String(err?.message ?? err)], card: null };
  }
  if (SPELLS.some((s) => s.id === card.id)) return { ok: false, errors: ['такой id уже занят встроенным заклинанием'], card: null };
  const list = Array.isArray(meta.customSpells) ? meta.customSpells.filter((s) => s?.id !== card.id) : [];
  list.push(card);
  meta.customSpells = list;
  return { ok: true, errors: [], card };
}

export function normalizeSettings(raw) {
  const s = isObject(raw) ? raw : {};
  return {
    ...s,
    enabled: typeof s.enabled === 'boolean' ? s.enabled : DEFAULT_SETTINGS.enabled,
    depth: clampDepth(s.depth ?? DEFAULT_SETTINGS.depth),
    templates: Array.isArray(s.templates) ? s.templates.filter((t) => isObject(t) && isText(t.name)) : [],
    theme: THEMES.includes(s.theme) ? s.theme : DEFAULT_SETTINGS.theme,
    desire: s.desire === true,
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
  const status = statusBlock(view.state, { ...options, skipNotes, skipFractures: fact ? fracturesOfRows(rows) : [] });
  return { status: status ?? '', fact: fact ?? '' };
}

// Данные каталога для панели.
export function viewData(meta, { desire = false } = {}) {
  const directions = desire ? DIRECTIONS : DIRECTIONS.filter((d) => d.id !== OPTIONAL_SCHOOL);
  return { spells: allSpells(meta, SPELLS, { desire }), fractures: FRACTURES, tags: TAGS, directions, sources: SOURCES };
}

// View для панели (форма — в договоре ui-contract).
export function buildView({ chatOpen, chatId = null, chat, meta, unsupported, settings }) {
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
    pending: [],
    pendingRows: [],
    rows: [],
    conflicts: [],
    data: viewData(unsupported ? null : meta, s),
    templates: s.templates,
    settings: { enabled: s.enabled, depth: s.depth, theme: s.theme, desire: s.desire },
  };
  if (!chatOpen || !isObject(meta)) return base;
  base.hasProfile = hasProfile(meta);
  if (unsupported) return base;
  base.mode = MODES.includes(meta.mode) ? meta.mode : 'story';
  base.snapshot = meta.snapshot ?? null;
  base.pending = Array.isArray(meta.pending) ? meta.pending : [];
  const computed = computeChat(chat ?? [], meta);
  if (!computed) return base;
  return {
    ...base,
    state: computed.state,
    forecast: computed.pendingPreview.state,
    pendingRows: computed.pendingPreview.rows,
    rows: computed.rows,
    conflicts: computed.conflicts,
  };
}

// Смещение тома от места по умолчанию, зажатое так, чтобы минимум `keep` px обложки оставались на экране.
// rect — рамка обложки без смещения.
export function clampOffset(off, rect, vw, vh, keep = 120) {
  const num = (v) => (Number.isFinite(v) ? v : 0);
  const k = Math.min(keep, rect.width, rect.height);
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  const x = clamp(num(off?.x), k - rect.left - rect.width, vw - k - rect.left);
  const y = clamp(num(off?.y), -rect.top, vh - k - rect.top);
  return { x: Math.round(x), y: Math.round(y) };
}
