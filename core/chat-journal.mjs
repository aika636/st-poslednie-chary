// Связка журнала с чатом: где лежат события, очередь команд до отправки, фиксация очереди
// в сообщение игрока, отключение событий и выбор сообщения для факта хода.
// Без DOM и без SillyTavern: на входе массив сообщений чата и объект метаданных чата.
// Время, генератор случайных чисел и id приходят параметрами.
import { applyEvent, replay, EVENT_KINDS } from './journal.mjs?v=0.1.17';
import { rollsAgainst, DIFFICULTIES } from './rules.mjs?v=0.1.17';

export const META_KEY = 'cenaChuda';
export const EXTRA_KEY = 'cenaChuda';
export const SCHEMA_VERSION = 1;
export const MODES = ['story', 'dice'];

export function emptyMeta() {
  return { schemaVersion: SCHEMA_VERSION, snapshot: null, mode: 'story', pending: [], seq: 0 };
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Дополняет недостающее, лишние поля сохраняет. Незнакомую версию схемы (и данные без версии,
// но явно в чужом формате) не трогает: { meta: исходный объект, unsupported: true } —
// слой ST показывает предупреждение и ничего не записывает.
export function normalizeMeta(raw) {
  if (raw === undefined || raw === null) return { meta: emptyMeta(), unsupported: false };
  if (!isObject(raw)) return { meta: raw, unsupported: true };
  const version = raw.schemaVersion;
  const foreign = version === undefined && Object.keys(raw).length > 0;
  if ((version !== undefined && version !== SCHEMA_VERSION) || foreign) return { meta: raw, unsupported: true };
  const meta = { ...emptyMeta(), ...raw };
  if (!MODES.includes(meta.mode)) meta.mode = 'story';
  if (!Array.isArray(meta.pending)) meta.pending = [];
  if (!Number.isInteger(meta.seq) || meta.seq < 0) meta.seq = 0;
  if (meta.snapshot !== null && !isObject(meta.snapshot)) meta.snapshot = null;
  return { meta, unsupported: false };
}

export const isSupported = (meta) => isObject(meta) && meta.schemaVersion === SCHEMA_VERSION;

// Следующий id в пределах чата: seq растёт в метаданных и не повторяется.
function nextId(meta, prefix, now) {
  meta.seq += 1;
  return `${prefix}-${Math.max(0, Math.floor(now)).toString(36)}-${meta.seq}`;
}

export const messageRecord = (message) => {
  const rec = message?.extra?.[EXTRA_KEY];
  return isObject(rec) ? rec : null;
};

export const messageEvents = (message) => {
  const events = messageRecord(message)?.events;
  return Array.isArray(events) ? events : [];
};

// Все события чата: по положению сообщения, внутри сообщения — по порядку записи.
export function collectEvents(chat) {
  const out = [];
  (chat ?? []).forEach((message, mesIndex) => {
    for (const event of messageEvents(message)) out.push({ event, mesIndex });
  });
  return out;
}

const DUPLICATE = 'событие с таким id уже есть в журнале';

// Пересчёт с номером сообщения у каждой строки. replay() не даёт строк для отключённых
// и повторных событий — панели они нужны, поэтому строки собираются здесь.
function detailedReplay(snapshot, entries) {
  const r = replay(snapshot, entries.map((e) => e.event));
  const byEvent = new Map(r.rows.map((row) => [row.event, row]));
  const rows = entries.map((entry) => {
    const { event } = entry;
    if (!event) return null;
    const row = byEvent.get(event);
    byEvent.delete(event);
    if (event.disabled) return { ...entry, ok: null, disabled: true, reason: null, warnings: [], before: null, after: null };
    if (row) return { ...entry, ...row };
    return { ...entry, ok: false, reason: DUPLICATE, warnings: [], before: null, after: null };
  }).filter(Boolean);
  return { state: r.state, conflicts: r.conflicts, rows };
}

// Команда очереди в виде события для прогноза: бросков ещё нет. Каст с проверкой в режиме
// кубика считается как успех — только чтобы показать цену; молитва — как неуслышанная.
function forecastEvent(command, mode) {
  const payload = { ...(command.payload ?? {}) };
  let forecast = false;
  if (command.kind === 'cast' && mode === 'dice' && payload.spell && rollsAgainst(payload.spell)) {
    delete payload.roll;
    payload.outcome = 'success';
    forecast = true;
  } else if (command.kind === 'faith_pray') {
    payload.d20 = 1;
    forecast = true;
  }
  return { event: { id: command.id, kind: command.kind, payload }, forecast };
}

function pendingEntries(meta) {
  return (meta.pending ?? []).map((command) => {
    const { event, forecast } = forecastEvent(command, meta.mode);
    return { event, mesIndex: null, pending: true, commandId: command.id, forecast };
  });
}

// Картина чата: подтверждённое состояние и прогноз с очередью. null — профиля нет
// или схема не поддерживается.
export function computeChat(chat, meta) {
  if (!isSupported(meta) || !meta.snapshot) return null;
  const entries = collectEvents(chat);
  const committed = detailedReplay(meta.snapshot, entries);
  const pending = pendingEntries(meta);
  const withQueue = detailedReplay(meta.snapshot, [...entries, ...pending]);
  const ids = new Set(pending.map((p) => p.event.id));
  return {
    state: committed.state,
    conflicts: committed.conflicts,
    rows: committed.rows,
    pendingPreview: {
      state: withQueue.state,
      rows: withQueue.rows.filter((r) => r.pending),
      conflicts: withQueue.conflicts.filter((c) => ids.has(c.id)),
    },
  };
}

// Проверка команды против состояния с уже стоящей очередью — для кнопок панели.
export function previewCommand(chat, meta, kind, payload = {}) {
  const view = computeChat(chat, meta);
  if (!view) return { ok: false, reason: 'профиль персоны ещё не создан', warnings: [], state: null, forecast: false };
  const { event, forecast } = forecastEvent({ id: '__preview__', kind, payload }, meta.mode);
  const r = applyEvent(view.pendingPreview.state, event);
  return { ok: r.ok, reason: r.reason, warnings: r.warnings, state: r.state, forecast };
}

// Команда в очередь (мутирует meta). Проверку делает previewCommand до вызова.
export function enqueue(meta, kind, payload = {}, { now = Date.now() } = {}) {
  if (!EVENT_KINDS.includes(kind)) throw new Error(`неизвестный вид события «${kind}»`);
  const command = { id: nextId(meta, 'ev', now), kind, payload: structuredClone(payload), at: now };
  meta.pending.push(command);
  return command;
}

export function dequeue(meta, commandId) {
  const before = meta.pending.length;
  meta.pending = meta.pending.filter((c) => c.id !== commandId);
  return meta.pending.length !== before;
}

export const rollD20 = (rng) => Math.min(20, Math.max(1, Math.floor(rng() * 20) + 1));

// Поля payload, которые ссылаются на другие события или их производные (`${castId}:e` и т. п.).
const REF_KEYS = ['castId', 'effectId', 'fractureId', 'debtId', 'noteId', 'traitId'];

function remapRef(value, idMap) {
  if (typeof value !== 'string') return value;
  if (idMap.has(value)) return idMap.get(value);
  const cut = value.indexOf(':');
  if (cut > 0 && idMap.has(value.slice(0, cut))) return idMap.get(value.slice(0, cut)) + value.slice(cut);
  return value;
}

function remapPayload(payload, idMap) {
  if (!idMap.size) return payload;
  const out = { ...payload };
  for (const key of REF_KEYS) if (key in out) out[key] = remapRef(out[key], idMap);
  if (Array.isArray(out.effectIds)) out.effectIds = out.effectIds.map((v) => remapRef(v, idMap));
  return out;
}

// Готовит событие из команды: здесь, и только здесь, бросается кубик.
function materialize(command, id, mode, rng, idMap) {
  const payload = remapPayload(structuredClone(command.payload ?? {}), idMap);
  if (command.kind === 'cast') {
    const { difficulty = 'normal' } = payload;
    delete payload.difficulty;
    delete payload.roll;
    if (mode === 'dice' && payload.spell && rollsAgainst(payload.spell)) {
      delete payload.outcome;
      payload.roll = { d20: rollD20(rng), difficulty: DIFFICULTIES.includes(difficulty) ? difficulty : 'normal' };
    }
  } else if (command.kind === 'faith_pray') {
    payload.d20 = rollD20(rng);
  }
  return { id, kind: command.kind, payload };
}

// Надлом от перегруза сразу получает проявление: случайное из надломов своего источника,
// если игрок не выбрал его сам в той же очереди. Сменить его можно потом из панели.
// Берётся проявление, которого нет у других надломов; если заняты все — из наименее занятых.
function autoManifest(state, castId, commandId, meta, fractures, rng, newId) {
  const f = (state.fractures ?? []).find((x) => x.castId === castId && !x.manifest);
  if (!f) return null;
  const chosen = meta.pending.some((c) => c.kind === 'fracture_manifest' && c.payload?.fractureId === `${commandId}:f`);
  if (chosen) return null;
  const sourceOptions = fractures.filter((x) => x.source === f.source);
  if (!sourceOptions.length) return null;
  const used = new Map();
  for (const x of state.fractures ?? []) {
    const id = x.manifest?.id;
    if (id) used.set(id, (used.get(id) ?? 0) + 1);
  }
  const least = Math.min(...sourceOptions.map((x) => used.get(x.id) ?? 0));
  const options = sourceOptions.filter((x) => (used.get(x.id) ?? 0) === least);
  const t = options[Math.min(options.length - 1, Math.floor(rng() * options.length))];
  return {
    id: newId(),
    kind: 'fracture_manifest',
    payload: { fractureId: f.id, auto: true, manifest: { id: t.id, name: t.name, text: t.text, heal: { ...t.heal }, accept: t.accept } },
  };
}

// Фиксация при отправке сообщения игрока chat[index] (в том числе вставленного в прошлое).
// fractures — каталог надломов для автопроявления (пустой — без автопроявления).
// Сообщение получает постоянный uid и отметку sent даже без команд; повторный вызов для
// отмеченного сообщения очередь не трогает. События добавляются к уже лежащим в сообщении,
// проверяются в месте сообщения; невозможные не переносятся и возвращаются в dropped.
export function commitPending(chat, meta, index, { now = Date.now(), rng = Math.random, fractures = [] } = {}) {
  const none = { changed: false, events: [], dropped: [] };
  const message = chat?.[index];
  if (!message?.is_user || message.is_system || !isSupported(meta) || !meta.snapshot) return none;
  const prev = messageRecord(message);
  if (prev?.sent) return none;

  message.extra = isObject(message.extra) ? message.extra : {};
  const record = prev ?? {};
  message.extra[EXTRA_KEY] = record;
  if (typeof record.uid !== 'string' || !record.uid) record.uid = nextId(meta, 'm', now);
  if (!Array.isArray(record.events)) record.events = [];

  // Состояние в месте сообщения: всё до него плюс то, что в нём уже лежит.
  const before = collectEvents(chat).filter((e) => e.mesIndex <= index).map((e) => e.event);
  let state = replay(meta.snapshot, before).state;
  const taken = new Set(collectEvents(chat).map((e) => e.event.id));

  const idMap = new Map();
  const events = [];
  const dropped = [];
  const consumed = new Set();
  for (const command of meta.pending) {
    consumed.add(command.id);
    let id = command.id;
    while (taken.has(id)) id = nextId(meta, 'ev', now);
    if (id !== command.id) idMap.set(command.id, id);
    const event = materialize(command, id, meta.mode, rng, idMap);
    const r = applyEvent(state, event);
    if (!r.ok) {
      dropped.push({ command, reason: r.reason });
      continue;
    }
    state = r.state;
    taken.add(id);
    events.push(event);
    if (event.kind === 'cast' && fractures.length) {
      const auto = autoManifest(state, event.id, command.id, meta, fractures, rng, () => {
        let mid = nextId(meta, 'ev', now);
        while (taken.has(mid)) mid = nextId(meta, 'ev', now);
        return mid;
      });
      if (auto) {
        const a = applyEvent(state, auto);
        if (a.ok) {
          state = a.state;
          taken.add(auto.id);
          events.push(auto);
        }
      }
    }
  }

  const have = new Set(record.events.map((e) => e?.id));
  for (const event of events) if (!have.has(event.id)) record.events.push(event);
  meta.pending = meta.pending.filter((c) => !consumed.has(c.id));
  record.sent = true;
  return { changed: true, events, dropped };
}

function findEvent(chat, eventId) {
  for (let i = 0; i < (chat?.length ?? 0); i++) {
    const event = messageEvents(chat[i]).find((e) => e?.id === eventId);
    if (event) return { event, mesIndex: i };
  }
  return null;
}

// Отключение и возврат события.
export function toggleEvent(chat, meta, eventId) {
  const found = findEvent(chat, eventId);
  if (!found) return null;
  found.event.disabled = !found.event.disabled;
  return { mesIndex: found.mesIndex, disabled: found.event.disabled };
}

// Какому сообщению игрока отвечает генерация; -1 — факт хода не нужен. Факт получает прямой
// ответ на последнее сообщение игрока, его свайп, регенерация и продолжение.
const FACT_TYPES_AFTER_REPLY = new Set(['swipe', 'continue', 'regenerate']);

export function factTarget(chat, type) {
  if (type === 'quiet' || type === 'impersonate') return -1;
  let last = -1;
  for (let i = (chat?.length ?? 0) - 1; i >= 0; i--) {
    if (chat[i]?.is_system) continue;
    if (chat[i]?.is_user) { last = i; break; }
  }
  if (last < 0) return -1;
  const after = chat.slice(last + 1).filter((m) => !m?.is_system).length;
  if (after === 0) return last;
  if (after === 1 && FACT_TYPES_AFTER_REPLY.has(type)) return last;
  return -1;
}

// Применённые события сообщения, на которое отвечает генерация (для факта хода).
export function factRows(chat, meta, type) {
  const target = factTarget(chat, type);
  if (target < 0) return [];
  const view = computeChat(chat, meta);
  if (!view) return [];
  return view.rows.filter((r) => r.mesIndex === target && r.ok === true);
}

// Сколько сообщений игрока после своего хода заметка об окончании чар остаётся в «недавних
// последствиях». В своём ходе её говорит факт хода, дальше она нужна как короткое напоминание;
// позже событие уже есть в истории чата, а заметка начинает спорить с новыми чарами того же имени.
export const NOTE_TURNS = 2;

// Заметки об окончании чар, которые старше NOTE_TURNS сообщений игрока. Ручные заметки игрок
// убирает сам — они здесь не устаревают.
export function staleNoteIds(chat, rows, turns = NOTE_TURNS) {
  const userAfter = (index) => (chat ?? []).slice(index + 1).filter((m) => m?.is_user && !m.is_system).length;
  const out = [];
  for (const r of rows ?? []) {
    if (r?.ok !== true || !Number.isInteger(r.mesIndex)) continue;
    const before = new Set((r.before?.notes ?? []).map((n) => n.id));
    const fresh = (r.after?.notes ?? []).filter((n) => !before.has(n.id) && n.kind === 'effect-end');
    if (fresh.length && userAfter(r.mesIndex) > turns) out.push(...fresh.map((n) => n.id));
  }
  return out;
}
