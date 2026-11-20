// Журнал событий: применение одного события и пересчёт от начального снимка.
// Событие: { id, kind, payload, disabled? }. Каст несёт копию нужных полей карточки
// (payload.spell), поэтому пересчёт не обращается к каталогу и не меняется при его обновлении.
// Кубик здесь не бросается: бросок приходит в событии уже готовым.
import {
  MASTERIES, scaleFor, SOURCES, ENVIRONMENTS, OUTCOMES, LASTING, PRAYER_THRESHOLD, castCost, payStrain, severityOf,
  rollsAgainst, threshold, judgeRoll, fractureLoad,
} from './rules.mjs?v=0.1.15';
import { initialState, cloneState, createProfile } from './state.mjs?v=0.1.15';

export const EFFECT_END_REASONS = ['done', 'broke', 'escaped', 'consent', 'scene', 'removed'];

const SOURCE_NAMES = { knowledge: 'знания', blood: 'крови', faith: 'веры', pact: 'договора', nature: 'природы' };

const findIndex = (arr, id) => arr.findIndex((x) => x.id === id);

function createEffect(d, castId) {
  const c = d.casts[castId];
  if (!LASTING.has(c.spell.duration) || c.outcome === 'failure') return;
  d.effects.push({
    id: `${castId}:e`,
    castId,
    spell: { id: c.spell.id, name: c.spell.name, duration: c.spell.duration },
    target: c.target,
    intent: c.intent,
    complication: c.outcome === 'complication',
    scene: d.scene,
    detail: 'full',
  });
}

function endEffect(d, effectId, reason, comment = '') {
  const i = findIndex(d.effects, effectId);
  if (i < 0) return false;
  const [e] = d.effects.splice(i, 1);
  d.notes.push({
    id: `${effectId}:end`,
    kind: 'effect-end',
    effectId,
    castId: e.castId,
    spell: e.spell,
    target: e.target,
    intent: e.intent,
    reason,
    comment,
  });
  return true;
}

// Нарушенные обеты и постоянные свойства: структурно в касте, текстом — в предупреждениях.
function violationsOf(d, spell) {
  const out = [];
  for (const tag of spell.tags ?? []) {
    if (d.profile.vows.includes(tag)) out.push({ kind: 'vow', tag });
    for (const t of d.profile.traits) {
      if ((t.forbiddenTags ?? []).includes(tag)) out.push({ kind: 'trait', tag, text: t.text });
    }
  }
  return out;
}

// Тег в тексте предупреждения — читаемыми словами: «подчинение_воли» → «подчинение воли».
const tagWords = (tag) => String(tag ?? '').replace(/_/g, ' ');
const violationWarning = (v) => (v.kind === 'vow'
  ? `каст нарушает обет «${tagWords(v.tag)}»`
  : `каст задевает постоянное свойство «${v.text}» (вид магии «${tagWords(v.tag)}»)`);

function cast(d, a, ctx) {
  const p = a.payload ?? {};
  const spell = p.spell;
  if (!spell || typeof spell.cost !== 'number') return 'в касте нет карточки заклинания';
  if (d.casts[a.id]) return 'каст с таким id уже был';

  let outcome;
  let roll = null;
  if (p.roll && rollsAgainst(spell)) {
    const limit = threshold(spell, p.roll.difficulty);
    outcome = judgeRoll(p.roll.d20, limit);
    roll = { d20: p.roll.d20, difficulty: p.roll.difficulty, threshold: limit };
  } else if (p.outcome !== undefined) {
    if (!OUTCOMES.includes(p.outcome)) return `неизвестный исход «${p.outcome}»`;
    outcome = p.outcome;
  } else if (rollsAgainst(spell)) return 'нет ни броска, ни выбранного исхода';
  else outcome = 'success';

  const { source } = d.profile;
  const price = p.free === true ? { cost: 0, giftApplied: null, warnings: [] } : castCost({ spell, source, environment: p.env === false ? 'unspecified' : d.environment, giftUsed: d.giftUsed, gift: Boolean(p.gift), mode: p.giftMode, lastPaid: d.lastPaid });
  const violations = violationsOf(d, spell);
  ctx.warnings.push(...price.warnings, ...violations.map(violationWarning));
  if (spell.resist === 'consent' && p.consent === false) ctx.warnings.push('цель не согласна: связь держится только на согласии');
  if (price.giftApplied) d.giftUsed = true;

  let { strain, overflow } = p.free === true ? { strain: d.strain, overflow: 0 } : payStrain(d, price.cost);
  let gift = price.giftApplied;
  // Милость веры: первый перегруз до отдыха заполняет шкалу, но не оставляет надлома.
  if (p.free !== true && p.giftMode === 'mercy' && source === 'faith' && !d.giftUsed && overflow > 0) {
    const cap = scaleFor(d.profile);
    strain = cap - Math.min(cap, fractureLoad(d.fractures));
    overflow = 0;
    gift = 'mercy';
    d.giftUsed = true;
  }
  d.strain = strain;
  let fractureId = null;
  if (gift === 'blood') {
    fractureId = `${a.id}:f`;
    d.fractures.push({ id: fractureId, castId: a.id, source, weight: 1, severity: 1, manifest: null });
    fitStrain(d);
    ctx.warnings.push(`надлом ${SOURCE_NAMES[source]} весом 1 вместо усталости`);
  } else if (overflow > 0) {
    fractureId = `${a.id}:f`;
    d.fractures.push({ id: fractureId, castId: a.id, source, weight: overflow, severity: severityOf(overflow), manifest: null });
    ctx.warnings.push(`перегруз: надлом ${SOURCE_NAMES[source]} весом ${overflow}`);
  }
  if (price.giftApplied === 'loan') {
    if (d.debts.length) ctx.warnings.push('у персоны уже есть непогашенный долг');
    if (!p.debt) ctx.warnings.push('у долга нет условия');
    d.debts.push({ id: `${a.id}:d`, castId: a.id, patron: d.profile.patron, condition: p.debt ?? '' });
  }

  d.casts[a.id] = {
    spell: { ...spell },
    target: p.target ?? null,
    intent: p.intent ?? '',
    outcome,
    roll,
    cost: price.cost,
    gift,
    fractureId,
    violations,
    consent: p.consent ?? null,
    prayer: null,
  };
  if (price.cost > 0) d.lastPaid = spell.id;
  createEffect(d, a.id);
  ctx.note = outcome;
  return null;
}

function faithPray(d, a, ctx) {
  const p = a.payload ?? {};
  if (d.profile.source !== 'faith') return 'молитва — дар веры';
  if (d.giftUsed) return 'дар уже использован до отдыха';
  const c = d.casts[p.castId];
  if (!c) return 'каст для молитвы не найден';
  if (c.outcome !== 'failure') return 'молитва помогает только после провала';
  if (c.prayer) return 'за этот каст уже молились';
  if (!Number.isInteger(p.d20) || p.d20 < 1 || p.d20 > 20) return 'бросок молитвы должен быть целым от 1 до 20';
  d.giftUsed = true;
  const answered = p.d20 >= PRAYER_THRESHOLD;
  c.prayer = { d20: p.d20, answered };
  if (answered) {
    c.outcome = 'success';
    createEffect(d, p.castId);
  }
  ctx.note = answered ? 'answered' : 'silent';
  return null;
}

function natureGift(d, a, ctx) {
  if (d.profile.source !== 'nature') return 'восстановление в живой среде — дар природы';
  if (d.giftUsed) return 'дар уже использован до отдыха';
  if (d.strain === 0) return 'обычного напряжения нет: снимать нечего';
  if (d.environment !== 'living') ctx.warnings.push('среда не отмечена как живая');
  d.giftUsed = true;
  d.strain -= 1;
  return null;
}

// root — укоренение природы: при обычном напряжении от 2 передышка снимает 2 и тратит дар.
function breather(d, a, ctx) {
  if (d.breatherUsed) return 'передышка уже была до отдыха';
  if (d.strain === 0) return 'обычного напряжения нет: снимать нечего';
  d.breatherUsed = true;
  if (a.payload?.root === true && d.profile.source === 'nature' && !d.giftUsed && d.strain >= 2) {
    d.strain -= 2;
    d.giftUsed = true;
    ctx.note = 'root';
  } else d.strain -= 1;
  return null;
}

function rest(d) {
  d.strain = 0;
  d.giftUsed = false;
  d.breatherUsed = false;
  d.lastPaid = null;
  return null;
}

function sceneEnd(d, a, ctx) {
  for (const id of a.payload?.effectIds ?? []) {
    if (!endEffect(d, id, 'scene')) ctx.warnings.push(`эффект ${id} уже не действует`);
  }
  d.scene += 1;
  return null;
}

function effectEnd(d, a) {
  const p = a.payload ?? {};
  const reason = p.reason ?? 'removed';
  if (!EFFECT_END_REASONS.includes(reason)) return `неизвестная причина «${reason}»`;
  if (!endEffect(d, p.effectId, reason, p.comment ?? '')) return 'такого эффекта нет';
  return null;
}

function effectDetail(d, a) {
  const p = a.payload ?? {};
  const e = d.effects.find((x) => x.id === p.effectId);
  if (!e) return 'такого эффекта нет';
  if (p.detail !== 'full' && p.detail !== 'compact') return 'подробность — full или compact';
  e.detail = p.detail;
  return null;
}

function fractureManifest(d, a) {
  const p = a.payload ?? {};
  const f = d.fractures.find((x) => x.id === p.fractureId);
  if (!f) return 'такого надлома нет';
  if (!p.manifest?.text) return 'у проявления нет описания';
  f.manifest = { ...p.manifest };
  return null;
}

// Снятие и принятие надлома освобождают закреплённое напряжение: оно становится обычным
// и уходит со следующим отдыхом. Шкала в момент снятия не меняется.
function removeFracture(d, index) {
  const cap = scaleFor(d.profile);
  const before = Math.min(cap, fractureLoad(d.fractures));
  const [f] = d.fractures.splice(index, 1);
  d.strain += before - Math.min(cap, fractureLoad(d.fractures));
  return f;
}

// Шкала стала меньше (ступень понижена, принятое свойство убрано): обычное напряжение, которое
// не помещается рядом с надломами, срезается. Шкала и так показана полной, отдых обнулил бы его
// в любом случае; сами надломы не теряются.
function fitStrain(d) {
  const cap = scaleFor(d.profile);
  d.strain = Math.min(d.strain, cap - Math.min(cap, fractureLoad(d.fractures)));
}

function fractureHeal(d, a) {
  const i = findIndex(d.fractures, a.payload?.fractureId);
  if (i < 0) return 'такого надлома нет';
  removeFracture(d, i);
  return null;
}

function fractureAccept(d, a) {
  const p = a.payload ?? {};
  const i = findIndex(d.fractures, p.fractureId);
  if (i < 0) return 'такого надлома нет';
  const f = d.fractures[i];
  if (f.severity < 3) return 'принять навсегда можно только надлом тяжести 3';
  const textValue = p.trait?.text ?? f.manifest?.accept ?? '';
  if (!textValue) return 'у постоянного свойства нет описания';
  removeFracture(d, i);
  d.profile.traits.push({
    id: `${a.id}:t`,
    text: textValue,
    origin: p.trait?.origin ?? f.manifest?.name ?? 'принятый надлом',
    forbiddenTags: p.trait?.forbiddenTags ?? [],
    fractureId: f.id,
  });
  return null;
}

function noteAdd(d, a) {
  const p = a.payload ?? {};
  if (!p.text) return 'пустая заметка';
  d.notes.push({ id: a.id, kind: p.kind ?? 'manual', text: p.text, ref: p.ref ?? null });
  return null;
}

function noteRemove(d, a) {
  const i = findIndex(d.notes, a.payload?.noteId);
  if (i < 0) return 'такой заметки нет';
  d.notes.splice(i, 1);
  return null;
}

function debtSettle(d, a) {
  const i = findIndex(d.debts, a.payload?.debtId);
  if (i < 0) return 'такого долга нет';
  d.debts.splice(i, 1);
  return null;
}

function traitAdd(d, a) {
  const p = a.payload ?? {};
  if (!p.text) return 'у свойства нет описания';
  d.profile.traits.push({ id: a.id, text: p.text, origin: p.origin ?? '', forbiddenTags: p.forbiddenTags ?? [] });
  return null;
}

function traitRemove(d, a) {
  const i = findIndex(d.profile.traits, a.payload?.traitId);
  if (i < 0) return 'такого свойства нет';
  d.profile.traits.splice(i, 1);
  fitStrain(d);
  return null;
}

function environmentSet(d, a) {
  const env = a.payload?.environment;
  if (!ENVIRONMENTS.includes(env)) return `неизвестная среда «${env}»`;
  d.environment = env;
  return null;
}

const PATCHABLE = ['name', 'source', 'mastery', 'signature', 'expression', 'vows', 'patron', 'favorites'];

function profilePatch(d, a) {
  const p = a.payload ?? {};
  if (p.source !== undefined && !SOURCES.includes(p.source)) return `неизвестный источник «${p.source}»`;
  if (p.mastery !== undefined && !MASTERIES.includes(p.mastery)) return `неизвестная ступень «${p.mastery}»`;
  const next = { ...d.profile };
  for (const key of PATCHABLE) if (p[key] !== undefined) next[key] = p[key];
  d.profile = { ...createProfile(next), traits: d.profile.traits };
  fitStrain(d);
  return null;
}

const HANDLERS = {
  cast,
  faith_pray: faithPray,
  nature_gift: natureGift,
  breather,
  rest,
  scene_end: sceneEnd,
  effect_end: effectEnd,
  effect_detail_set: effectDetail,
  fracture_manifest: fractureManifest,
  fracture_heal: fractureHeal,
  fracture_accept: fractureAccept,
  note_add: noteAdd,
  note_remove: noteRemove,
  debt_settle: debtSettle,
  trait_add: traitAdd,
  trait_remove: traitRemove,
  environment_set: environmentSet,
  profile_patch: profilePatch,
};

export const EVENT_KINDS = Object.keys(HANDLERS);

// Применяет одно событие к копии состояния. Вход не меняется.
export function applyEvent(state, event) {
  const ctx = { warnings: [], note: '' };
  const handler = HANDLERS[event?.kind];
  if (!handler) return { ok: false, reason: `неизвестный вид события «${event?.kind}»`, warnings: [], state: null };
  const d = cloneState(state);
  let reason;
  try {
    reason = handler(d, event, ctx);
  } catch (err) {
    reason = `событие записано некорректно: ${err.message}`;
  }
  if (reason) return { ok: false, reason, warnings: ctx.warnings, state: null };
  d.history.push({ id: event.id, kind: event.kind, note: ctx.note });
  return { ok: true, reason: null, warnings: ctx.warnings, state: d };
}

// Пересчёт от снимка. Невозможное событие пропускается и попадает в conflicts —
// журнал не останавливается (например, снятие эффекта, чей каст удалили).
export function replay(snapshot, events) {
  let state = initialState(snapshot);
  const conflicts = [];
  const rows = [];
  const seen = new Set();
  for (const event of events ?? []) {
    if (!event || event.disabled) continue;
    if (seen.has(event.id)) {
      conflicts.push({ id: event.id, reason: 'событие с таким id уже есть в журнале' });
      continue;
    }
    seen.add(event.id);
    const before = state;
    const r = applyEvent(state, event);
    if (r.ok) state = r.state;
    else conflicts.push({ id: event.id, reason: r.reason });
    rows.push({ event, ok: r.ok, reason: r.reason, warnings: r.warnings, before, after: state });
  }
  return { state, conflicts, rows };
}
