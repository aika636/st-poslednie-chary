// Панель «Последних чар» — том заклинаний со свечой. Разметка строками от view, события через
// data-act / data-bind. Правил здесь нет: можно ли, сколько стоит и что предупредить —
// говорит actions.preview. Весь текст из чата, профиля и метаданных — только через esc().
import { SCALE, THRESHOLDS, DIFFICULTIES, discountUseful, fractureLoad, scaleOf, rollsAgainst } from './core/rules.mjs?v=0.1.2';
import { castCard, createCatalog } from './core/catalog.mjs?v=0.1.2';
import SHORT from './core/data/short.mjs?v=0.1.2';
import { clampOffset, canSwitchMode } from './view.mjs?v=0.1.2';
import { candleSvg, candleMarks } from './candle.js?v=0.1.2';
import { SOURCE_GLYPH, STAR, RING, CORNER, BRACKET, glyphFor } from './glyphs.js?v=0.1.2';

export const esc = (s) => String(s ?? '').replace(/[&<>"'`]/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;',
}[ch]));

const clean = (s) => (typeof s === 'string' ? s.trim() : '');
const list = (v) => (Array.isArray(v) ? v : []);
const capFirst = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const attr = (name, on) => (on ? ` ${name}` : '');

// ---------- словари ----------

const OUTCOME_RU = { success: 'успех', complication: 'успех с осложнением', failure: 'провал' };
const DIFFICULTY_RU = { easy: 'лёгкая', normal: 'обычная', hard: 'трудная' };
const END_RU = { done: 'выполнено', broke: 'рассыпались', escaped: 'вырвалась', consent: 'согласие отозвано', scene: 'конец сцены', removed: 'снято' };
const SEVERITY_RU = { 1: 'лёгкий', 2: 'серьёзный', 3: 'тяжёлый' };
const ENV_RU = { living: 'живая', lifeless: 'без жизни', unspecified: 'не отмечена' };
const LABELS = ['бой', 'быт', 'социалка'];
const SOURCE_GEN = { knowledge: 'знания', blood: 'крови', faith: 'веры', pact: 'договора', nature: 'природы' };
const THEME_RU = { amethyst: 'Аметист', tavern: 'Как таверна' };
const KIND_RU = {
  cast: 'Каст', faith_pray: 'Молитва', nature_gift: 'Дар природы', breather: 'Передышка', rest: 'Отдых',
  scene_end: 'Конец сцены', effect_end: 'Снятие чар', effect_detail_set: 'Описание чар',
  fracture_manifest: 'Проявление надлома', fracture_heal: 'Снятие надлома', fracture_accept: 'Принятие надлома',
  note_add: 'Заметка', note_remove: 'Заметка убрана', debt_settle: 'Долг погашен', trait_add: 'Свойство',
  trait_remove: 'Свойство убрано', environment_set: 'Среда', profile_patch: 'Профиль',
};
const PROFILE_FIELDS_RU = {
  name: 'имя', source: 'источник', signature: 'сигнатура', expression: 'выражение', vows: 'обеты',
  patron: 'покровитель', favorites: 'избранное',
};

// ---------- состояние панели ----------

const emptyOpts = () => ({ difficulty: 'normal', gift: false, loan: false, debt: '' });
const emptyCustom = () => ({ name: '', cost: 1, resist: 'none', duration: 'instant', target: '', limit: '', success: '', failure: '' });
const emptyDraft = () => ({ name: '', source: 'knowledge', signature: '', expression: '', vows: [], patron: '' });

export function initialUi() {
  return {
    tab: 'cast',
    layout: 'spread', school: '', listScroll: 0,
    q: '', label: '',
    spellId: null, opts: emptyOpts(),
    custom: emptyCustom(), customErrors: [],
    manifestFor: null, acceptFor: null, accept: { text: '', tag: '' },
    noteText: '', traitText: '',
    profileDraft: null, createError: '',
  };
}

// Смена чата: всё введённое относится к прежнему чату — сбросить, оставив вкладку.
export function switchChat(ui, prevChatId, nextChatId) {
  if (prevChatId === nextChatId) return false;
  const { tab, layout } = ui;
  Object.assign(ui, initialUi(), { tab: tab === 'more' ? 'cast' : tab, layout: layout ?? 'spread' });
  return true;
}

// ---------- чистые помощники ----------

const sourcesOf = (data) => {
  const s = data?.sources ?? {};
  return Array.isArray(s) ? s : Object.values(s);
};
const sourceById = (data, id) => sourcesOf(data).find((s) => s?.id === id) ?? null;

// Состояние, которое видит игрок: с учётом очереди.
const current = (view) => view.forecast ?? view.state;

export const shortLine = (spell) => clean(spell?.short) || SHORT[spell?.id] || clean(String(spell?.limit ?? '').split(/[.;]/)[0]).slice(0, 40);

// Какой дар у источника относится к цене каста: скидка (знание, кровь — при ненулевой цене),
// заём (договор) или ничего (у веры и природы дар не про цену каста).
export function giftOption(source, spell) {
  if (source === 'knowledge' || source === 'blood') return discountUseful(source, spell.cost) ? 'discount' : null;
  if (source === 'pact') return 'loan';
  return null;
}

// Каст одним нажатием. «Сюжет» — всегда успех, «Кубик» — обычная сложность. Скидка дара
// (знание, кровь) и долг договора — только по явному выбору (opts.gift, opts.loan). Согласие цели не утверждается: панель его не знает.
export function quickPayload(spell, { mode, source, giftUsed }, opts = {}) {
  const payload = { spell: castCard(spell) };
  const gift = giftOption(source, spell);
  if (!giftUsed && gift === 'discount' && opts.gift) payload.gift = true;
  if (!giftUsed && gift === 'loan' && opts.loan) {
    payload.gift = true;
    payload.debt = clean(opts.debt);
  }
  if (mode === 'story') payload.outcome = 'success';
  else if (rollsAgainst(spell)) payload.difficulty = DIFFICULTIES.includes(opts.difficulty) ? opts.difficulty : 'normal';
  return payload;
}

// Каст этого заклинания, уже стоящий в очереди.
export const queuedCast = (view, spellId) => list(view?.pending).find((c) => c.kind === 'cast' && c.payload?.spell?.id === spellId) ?? null;

function safePreview(preview, kind, payload) {
  try {
    return preview(kind, payload) ?? { ok: false, reason: 'нет ответа', warnings: [] };
  } catch (err) {
    return { ok: false, reason: err?.message ?? 'ошибка', warnings: [] };
  }
}

// Короткое описание команды или события — простой текст (экранируется при выводе).
export function describe(kind, payload, st) {
  const p = payload ?? {};
  const effect = (id) => st?.effects?.find((e) => e.id === id) ?? st?.notes?.find((n) => n.effectId === id);
  const fracture = (id) => st?.fractures?.find((f) => f.id === id);
  const castName = (id) => st?.casts?.[id]?.spell?.name;
  const fName = (f) => (f?.manifest?.name ? `«${f.manifest.name}»` : 'надлом');
  switch (kind) {
    case 'cast': {
      const parts = [`«${p.spell?.name ?? 'чудо'}»`];
      if (p.target?.label) parts.push(`→ ${p.target.label}`);
      if (p.outcome && p.outcome !== 'success') parts.push(`· ${OUTCOME_RU[p.outcome] ?? p.outcome}`);
      else if (p.difficulty && p.difficulty !== 'normal') parts.push(`· сложность ${DIFFICULTY_RU[p.difficulty] ?? p.difficulty}`);
      if (p.gift) parts.push(p.debt !== undefined ? '· в долг' : '· с даром');
      return parts.join(' ');
    }
    case 'faith_pray': return `Молитва за «${castName(p.castId) ?? 'чудо'}»`;
    case 'nature_gift': return 'Дар природы';
    case 'breather': return 'Передышка';
    case 'rest': return 'Отдых';
    case 'scene_end': return 'Конец сцены';
    case 'effect_end': return `Завершить «${effect(p.effectId)?.spell?.name ?? 'чары'}»`;
    case 'effect_detail_set': return `«${effect(p.effectId)?.spell?.name ?? 'чары'}»: ${p.detail === 'compact' ? 'кратко' : 'подробно'}`;
    case 'fracture_manifest': return `Проявление надлома: ${p.manifest?.name ?? '—'}`;
    case 'fracture_heal': return `Снять ${fName(fracture(p.fractureId))}`;
    case 'fracture_accept': return `Принять навсегда ${fName(fracture(p.fractureId))}`;
    case 'note_add': return `Заметка: ${p.text ?? ''}`;
    case 'note_remove': return 'Убрать заметку';
    case 'debt_settle': return 'Погасить долг';
    case 'trait_add': return `Свойство: ${p.text ?? ''}`;
    case 'trait_remove': return 'Убрать постоянное свойство';
    case 'environment_set': return `Среда: ${ENV_RU[p.environment] ?? p.environment}`;
    case 'profile_patch': {
      const keys = Object.keys(p).filter((k) => PROFILE_FIELDS_RU[k]);
      return `Профиль: ${keys.map((k) => PROFILE_FIELDS_RU[k]).join(', ') || 'без изменений'}`;
    }
    default: return KIND_RU[kind] ?? 'Событие';
  }
}

// ---------- кусочки разметки ----------

const btn = (act, label, { v = '', cls = '', disabled = false, title = '' } = {}) =>
  `<button type="button" class="cc-btn ${cls}" data-act="${esc(act)}" data-v="${esc(v)}"${attr('disabled', disabled)}${title ? ` title="${esc(title)}"` : ''}>${esc(label)}</button>`;
const warnBox = (text, cls = '') => `<div class="cc-warn ${cls}">${esc(capFirst(String(text)))}</div>`;
const rule = (title, aside = '') => `<div class="cc-rule"><span>${esc(title)}</span>${aside ? `<em>${esc(aside)}</em>` : ''}</div>`;
const textInput = (bind, value, placeholder = '', { area = false, maxlength = 400, id = '' } = {}) => (area
  ? `<textarea class="cc-input" rows="2" data-bind="${esc(bind)}"${id ? ` id="${esc(id)}"` : ''} maxlength="${maxlength}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
  : `<input type="text" class="cc-input" data-bind="${esc(bind)}"${id ? ` id="${esc(id)}"` : ''} value="${esc(value)}" maxlength="${maxlength}" placeholder="${esc(placeholder)}">`);
const field = (label, inner, hint = '') => `<label class="cc-field"><span>${esc(label)}</span>${inner}${hint ? `<small>${esc(hint)}</small>` : ''}</label>`;
const seg = (act, options, value) => `<div class="cc-seg" role="group">${options.map(([v, label, title]) => {
  const on = String(v) === String(value);
  return `<button type="button"${on ? ' class="cc-on"' : ''} data-act="${esc(act)}" data-v="${esc(v)}" aria-pressed="${on}"${title ? ` title="${esc(title)}"` : ''}>${esc(label)}</button>`;
}).join('')}</div>`;
const coin = (n, cls = '') => `<span class="cc-coin ${cls}" title="Цена">${esc(n)}</span>`;
const closeBtn = '<button type="button" class="cc-close" data-act="close" title="Закрыть" aria-label="Закрыть">✕</button>';

// Шкала словами и числом (для подписи свечи).
export function scaleText(st, confirmed) {
  const now = scaleOf(st);
  const was = confirmed ? scaleOf(confirmed) : now;
  return was !== now ? `${was}/${SCALE} → ${now}/${SCALE}` : `${now}/${SCALE}`;
}

// Свеча на томе: уровень — подтверждённое состояние, прогноз — с очередью.
export function candleHtml(view, { mini = false, uid = 'p', bare = false } = {}) {
  if (bare) return `<div class="cc-candle-box cc-mini">${candleSvg({ level: 0, mini: true, uid })}</div>`;
  const confirmed = view?.state;
  const st = current(view ?? {});
  if (!st) return '';
  const marks = candleMarks(confirmed ?? st);
  const level = scaleOf(confirmed ?? st);
  const forecast = scaleOf(st);
  const load = Math.min(SCALE, fractureLoad(list(st.fractures)));
  const title = `Напряжение ${scaleText(st, confirmed)}${load ? ` · надломы держат ${load}` : ''}`;
  return `<div class="cc-candle-box${mini ? ' cc-mini' : ''}" title="${esc(title)}">
    ${candleSvg({ level, forecast, temporary: marks.temporary, permanent: marks.permanent, mini, uid })}
    ${mini ? '' : '<span class="cc-candle-cap">напряжение</span>'}
    <span class="cc-candle-n">${esc(scaleText(st, confirmed))}</span>
  </div>`;
}

// Старые события, которые после правки чата больше не применяются.
function conflictsHtml(view) {
  const n = list(view.conflicts).length;
  if (!n) return '';
  return `<button type="button" class="cc-alert" data-act="more" data-v="journal">${esc(`В журнале есть не применённые события (${n})`)}</button>`;
}

// ---------- обложка и шапка страницы ----------

const CHARM_FACES = {
  story: '<path class="cc-cf-ink" d="M22 14c-3.5-2.6-9-2.8-12.5-.8v16.6c3.500-2 9-1.800 12.500.8 3.500-2.600 9-2.800 12.500-.8V13.200C31 11.200 25.500 11.400 22 14z"/><path class="cc-cf-ink" d="M22 14v16.600"/>',
  dice: '<path class="cc-cf-ink" d="M22 7.500l12 7v14.500l-12 7-12-7V14.500z"/><path class="cc-cf-ink" d="M22 13l8.500 15.500h-17zM22 7.500V13M10 14.500l3.500 14M34 14.500l-3.500 14M22 36L13.500 28.500M22 36l8.500-7.500"/>',
};
const MODE_LABEL = { story: 'сюжет', dice: 'кубик d20' };
const MODE_HINT = { story: 'Сюжет: чудо удаётся, платится цена', dice: 'Кубик d20: исход решает бросок при отправке' };

// Брелок режима: монета на цепочке, одна сторона — «Сюжет», другая — «Кубик».
function charmHtml(view, ui) {
  const dice = view.mode === 'dice';
  const lock = canSwitchMode({ pending: view.pending });
  const next = dice ? 'story' : 'dice';
  const label = `Режим: ${MODE_LABEL[view.mode] ?? MODE_LABEL.story}`;
  const title = lock.ok ? `${MODE_HINT[view.mode] ?? MODE_HINT.story}. Нажмите, чтобы переключить` : lock.reason;
  const flip = ui?.flipTo === view.mode ? ` data-flip="1" style="--cc-from:${dice ? '0deg' : '180deg'}"` : '';
  const face = (k) => `<span class="cc-face cc-face-${k}"><svg viewBox="0 0 44 44" aria-hidden="true"><circle class="cc-cf-disc" cx="22" cy="22" r="20.500"/><circle class="cc-cf-rim" cx="22" cy="22" r="17"/>${CHARM_FACES[k]}</svg></span>`;
  return `<button type="button" class="cc-charm${lock.ok ? '' : ' cc-locked'}" role="switch" aria-checked="${dice}" aria-disabled="${!lock.ok}" aria-label="${esc(label)}" title="${esc(title)}" data-act="mode" data-v="${next}">
    <svg class="cc-charm-chain" viewBox="0 0 44 54" aria-hidden="true"><defs><linearGradient id="cc-charm-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="cc-st1"/><stop offset=".5" class="cc-st2"/><stop offset="1" class="cc-st3"/></linearGradient></defs><circle class="cc-chain-ring" cx="22" cy="5" r="4"/><ellipse class="cc-chain-link" cx="22" cy="15" rx="3" ry="5"/><ellipse class="cc-chain-link" cx="22" cy="25" rx="5" ry="3"/><ellipse class="cc-chain-link" cx="22" cy="34" rx="3" ry="5"/><ellipse class="cc-chain-link" cx="22" cy="44" rx="5" ry="3"/></svg>
    <span class="cc-coin3d" data-side="${dice ? 'dice' : 'story'}"${flip}>${face('story')}${face('dice')}</span>
    <span class="cc-charm-cap">${esc(MODE_LABEL[view.mode] ?? MODE_LABEL.story)}</span>
  </button>`;
}

function headHtml(view, ui) {
  const st = current(view);
  const p = st.profile;
  const src = sourceById(view.data, p.source);
  const flags = [];
  // Дар по подтверждённому состоянию; если его возьмёт каст из очереди — «потратится».
  const spent = Boolean(view.state?.giftUsed);
  const soon = !spent && st.giftUsed;
  flags.push(`<span class="cc-flag${spent ? ' cc-off' : ''}" title="${esc(src?.gift ?? 'Дар источника')}">${STAR}<span>${spent ? 'дар потрачен' : soon ? 'дар потратится с сообщением' : 'дар доступен'}</span></span>`);
  if (st.debts?.length) flags.push(`<span class="cc-flag cc-warnflag">долгов: ${esc(st.debts.length)}</span>`);
  if (view.settings && view.settings.enabled === false) flags.push('<span class="cc-flag cc-warnflag">не передаётся модели</span>');
  return `<header class="cc-pagehead">
    <div class="cc-title"><i>✦</i><span>Последние чары</span><i>✦</i></div>
    <div class="cc-who">
      <span class="cc-pill"><b>${esc(p.name || 'Персона')}</b></span>
      <span class="cc-pill cc-src" data-src="${esc(p.source)}">${SOURCE_GLYPH[p.source] ?? ''}<b>${esc(src?.name ?? '')}</b></span>
    </div>
    <div class="cc-flags">${flags.join('')}</div>
    ${conflictsHtml(view)}
    ${charmHtml(view, ui)}
  </header>`;
}

function ribbonsHtml(view, ui) {
  const st = current(view);
  const alerts = list(st.fractures).filter((f) => !f.manifest).length + list(view.conflicts).length;
  const tabs = [['cast', 'Каст'], ['state', 'Состояние'], ['more', 'Ещё']];
  return `<nav class="cc-ribbons" role="tablist">${tabs.map(([k, n], i) =>
    `<button type="button" role="tab" class="cc-ribbon" data-i="${i}" data-act="tab" data-v="${k}" aria-selected="${ui.tab === k}">${esc(n)}${k === 'state' && alerts ? `<span class="cc-dot">${esc(alerts)}</span>` : ''}</button>`).join('')}</nav>`;
}

// Очередь: уйдёт с ближайшим сообщением игрока.
export function queueHtml(view) {
  const pending = list(view.pending);
  if (!pending.length) return '';
  const rows = new Map(list(view.pendingRows).map((r) => [r.event?.id ?? r.commandId, r]));
  const items = pending.map((cmd) => {
    const row = rows.get(cmd.id);
    const st = row?.before ?? current(view);
    let note = '';
    if (row?.ok === false) note = `<span class="cc-bad-text">${esc(capFirst(row.reason ?? 'не выйдет'))}</span>`;
    else if (row?.warnings?.length) note = `<span class="cc-warn-text">${esc(row.warnings.map(capFirst).join(' · '))}</span>`;
    return `<span class="cc-q-item" data-status="${row?.ok === false ? 'bad' : row?.warnings?.length ? 'warn' : 'ok'}">
      <b>${esc(describe(cmd.kind, cmd.payload, st))}</b>${note}
      <button type="button" class="cc-x" data-act="dequeue" data-v="${esc(cmd.id)}" title="Убрать из очереди" aria-label="Убрать из очереди">✕</button>
    </span>`;
  }).join('');
  return `<section class="cc-queue"><div class="cc-q-h">Уйдёт с вашим сообщением</div><div class="cc-q-list">${items}</div></section>`;
}

// ---------- страница «Каст» ----------

function filteredSpells(view, ui) {
  const all = list(view.data?.spells);
  let found = createCatalog(all).search(ui.q);
  if (ui.label) found = found.filter((s) => list(s.labels).includes(ui.label));
  return found;
}

function spellListHtml(view, ui) {
  const st = current(view);
  const prof = st.profile;
  const filters = `<div class="cc-filters">
      <label class="cc-search">${textInput('q', ui.q, 'Найти заклинание…', { id: 'cc-q' })}</label>
      <div class="cc-tags">
        ${LABELS.map((l) => `<button type="button" class="cc-tog" data-act="f-label" data-v="${esc(l)}" aria-pressed="${ui.label === l}">${esc(capFirst(l))}</button>`).join('')}
      </div>
    </div>`;
  const found = filteredSpells(view, ui);
  const row = (s) => {
    const queued = Boolean(queuedCast(view, s.id));
    const vow = list(s.tags).some((t) => prof.vows.includes(t));
    const fav = prof.favorites.includes(s.id);
    return `<div class="cc-spell-row" data-direction="${esc(s.direction ?? 'custom')}"><button type="button" class="cc-spell" data-act="pick" data-v="${esc(s.id)}" aria-current="${ui.spellId === s.id ? 'true' : 'false'}"${attr('data-open', ui.spellId === s.id)}>
      <span class="cc-spell-g">${glyphFor(s)}</span>
      <span class="cc-spell-t"><b>${esc(s.name)}${fav ? ' <i class="cc-fav">★</i>' : ''}</b><span>${esc(shortLine(s))}${vow ? ' · <em class="cc-warn-text">обет</em>' : ''}</span></span>
    </button><button type="button" class="cc-quickcast" data-act="cast" data-v="${esc(s.id)}" aria-pressed="${queued}" aria-label="${queued ? 'Заклинание уже в очереди: ' : 'Быстро добавить в очередь: '}${esc(s.name)}">${coin(s.cost, queued ? 'cc-coin-on' : '')}</button></div>`;
  };
  const directions = list(view.data?.directions);
  const tab = schoolTab(ui, prof, directions);
  const searching = Boolean(String(ui.q ?? '').trim());
  const tabBtn = (id, label, title, glyph = '') => `<button type="button" data-act="school" data-v="${esc(id)}" title="${esc(title)}" aria-pressed="${!searching && tab === id}">${glyph}<span>${esc(label)}</span></button>`;
  const nav = `<nav class="cc-school-nav" aria-label="Школы магии">${tabBtn('all', 'Все', 'Все школы')}${tabBtn('fav', 'Избранное', 'Избранные заклинания', STAR)}${directions.map((d) => tabBtn(d.id, SCHOOL_SHORT[d.id] ?? d.name, d.name, glyphFor({ direction: d.id }))).join('')}${tabBtn('custom', 'Свои', 'Свои заклинания')}</nav>`;
  const chapter = (ch, inner) => `<section class="cc-chapter" data-direction="${esc(ch.id)}">
      <h4 class="cc-chapter-h">${ch.glyph}<span>${esc(ch.name)}</span><small>${ch.spells.length}</small></h4>
      ${inner}
    </section>`;
  const flat = (ch) => chapter(ch, `<div class="cc-spells" role="list">${ch.spells.map(row).join('')}</div>`);
  const byCost = (ch) => chapter(ch, costGroups(ch.spells).map((g) => `<div class="cc-cost-h">${esc(g.label)}</div><div class="cc-spells" role="list">${g.spells.map(row).join('')}</div>`).join(''));
  let body;
  if (searching) {
    const chs = spellChapters(found, directions);
    body = chs.length ? `<p class="cc-small cc-search-note">Поиск по всем школам</p>${chs.map(flat).join('')}` : '';
  } else if (tab === 'all') {
    body = spellChapters(found, directions).map(byCost).join('');
  } else if (tab === 'fav') {
    const chs = spellChapters(found.filter((s) => prof.favorites.includes(s.id)), directions);
    body = chs.map(flat).join('') || '<p class="cc-small">Пока пусто. Отметьте заклинание звёздочкой на его странице — оно появится здесь.</p>';
  } else {
    const ch = spellChapters(found, directions).find((c) => c.id === tab);
    body = ch ? byCost(ch) : '';
    if (!ch && tab === 'custom') body = '<p class="cc-small">Своих заклинаний пока нет. Создать — во вкладке «Ещё».</p>';
  }
  return `${nav}${filters}${body || '<p class="cc-small">Ничего не нашлось.</p>'}`;
}

// Короткие имена школ для вкладок: полное имя — в подсказке и заголовке главы.
const SCHOOL_SHORT = { matter: 'Стихии', body: 'Тело', mind: 'Разум', images: 'Иллюзии', bonds: 'Духи', bounds: 'Пространство' };

// Открытая вкладка: выбранная, иначе «Избранное», если оно есть, иначе первая школа.
export function schoolTab(ui, profile, directions) {
  if (ui.school) return ui.school;
  return list(profile?.favorites).length ? 'fav' : (directions[0]?.id ?? 'custom');
}

// Подзаголовки по цене внутри школы: «бесплатно», «цена 1»…
export function costGroups(spells) {
  const groups = [];
  for (const s of spells) {
    const label = s.cost ? `цена ${s.cost}` : 'бесплатно';
    if (groups.at(-1)?.label !== label) groups.push({ label, spells: [] });
    groups.at(-1).spells.push(s);
  }
  return groups;
}

// Главы списка: школы по порядку, свои заклинания — отдельной главой; внутри — по цене.
// Пустые главы (после поиска и фильтров) не показываются.
export function spellChapters(spells, directions) {
  const byCost = (a, b) => a.cost - b.cost;
  const custom = spells.filter((s) => String(s.id).startsWith('custom:'));
  const builtin = spells.filter((s) => !String(s.id).startsWith('custom:'));
  const chapters = directions.map((d) => ({
    id: d.id,
    name: d.name,
    glyph: glyphFor({ direction: d.id }),
    spells: builtin.filter((s) => s.direction === d.id).sort(byCost),
  }));
  const known = new Set(directions.map((d) => d.id));
  const stray = builtin.filter((s) => !known.has(s.direction));
  chapters.push({ id: 'custom', name: 'Свои заклинания', glyph: STAR, spells: [...custom, ...stray].sort(byCost) });
  return chapters.filter((ch) => ch.spells.length);
}

// Парящий лист выбранного заклинания: подробности, прогноз, необязательные настройки.
export function leafHtml(view, ui, preview, spell) {
  const st = current(view);
  const confirmed = view.state;
  const src = st.profile.source;
  const queued = queuedCast(view, spell.id);
  const opts = ui.opts;
  const payload = queued?.payload ?? quickPayload(spell, { mode: view.mode, source: src, giftUsed: confirmed?.giftUsed }, opts);
  // Прогноз: если каст уже в очереди, он учтён в forecast; иначе считаем поверх.
  let costLine = '';
  let problems = '';
  if (queued) {
    const f = list(st.fractures).find((x) => x.castId === queued.id);
    costLine = `Цена ${esc(st.casts?.[queued.id]?.cost ?? spell.cost)} · свеча ${esc(scaleText(st, confirmed))}${f ? ` · <b class="cc-bad-text">надлом ${esc(f.weight)}</b>` : ''}`;
  } else {
    const r = safePreview(preview, 'cast', payload);
    if (r.ok && r.state) {
      const c = r.state.casts?.__preview__;
      const f = list(r.state.fractures).find((x) => x.castId === '__preview__');
      costLine = `Цена ${esc(c?.cost ?? spell.cost)} · свеча ${esc(`${scaleOf(st)}/${SCALE} → ${scaleOf(r.state)}/${SCALE}`)}${f ? ` · <b class="cc-bad-text">надлом ${esc(f.weight)}</b>` : ''}`;
      problems = list(r.warnings).map((w) => warnBox(w)).join('');
    } else problems = warnBox(r.reason ?? 'так не выйдет', 'cc-bad');
  }
  const gift = giftOption(src, spell);
  const extra = [];
  if (view.mode === 'dice' && rollsAgainst(spell)) {
    extra.push(`<div class="cc-field"><span>Сложность цели</span>${seg('difficulty', DIFFICULTIES.map((d) => [d, `${DIFFICULTY_RU[d]} · ${THRESHOLDS[spell.resist][d]}`]), queued?.payload?.difficulty ?? opts.difficulty)}</div>`);
  }
  if (gift === 'discount' && !confirmed?.giftUsed) {
    extra.push(`<label class="cc-check"><input type="checkbox" data-act="opt-gift"${attr('checked', opts.gift)}> Дар: на 1 дешевле (тратится до отдыха)</label>`);
  } else if (gift === 'loan' && !confirmed?.giftUsed) {
    extra.push(`<label class="cc-check"><input type="checkbox" data-act="opt-loan"${attr('checked', opts.loan)}> В долг: за 0, покровитель потребует своё</label>`);
    if (opts.loan) extra.push(field('Условие долга', textInput('opts.debt', opts.debt, 'Что персона будет должна', { area: true, id: 'cc-debt' })));
  }
  const fav = st.profile.favorites.includes(spell.id);
  const rolls = view.mode === 'dice' && rollsAgainst(spell);
  return `<article class="cc-leaf" data-direction="${esc(spell.direction ?? 'custom')}" data-queued="${Boolean(queued)}">
    <nav class="cc-leaf-nav" aria-label="Навигация страницы">
      <button type="button" data-act="unpick">← Каталог</button>
      <button type="button" data-act="close" aria-label="Закрыть том">✕</button>
    </nav>
    <div class="cc-leaf-top">
      <span class="cc-leaf-g">${glyphFor(spell)}</span>
      <button type="button" class="cc-starbtn" data-act="fav" data-v="${esc(spell.id)}" aria-pressed="${fav}" title="${fav ? 'Убрать из избранного' : 'В избранное'}">${STAR}</button>
      <button type="button" class="cc-x cc-leaf-x" data-act="unpick" title="Закрыть лист" aria-label="Закрыть лист">✕</button>
    </div>
    <h3 class="cc-leaf-name" tabindex="-1">${esc(spell.name)}</h3>
    <p class="cc-leaf-short">${esc(shortLine(spell))}</p>
    <div class="cc-leaf-cost">${costLine}</div>
    ${problems}
    ${spell.limit ? `<p class="cc-leaf-summary">${esc(spell.limit)}</p>` : ''}
    <details class="cc-leaf-facts" data-leaf-detail="facts"${attr('open', ui.leafFactsOpen)}><summary>Цель и заметность</summary><dl class="cc-dl"><dt>Цель</dt><dd>${esc(spell.target)}</dd><dt>Заметность</dt><dd>${esc(spell.visibility)}</dd></dl></details>
    ${rolls ? '<p class="cc-small">Кубик d20 бросится при отправке, один раз — свайпы его не перебросят.</p>' : ''}
    ${view.mode === 'story' ? '<p class="cc-small">«Сюжет»: чудо удаётся в пределах заклинания, платится только цена.</p>' : ''}
    ${extra.length ? `<details class="cc-leaf-settings" data-leaf-detail="settings"${attr('open', ui.leafSettingsOpen)}><summary>Настройки каста</summary><div class="cc-leaf-extra">${extra.join('')}</div></details>` : ''}
    <div class="cc-leaf-go">${queued
    ? `<span class="cc-ok-text">✦ В очереди — уйдёт с вашим сообщением</span>${btn('dequeue', 'Убрать', { v: queued.id, cls: 'cc-ghost' })}`
    : btn('cast', 'В очередь', { v: spell.id, cls: 'cc-primary' })}</div>
  </article>`;
}

function castPage(view, ui, preview) {
  const spell = ui.spellId ? list(view.data?.spells).find((s) => s.id === ui.spellId) : null;
  return { main: spellListHtml(view, ui), side: spell ? leafHtml(view, ui, preview, spell) : frontispiece(view) };
}

// Правая страница без выбранного заклинания: экслибрис персоны, чары «под рукой» и сводка «сейчас».
export function frontispiece(view) {
  const st = current(view);
  const p = st.profile;
  const src = sourceById(view.data, p.source);
  const spells = list(view.data?.spells);
  const byId = new Map(spells.map((s) => [s.id, s]));
  const fav = list(p.favorites).filter((id) => byId.has(id));
  const recent = [];
  // Недавние — только по уже отправленным кастам, без очереди.
  for (const c of Object.values((view.state ?? st).casts ?? {}).reverse()) {
    const id = c?.spell?.id;
    if (id && byId.has(id) && !fav.includes(id) && !recent.includes(id)) recent.push(id);
  }
  const slot = '<div class="cc-hand-slot" aria-hidden="true">✦</div>';
  const hand = [...fav.slice(0, 6), ...recent.slice(0, Math.max(0, 6 - Math.min(fav.length, 6)))].map((id) => byId.get(id));
  const card = (s) => {
    const queued = Boolean(queuedCast(view, s.id));
    const isRecent = !fav.includes(s.id);
    return `<div class="cc-hand-card" data-direction="${esc(s.direction ?? 'custom')}"><button type="button" class="cc-hand-pick" data-act="pick" data-v="${esc(s.id)}" title="${esc(shortLine(s))}"><span class="cc-spell-g">${glyphFor(s)}</span><b>${esc(s.name)}</b>${isRecent ? '<i>недавно</i>' : ''}</button><button type="button" class="cc-quickcast" data-act="cast" data-v="${esc(s.id)}" aria-pressed="${queued}" aria-label="${queued ? 'Заклинание уже в очереди: ' : 'Быстро добавить в очередь: '}${esc(s.name)}">${coin(s.cost, queued ? 'cc-coin-on' : '')}</button></div>`;
  };
  // «Сейчас» — подтверждённое состояние; то, что в очереди, отдельной строкой.
  const done = view.state ?? st;
  const effects = list(done.effects);
  const fr = list(done.fractures);
  const spent = Boolean(done.giftUsed);
  const pending = list(view.pending).filter((c) => c.kind === 'cast').map((c) => c.payload?.spell?.name).filter(Boolean);
  const calm = !effects.length && !fr.length && !pending.length;
  const now = calm ? `<li class="cc-now-calm">${STAR}<span>спокойно: чар нет, надломов нет, дар ${spent ? 'потрачен' : 'доступен'}</span></li>` : [
    effects.length
      ? `<li>${STAR}<span>Действует: ${esc(effects.slice(0, 3).map((e) => e.spell?.name ?? 'чары').join(', '))}${effects.length > 3 ? ` и ещё ${effects.length - 3}` : ''}</span></li>`
      : `<li>${STAR}<span>Ничего не действует</span></li>`,
    `<li>${STAR}<span>${fr.length ? `Надломов: ${fr.length}` : 'Надломов нет'} · дар ${spent ? 'потрачен' : 'доступен'}</span></li>`,
    pending.length ? `<li class="cc-now-q">${STAR}<span>В очереди: ${esc(pending.join(', '))}</span></li>` : '',
  ].join('');
  const trait = String(src?.trait ?? '').split(/(?<=\.)\s/)[0];
  return `<div class="cc-frontispiece">
    <header class="cc-exlibris">
      <span class="cc-front-mark">${SOURCE_GLYPH[p.source] ?? STAR}</span>
      <div><p class="cc-front-source">${esc(src?.name ?? 'Источник магии')}</p><h2>${esc(p.name || 'Персона')}</h2>${trait ? `<p class="cc-front-trait">${esc(trait)}</p>` : ''}</div>
    </header>
    <section class="cc-hand" aria-label="Под рукой">
      ${rule('Под рукой')}
      ${hand.length
        ? `<div class="cc-hand-grid">${hand.map(card).join('')}${slot.repeat(hand.length % 2)}</div>`
        : `<div class="cc-hand-grid cc-hand-slots">${slot.repeat(3)}</div><p class="cc-small cc-hand-empty">★ на странице чар — и они лягут сюда</p>`}
    </section>
    <section class="cc-now" aria-label="Сейчас">
      ${rule('Сейчас')}
      <ul>${now}</ul>
      <button type="button" class="cc-linkbtn" data-act="tab" data-v="state">Подробнее — в «Состоянии»</button>
    </section>
    ${src?.gift ? `<p class="cc-front-note">дар: ${esc(src.gift.charAt(0).toLowerCase() + src.gift.slice(1))}</p>` : ''}
  </div>`;
}

// ---------- страница «Состояние» ----------

function effectsHtml(view) {
  const st = current(view);
  const effects = list(st.effects);
  const pendingIds = new Set(list(view.pending).map((c) => c.id));
  const rows = effects.map((e) => `<div class="cc-row">
      <div><b>${esc(e.spell?.name)}</b><span>${esc([e.target?.label, e.intent].filter(Boolean).join(' · ') || (e.spell?.duration === 'bond' ? 'связь по согласию' : 'действует'))}${pendingIds.has(e.castId) ? ' · в очереди' : ''}</span></div>
      ${btn('effect-end', 'Завершить', { v: e.id, cls: 'cc-ghost' })}
    </div>`).join('');
  return `${rule('Действующие чары', effects.length ? String(effects.length) : '')}${rows || '<p class="cc-small">Сейчас ничего не действует.</p>'}`;
}

function fracturesHtml(view, ui) {
  const st = current(view);
  const fr = list(st.fractures);
  if (!fr.length) return '';
  const body = fr.map((f) => {
    const m = f.manifest;
    const from = st.casts?.[f.castId]?.spell?.name;
    let more = m ? `<p class="cc-text">${esc(m.text)}</p>` : '';
    const heal = m?.heal?.[f.severity] ?? m?.heal?.[String(f.severity)];
    if (heal) more += `<p class="cc-small"><b>Как снять:</b> ${esc(heal)}</p>`;
    if (ui.manifestFor === f.id || !m) {
      const options = list(view.data?.fractures).filter((x) => x.source === f.source);
      more += ui.manifestFor === f.id || !m
        ? `<div class="cc-choice">${options.map((o) => `<button type="button" class="cc-opt" data-act="manifest" data-f="${esc(f.id)}" data-v="${esc(o.id)}" aria-pressed="${m?.id === o.id}"><b>${esc(o.name)}</b><span>${esc(o.text)}</span></button>`).join('')}${m ? btn('manifest-cancel', 'Оставить как есть', { cls: 'cc-ghost' }) : ''}</div>`
        : '';
    }
    if (ui.acceptFor === f.id) {
      const tags = list(view.data?.tags);
      more += `<div class="cc-confirm">
        ${field('Что останется навсегда', textInput('accept.text', ui.accept.text, 'Шрам, утрата, привычка…', { area: true, id: 'cc-accept' }))}
        ${field('Закрывает вид магии', `<select class="cc-input" data-bind="accept.tag" id="cc-accept-tag"><option value="">— нет —</option>${tags.map((t) => `<option value="${esc(t.id)}"${attr('selected', ui.accept.tag === t.id)}>${esc(t.label)}</option>`).join('')}</select>`)}
        <div class="cc-inline">${btn('accept-go', 'Принять навсегда', { v: f.id, disabled: !clean(ui.accept.text) })}${btn('accept-cancel', 'Отмена', { cls: 'cc-ghost' })}</div>
      </div>`;
    } else if (m && ui.manifestFor !== f.id) {
      more += `<div class="cc-inline">${btn('manifest-open', 'Другое проявление', { v: f.id, cls: 'cc-ghost' })}${btn('heal', 'Условие выполнено — снять', { v: f.id, cls: 'cc-ghost' })}${f.severity >= 3 ? btn('accept-open', 'Принять навсегда', { v: f.id, cls: 'cc-ghost' }) : ''}</div>`;
    }
    return `<div class="cc-fracture" data-sev="${esc(f.severity)}"><div class="cc-fr-head"><b>${esc(m?.name ?? 'Проявление не выбрано')}</b><span>Надлом ${esc(SOURCE_GEN[f.source] ?? '')} · ${esc(SEVERITY_RU[f.severity] ?? f.severity)}${from ? ` · после «${esc(from)}»` : ''}</span></div>${more}</div>`;
  }).join('');
  return `${rule('Надломы', String(fr.length))}${body}<p class="cc-small">Снятый надлом переходит в обычное напряжение и уходит с отдыхом.</p>`;
}

function debtsHtml(view) {
  const st = current(view);
  const debts = list(st.debts);
  if (!debts.length) return '';
  const body = debts.map((d) => {
    const from = st.casts?.[d.castId]?.spell?.name;
    return `<div class="cc-row"><div><b>${esc(d.patron ? `Покровителю: ${d.patron}` : 'Покровителю')}</b><span>${esc(d.condition || 'условие ещё не названо')}${from ? ` · за «${esc(from)}»` : ''}</span></div>${btn('debt-settle', 'Погасить', { v: d.id, cls: 'cc-ghost' })}</div>`;
  }).join('');
  return `${rule('Долги', String(debts.length))}${body}`;
}

function recoveryHtml(view, preview) {
  const st = current(view);
  const src = st.profile.source;
  const pv = (kind, payload = {}) => safePreview(preview, kind, payload);
  const action = (act, kind, label, payload) => {
    const r = pv(kind, payload);
    return btn(act, label, { disabled: !r.ok, title: r.ok ? '' : capFirst(r.reason ?? ''), cls: 'cc-ghost' });
  };
  const out = [`<div class="cc-actions">
    ${action('breather', 'breather', 'Передышка')}
    ${action('rest', 'rest', 'Отдых')}
    ${btn('scene-end', 'Конец сцены', { cls: 'cc-ghost' })}
  </div>
  <p class="cc-small">Передышка снимает одно напряжение раз до отдыха. Отдых возвращает силы, дар и передышку — надломы остаются. Конец сцены завершает чары, кроме связей по согласию.</p>`];
  if (src === 'nature') {
    out.push(`<div class="cc-field"><span>Среда вокруг</span>${seg('env', [['living', 'живая'], ['lifeless', 'без жизни'], ['unspecified', 'не отмечена']], st.environment)}</div>`);
    out.push(`<div class="cc-actions">${action('nature-gift', 'nature_gift', 'Дар природы: снять напряжение')}</div>`);
  }
  if (src === 'faith') {
    const failed = Object.entries(st.casts ?? {}).filter(([, c]) => c.outcome === 'failure' && !c.prayer);
    const pray = failed.map(([id, c]) => {
      const r = pv('faith_pray', { castId: id });
      return `<div class="cc-row"><div><b>«${esc(c.spell?.name)}»</b><span>${esc(r.ok ? 'провал — можно помолиться' : capFirst(r.reason ?? ''))}</span></div>${btn('pray', 'Молиться', { v: id, disabled: !r.ok })}</div>`;
    }).join('');
    out.push(`${rule('Молитва после провала')}<p class="cc-small">d20 при отправке: на 11+ провал станет успехом.</p>${pray || '<p class="cc-small">Проваленных кастов без молитвы нет.</p>'}`);
  }
  return `${rule('Восстановление')}${out.join('')}`;
}

function statePage(view, ui, preview) {
  return [effectsHtml(view), fracturesHtml(view, ui), debtsHtml(view), recoveryHtml(view, preview)].join('');
}

// ---------- страница «Ещё» ----------

function profileFields(d, data) {
  const parts = [];
  parts.push(`<div class="cc-field"><span>Источник силы</span><div class="cc-sources cc-sources-sm">${sourcesOf(data).map((s) => `<button type="button" class="cc-source" data-act="prof-source" data-v="${esc(s.id)}" aria-pressed="${d.source === s.id}" data-src="${esc(s.id)}">${SOURCE_GLYPH[s.id] ?? ''}<b>${esc(s.name)}</b></button>`).join('')}</div></div>`);
  parts.push(field('Имя', textInput('prof.name', d.name, 'Как зовут персону', { maxlength: 80, id: 'cc-prof-name' })));
  parts.push(field('Как выглядит её магия', textInput('prof.signature', d.signature, 'Серебряные строки, запах грозы… (необязательно)', { area: true, id: 'cc-prof-sig' })));
  parts.push(field('Способ выражения', textInput('prof.expression', d.expression, 'Жест, песня, формула шёпотом… (необязательно)', { id: 'cc-prof-expr' })));
  if (d.source === 'faith') {
    parts.push(`<div class="cc-field"><span>Обеты — от чего вера требует отказаться</span><div class="cc-picks">${list(data?.tags).map((t) => `<label class="cc-pick"><input type="checkbox" data-act="prof-vow" data-v="${esc(t.id)}"${attr('checked', d.vows.includes(t.id))}><span>${esc(t.vow)}</span></label>`).join('')}</div><small>При нарушении панель предупредит, но не запретит.</small></div>`);
  }
  if (d.source === 'pact') parts.push(field('Покровитель', textInput('prof.patron', d.patron, 'Кто дал силу (необязательно)', { maxlength: 120, id: 'cc-prof-patron' })));
  return parts.join('');
}

const profileFromDraft = (d) => ({
  name: clean(d.name), source: d.source, signature: clean(d.signature), expression: clean(d.expression),
  vows: d.source === 'faith' ? [...d.vows] : [], patron: d.source === 'pact' ? clean(d.patron) : '',
});

function customHtml(ui) {
  const c = ui.custom;
  const RESIST = { none: 'без сопротивления', consent: 'по согласию', soft: 'мягкое', hard: 'жёсткое' };
  const DURATION = { instant: 'мгновенно', scene: 'до конца сцены', sustained: 'пока держится', bond: 'связь' };
  const opt = (map, value) => Object.entries(map).map(([k, l]) => `<option value="${esc(k)}"${attr('selected', k === value)}>${esc(l)}</option>`).join('');
  return `${field('Название', textInput('custom.name', c.name, 'Например: Тёплый ветер', { maxlength: 80, id: 'cc-c-name' }))}
    <div class="cc-grid3">
      ${field('Цена', `<select class="cc-input" data-bind="custom.cost" data-num="1" id="cc-c-cost">${[0, 1, 2, 3].map((n) => `<option value="${n}"${attr('selected', Number(c.cost) === n)}>${n}</option>`).join('')}</select>`)}
      ${field('Сопротивление', `<select class="cc-input" data-bind="custom.resist" id="cc-c-res">${opt(RESIST, c.resist)}</select>`)}
      ${field('Длится', `<select class="cc-input" data-bind="custom.duration" id="cc-c-dur">${opt(DURATION, c.duration)}</select>`)}
    </div>
    ${field('Цель', textInput('custom.target', c.target, 'На кого или на что', { id: 'cc-c-target' }))}
    ${field('Предел', textInput('custom.limit', c.limit, 'Чего чудо не делает', { area: true, id: 'cc-c-limit' }))}
    ${field('Если удалось', textInput('custom.success', c.success, 'Текст для модели', { area: true, id: 'cc-c-ok' }))}
    ${field('Если не вышло', textInput('custom.failure', c.failure, 'Текст для модели: эффект не наступил', { area: true, id: 'cc-c-fail' }))}
    ${list(ui.customErrors).map((e) => warnBox(e, 'cc-bad')).join('')}
    <div class="cc-inline">${btn('custom-save', 'Добавить в том')}</div>`;
}

function notesHtml(view, ui) {
  const st = current(view);
  const notes = list(st.notes);
  const traits = list(st.profile.traits);
  const text = (n) => (n.kind === 'effect-end'
    ? `«${n.spell?.name ?? 'чары'}»${n.target?.label ? ` → ${n.target.label}` : ''}: ${END_RU[n.reason] ?? 'снято'}${n.comment ? `. ${n.comment}` : ''}`
    : n.text ?? '');
  const noteRows = notes.map((n) => `<div class="cc-row"><div><span class="cc-ink">${esc(text(n))}</span></div><button type="button" class="cc-x" data-act="note-remove" data-v="${esc(n.id)}" title="Убрать заметку" aria-label="Убрать заметку">✕</button></div>`).join('');
  const traitRows = traits.map((t) => `<div class="cc-row"><div><span class="cc-ink">${esc(t.text)}</span>${t.origin ? `<span>${esc(t.origin)}</span>` : ''}</div><button type="button" class="cc-x" data-act="trait-remove" data-v="${esc(t.id)}" title="Убрать свойство" aria-label="Убрать свойство">✕</button></div>`).join('');
  return `${noteRows || '<p class="cc-small">Заметок нет.</p>'}
    <div class="cc-add">${textInput('noteText', ui.noteText, 'Чем закончились чары…', { area: true, id: 'cc-note' })}${btn('note-add', 'Добавить', { disabled: !clean(ui.noteText) })}</div>
    ${rule('Постоянные свойства')}
    ${traitRows || '<p class="cc-small">Пока нет.</p>'}
    <div class="cc-add">${textInput('traitText', ui.traitText, 'Шрам, утрата, клятва…', { id: 'cc-trait' })}${btn('trait-add', 'Добавить', { disabled: !clean(ui.traitText) })}</div>`;
}

function rowExtra(row) {
  const ev = row.event;
  const after = row.after;
  if (!after) return '';
  if (ev.kind === 'cast') {
    const c = after.casts?.[ev.id];
    if (!c) return '';
    const bits = [`цена ${c.cost}`];
    if (c.roll) bits.push(`d20: ${c.roll.d20} против ${c.roll.threshold}`);
    bits.push(OUTCOME_RU[c.outcome] ?? c.outcome);
    if (c.prayer) bits.push(c.prayer.answered ? 'молитва услышана' : 'молитва без ответа');
    if (c.fractureId) bits.push('надлом');
    return bits.join(' · ');
  }
  if (ev.kind === 'faith_pray') {
    const pr = after.casts?.[ev.payload?.castId]?.prayer;
    return pr ? `d20: ${pr.d20} — ${pr.answered ? 'услышана' : 'без ответа'}` : '';
  }
  return '';
}

function journalHtml(view) {
  const rows = list(view.rows).slice().reverse();
  if (!rows.length) return '<p class="cc-small">Событий ещё нет. Всё, что вы поставите в очередь, появится здесь после отправки сообщения.</p>';
  return rows.map((row) => {
    const status = row.disabled ? 'disabled' : row.ok === false ? 'conflict' : row.warnings?.length ? 'warn' : 'ok';
    const st = row.before ?? view.state;
    const extra = rowExtra(row);
    let note = '';
    if (row.disabled) note = '<span>отключено</span>';
    else if (row.ok === false) note = `<span class="cc-bad-text">Не применено: ${esc(row.reason ?? '')}</span>`;
    else if (row.warnings?.length) note = `<span class="cc-warn-text">${esc(row.warnings.map(capFirst).join(' · '))}</span>`;
    return `<div class="cc-log" data-status="${status}">
      <div class="cc-log-main"><span>#${esc(row.mesIndex)} · ${esc(KIND_RU[row.event?.kind] ?? 'событие')}</span><b>${esc(describe(row.event?.kind, row.event?.payload, st))}</b>${extra ? `<span>${esc(extra)}</span>` : ''}${note}</div>
      ${btn('toggle-event', row.disabled ? 'Вернуть' : 'Отключить', { v: row.event?.id, cls: 'cc-ghost' })}
    </div>`;
  }).join('');
}

function settingsHtml(view) {
  const s = view.settings ?? {};
  return `<div class="cc-field"><span>Оформление</span>${seg('theme', Object.entries(THEME_RU), s.theme ?? 'amethyst')}</div>
    <label class="cc-check"><input type="checkbox" data-act="enabled"${attr('checked', s.enabled !== false)}> Передавать магию модели</label>
    <label class="cc-field cc-row-field"><span>Глубина блока состояния</span><input type="number" class="cc-input cc-num" id="cc-depth-in" min="0" max="10" step="1" data-act="depth" value="${esc(s.depth ?? 1)}"></label>
    <div class="cc-inline">${btn('prof-template', 'Сохранить профиль как шаблон', { cls: 'cc-ghost' })}</div>`;
}

function morePage(view, ui) {
  const st = current(view);
  const prof = st.profile;
  const d = ui.profileDraft ?? { ...emptyDraft(), ...prof, vows: [...list(prof.vows)] };
  const changed = ui.profileDraft !== null;
  const block = (key, title, body) => `<details class="cc-more" data-more="${key}"${attr('open', ui.moreOpen === key)}><summary>${esc(title)}</summary><div class="cc-more-body">${body}</div></details>`;
  return [
    block('profile', 'Профиль персоны', `${profileFields(d, view.data)}<div class="cc-inline">${btn('prof-save', 'Сохранить', { disabled: !changed })}${changed ? btn('prof-reset', 'Как было', { cls: 'cc-ghost' }) : ''}</div><p class="cc-small">Изменения уйдут с вашим следующим сообщением.</p>`),
    block('custom', 'Своё заклинание', customHtml(ui)),
    block('notes', 'Заметки и постоянные свойства', notesHtml(view, ui)),
    block('journal', 'Журнал событий', journalHtml(view)),
    block('settings', 'Настройки', settingsHtml(view)),
  ].join('');
}

// ---------- без профиля ----------

export function choiceHtml(view, ui) {
  const sources = sourcesOf(view.data);
  return `<div class="cc-choose">
    <p class="cc-choose-lead">Чья это магия? Выберите источник силы — остальное можно дописать потом.</p>
    <div class="cc-sources">${sources.map((s) => `<button type="button" class="cc-source" data-act="create" data-v="${esc(s.id)}" data-src="${esc(s.id)}">
      ${SOURCE_GLYPH[s.id] ?? ''}<b>${esc(s.name)}</b><span>${esc(s.gift)}</span>
    </button>`).join('')}</div>
    ${ui.createError ? warnBox(ui.createError, 'cc-bad') : ''}
  </div>`;
}

// ---------- весь том ----------

const tome = (view, inner, { side = '', spread = false, selected = false, layout = 'spread', candle = '', ribbons = '' } = {}) => {
  const theme = esc(view?.settings?.theme ?? 'amethyst');
  return `<div class="cc-tome" data-theme="${theme}" data-spread="${spread}" data-selected="${selected}" data-layout="${esc(layout)}">
    <div class="cc-edges" aria-hidden="true"></div>
    <div class="cc-lavender" aria-hidden="true"></div>
    <div class="cc-corners" aria-hidden="true">${CORNER}${CORNER}${CORNER}${CORNER}</div>
    <div class="cc-spine">${RING}${RING}${RING}</div>
    ${candle ? `<div class="cc-tome-candle">${BRACKET}${candle}</div>` : ''}
    ${ribbons}
    ${inner}
    ${side ? `<div class="cc-side">${side}</div>` : ''}
    <div class="cc-props" aria-hidden="true"><div class="cc-candlelight"></div><div class="cc-moth"><i class="cc-moth-rest"></i><i class="cc-moth-fly"></i></div></div>
  </div>`;
};

const blankPage = (text) => `<section class="cc-page"><header class="cc-pagehead"><div class="cc-title"><i>✦</i><span>Последние чары</span><i>✦</i></div></header><div class="cc-pagebody">${text}</div>${closeBtn}</section>`;

export function panelHtml(view, ui, preview) {
  if (!view || !view.chatOpen) return tome(view, blankPage('<p class="cc-empty">Откройте чат — магия хранится в каждом чате отдельно.</p>'));
  if (view.unsupported) return tome(view, blankPage(warnBox('Данные магии в этом чате записаны другой версией расширения. Панель их не трогает — обновите расширение.', 'cc-bad')));
  if (!view.hasProfile || !current(view)) return tome(view, blankPage(choiceHtml(view, ui)));
  let main;
  let side = '';
  if (ui.tab === 'state') main = statePage(view, ui, preview);
  else if (ui.tab === 'more') main = morePage(view, ui);
  else ({ main, side } = castPage(view, ui, preview));
  const page = `<section class="cc-page">
    ${closeBtn}
    ${headHtml(view, ui)}
    ${ui.tab === 'cast' ? `<div class="cc-queue-slot">${queueHtml(view)}</div>` : ''}
    ${ui.tab === 'cast' ? `<div class="cc-toolbar"><button type="button" data-act="layout" data-v="${ui.layout === 'compact' ? 'spread' : 'compact'}" aria-label="${ui.layout === 'compact' ? 'Показать разворот' : 'Компактный режим'}">${ui.layout === 'compact' ? 'Разворот' : 'Компактно'}</button>${ui.spellId ? btn('unpick', 'К каталогу', { cls: 'cc-back' }) : ''}</div>` : ''}
    <div class="cc-pagebody">${main}</div>
  </section>`;
  const casting = ui.tab === 'cast';
  return tome(view, page, { side: casting ? side : frontispiece(view), spread: true, selected: Boolean(casting && ui.spellId), layout: ui.layout ?? 'spread', candle: candleHtml(view), ribbons: ribbonsHtml(view, ui) });
}

// ---------- DOM ----------

function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k];
  o[keys[keys.length - 1]] = value;
}

export function createPanel(actions) {
  const ui = { ...initialUi(), moreOpen: null };
  let view = null;
  let scrollTop = false;
  let lastLevel = null;
  let renderedSpellId = null;
  const host = document.createElement('div');
  host.id = 'cc-panel-host';
  const shadow = host.attachShadow({ mode: 'open' });
  const reset = document.createElement('style');
  reset.textContent = ':host { all: initial; }';
  const sheet = document.createElement('link');
  sheet.rel = 'stylesheet';
  sheet.href = new URL('./style.css?v=0.1.2', import.meta.url).href;
  const root = document.createElement('div');
  root.id = 'cc-panel';
  root.className = 'cc-panel';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Последние чары');
  shadow.append(reset, sheet, root);
  document.body.append(host);

  const preview = (kind, payload) => actions.preview(kind, payload);
  const st = () => (view ? current(view) : null);
  const spellById = (id) => list(view?.data?.spells).find((s) => s.id === id) ?? null;

  function paint() {
    if (root.hidden) return;
    const active = shadow.activeElement;
    let focusKey = null;
    let focusAct = null;
    let focusV = null;
    let sel = null;
    if (active && root.contains(active) && active.dataset?.bind) {
      focusKey = active.dataset.bind;
      try { sel = [active.selectionStart, active.selectionEnd]; } catch { sel = null; }
    } else if (active && root.contains(active) && active.dataset?.act) {
      focusAct = active.dataset.act;
      focusV = active.dataset.v;
    }
    const scroller = root.querySelector('.cc-pagebody');
    if (scroller?.getClientRects?.().length) ui.listScroll = scroller.scrollTop;
    if (ui.spellId && renderedSpellId === ui.spellId) {
      ui.leafFactsOpen = Boolean(root.querySelector('[data-leaf-detail="facts"]')?.open);
      ui.leafSettingsOpen = Boolean(root.querySelector('[data-leaf-detail="settings"]')?.open);
    }
    const resetScroll = scrollTop;
    scrollTop = false;
    root.innerHTML = panelHtml(view, ui, preview);
    ui.flipTo = null;
    const body = root.querySelector('.cc-pagebody');
    if (body) body.scrollTop = resetScroll ? 0 : (ui.tab === 'cast' ? ui.listScroll : 0);
    // Короткая вспышка свечи, когда напряжение выросло (после отправки).
    const level = view?.state ? scaleOf(view.state) : null;
    if (lastLevel !== null && level !== null && level > lastLevel) root.querySelector('.cc-candle-box')?.classList.add('cc-flare');
    lastLevel = level;
    if (focusKey) {
      const el = [...root.querySelectorAll('[data-bind]')].find((x) => x.dataset.bind === focusKey);
      if (el) {
        el.focus();
        if (sel && sel[0] !== null && typeof el.setSelectionRange === 'function') {
          try { el.setSelectionRange(sel[0], sel[1]); } catch { /* поле без выделения */ }
        }
      }
    } else if (focusAct) {
      let el;
      if (focusAct === 'pick') el = root.querySelector('.cc-leaf-name') ?? [...root.querySelectorAll('[data-act="pick"]')].find((x) => x.dataset.v === focusV);
      else if (focusAct === 'unpick') el = root.querySelector('[data-bind="q"]');
      else el = [...root.querySelectorAll('[data-act]')].find((x) => x.dataset.act === focusAct && (focusV === undefined || x.dataset.v === focusV))
        ?? [...root.querySelectorAll('[data-act]')].find((x) => x.dataset.act === focusAct);
      el?.focus();
    }
    renderedSpellId = ui.spellId;
  }

  const enqueue = (kind, payload) => actions.enqueue(kind, payload);

  // Каст одним нажатием: в очередь с настройками листа; если уже в очереди — заменить.
  function castSpell(spellId, { replace = false } = {}) {
    const spell = spellById(spellId);
    const s = st();
    if (!spell || !s) return null;
    const old = queuedCast(view, spellId);
    if (old && !replace) return old;
    if (old) actions.dequeue(old.id);
    const payload = quickPayload(spell, { mode: view.mode, source: s.profile.source, giftUsed: view.state?.giftUsed }, ui.opts);
    return enqueue('cast', payload);
  }

  function patchList(fieldName, id) {
    const prof = st()?.profile;
    if (!prof) return;
    const cur = list(prof[fieldName]);
    // Открытая вкладка не перескакивает на «Избранное» от первой звёздочки.
    if (fieldName === 'favorites' && !ui.school) ui.school = schoolTab(ui, prof, list(view.data?.directions));
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    const last = list(view.pending).at(-1);
    if (last?.kind === 'profile_patch' && Object.keys(last.payload ?? {}).length === 1 && fieldName in last.payload) actions.dequeue(last.id);
    enqueue('profile_patch', { [fieldName]: next });
  }

  function ensureDraft() {
    if (!ui.profileDraft) {
      const p = st().profile;
      ui.profileDraft = { ...emptyDraft(), ...p, vows: [...list(p.vows)] };
    }
  }

  async function create(source) {
    ui.createError = '';
    try {
      const r = await actions.createProfile({ profile: { source } });
      if (r && r.ok === false) ui.createError = r.errors?.join('; ') || 'Не получилось начать.';
      else ui.tab = 'cast';
    } catch (err) {
      ui.createError = err?.message ?? 'Не получилось начать.';
    }
    paint();
  }

  function onClick(ev) {
    const el = ev.target.closest('[data-act]');
    if (!el || !root.contains(el) || el.disabled) return;
    if (el.tagName === 'INPUT' || el.tagName === 'SELECT') return;
    const { act, v } = el.dataset;
    const s = st();
    switch (act) {
      case 'close': close(); return;
      case 'tab': ui.tab = v; ui.profileDraft = null; scrollTop = true; break;
      case 'more': ui.tab = 'more'; ui.moreOpen = v; scrollTop = true; break;
      case 'mode': ui.flipTo = v; actions.setMode(v); return;
      case 'theme': actions.setTheme?.(v); return;
      case 'dequeue': actions.dequeue(v); return;
      case 'create': create(v); return;
      // каст
      case 'f-label': ui.label = ui.label === v ? '' : v; break;
      case 'school': ui.school = v; break;
      case 'layout': ui.layout = v === 'compact' ? 'compact' : 'spread'; break;
      case 'pick':
        // Повторный клик по открытой строке закрывает лист.
        if (ui.spellId === v) { ui.spellId = null; break; }
        ui.opts = emptyOpts(); ui.leafFactsOpen = false; ui.leafSettingsOpen = false; ui.spellId = v; break;
      case 'toggle-cast': {
        if (ui.spellId !== v) { ui.opts = emptyOpts(); ui.leafFactsOpen = false; ui.leafSettingsOpen = false; }
        ui.spellId = v;
        break;
      }
      case 'cast': castSpell(v); return;
      case 'unpick': ui.spellId = null; break;
      case 'fav': patchList('favorites', v); return;
      case 'difficulty': ui.opts.difficulty = v; if (queuedCast(view, ui.spellId)) { castSpell(ui.spellId, { replace: true }); return; } break;
      // состояние
      case 'effect-end': enqueue('effect_end', { effectId: v, reason: 'removed' }); return;
      case 'scene-end': enqueue('scene_end', { effectIds: list(s?.effects).filter((e) => e.spell?.duration !== 'bond').map((e) => e.id) }); return;
      case 'manifest-open': ui.manifestFor = v; break;
      case 'manifest-cancel': ui.manifestFor = null; break;
      case 'manifest': {
        const t = list(view.data?.fractures).find((x) => x.id === v);
        ui.manifestFor = null;
        if (t) enqueue('fracture_manifest', { fractureId: el.dataset.f, manifest: { id: t.id, name: t.name, text: t.text, heal: { ...t.heal }, accept: t.accept } });
        return;
      }
      case 'heal': enqueue('fracture_heal', { fractureId: v }); return;
      case 'accept-open': {
        const f = list(s?.fractures).find((x) => x.id === v);
        ui.acceptFor = v;
        ui.accept = { text: f?.manifest?.accept ?? '', tag: '' };
        break;
      }
      case 'accept-cancel': ui.acceptFor = null; break;
      case 'accept-go': {
        const f = list(s?.fractures).find((x) => x.id === v);
        const text = clean(ui.accept.text);
        if (!text) return;
        ui.acceptFor = null;
        enqueue('fracture_accept', { fractureId: v, trait: { text, origin: f?.manifest?.name ?? 'принятый надлом', forbiddenTags: ui.accept.tag ? [ui.accept.tag] : [] } });
        return;
      }
      case 'debt-settle': enqueue('debt_settle', { debtId: v }); return;
      case 'breather': enqueue('breather', {}); return;
      case 'rest': enqueue('rest', {}); return;
      case 'nature-gift': enqueue('nature_gift', {}); return;
      case 'env': enqueue('environment_set', { environment: v }); return;
      case 'pray': enqueue('faith_pray', { castId: v }); return;
      // ещё
      case 'note-add': {
        const text = clean(ui.noteText);
        if (!text) return;
        ui.noteText = '';
        enqueue('note_add', { text });
        return;
      }
      case 'note-remove': enqueue('note_remove', { noteId: v }); return;
      case 'trait-add': {
        const text = clean(ui.traitText);
        if (!text) return;
        ui.traitText = '';
        enqueue('trait_add', { text, origin: '', forbiddenTags: [] });
        return;
      }
      case 'trait-remove': enqueue('trait_remove', { traitId: v }); return;
      case 'prof-source': ensureDraft(); ui.profileDraft.source = v; break;
      case 'prof-reset': ui.profileDraft = null; break;
      case 'prof-save': {
        const prof = s.profile;
        const next = profileFromDraft(ui.profileDraft ?? { ...emptyDraft(), ...prof });
        const patch = {};
        for (const k of Object.keys(next)) if (JSON.stringify(next[k]) !== JSON.stringify(prof[k])) patch[k] = next[k];
        ui.profileDraft = null;
        if (Object.keys(patch).length) { enqueue('profile_patch', patch); return; }
        break;
      }
      case 'prof-template': if (s) actions.saveTemplate(structuredClone(s.profile)); return;
      case 'custom-save': {
        const r = actions.addCustomSpell({ ...ui.custom, cost: Number(ui.custom.cost) });
        Promise.resolve(r).then((res) => {
          if (res?.ok === false) ui.customErrors = list(res.errors).length ? res.errors : ['Не получилось сохранить.'];
          else { ui.custom = emptyCustom(); ui.customErrors = []; }
          paint();
        }, (err) => { ui.customErrors = [err?.message ?? 'Не получилось сохранить.']; paint(); });
        return;
      }
      case 'toggle-event': actions.toggleEvent(v); return;
      default: return;
    }
    paint();
  }

  const isChoice = (el) => el.tagName === 'SELECT' || el.type === 'checkbox';

  function bindValue(el) {
    const bind = el.dataset.bind;
    const value = el.type === 'checkbox' ? el.checked : el.dataset.num ? Number(el.value) : el.value;
    if (bind.startsWith('prof.')) { ensureDraft(); setPath(ui, `profileDraft.${bind.slice(5)}`, value); } else setPath(ui, bind, value);
    return { bind, value };
  }

  function onInput(ev) {
    const el = ev.target;
    if (!el.dataset?.bind || !root.contains(el) || isChoice(el)) return;
    const { bind, value } = bindValue(el);
    if (bind === 'q') { paint(); return; }
    if (bind.startsWith('prof.')) {
      const b = root.querySelector('[data-act="prof-save"]');
      if (b) b.disabled = false;
      return;
    }
    const btnAct = { noteText: 'note-add', traitText: 'trait-add', 'accept.text': 'accept-go' }[bind];
    if (btnAct) {
      const b = root.querySelector(`[data-act="${btnAct}"]`);
      if (b) b.disabled = !clean(String(value));
    }
  }

  function onChange(ev) {
    const el = ev.target;
    if (!root.contains(el)) return;
    const { act, v } = el.dataset ?? {};
    if (el.dataset?.bind) {
      if (isChoice(el)) { bindValue(el); paint(); return; }
      // Условие долга: после ввода каст в очереди обновляется.
      if (el.dataset.bind === 'opts.debt' && queuedCast(view, ui.spellId)) castSpell(ui.spellId, { replace: true });
      return;
    }
    switch (act) {
      case 'opt-gift': ui.opts.gift = el.checked; if (queuedCast(view, ui.spellId)) castSpell(ui.spellId, { replace: true }); else paint(); return;
      case 'opt-loan': ui.opts.loan = el.checked; if (queuedCast(view, ui.spellId)) castSpell(ui.spellId, { replace: true }); else paint(); return;
      case 'prof-vow': ensureDraft(); ui.profileDraft.vows = el.checked ? [...ui.profileDraft.vows, v] : ui.profileDraft.vows.filter((x) => x !== v); paint(); return;
      case 'enabled': actions.setEnabled(el.checked); return;
      case 'depth': {
        const n = Number(el.value);
        if (Number.isInteger(n) && n >= 0) actions.setDepth(n);
        return;
      }
      default:
    }
  }

  function onKey(ev) {
    if (ev.key !== 'Escape' || root.hidden) return;
    // Esc сначала закрывает лист заклинания, потом весь том.
    if (ui.spellId && ui.tab === 'cast') { ui.spellId = null; paint(); return; }
    close();
  }

  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  root.addEventListener('change', onChange);
  // toggle у <details> не всплывает — ловим на погружении, чтобы перерисовка помнила раскрытое.
  root.addEventListener('toggle', (ev) => {
    const key = ev.target?.dataset?.more;
    if (key) {
      if (ev.target.open) ui.moreOpen = key;
      else if (ui.moreOpen === key) ui.moreOpen = null;
      return;
    }
    if (ev.target?.dataset?.leafDetail === 'facts') ui.leafFactsOpen = ev.target.open;
    if (ev.target?.dataset?.leafDetail === 'settings') ui.leafSettingsOpen = ev.target.open;
  }, true);
  root.addEventListener('scroll', (ev) => {
    if (ev.target?.classList?.contains('cc-pagebody') && ui.tab === 'cast' && ev.target.getClientRects?.().length) ui.listScroll = ev.target.scrollTop;
  }, true);
  document.addEventListener('keydown', onKey);

  // Перетаскивание: смещение от места по умолчанию, на телефонной вёрстке не применяется.
  const POS_KEY = 'cena-chuda:pos';
  const narrow = () => globalThis.matchMedia?.('(max-width: 700px)').matches ?? false;
  let off = null;
  try {
    const p = JSON.parse(globalThis.localStorage?.getItem(POS_KEY) ?? 'null');
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) off = { x: p.x, y: p.y };
  } catch { off = null; }
  const savePos = () => {
    try {
      if (off) globalThis.localStorage?.setItem(POS_KEY, JSON.stringify(off));
      else globalThis.localStorage?.removeItem(POS_KEY);
    } catch { /* без хранилища */ }
  };
  function applyPos(next = off) {
    root.style.translate = 'none';
    if (!next || narrow() || root.hidden) return;
    const tome = root.querySelector('.cc-tome');
    if (!tome) return;
    off = clampOffset(next, tome.getBoundingClientRect(), globalThis.innerWidth, globalThis.innerHeight);
    root.style.translate = `${off.x}px ${off.y}px`;
  }
  // Если обложки почти не видно (окно сильно уменьшили), том возвращается на место.
  function ensureReachable() {
    const tome = root.querySelector('.cc-tome');
    if (!off || narrow() || !tome) return;
    const r = tome.getBoundingClientRect();
    const vis = (a, b, max) => Math.min(b, max) - Math.max(a, 0);
    if (vis(r.left, r.right, globalThis.innerWidth) >= 120 && vis(r.top, r.bottom, globalThis.innerHeight) >= 120) return;
    off = null;
    savePos();
    applyPos();
  }
  const NO_GRAB = 'button, input, select, textarea, a, summary, label, [data-act], [contenteditable], .cc-page, .cc-side';
  let drag = null;
  root.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 || narrow() || !ev.target.closest?.('.cc-tome') || ev.target.closest(NO_GRAB)) return;
    drag = { id: ev.pointerId, sx: ev.clientX, sy: ev.clientY, from: off ?? { x: 0, y: 0 }, moved: false };
  });
  root.addEventListener('pointermove', (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    const dx = ev.clientX - drag.sx;
    const dy = ev.clientY - drag.sy;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      root.setPointerCapture?.(ev.pointerId);
      root.classList.add('cc-dragging');
    }
    applyPos({ x: drag.from.x + dx, y: drag.from.y + dy });
  });
  const endDrag = (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    const moved = drag.moved;
    drag = null;
    root.classList.remove('cc-dragging');
    try { root.releasePointerCapture?.(ev.pointerId); } catch { /* захвата нет */ }
    if (moved) savePos();
  };
  root.addEventListener('pointerup', endDrag);
  root.addEventListener('pointercancel', endDrag);
  root.addEventListener('dblclick', (ev) => {
    if (narrow() || !ev.target.closest?.('.cc-tome') || ev.target.closest(NO_GRAB)) return;
    off = null;
    savePos();
    applyPos();
  });
  globalThis.addEventListener?.('resize', () => applyPos());

  function open() {
    root.hidden = false;
    document.body.classList.add('cc-open');
    paint();
    applyPos();
    ensureReachable();
  }

  function close() {
    root.hidden = true;
    document.body.classList.remove('cc-open');
  }

  return {
    open,
    close,
    toggle: () => (root.hidden ? open() : close()),
    isOpen: () => !root.hidden,
    // Каст из подсказки у поля ввода: те же правила, что у нажатия в томе.
    quickCast(spellId) {
      if (!view?.hasProfile) return null;
      ui.opts = emptyOpts();
      return castSpell(spellId);
    },
    render(next) {
      if (switchChat(ui, view?.chatId, next?.chatId)) { scrollTop = true; lastLevel = null; }
      view = next;
      if (ui.spellId && !spellById(ui.spellId)) ui.spellId = null;
      paint();
    },
  };
}
