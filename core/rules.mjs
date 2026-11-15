// Числа правил: шкала напряжения, пороги броска, цена каста с даром и средой.
// Чистые функции без состояния журнала.

// Шкала растёт со ступенью мастерства и принятыми надломами: scale = min(SCALE_MAX, база + принятые).
export const SCALE = 4; // шкала Умелого: значение по умолчанию (профили без ступени)
export const SCALE_MAX = 6;
export const MASTERIES = ['novice', 'adept', 'master'];
export const DEFAULT_MASTERY = 'adept';
export const MASTERY_BASE = { novice: 3, adept: 4, master: 5 };
export const SOURCES = ['knowledge', 'blood', 'faith', 'pact', 'nature'];
export const ENVIRONMENTS = ['unspecified', 'living', 'lifeless'];
export const OUTCOMES = ['success', 'complication', 'failure'];
export const DIFFICULTIES = ['easy', 'normal', 'hard'];

// Сопротивление карточки: none — без броска, consent — без броска, но нужно согласие цели.
export const RESISTANCES = ['none', 'consent', 'soft', 'hard'];
export const THRESHOLDS = {
  soft: { easy: 8, normal: 11, hard: 14 },
  hard: { easy: 11, normal: 14, hard: 17 },
};
export const PRAYER_THRESHOLD = 11;

// Длительности: instant — эффекта не остаётся; scene и sustained снимаются кнопкой или концом
// сцены; bond — связь по согласию, переживает отдых и конец сцены.
export const DURATIONS = ['instant', 'scene', 'sustained', 'bond'];
export const LASTING = new Set(['scene', 'sustained', 'bond']);

// Источники, чей дар — скидка 1 к цене.
const DISCOUNT_SOURCES = new Set(['knowledge', 'blood']);

export const rollsAgainst = (spell) => spell.resist === 'soft' || spell.resist === 'hard';

export function threshold(spell, difficulty) {
  const row = THRESHOLDS[spell.resist];
  if (!row) return null;
  if (!DIFFICULTIES.includes(difficulty)) throw new Error(`неизвестная сложность «${difficulty}»`);
  return row[difficulty];
}

// Ровно порог — успех с малым осложнением. Особых 1 и 20 нет.
export function judgeRoll(d20, limit) {
  if (!Number.isInteger(d20) || d20 < 1 || d20 > 20) throw new Error('бросок d20 должен быть целым от 1 до 20');
  if (d20 > limit) return 'success';
  if (d20 === limit) return 'complication';
  return 'failure';
}

export const fractureLoad = (fractures) => fractures.reduce((sum, f) => sum + f.weight, 0);

// Из чего сложена шкала профиля: база ступени, бонус за принятые надломы (постоянные свойства
// с fractureId), итог не выше SCALE_MAX. Профиль без ступени — Умелый.
export function scaleParts(profile) {
  const mastery = MASTERIES.includes(profile?.mastery) ? profile.mastery : DEFAULT_MASTERY;
  const base = MASTERY_BASE[mastery];
  const bonus = (profile?.traits ?? []).filter((t) => t?.fractureId).length;
  return { mastery, base, bonus, scale: Math.min(SCALE_MAX, base + bonus) };
}
export const scaleFor = (profile) => scaleParts(profile).scale;

// Заполненность шкалы: обычное напряжение плюс надломы, не больше шкалы персоны.
export function scaleOf(state) {
  const cap = scaleFor(state.profile);
  return Math.min(cap, state.strain + Math.min(cap, fractureLoad(state.fractures)));
}

// Тяжесть надлома: вес, но не выше трёх.
export const severityOf = (weight) => Math.min(3, weight);

// Сможет ли дар-скидка что-то дать: только при ненулевой цене до скидки.
export const discountUseful = (source, baseCost) => DISCOUNT_SOURCES.has(source) && baseCost > 0;

// Цена каста. gift — игрок хочет применить дар своего источника к этому касту.
// Возвращает итоговую цену, применён ли дар и предупреждения. Ничего не запрещает.
// mode — новый дар по виду: repeat (знание, повтор последнего платного чуда), blood (кровь, чудо ценой 2–3 за лёгкий надлом).
export function castCost({ spell, source, environment, giftUsed, gift, mode, lastPaid }) {
  const warnings = [];
  let cost = spell.cost;
  if (source === 'nature' && environment === 'lifeless') cost += 1;
  let giftApplied = null;
  if (mode) {
    if (giftUsed) warnings.push('дар уже использован до отдыха: заклинание стоит обычную цену');
    else if (mode === 'repeat' && source === 'knowledge' && lastPaid === spell.id && cost > 0) {
      cost -= 1;
      giftApplied = 'repeat';
    } else if (mode === 'blood' && source === 'blood' && (spell.cost === 2 || spell.cost === 3)) {
      cost = 0;
      giftApplied = 'blood';
    } else if (mode !== 'mercy') warnings.push('дар сейчас не применим: заклинание стоит обычную цену');
  } else if (gift) {
    if (giftUsed) warnings.push('дар уже использован до отдыха: заклинание стоит обычную цену');
    else if (DISCOUNT_SOURCES.has(source)) {
      if (cost > 0) {
        cost -= 1;
        giftApplied = 'discount';
      } else warnings.push('заклинание и так ничего не стоит: дар не нужен');
    } else if (source === 'pact') {
      cost = 0;
      giftApplied = 'loan';
    } else warnings.push('дар этого источника применяется не к цене каста');
  }
  return { cost, giftApplied, warnings };
}

// Оплата напряжением. Переполнение становится надломом такого же веса.
// C — шкала персоны. H = N + min(C, B); W = max(0, H + P − C); H′ = min(C, H + P); N′ = H′ − min(C, B + W).
export function payStrain(state, price) {
  const cap = scaleFor(state.profile);
  const load = fractureLoad(state.fractures);
  const filled = state.strain + Math.min(cap, load);
  const overflow = Math.max(0, filled + price - cap);
  const after = Math.min(cap, filled + price);
  const strain = Math.max(0, after - Math.min(cap, load + overflow));
  return { strain, overflow };
}
