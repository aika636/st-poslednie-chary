// Тексты для модели: блок состояния (каждый ход) и факт хода (только для ответа на сообщение).
// Только проза: никаких чисел механики, ID, цен, бросков и порогов.
import { SCALE, scaleOf, fractureLoad } from './rules.mjs?v=0.1.4';

const SOURCE_GEN = { knowledge: 'знания', blood: 'крови', faith: 'веры', pact: 'договора', nature: 'природы' };

// Как магия устроена в мире — для рассказчика и остальных персонажей.
const WORLD_TEXT = 'Магия реальна и требует сил. Колдовство обычно заметно окружающим; свидетели помнят замеченные проявления. Накопившаяся магическая усталость видна со стороны. Надлом — след колдовства сверх сил; он не проходит сам и не снимается обычным отдыхом.';

const STRAIN_TEXT = [
  'Силы свободны: магия даётся легко.',
  'Лёгкая усталость: колдовство уже ощущается, но пока не тяготит.',
  'Заметное напряжение: каждое чудо даётся с усилием.',
  'Силы почти на исходе: персона чувствует, что предел совсем близко.',
  'Силы на пределе: цена прошлых чудес уже учтена, новой платы пока нет. Колдовать ещё можно, но следующее чудо возьмёт плату с самой персоны и оставит надлом.',
];

// Предел, когда шкалу держат надломы: прошлая плата уже взята надломом, «платы нет» тут неверно.
const LIMIT_FRACTURES_TEXT = {
  part: 'Силы на пределе: часть их держат надломы, остальное — обычная усталость от магии. Колдовать ещё можно, но следующее чудо возьмёт плату с самой персоны и оставит новый надлом.',
  all: 'Силы на пределе: их целиком держат надломы, и обычный отдых их не вернёт. Колдовать ещё можно, но каждое чудо возьмёт плату с самой персоны и оставит новый надлом.',
};

function strainText(state) {
  const scale = scaleOf(state);
  const load = fractureLoad(state.fractures ?? []);
  if (scale < SCALE || load === 0) return STRAIN_TEXT[scale];
  return load >= SCALE ? LIMIT_FRACTURES_TEXT.all : LIMIT_FRACTURES_TEXT.part;
}

const SEVERITY_TEXT = {
  1: 'лёгкий, проявляется время от времени',
  2: 'серьёзный, устойчиво мешает',
  3: 'тяжёлый, стал заметной частью её состояния',
};

const ENVIRONMENT_TEXT = {
  living: 'Вокруг живая среда: магия персоны черпает из неё силу.',
  lifeless: 'Вокруг камень и железо без жизни: колдовать здесь тяжелее.',
};

// Общие заметки окончания, если у карточки нет своего текста для причины.
// {чары} — «чары «Название» (цель — …)».
const END_TEXT = {
  done: '{Чары} завершились.',
  broke: '{Чары} рассыпались, так и не исполнив задуманного.',
  escaped: '{Чары} не удержали цель: она вырвалась.',
  consent: 'Согласие отозвано: {чары} разорваны, новых ощущений через связь больше нет.',
  scene: 'Сцена закончилась, и {чары} угасли. Само окончание не подтверждает, что задуманное исполнено.',
  removed: '{Чары} сняты. Само окончание не подтверждает, что задуманное исполнено.',
};

const clean = (v) => (typeof v === 'string' ? v.trim() : '');
const upperFirst = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
// Строчная первая буква, только если это обычное слово, а не аббревиатура.
const lowerFirst = (s) => (s && /^\p{Lu}(?!\p{Lu})/u.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
const stripEnd = (s) => s.replace(/[\s.!…;]+$/u, '');
// Предложение с точкой на конце.
const sentence = (s) => {
  const t = clean(s);
  if (!t) return '';
  // Кавычка в конце закрывает цитату, а не предложение: «…приказы». Точка нужна,
  // если внутри цитаты перед кавычкой нет своего знака конца.
  return /[.!?…]["»]?$/u.test(t) ? t : `${t}.`;
};

const targetLabel = (target) => clean(target?.label) || clean(target?.key);

// Пустой замысел: хвост «: {замысел}» в конце фразы, «({замысел})» и ««{замысел}»» убираются
// вместе со своей пунктуацией; в остальных местах остаётся нейтральное «задуманное».
const AIM = /\{(?:замысел|просьба|задача)\}/gu;
const AIM_EMPTY = [
  /\s*:\s*\{(?:замысел|просьба|задача)\}(?=\s*[.!?…;,]|\s*$)/gu,
  /\s*\(\{(?:замысел|просьба|задача)\}\)/gu,
  /\s*«\{(?:замысел|просьба|задача)\}»/gu,
];

// Подстановка {цель} и {замысел}. {просьба} и {задача} — синонимы замысла из текстов карточек.
export function fill(template, { target, intent } = {}) {
  const label = typeof target === 'string' ? clean(target) : targetLabel(target);
  const aim = clean(intent);
  let out = clean(template);
  // Без цели пояснение в скобках убираем: «цели ({цель})» → «цели».
  if (!label) out = out.replace(/\s*\(\{цель\}\)/gu, '');
  out = out.replace(/\{цель\}/gu, label || 'цель');
  if (!aim) for (const re of AIM_EMPTY) out = out.replace(re, '');
  out = out.replace(AIM, aim || 'задуманное');
  // Предложение внутри текста, начатое подстановкой, — с заглавной буквы.
  // Начало всего текста не трогаем: вызывающий решает сам (после «Заметность:» нужна строчная).
  return out.replace(/([.!?…]\s+)(\p{Ll})/gu, (m, before, ch) => before + ch.toUpperCase());
}

// aim — замысел для опознания чар; исход по нему не утверждается.
function charmsPhrase(name, target, aim = '') {
  const label = targetLabel(target);
  // Без цели не утверждаем, на ком чары, — это видно из поста игрока.
  const parts = [label ? `цель — ${label}` : '', aim ? `замысел: ${stripEnd(aim)}` : ''].filter(Boolean);
  const who = parts.length ? ` (${parts.join(', ')})` : '';
  return `чары «${name || 'без названия'}»${who}`;
}

// Текст одной заметки: окончание эффекта по тексту карточки или общему шаблону, иначе — текст.
export function noteText(note, state) {
  if (!note) return '';
  if (note.kind !== 'effect-end') return sentence(note.text);
  const card = state?.casts?.[note.castId]?.spell;
  const own = clean(card?.texts?.end?.[note.reason]);
  const ctx = { target: note.target, intent: note.intent };
  let text;
  if (own) text = sentence(upperFirst(fill(own, ctx)));
  else {
    // Замысел называем только при ручном завершении: в остальных шаблонах исход уже сказан.
    const aim = note.reason === 'done' ? clean(note.intent) : '';
    const charms = charmsPhrase(note.spell?.name ?? card?.name, note.target, aim);
    const tpl = END_TEXT[note.reason] ?? END_TEXT.removed;
    text = tpl.replace('{Чары}', upperFirst(charms)).replace('{чары}', charms);
  }
  const comment = clean(note.comment);
  return comment ? `${text} ${sentence(upperFirst(comment))}` : text;
}

function vowText(tagId, tags) {
  const vow = clean(tags?.[tagId]?.vow);
  return vow ? `«${vow.replace(/^«|»$/gu, '')}»` : `не творить магию вида «${tagId.replace(/_/g, ' ')}»`;
}

function fractureLine(f) {
  const kind = SOURCE_GEN[f.source] ? `Надлом ${SOURCE_GEN[f.source]}` : 'Надлом';
  const sev = SEVERITY_TEXT[Math.min(3, Math.max(1, f.severity ?? 1))];
  const m = f.manifest;
  if (m?.text) {
    const name = clean(m.name) ? ` «${clean(m.name)}»` : '';
    return `${kind}${name} (${sev}): ${sentence(lowerFirst(clean(m.text)))}`;
  }
  return `${kind} (${sev}): надлом ещё не проявился.`;
}

// Строка действующего эффекта. Текст успеха здесь не повторяется — он уже сказан в факте хода.
// Цель не повторяется: эффекты сгруппированы по ней в effectsSection.
function effectLine(e, state) {
  const card = state.casts?.[e.castId]?.spell;
  const name = `«${e.spell?.name ?? card?.name ?? 'без названия'}»`;
  const aim = stripEnd(clean(e.intent));
  if (e.detail === 'compact') return aim ? `${name} (${aim})` : name;
  const parts = [aim ? `${name}, замысел: ${aim}.` : `${name}.`];
  const limit = clean(card?.limit);
  if (limit) parts.push(`Предел чар: ${sentence(fill(lowerFirst(limit), e))}`);
  if (e.complication) parts.push('Сотворено с осложнением.');
  if (e.spell?.duration === 'bond') parts.push('Связь держится на согласии.');
  return parts.join(' ');
}

// Действующие эффекты, сгруппированные по цели; эффекты без цели — отдельными строками без подписи.
function effectsSection(state) {
  const groups = new Map();
  for (const e of state.effects ?? []) {
    const key = e.target?.key ?? '';
    if (!groups.has(key)) groups.set(key, { label: key ? targetLabel(e.target) : '', items: [] });
    groups.get(key).items.push({ text: effectLine(e, state), compact: e.detail === 'compact' });
  }
  // Сжатые эффекты идут списком через запятую, подробные — отдельными предложениями.
  return [...groups.values()].map((g) => {
    const who = g.label ? `${upperFirst(g.label)}: ` : '';
    const short = g.items.filter((x) => x.compact).map((x) => x.text);
    const full = g.items.filter((x) => !x.compact).map((x) => x.text);
    const parts = [...full];
    if (short.length) parts.push(`${full.length ? 'Также: ' : ''}${short.join(', ')}.`);
    return `— ${who}${parts.join(' ')}`;
  });
}

// Блок состояния: кто персона, как выглядит её магия, сколько осталось сил и что действует.
// skipNotes — id заметок, которые уже сказаны в факте этого хода: в «недавних» их не повторяем.
export function statusBlock(state, { sources = {}, tags = null, recentNotes = 3, skipNotes = [] } = {}) {
  const p = state.profile ?? {};
  const src = sources[p.source];
  const out = ['[Магия персоны]', WORLD_TEXT];

  const who = clean(p.name) ? `Персона — ${clean(p.name)}.` : 'Персона игрока владеет магией.';
  out.push(src ? `${who} Источник магии — ${src.name.toLowerCase()}. ${sentence(src.trait)}` : who);
  const look = [];
  if (clean(p.signature)) look.push(`Как выглядит и ощущается её магия: ${sentence(lowerFirst(clean(p.signature)))}`);
  if (clean(p.expression)) look.push(`Способ выражения: ${sentence(lowerFirst(clean(p.expression)))}`);
  if (look.length) out.push(look.join(' '));
  if (p.source === 'pact' && clean(p.patron)) out.push(`Покровитель: ${sentence(p.patron)}`);

  out.push(strainText(state));

  const fractures = state.fractures ?? [];
  if (fractures.length) out.push('Надломы:', ...fractures.map((f) => `— ${fractureLine(f)}`));

  const traits = (p.traits ?? []).map((t) => clean(t.text)).filter(Boolean);
  if (traits.length) out.push(`Постоянные свойства: ${traits.map((t, i) => sentence(i ? t : lowerFirst(t))).join(' ')}`);

  if (p.source === 'faith' && p.vows?.length) {
    out.push(`Обеты: ${p.vows.map((v) => vowText(v, tags)).join('; ')}.`);
  }

  const effects = effectsSection(state);
  if (effects.length) out.push('Действующая магия (поддержание чар не расходует силы персоны):', ...effects);

  const debts = state.debts ?? [];
  if (debts.length) {
    out.push('Непогашенные долги:', ...debts.map((d) => {
      const whom = clean(d.patron) ? `покровителю (${clean(d.patron)})` : 'покровителю';
      const cond = clean(d.condition) ? `условие — ${stripEnd(clean(d.condition))}` : 'условие ещё не названо';
      return `— Долг ${whom}: ${cond}.`;
    }));
  }

  if (p.source === 'nature' && ENVIRONMENT_TEXT[state.environment]) out.push(ENVIRONMENT_TEXT[state.environment]);

  const skip = new Set(skipNotes);
  const notes = recentNotes > 0 ? (state.notes ?? []).filter((n) => !skip.has(n.id)).slice(-recentNotes) : [];
  const noteLines = notes.map((n) => noteText(n, state)).filter(Boolean);
  if (noteLines.length) out.push('Недавние последствия магии:', ...noteLines.map((n) => `— ${n}`));

  return out.join('\n');
}

// --- Факт хода ---

function castLines(row, last, { sources, tags }) {
  const c = row.after.casts?.[row.event.id];
  if (!c) return [];
  const card = c.spell ?? {};
  const t = card.texts ?? {};
  const ctx = { target: c.target, intent: c.intent };
  const lines = [];

  const label = targetLabel(c.target);
  const aim = clean(c.intent);
  const named = clean(card.name) ? ` «${clean(card.name)}»` : '';
  lines.push(`Персона сотворила чудо${named}${label ? ` (цель — ${label})` : ''}${aim ? `, замысел: ${stripEnd(aim)}` : ''}.`);

  if (c.gift === 'discount' && sources?.[row.after.profile.source]?.giftFact) {
    lines.push(sentence(sources[row.after.profile.source].giftFact));
  }

  if (c.outcome === 'failure') {
    const fail = clean(t.failure);
    lines.push(`${fail ? `${sentence(upperFirst(fill(fail, ctx)))} ` : ''}Эффект не наступил.`);
  } else {
    const ok = upperFirst(stripEnd(fill(t.success, ctx))) || 'Чудо удалось';
    const comp = clean(t.complication);
    lines.push(`${ok}.`);
    if (c.outcome === 'complication' && comp) lines.push(`Но не всё прошло гладко: ${sentence(fill(lowerFirst(comp), ctx))}`);
  }

  // Заметность и память описывают удавшийся эффект; при провале всё нужное говорит текст провала.
  if (c.outcome !== 'failure' && clean(card.visibility)) lines.push(`Заметность: ${sentence(fill(lowerFirst(card.visibility), ctx))}`);
  if (c.outcome !== 'failure' && clean(t.memory)) lines.push(`Память: ${sentence(fill(lowerFirst(t.memory), ctx))}`);

  if (c.gift === 'loan') {
    const debt = (row.after.debts ?? []).find((d) => d.castId === row.event.id);
    const cond = clean(debt?.condition);
    lines.push(`Покровитель оплатил это чудо в долг; условие: ${cond ? sentence(lowerFirst(stripEnd(cond))) : 'пока не названо.'}`);
  }

  if (c.fractureId) {
    const f = (last.after.fractures ?? []).find((x) => x.id === c.fractureId);
    const sev = { 1: 'лёгкий', 2: 'серьёзный', 3: 'тяжёлый' }[Math.min(3, f?.severity ?? 1)];
    let line = `Магия взяла больше, чем было сил: остался ${sev} надлом.`;
    if (f?.manifest?.text) line += ` ${sentence(f.manifest.text)}`;
    lines.push(line);
  }

  for (const v of c.violations ?? []) {
    if (v.kind === 'vow') lines.push(`Это чудо нарушило обет ${vowText(v.tag, tags)}.`);
    else lines.push(`Это чудо пошло против того, что с персоной навсегда: ${sentence(lowerFirst(clean(v.text)))}`);
  }
  if (c.consent === false && card.resist === 'consent') lines.push('Цель не дала согласия, а такая связь держится только на нём.');
  return lines;
}

function endNotes(row, ids) {
  return ids
    .map((id) => (row.after.notes ?? []).find((n) => n.id === `${id}:end`))
    .filter(Boolean)
    .map((n) => noteText(n, row.after));
}

function rowLines(row, rows, opts) {
  const { event, before, after } = row;
  const p = event.payload ?? {};
  const last = rows[rows.length - 1];
  switch (event.kind) {
    case 'cast':
      return castLines(row, last, opts);
    case 'faith_pray': {
      const c = after.casts?.[p.castId];
      if (!c?.prayer) return [];
      const name = `«${c.spell?.name ?? 'чудо'}»`;
      if (c.prayer.answered) {
        const ok = sentence(fill(lowerFirst(clean(c.spell?.texts?.success)), { target: c.target, intent: c.intent }));
        return [`Персона взмолилась после неудачного чуда ${name}, и молитва услышана: ${ok || 'чудо всё-таки свершилось.'}`];
      }
      return [`Персона взмолилась после неудачного чуда ${name}, но молитва осталась без ответа: провал в силе, эффект не наступил.`];
    }
    case 'effect_end':
      return endNotes(row, [p.effectId]);
    case 'scene_end':
      return endNotes(row, p.effectIds ?? []);
    case 'rest':
      return [after.fractures?.length
        ? 'Персона отдохнула: обычная усталость от магии ушла, но надломы по-прежнему держат часть сил.'
        : 'Персона отдохнула: силы восстановились полностью.'];
    case 'breather':
      return ['Персона перевела дух: напряжение немного отпустило.'];
    case 'nature_gift':
      return [sentence(opts.sources?.nature?.giftFact) || 'Персона приняла силу живой среды и восстановилась.'];
    case 'fracture_manifest': {
      // Проявление надлома, полученного в этом же ходе, уже сказано в строке каста.
      if (rows.some((r) => r.event.kind === 'cast' && r.ok && `${r.event.id}:f` === p.fractureId)) return [];
      const f = (after.fractures ?? []).find((x) => x.id === p.fractureId);
      return f?.manifest?.text ? [`Надлом проявился: ${sentence(lowerFirst(clean(f.manifest.text)))}`] : [];
    }
    case 'fracture_heal': {
      const f = (before.fractures ?? []).find((x) => x.id === p.fractureId);
      const name = clean(f?.manifest?.name);
      return [`Надлом${name ? ` «${name}»` : ''} исцелён и больше не проявляется; силы вернутся с отдыхом.`];
    }
    case 'fracture_accept': {
      const t = (after.profile.traits ?? []).find((x) => x.fractureId === p.fractureId);
      return t ? [`Персона приняла надлом навсегда: он ушёл, но оставил постоянный след. ${sentence(t.text)}`] : [];
    }
    case 'debt_settle': {
      const d = (before.debts ?? []).find((x) => x.id === p.debtId);
      const cond = clean(d?.condition);
      return [`Долг покровителю погашен${cond ? `: условие «${stripEnd(cond)}» исполнено` : ''}.`];
    }
    case 'environment_set':
      if (after.profile.source !== 'nature') return [];
      return ENVIRONMENT_TEXT[after.environment] ? [ENVIRONMENT_TEXT[after.environment]] : [];
    default:
      return [];
  }
}

// Заметки, появившиеся в этих строках журнала: их уже говорит факт хода.
export function notesOfRows(rows) {
  const ids = [];
  for (const r of rows ?? []) {
    if (!r?.ok) continue;
    const before = new Set((r.before?.notes ?? []).map((n) => n.id));
    for (const n of r.after?.notes ?? []) if (!before.has(n.id)) ids.push(n.id);
  }
  return ids;
}

// Факт хода по строкам журнала одного сообщения. Пустая строка — сказать нечего.
export function turnFact(rows, { sources = {}, tags = null } = {}) {
  const done = (rows ?? []).filter((r) => r?.ok);
  const lines = done.flatMap((r) => rowLines(r, done, { sources, tags })).filter(Boolean);
  return lines.length ? ['[Магия в этом ходе]', ...lines].join('\n') : '';
}
