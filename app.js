// «Последние чары» — слой SillyTavern: хранение в чате, очередь до отправки, тексты в промпте, панель.
import {
  META_KEY, MODES, previewCommand, enqueue as coreEnqueue, dequeue as coreDequeue, commitPending,
  toggleEvent as coreToggleEvent, computeChat,
} from './core/chat-journal.mjs?v=0.1.14';
import { createSnapshot } from './core/state.mjs?v=0.1.14';
import { statusBlock } from './core/prompt.mjs?v=0.1.14';
import {
  readMeta, worthWarning, hasProfile, hasHistory, canSwitchMode, buildView, promptTexts, normalizeSettings, clampDepth, ITEMS, SKINS, THEMES,
  upsertTemplate, removeTemplate, saveCustomSpell as saveCustomSpellTo, deleteCustomSpell as deleteCustomSpellFrom, migrateCustom, PROMPT_OPTIONS, DEPTH_MIN, DEPTH_MAX,
} from './view.mjs?v=0.1.14';
import { createPanel, candleHtml } from './ui.js?v=0.1.14';
import { levelGrew, playFx } from './candle.js?v=0.1.14';
import { scaleOf } from './core/rules.mjs?v=0.1.14';
import { clampOffset } from './view.mjs?v=0.1.14';
import { createDicePresenter } from './dice.js?v=0.1.14';
import { buildMatchers, findSpell } from './hint.js?v=0.1.14';
import FRACTURES from './core/data/fractures.mjs?v=0.1.14';

const MODULE = 'cena-chuda';
const SETTINGS_KEY = 'cenaChuda';
const TITLE = 'Последние чары';
const UNSUPPORTED_TEXT = 'Данные магии в этом чате от другой версии расширения — панель их не трогает';
const INJECT = { status: 'cena_chuda_status', fact: 'cena_chuda_fact' };
// Значения extension_prompt_types.IN_CHAT и extension_prompt_roles.SYSTEM (public/script.js).
const IN_CHAT = 1;
const ROLE_SYSTEM = 0;

const ctx = () => SillyTavern.getContext();
const toast = (kind, text) => globalThis.toastr?.[kind]?.(text, TITLE);
const chatId = () => ctx().getCurrentChatId?.() ?? null;
const chatOpen = () => Boolean(chatId());
const eventTypes = (c) => c.event_types ?? c.eventTypes;

// ---------- настройки ----------

const readSettings = () => normalizeSettings(ctx().extensionSettings?.[SETTINGS_KEY]);

function writeSettings(patch) {
  const all = ctx().extensionSettings;
  all[SETTINGS_KEY] = { ...normalizeSettings(all[SETTINGS_KEY]), ...patch };
  ctx().saveSettingsDebounced();
  return all[SETTINGS_KEY];
}

// ---------- метаданные чата ----------

// Ссылку на chatMetadata не кэшируем: таверна подменяет объект при смене чата.
// Чтение ничего не пишет в chatMetadata.
function current() {
  if (!chatOpen()) return { open: false, chat: [], meta: null, unsupported: false, exists: false, raw: undefined };
  const c = ctx();
  const raw = c.chatMetadata?.[META_KEY];
  return { open: true, chat: c.chat ?? [], raw, ...readMeta(raw) };
}

// Одно предупреждение на чат о незнакомых метаданных.
let warnedChat = null;
function warnUnsupported(cur) {
  const id = chatId();
  if (!cur.unsupported || warnedChat === id || !worthWarning(cur.raw)) return;
  warnedChat = id;
  toast('warning', UNSUPPORTED_TEXT);
}

// Сохранения идут строго по очереди; несколько изменений подряд сливаются в одно сохранение.
// После каждого await проверяется, что чат тот же, иначе запись пропускается: saveChat контекста
// пишет только текущий чат, а записать чужой чат его снимком нельзя без риска затереть свежие данные.
// saveChat контекста (saveChatConditional) пишет и сообщения, и метаданные, в том числе в группах.
let queue = Promise.resolve();
const dirtyChats = new Set();
function persist() {
  const now = chatId();
  if (now) dirtyChats.add(now);
  const step = async () => {
    const ids = [...dirtyChats];
    dirtyChats.clear();
    const cur = chatId();
    for (const id of ids) {
      if (id === cur) continue;
      // Правка лежит в метаданных прошлого чата в памяти; сохранится, только если таверна
      // сама записала тот чат при переключении.
      console.warn(`[${MODULE}] изменение магии не сохранено отдельно: чат «${id}» сменился до записи. `
        + 'Если таверна не сохранила его при переключении, последняя правка в нём потеряна.');
    }
    if (cur && ids.includes(cur)) await ctx().saveChat();
  };
  queue = queue.then(step).catch((err) => console.error(`[${MODULE}] не сохранено:`, err));
  return queue;
}

// Изменение метаданных: fn получает нормализованную копию и чат, возвращает
// { write, result }. write — положить meta в chatMetadata и сохранить (вместе с чатом).
function mutate(fn, { needProfile = true } = {}) {
  const cur = current();
  if (!cur.open) return { result: null, done: false };
  if (cur.unsupported) {
    toast('warning', UNSUPPORTED_TEXT);
    return { result: null, done: false };
  }
  if (needProfile && !hasProfile(cur.meta)) return { result: null, done: false };
  const out = fn(cur.meta, cur.chat) ?? {};
  if (out.write) {
    ctx().chatMetadata[META_KEY] = cur.meta;
    persist();
    refresh();
  }
  return { result: out.result, done: Boolean(out.write) };
}

// ---------- промпт ----------

function setPrompts(status, fact) {
  const c = ctx();
  c.setExtensionPrompt(INJECT.status, status, IN_CHAT, readSettings().depth, false, ROLE_SYSTEM);
  // Глубина 0: после последнего сообщения; при продолжении таверна сама ставит перед ответом.
  c.setExtensionPrompt(INJECT.fact, fact, IN_CHAT, 0, false, ROLE_SYSTEM);
}

// Режим бога в модель не передаётся: он лишь убирает из текста угрозу надломом.
const promptOptions = (s) => ({ ...PROMPT_OPTIONS, free: s.free });

function updatePrompts(type = 'normal') {
  const cur = current();
  const s = readSettings();
  const { status, fact } = promptTexts({
    chat: cur.chat, meta: cur.meta, unsupported: cur.unsupported, enabled: s.enabled, type, options: promptOptions(s),
  });
  setPrompts(status, fact);
}

// Вызывается таверной перед сборкой промпта (manifest.generate_interceptor):
// (chat, contextSize, abort, type). Только пересчитывает тексты, ничего не фиксирует.
globalThis.cenaChudaInterceptor = async (_chat, _contextSize, _abort, type) => {
  try {
    updatePrompts(type);
  } catch (err) {
    console.error(`[${MODULE}] промпт не обновлён:`, err);
    try { setPrompts('', ''); } catch { /* таверна недоступна */ }
  }
};

// ---------- действия панели ----------

const actions = {
  createProfile(input = {}) {
    let errors = [];
    const { result } = mutate((meta, chat) => {
      if (hasProfile(meta) && hasHistory(chat, meta)) {
        errors = ['в чате уже есть события — профиль меняется через журнал'];
        return {};
      }
      let snapshot;
      // Имя по умолчанию — из персоны таверны.
      const profile = { ...(input.profile ?? {}) };
      if (!profile.name) profile.name = String(ctx().name1 ?? '').trim();
      try {
        snapshot = createSnapshot({ ...input, profile });
      } catch (err) {
        errors = [String(err?.message ?? err)];
        return {};
      }
      meta.snapshot = snapshot;
      if (MODES.includes(input.mode)) meta.mode = input.mode;
      return { write: true, result: true };
    }, { needProfile: false });
    if (result) return { ok: true, errors: [] };
    if (!errors.length) errors = [chatOpen() ? 'изменения в этом чате недоступны' : 'чат не открыт'];
    return { ok: false, errors };
  },

  saveTemplate(profile) {
    const r = upsertTemplate(readSettings().templates, profile);
    if (r.ok) {
      writeSettings({ templates: r.templates });
      refresh();
    }
    return { ok: r.ok, errors: r.errors };
  },

  deleteTemplate(name) {
    writeSettings({ templates: removeTemplate(readSettings().templates, name) });
    refresh();
  },

  setMode(mode) {
    if (!MODES.includes(mode)) return { ok: false, reason: 'неизвестный режим' };
    let out = { ok: false, reason: '' };
    const { done } = mutate((meta) => {
      if (meta.mode === mode) {
        out = { ok: true, reason: '' };
        return {};
      }
      const check = canSwitchMode(meta);
      if (!check.ok) {
        out = check;
        toast('warning', check.reason);
        return {};
      }
      meta.mode = mode;
      out = { ok: true, reason: '' };
      return { write: true };
    });
    if (!done && !out.ok && !out.reason) out.reason = chatOpen() ? 'изменения в этом чате недоступны' : 'чат не открыт';
    return out;
  },

  preview(kind, payload = {}) {
    const cur = current();
    if (!cur.open) return { ok: false, reason: 'чат не открыт', warnings: [], state: null, forecast: false };
    if (cur.unsupported) return { ok: false, reason: 'данные магии в этом чате от другой версии', warnings: [], state: null, forecast: false };
    try {
      return previewCommand(cur.chat, cur.meta, kind, payload);
    } catch (err) {
      return { ok: false, reason: String(err?.message ?? err), warnings: [], state: null, forecast: false };
    }
  },

  enqueue(kind, payload = {}) {
    const { result } = mutate((meta, chat) => {
      let check;
      try {
        check = previewCommand(chat, meta, kind, payload);
      } catch (err) {
        check = { ok: false, reason: String(err?.message ?? err) };
      }
      if (!check.ok) {
        toast('warning', check.reason || 'действие сейчас невозможно');
        return {};
      }
      return { write: true, result: coreEnqueue(meta, kind, payload, { now: Date.now() }) };
    });
    return result ?? null;
  },

  dequeue(commandId) {
    mutate((meta) => (coreDequeue(meta, commandId) ? { write: true } : {}));
  },

  toggleEvent(eventId) {
    mutate((meta, chat) => (coreToggleEvent(chat, meta, eventId) ? { write: true } : {}));
  },

  // Свои чары общие для всех чатов и лежат в настройках, а не в метаданных чата.
  saveCustomSpell(input, editId = null) {
    const r = saveCustomSpellTo(readSettings(), current().meta, input, { editId });
    if (!r.ok) return { ok: false, errors: r.errors };
    writeSettings(r.patch);
    refresh();
    return { ok: true, errors: [], id: r.card.id };
  },

  deleteCustomSpell(id) {
    const patch = deleteCustomSpellFrom(readSettings(), id);
    if (!patch) return { ok: false, errors: ['так не получится удалить'] };
    writeSettings(patch);
    refresh();
    return { ok: true, errors: [] };
  },

  setEnabled(on) {
    writeSettings({ enabled: Boolean(on) });
    syncSettingsDrawer();
    refresh();
  },

  setDesire(on) {
    writeSettings({ desire: Boolean(on) });
    syncSettingsDrawer();
    refresh();
  },

  setFree(on) {
    writeSettings({ free: Boolean(on) });
    syncSettingsDrawer();
    refresh();
  },

  setTheme(theme) {
    writeSettings({ theme, skin: theme });
    refresh();
  },

  setItem(item) {
    if (!ITEMS.includes(item)) return;
    writeSettings({ item, skin: SKINS[item][0] ?? '' });
    refresh();
  },

  setSkin(skin) {
    const s = readSettings();
    if (!SKINS[s.item].includes(skin)) return;
    writeSettings(THEMES.includes(skin) ? { skin, theme: skin } : { skin });
    refresh();
  },

  setDepth(n) {
    writeSettings({ depth: clampDepth(n) });
    syncSettingsDrawer();
    refresh();
  },
};

// ---------- отправка сообщения ----------

// Очередь уходит в отправленное сообщение игрока chat[index]. Бросок — здесь.
async function onMessageSent(index) {
  const id = chatId();
  const cur = current();
  if (!readSettings().enabled || !cur.open || cur.unsupported || !hasProfile(cur.meta)) return;
  const r = commitPending(cur.chat, cur.meta, Number(index), { now: Date.now(), rng: Math.random, fractures: FRACTURES });
  if (!r.changed) return;
  ctx().chatMetadata[META_KEY] = cur.meta;
  // Бросок уже зафиксирован в событии. Анимация лишь показывает его;
  // не ждём сохранения, которое само может вызвать обновление чата.
  pendingRollChat = id;
  refresh();
  for (const d of r.dropped) toast('warning', `Не применено: ${d.reason}`);
  // Ждём сохранения: при вставке в прошлое таверна сразу перечитывает чат с диска.
  await persist();
  if (chatId() !== id) return;
  refresh();
}

// ---------- обновление ----------

let panel = null;
let dicePresenter = null;
let pendingRollChat = null;
let lastView = null;
let refreshQueued = false;

function refresh() {
  if (refreshQueued) return;
  refreshQueued = true;
  queueMicrotask(() => {
    refreshQueued = false;
    try {
      const cur = current();
      warnUnsupported(cur);
      const moved = cur.open && !cur.unsupported ? migrateCustom(readSettings(), cur.meta) : null;
      if (moved) writeSettings(moved);
      const view = buildView({
        chatOpen: cur.open, chatId: chatId(), chat: cur.chat, meta: cur.meta, unsupported: cur.unsupported, settings: readSettings(),
      });
      lastView = view;
      panel?.render(view);
      const committed = pendingRollChat === view.chatId && readSettings().enabled;
      pendingRollChat = null;
      dicePresenter?.update(view, { committed });
      updateButton(cur, view);
      updateHint();
      updatePrompts();
    } catch (err) {
      console.error(`[${MODULE}] обновление не удалось:`, err);
    }
  });
}

// Летающая кнопка: свеча без подписи, а в чате с профилем — свеча с числом.
function updateButton(cur, view) {
  const btn = document.getElementById('cc-open');
  if (!btn) return;
  const n = !cur.unsupported && Array.isArray(cur.meta?.pending) ? cur.meta.pending.length : 0;
  btn.classList.toggle('cc-armed', n > 0);
  btn.title = n ? `${TITLE} — в очереди: ${n}, уйдёт с сообщением` : TITLE;
  btn.style.display = readSettings().enabled ? '' : 'none';
  const cfg = readSettings();
  btn.dataset.theme = cfg.theme;
  btn.dataset.item = cfg.item;
  btn.dataset.skin = cfg.skin;
  btn.innerHTML = view?.hasProfile && view.state ? candleHtml(view, { mini: true, uid: 'mini' }) : candleHtml({ settings: readSettings() }, { mini: true, uid: 'mini', bare: true });
  const level = view?.hasProfile && view.state ? scaleOf(view.state) : null;
  const same = miniFx.chat === (view?.chatId ?? null);
  if (same && levelGrew(miniFx.level, level)) miniFx.at = Date.now();
  Object.assign(miniFx, { chat: view?.chatId ?? null, level });
  if (!same) miniFx.at = 0;
  playFx(btn.querySelector('.cc-candle-box'), 'cc-drop', miniFx.at, 1500, 'cc-drop-fall');
  placeButton();
}
const miniFx = { chat: null, level: null, at: 0 };

const BTN_KEY = 'cena-chuda:btn';
const BTN_SIZE = 44;
let btnOff = null;

// Позиция задаётся left/top: на мобильной вёрстке таверны fixed считается от <html>, и bottom ненадёжен.
function placeButton() {
  const btn = document.getElementById('cc-open');
  if (!btn) return;
  const formH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cc-form-h')) || 64;
  const rect = { left: innerWidth - 12 - BTN_SIZE, top: innerHeight - formH - 76 - BTN_SIZE, width: BTN_SIZE, height: BTN_SIZE };
  btnOff = clampOffset(btnOff ?? { x: 0, y: 0 }, rect, innerWidth, innerHeight, BTN_SIZE);
  const barBottom = document.getElementById('top-settings-holder')?.getBoundingClientRect().bottom || 0;
  btnOff.y = Math.max(btnOff.y, Math.ceil(barBottom) - rect.top);
  btn.style.setProperty('left', `${rect.left + btnOff.x}px`);
  btn.style.setProperty('top', `${rect.top + btnOff.y}px`);
}

// ---------- подсказка каста по тексту поста ----------

let matchers = [];
let matchersKey = '';
const dismissed = new Map(); // id заклинания → текст, при котором подсказку закрыли
let hintTimer = null;

function hintCandidates(text, view) {
  const spells = Array.isArray(view?.data?.spells) ? view.data.spells : [];
  const key = spells.map((s) => `${s.id}:${s.name}`).join('|');
  if (key !== matchersKey) { matchers = buildMatchers(spells); matchersKey = key; }
  const skip = new Set((view?.pending ?? []).filter((c) => c.kind === 'cast').map((c) => c.payload?.spell?.id));
  // Закрытая подсказка не возвращается, пока текст только дописывается после неё.
  for (const [id, frag] of dismissed) {
    if (text.startsWith(frag)) skip.add(id);
    else dismissed.delete(id);
  }
  const out = [];
  for (let i = 0; i < 3; i++) {
    const hit = findSpell(text, matchers, skip);
    if (!hit) break;
    out.push(hit);
    skip.add(hit.id);
  }
  return out;
}

function hintChip(label, title, onPick, onDismiss, cls = '') {
  const chip = document.createElement('span');
  chip.className = `cc-hint-chip ${cls}`.trim();
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.title = title;
  b.addEventListener('mousedown', (e) => e.preventDefault()); // не забирать фокус у поля ввода
  b.addEventListener('click', onPick);
  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'cc-hint-x';
  x.textContent = '✕';
  x.title = cls ? 'Убрать из очереди' : 'Не колдовать';
  x.setAttribute('aria-label', x.title);
  x.addEventListener('mousedown', (e) => e.preventDefault());
  x.addEventListener('click', onDismiss);
  chip.append(b, x);
  return chip;
}

function updateHint() {
  const box = document.getElementById('cc-hint');
  const area = document.getElementById('send_textarea');
  if (!box || !area) return;
  const view = lastView;
  const text = String(area.value ?? '');
  const on = Boolean(readSettings().enabled && view?.hasProfile && !view.unsupported);
  const hits = on && text.trim() ? hintCandidates(text, view) : [];
  const queued = on ? (view.pending ?? []).filter((c) => c.kind === 'cast') : [];
  const cfg = readSettings();
  box.dataset.theme = cfg.theme;
  box.dataset.item = cfg.item;
  box.dataset.skin = cfg.skin;
  box.replaceChildren(
    ...queued.map((c) => hintChip(`✦ ${c.payload?.spell?.name ?? 'чудо'} · в очереди`, 'Уйдёт с вашим сообщением',
      () => panel?.open(), () => actions.dequeue(c.id), 'cc-hint-on')),
    ...hits.map((h) => hintChip(`✦ ${h.name}?`, 'Колдовать: встанет в очередь и уйдёт с сообщением',
      () => panel?.quickCast(h.id),
      () => { dismissed.set(h.id, String(area.value ?? '')); updateHint(); })),
  );
  box.hidden = !box.childElementCount;
}

function scheduleHint() {
  clearTimeout(hintTimer);
  hintTimer = setTimeout(updateHint, 160);
}

function mountHint() {
  const sheld = document.getElementById('form_sheld');
  const form = document.getElementById('send_form');
  if (!sheld || !form || document.getElementById('cc-hint')) return;
  const box = document.createElement('div');
  box.id = 'cc-hint';
  box.hidden = true;
  box.setAttribute('aria-live', 'polite');
  sheld.insertBefore(box, form);
  const area = document.getElementById('send_textarea');
  area?.addEventListener('input', scheduleHint);
  area?.addEventListener('compositionend', scheduleHint);
  // Высота формы ввода: том не должен закрывать кнопку отправки.
  const setH = () => document.documentElement.style.setProperty('--cc-form-h', `${Math.ceil(sheld.getBoundingClientRect().height)}px`);
  const setHp = () => { setH(); placeButton(); };
  setHp();
  try { new ResizeObserver(setHp).observe(sheld); } catch { globalThis.addEventListener?.('resize', setH); }
}

function mountFonts() {
  if (document.getElementById('cc-fonts')) return;
  const link = document.createElement('link');
  link.id = 'cc-fonts';
  link.rel = 'stylesheet';
  link.href = new URL('./fonts/fonts.css?v=0.1.14', import.meta.url).href;
  document.head.append(link);
}

function mountStyle() {
  if (document.getElementById('cc-style')) return;
  const hrefs = [new URL('./shells/tome.css?v=0.1.14', import.meta.url).href, new URL('./style.css?v=0.1.14', import.meta.url).href, new URL('./shells/phone.css?v=0.1.14', import.meta.url).href];
  hrefs.forEach((href, i) => {
    const link = document.createElement('link');
    if (i === 1) link.id = 'cc-style';
    link.rel = 'stylesheet';
    link.href = href;
    document.head.append(link);
  });
}

function mountDiceStyles() {
  if (document.getElementById('cc-dice-style')) return;
  const link = document.createElement('link');
  link.id = 'cc-dice-style';
  link.rel = 'stylesheet';
  link.href = new URL('./dice.css?v=0.1.14', import.meta.url).href;
  document.head.append(link);
}

// ---------- разметка таверны ----------

function mountButton() {
  if (document.getElementById('cc-open')) return;
  const btn = document.createElement('div');
  btn.id = 'cc-open';
  btn.tabIndex = 0;
  btn.title = TITLE;
  btn.setAttribute('role', 'button');
  btn.setAttribute('aria-label', TITLE);
  try {
    const p = JSON.parse(localStorage.getItem(BTN_KEY) ?? 'null');
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) btnOff = { x: p.x, y: p.y };
  } catch { btnOff = null; }
  let drag = null;
  let dragged = false;
  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragged = false;
    drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, from: btnOff ?? { x: 0, y: 0 }, moved: false };
    btn.setPointerCapture?.(e.pointerId);
  });
  btn.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.sx;
    const dy = e.clientY - drag.sy;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      btn.classList.add('cc-dragging');
    }
    btnOff = { x: drag.from.x + dx, y: drag.from.y + dy };
    placeButton();
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    dragged = drag.moved;
    drag = null;
    btn.classList.remove('cc-dragging');
    if (dragged) {
      try { localStorage.setItem(BTN_KEY, JSON.stringify(btnOff)); } catch { /* без хранилища */ }
    }
  };
  btn.addEventListener('pointerup', end);
  btn.addEventListener('pointercancel', end);
  btn.addEventListener('click', () => {
    if (dragged) { dragged = false; return; }
    panel?.toggle();
  });
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      panel?.toggle();
    }
  });
  btn.innerHTML = candleHtml({ settings: readSettings() }, { mini: true, uid: 'mini', bare: true });
  document.body.append(btn);
  placeButton();
  addEventListener('resize', placeButton);
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

function mountSettings() {
  const host = document.getElementById('extensions_settings2') ?? document.getElementById('extensions_settings');
  if (!host || document.getElementById('cc-settings')) return;
  const enabled = el('input', { type: 'checkbox', id: 'cc-enabled' });
  const desire = el('input', { type: 'checkbox', id: 'cc-desire' });
  const free = el('input', { type: 'checkbox', id: 'cc-free' });
  const depth = el('input', { type: 'number', id: 'cc-depth', className: 'text_pole', min: String(DEPTH_MIN), max: String(DEPTH_MAX) });
  const box = el('div', { id: 'cc-settings' }, [
    el('div', { className: 'inline-drawer' }, [
      el('div', { className: 'inline-drawer-toggle inline-drawer-header' }, [
        el('b', { textContent: TITLE }),
        el('div', { className: 'inline-drawer-icon fa-solid fa-circle-chevron-down down' }),
      ]),
      el('div', { className: 'inline-drawer-content' }, [
        el('label', { className: 'checkbox_label' }, [enabled, el('span', { textContent: 'Включено' })]),
        el('label', { className: 'checkbox_label' }, [desire, el('span', { textContent: 'Чары влечения (18+)' })]),
        el('label', { className: 'checkbox_label' }, [free, el('span', { textContent: 'Режим бога (каст без цены)' })]),
        el('label', { htmlFor: 'cc-depth', textContent: 'Глубина блока состояния' }),
        depth,
        el('small', { textContent: 'Факт хода всегда идёт сразу после сообщения игрока.' }),
      ]),
    ]),
  ]);
  host.append(box);
  enabled.addEventListener('change', () => actions.setEnabled(enabled.checked));
  desire.addEventListener('change', () => actions.setDesire(desire.checked));
  free.addEventListener('change', () => actions.setFree(free.checked));
  depth.addEventListener('change', () => actions.setDepth(depth.value));
  syncSettingsDrawer();
}

function syncSettingsDrawer() {
  const s = readSettings();
  const enabled = document.getElementById('cc-enabled');
  const depth = document.getElementById('cc-depth');
  if (enabled) enabled.checked = s.enabled;
  const desire = document.getElementById('cc-desire');
  if (desire) desire.checked = s.desire;
  const free = document.getElementById('cc-free');
  if (free) free.checked = s.free;
  if (depth) depth.value = String(s.depth);
}

// ---------- события ----------

const REFRESH_EVENTS = [
  'MESSAGE_DELETED', 'MESSAGE_EDITED', 'MESSAGE_UPDATED', 'MESSAGE_SWIPED', 'MESSAGE_SWIPE_DELETED', 'MESSAGE_RECEIVED',
  'MORE_MESSAGES_LOADED', 'CHAT_DELETED', 'GROUP_CHAT_DELETED',
];

let started = false;
function init() {
  if (started) return;
  started = true;
  const c = ctx();
  mountStyle();
  mountFonts();
  mountDiceStyles();
  dicePresenter = createDicePresenter();
  panel = createPanel(actions);
  mountButton();
  mountHint();
  mountSettings();

  const ev = c.eventSource;
  const t = eventTypes(c);
  // Промис возвращается: ST ждёт его перед reloadCurrentChat при вставке в прошлое (/send at=).
  ev.on(t.MESSAGE_SENT, (index) => {
    dismissed.clear();
    return onMessageSent(index).catch((err) => console.error(`[${MODULE}] очередь не зафиксирована:`, err)).finally(updateHint);
  });
  ev.on(t.CHAT_CHANGED, () => {
    pendingRollChat = null;
    dicePresenter?.update({ chatId: chatId(), rows: [] });
    // Тексты прошлого чата не должны попасть в следующую генерацию.
    try { setPrompts('', ''); } catch (err) { console.error(`[${MODULE}] промпт не очищен:`, err); }
    dismissed.clear();
    refresh();
  });
  for (const name of REFRESH_EVENTS) if (t[name]) ev.on(t[name], () => refresh());
  refresh();
}

// Только чтение: состояние и блок состояния текущего чата.
globalThis.CenaChudaAPI = Object.freeze({
  apiVersion: 1,
  state() {
    const cur = current();
    if (cur.unsupported || !hasProfile(cur.meta)) return null;
    return structuredClone(computeChat(cur.chat, cur.meta)?.state ?? null);
  },
  statusBlock() {
    const cur = current();
    if (cur.unsupported || !hasProfile(cur.meta)) return '';
    const view = computeChat(cur.chat, cur.meta);
    return view ? statusBlock(view.state, promptOptions(readSettings())) : '';
  },
});

// APP_READY в таверне «залипающее»: подписка после события срабатывает сразу.
const c0 = ctx();
c0.eventSource.on(eventTypes(c0).APP_READY, init);
